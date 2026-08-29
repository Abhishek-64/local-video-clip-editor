/**
 * useUploadQueue — YouTube upload pipeline hook
 *
 * Extends (does NOT replace) the existing processing queue.
 * Watches for newly completed export jobs and immediately starts YouTube uploads.
 *
 * Pipeline per clip:
 *   Export complete → POST /api/uploads/metadata → get uploadUrl
 *   → XHR upload Blob directly to YouTube → report completion → release Blob ref
 *
 * Memory management:
 *   - Blobs are kept until upload completes (user can still download during upload)
 *   - After successful upload, the blob reference in uploadJobs is cleared
 *   - The existing completedClips from useProcessingQueue is NOT modified
 *
 * If VITE_API_URL is not set or YouTube is not connected:
 *   - Hook does nothing; existing behavior is fully preserved
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  createUploadSession,
  uploadBlobToYouTube,
  updateUploadJob,
  getUploadHistory,
  retryUploadJob,
  buildYouTubeUrl,
  isApiConfigured
} from '../services/apiService';
import { formatTagsAsHashtagString, parseTagsInput } from '../utils/titleCleaner';

/**
 * @param {object} opts
 * @param {object[]} opts.completedClips — from useProcessingQueue
 * @param {boolean} opts.isConnected — from useYouTube
 * @param {object} opts.ytSettings — from useYouTube
 * @param {function} opts.renderTemplate — from useYouTube
 * @param {string} opts.movieName — current movie name from textSettings
 */
export function useUploadQueue({
  completedClips,
  isConnected,
  ytSettings,
  renderTemplate,
  movieName
}) {
  const apiAvailable = isApiConfigured();

  // Map of jobId → upload state
  // { status, progress, videoId, uploadUrl, error, scheduledAt, blobRef }
  const [uploadJobs, setUploadJobs] = useState({});

  // Upload history from D1 (persists across refreshes)
  const [uploadHistory, setUploadHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Set of jobIds currently being uploaded (for concurrency control)
  const activeUploadsRef = useRef(new Set());
  const uploadQueueRef = useRef([]); // jobs waiting to upload
  const abortControllersRef = useRef(new Map());
  const processedExportIdsRef = useRef(new Set()); // track which exports we've already enqueued

  // Always keep latest refs to avoid stale closure in upload async callbacks
  const ytSettingsRef = useRef(ytSettings);
  const renderTemplateRef = useRef(renderTemplate);
  const movieNameRef = useRef(movieName);
  const startUploadRef = useRef(null);

  useEffect(() => {
    ytSettingsRef.current = ytSettings;
  }, [ytSettings]);

  useEffect(() => {
    renderTemplateRef.current = renderTemplate;
  }, [renderTemplate]);

  useEffect(() => {
    movieNameRef.current = movieName;
  }, [movieName]);

  const UPLOAD_CONCURRENCY = 1;

  // ── Load upload history on mount ─────────────────────────────────────────────

  const refreshHistory = useCallback(async () => {
    if (!apiAvailable || !isConnected) return;
    setIsLoadingHistory(true);
    try {
      const history = await getUploadHistory();
      setUploadHistory(history || []);
    } catch (err) {
      console.warn('Could not load upload history:', err.message);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [apiAvailable, isConnected]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  // ── Update a single upload job's state ───────────────────────────────────────

  const updateLocalJob = useCallback((jobId, updates) => {
    setUploadJobs(prev => ({
      ...prev,
      [jobId]: { ...(prev[jobId] || {}), ...updates }
    }));
  }, []);

  // ── Process next item from the upload queue ───────────────────────────────────

  const processNextUpload = useCallback(() => {
    if (!apiAvailable || !isConnected) return;

    while (
      activeUploadsRef.current.size < UPLOAD_CONCURRENCY &&
      uploadQueueRef.current.length > 0
    ) {
      const next = uploadQueueRef.current.shift();
      if (next && startUploadRef.current) startUploadRef.current(next);
    }
  }, [apiAvailable, isConnected]);

  // ── Start uploading a single clip ────────────────────────────────────────────

  const startUpload = useCallback(async (clip) => {
    const { id: jobId, blob, partNumber, name } = clip;
    const currentYt = ytSettingsRef.current || ytSettings;
    const currentRender = renderTemplateRef.current || renderTemplate;
    const currentMovie = movieNameRef.current || movieName;

    if (!blob) {
      updateLocalJob(jobId, {
        status: 'upload_failed',
        error: 'Clip blob is no longer available. Please re-export to upload to YouTube.'
      });
      return;
    }

    activeUploadsRef.current.add(jobId);
    updateLocalJob(jobId, { status: 'uploading', progress: 0, error: null });

    const controller = new AbortController();
    abortControllersRef.current.set(jobId, controller);

    const rawTags = (clip.tagsOverride && clip.tagsOverride.length > 0)
      ? clip.tagsOverride
      : (Array.isArray(currentYt?.yt_tags) && currentYt.yt_tags.length > 0
          ? currentYt.yt_tags
          : ['shorts', 'viral', 'clips']);
    const tags = parseTagsInput(rawTags);
    const hashtagsStr = formatTagsAsHashtagString(tags) || '#Shorts #Viral';

    const activeMovieName = clip.movieName || currentYt?.yt_name || currentMovie || 'My Movie';
    const isZeroPad = currentYt?.yt_zero_pad !== false;
    const activePartNumber = clip.ytPartNumber != null ? clip.ytPartNumber : (clip.partNumber != null ? clip.partNumber : (currentYt?.yt_start_part || 1));

    let title = clip.titleOverride;
    if (!title) {
      if (currentRender && currentYt?.yt_title_template) {
        title = currentRender(currentYt.yt_title_template, {
          movieName: activeMovieName,
          partNumber: activePartNumber,
          zeroPad: isZeroPad,
          tags
        });
      } else {
        title = clip.name || `${activeMovieName} - Part ${activePartNumber} | #Shorts`;
      }
    }

    let description = clip.descriptionOverride;
    if (!description) {
      if (currentRender && currentYt?.yt_description_template !== undefined) {
        description = currentRender(currentYt.yt_description_template, {
          movieName: activeMovieName,
          partNumber: activePartNumber,
          zeroPad: isZeroPad,
          tags
        });
      } else {
        description = `${activeMovieName} - Part ${activePartNumber}\n\n#Shorts\n\n${hashtagsStr}`;
      }
    }

    // Ensure description contains hashtags
    if (hashtagsStr) {
      const individualHashtags = hashtagsStr.split(' ').filter(Boolean);
      const missingHashtags = individualHashtags.filter(ht => !description.toLowerCase().includes(ht.toLowerCase()));
      if (missingHashtags.length > 0) {
        description = `${description ? description.trim() + '\n\n' : ''}${missingHashtags.join(' ')}`;
      }
    }

    const scheduledAt = clip.scheduledAt || null;
    const visibility = scheduledAt ? 'private' : (clip.visibilityOverride || currentYt?.yt_visibility || 'private');
    const madeForKids = clip.madeForKids != null ? clip.madeForKids : (currentYt?.yt_made_for_kids || false);

    try {
      // Step 1: Create D1 record and get YouTube resumable upload URL
      const { jobId: serverJobId, uploadUrl } = await createUploadSession({
        jobId,
        partNumber: activePartNumber,
        movieName: activeMovieName,
        title,
        description,
        tags,
        visibility,
        category: currentYt?.yt_category || '22',
        madeForKids,
        notifySubscribers: currentYt?.yt_notify_subscribers !== false,
        scheduledAt,
        fileSize: blob.size,
        mimeType: blob.type || 'video/mp4'
      });

      updateLocalJob(jobId, { uploadUrl, scheduledAt });

      // Step 2: Upload Blob directly to YouTube (no bytes go through Worker)
      const { videoId } = await uploadBlobToYouTube(uploadUrl, blob, {
        onProgress: (pct) => {
          updateLocalJob(jobId, { progress: pct, scheduledAt });
        },
        signal: controller.signal
      });

      // Step 3: Report success to Worker → D1
      const finalStatus = scheduledAt ? 'scheduled' : 'uploaded';
      await updateUploadJob(jobId, {
        status: finalStatus,
        youtube_video_id: videoId,
        title,
        description,
        tags,
        scheduled_at: scheduledAt || null
      });

      updateLocalJob(jobId, {
        status: finalStatus,
        progress: 100,
        videoId,
        scheduledAt,
        youtubeUrl: buildYouTubeUrl(videoId),
        blobRef: null // release — upload complete
      });

      // Refresh history to reflect new record
      refreshHistory();

    } catch (err) {
      const isCancelled = controller.signal.aborted || err.message?.includes('cancelled');

      if (!isCancelled) {
        // Report failure to D1
        try {
          await updateUploadJob(jobId, {
            status: 'failed',
            error_message: err.message
          });
        } catch {}
      }

      updateLocalJob(jobId, {
        status: isCancelled ? 'upload_cancelled' : 'upload_failed',
        error: isCancelled ? 'Upload cancelled' : err.message,
        progress: 0,
        scheduledAt
      });
    } finally {
      activeUploadsRef.current.delete(jobId);
      abortControllersRef.current.delete(jobId);
      // Process next waiting upload
      processNextUpload();
    }
  }, [ytSettings, movieName, renderTemplate, updateLocalJob, refreshHistory, processNextUpload]);

  useEffect(() => {
    startUploadRef.current = startUpload;
  }, [startUpload]);

  // ── Watch for newly completed exports (Auto-Upload) ──────────────────────────

  useEffect(() => {
    if (!apiAvailable || !isConnected) return;

    // Filter completed clips that haven't been queued for upload yet
    const newClips = completedClips.filter(clip => {
      if (processedExportIdsRef.current.has(clip.id) || !clip.blob) return false;
      // Auto upload if clip has autoUpload enabled, scheduledAt set, or ytSettings.yt_default_upload === 'auto'
      const shouldAutoUpload = clip.autoUpload === true || (clip.autoUpload !== false && (clip.scheduledAt || ytSettings.yt_default_upload === 'auto'));
      return shouldAutoUpload;
    });

    for (const clip of newClips) {
      processedExportIdsRef.current.add(clip.id);

      // Initialize job state with scheduledAt
      setUploadJobs(prev => ({
        ...prev,
        [clip.id]: {
          status: 'queued',
          progress: 0,
          videoId: null,
          error: null,
          scheduledAt: clip.scheduledAt || null,
          blobRef: clip.blob
        }
      }));

      uploadQueueRef.current.push(clip);
    }

    if (newClips.length > 0) {
      processNextUpload();
    }
  }, [completedClips, apiAvailable, isConnected, ytSettings.yt_default_upload, processNextUpload]);

  // ── Manual upload trigger ─────────────────────────────────────────────────────

  const uploadClip = useCallback((clip, overrides = {}) => {
    if (!apiAvailable || !isConnected) return;
    if (!clip.blob) {
      updateLocalJob(clip.id, {
        status: 'upload_failed',
        error: 'Clip blob is no longer available. Please re-export to upload to YouTube.'
      });
      return;
    }

    const enrichedClip = { ...clip, ...overrides };

    // Don't queue if already uploading or queued
    const current = uploadJobs[clip.id];
    if (current?.status === 'uploading' || current?.status === 'queued') return;

    setUploadJobs(prev => ({
      ...prev,
      [clip.id]: {
        status: 'queued',
        progress: 0,
        videoId: null,
        scheduledAt: enrichedClip.scheduledAt || null,
        error: null
      }
    }));

    uploadQueueRef.current.push(enrichedClip);
    processNextUpload();
  }, [apiAvailable, isConnected, uploadJobs, updateLocalJob, processNextUpload]);

  // ── Cancel upload ────────────────────────────────────────────────────────────

  const cancelUpload = useCallback((jobId) => {
    const controller = abortControllersRef.current.get(jobId);
    if (controller) {
      controller.abort();
    }
    // Remove from queue if not yet started
    uploadQueueRef.current = uploadQueueRef.current.filter(c => c.id !== jobId);
    updateLocalJob(jobId, { status: 'upload_cancelled' });
  }, [updateLocalJob]);

  // ── Retry a failed upload ────────────────────────────────────────────────────

  const retryUpload = useCallback(async (clip) => {
    if (!clip.blob) {
      updateLocalJob(clip.id, {
        status: 'upload_failed',
        error: 'Blob no longer in memory — please re-export to retry uploading.'
      });
      return;
    }

    try {
      await retryUploadJob(clip.id);
    } catch {}

    uploadClip(clip);
  }, [updateLocalJob, uploadClip]);

  // ── Clean up on unmount ───────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      abortControllersRef.current.forEach(c => {
        try { c.abort(); } catch {}
      });
    };
  }, []);

  return {
    uploadJobs,      // Map of jobId → upload state
    uploadHistory,   // From D1 (survives refresh)
    isLoadingHistory,
    uploadClip,
    cancelUpload,
    retryUpload,
    refreshHistory
  };
}
