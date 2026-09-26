/**
 * useInstagram — React Hook for Meta Graph API & Instagram Reels/Video Publishing
 *
 * Manages:
 * - Meta OAuth & Active Instagram Professional Account Selection
 * - Template tokens for Instagram Captions & Hashtags
 * - End-to-end publishing pipeline: Client -> Backblaze B2 -> Meta Graph API -> B2 Cleanup
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getInstagramAccount,
  selectInstagramAccount,
  connectInstagramAccountById,
  disconnectInstagramAccount,
  debugInstagramAccount,
  getInstagramDiagnostics,
  getInstagramB2UploadTarget,
  uploadToB2,
  publishToInstagram,
  isApiConfigured
} from '../services/apiService';
import sharedUploadCache from '../services/sharedUploadCache';

const IG_SETTINGS_STORAGE_KEY = 'video_clip_editor_ig_settings';

const DEFAULT_IG_SETTINGS = {
  ig_name: '',
  ig_start_part: 1,
  ig_zero_pad: true,
  ig_content_type: 'reel', // 'reel' | 'video'
  ig_is_ai_generated: false,
  ig_share_to_feed: true,
  ig_caption_template: '{movie} - Part {part}\n\n#Reels #InstagramReels #Viral\n\n{hashtags}',
  ig_title_template: '{movie} - Part {part} | #Reels',
  ig_tags: ['reels', 'instagramreels', 'viral', 'explore', 'trending', 'clips'],
  ig_schedule_mode: 'now', // 'now' | 'schedule'
  ig_schedule_time: ''
};

function loadStoredIgSettings() {
  try {
    const raw = localStorage.getItem(IG_SETTINGS_STORAGE_KEY);
    return raw ? { ...DEFAULT_IG_SETTINGS, ...JSON.parse(raw) } : DEFAULT_IG_SETTINGS;
  } catch {
    return DEFAULT_IG_SETTINGS;
  }
}

export function useInstagram({ isAuthenticated = false } = {}) {
  const [igAccount, setIgAccount] = useState(null);
  const [availableAccounts, setAvailableAccounts] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isUserConnected, setIsUserConnected] = useState(false);
  const [isAccountConnected, setIsAccountConnected] = useState(false);
  const [isLoadingAccount, setIsLoadingAccount] = useState(false);
  const [accountError, setAccountError] = useState(null);

  // Manual Account Connection State
  const [isConnectingAccount, setIsConnectingAccount] = useState(false);
  const [accountConnectError, setAccountConnectError] = useState(null);

  // Instagram Publishing Settings (persisted locally)
  const [igSettings, setIgSettings] = useState(loadStoredIgSettings);

  // Publishing Execution State
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState(0);
  const [publishStage, setPublishStage] = useState(''); // 'b2_upload' | 'ig_processing' | 'cleanup' | 'done' | 'error'
  const [publishError, setPublishError] = useState(null);
  const [lastPublishedPost, setLastPublishedPost] = useState(null);

  const apiAvailable = isApiConfigured();

  const updateIgSettings = useCallback((updates) => {
    setIgSettings(prev => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem(IG_SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // ── Load Account Info ────────────────────────────────────────────────────────

  const refreshIgAccount = useCallback(async () => {
    if (!apiAvailable) return;
    setIsLoadingAccount(true);
    setAccountError(null);
    try {
      const res = await getInstagramAccount();
      if (res && res.account) {
        const hasActiveAccount = Boolean(res.isAccountConnected || (res.account.ig_user_id && res.account.ig_username));
        const hasUser = Boolean(res.isUserConnected || res.account.ig_user_id);

        setIgAccount(res.account);
        setAvailableAccounts(res.availableAccounts || []);
        setIsUserConnected(hasUser);
        setIsAccountConnected(hasActiveAccount);
        setIsConnected(hasActiveAccount);
      } else {
        setIgAccount(null);
        setAvailableAccounts([]);
        setIsUserConnected(false);
        setIsAccountConnected(false);
        setIsConnected(false);
      }
    } catch (err) {
      setAccountError(err.message);
      setIsUserConnected(false);
      setIsAccountConnected(false);
      setIsConnected(false);
    } finally {
      setIsLoadingAccount(false);
    }
  }, [apiAvailable]);

  useEffect(() => {
    refreshIgAccount();
  }, [refreshIgAccount, isAuthenticated]);

  // ── Connect Instagram via Popup ──────────────────────────────────────────────

  const connectInstagram = useCallback(() => {
    if (!apiAvailable) {
      alert('Backend API is not configured.');
      return;
    }

    const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
    const frontendUrl = window.location.origin;
    const connectUrl = `${apiUrl}/api/instagram/connect?frontendUrl=${encodeURIComponent(frontendUrl)}&popup=1`;

    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      connectUrl,
      'instagram_oauth',
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,status=yes`
    );

    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      window.location.href = connectUrl;
      return;
    }

    const handleMessage = (event) => {
      if (event.data && event.data.type === 'INSTAGRAM_AUTH_RESULT') {
        window.removeEventListener('message', handleMessage);
        if (event.data.success) {
          refreshIgAccount();
        } else {
          setAccountError(event.data.error || 'Failed to connect Instagram account.');
        }
      }
    };

    window.addEventListener('message', handleMessage);

    // Fallback interval to check if popup closed
    const timer = setInterval(() => {
      if (popup && popup.closed) {
        clearInterval(timer);
        window.removeEventListener('message', handleMessage);
        refreshIgAccount();
      }
    }, 1000);
  }, [apiAvailable, refreshIgAccount]);

  // ── Manually Connect Instagram Account by ID / Username ──────────────────────

  const connectAccountById = useCallback(async (accountId) => {
    const cleanId = String(accountId || '').trim();
    if (!cleanId) {
      setAccountConnectError('Please enter a valid Instagram Account ID or Username.');
      return false;
    }
    setIsConnectingAccount(true);
    setAccountConnectError(null);
    try {
      const res = await connectInstagramAccountById({ accountId: cleanId });
      if (res && res.success) {
        await refreshIgAccount();
        return true;
      }
      return false;
    } catch (err) {
      setAccountConnectError(err.message || 'This Instagram account is not accessible by the connected Meta account.');
      return false;
    } finally {
      setIsConnectingAccount(false);
    }
  }, [refreshIgAccount]);

  // ── Safe Account Diagnostics ────────────────────────────────────────────────

  const checkAccountDiagnostics = useCallback(async () => {
    try {
      return await getInstagramDiagnostics();
    } catch (err) {
      try {
        return await debugInstagramAccount();
      } catch (innerErr) {
        return { connected: false, can_publish: false, error: err.message || innerErr.message };
      }
    }
  }, []);

  // ── Switch Active Instagram Account ─────────────────────────────────────────

  const switchAccount = useCallback(async (igUserId) => {
    if (!igUserId) return;
    try {
      await selectInstagramAccount(igUserId);
      await refreshIgAccount();
    } catch (err) {
      setAccountError(err.message);
    }
  }, [refreshIgAccount]);

  // ── Disconnect Instagram ────────────────────────────────────────────────────

  const disconnectInstagram = useCallback(async () => {
    try {
      await disconnectInstagramAccount();
      setIgAccount(null);
      setAvailableAccounts([]);
      setIsConnected(false);
      setIsUserConnected(false);
      setIsAccountConnected(false);
    } catch (err) {
      console.error('Failed to disconnect Instagram:', err);
    }
  }, []);

  // ── Template Token Renderer ─────────────────────────────────────────────────

  const renderIgTemplate = useCallback((templateStr, {
    movieName = 'My Movie',
    partNumber = 1,
    zeroPad = true,
    tags = []
  } = {}) => {
    if (!templateStr) return '';
    const partFormatted = zeroPad ? String(partNumber).padStart(2, '0') : String(partNumber);
    const activeTags = (tags && tags.length > 0) ? tags : (igSettings.ig_tags || []);
    const hashtagsFormatted = activeTags.map(t => `#${t.replace(/^#+/, '')}`).join(' ');

    return templateStr
      .replace(/\{movie\}/gi, movieName)
      .replace(/\{title\}/gi, movieName)
      .replace(/\{text\}/gi, movieName)
      .replace(/\{part\}/gi, partFormatted)
      .replace(/\{hashtags\}/gi, hashtagsFormatted)
      .replace(/\{tags\}/gi, activeTags.join(', '));
  }, [igSettings.ig_tags]);

  // ── End-to-End Publish Pipeline ─────────────────────────────────────────────

  const publishToInstagramPipeline = useCallback(async (blobOrOptions, maybeOptions = {}) => {
    let videoBlob = blobOrOptions;
    let opts = maybeOptions || {};

    if (blobOrOptions && !(blobOrOptions instanceof Blob) && blobOrOptions.videoBlob instanceof Blob) {
      videoBlob = blobOrOptions.videoBlob;
      opts = blobOrOptions;
    }

    const {
      contentType = 'reel',
      caption = '',
      title = '',
      hashtags = [],
      shareToFeed = true,
      isAiGenerated = false,
      scheduledAt = null,
      fileName = 'clip.mp4',
      igUserId = null
    } = opts;

    const isBlobLike = (b) => Boolean(b && (
      b instanceof Blob ||
      (typeof b === 'object' && typeof b.slice === 'function' && typeof b.size === 'number')
    ));

    // If videoBlob was not directly passed, attempt recovery from outputUrl if provided
    if (!isBlobLike(videoBlob) && (opts.outputUrl || opts.url)) {
      try {
        const fetchRes = await fetch(opts.outputUrl || opts.url);
        videoBlob = await fetchRes.blob();
      } catch (recoveryErr) {
        console.warn('[useInstagram] Could not recover blob from outputUrl:', recoveryErr);
      }
    }

    if (!isBlobLike(videoBlob) && (!opts.b2FileId || !opts.b2FileName)) {
      throw new Error('No valid video blob or B2 asset available to publish.');
    }

    if (!isConnected || !igAccount) {
      throw new Error('Please connect your Instagram Account before publishing.');
    }

    setIsPublishing(true);
    setPublishProgress(0);
    setPublishError(null);
    setLastPublishedPost(null);

    const cacheKey = opts.clipId || (videoBlob && videoBlob.size ? `${fileName}_${videoBlob.size}` : videoBlob);
    let cachedUpload = videoBlob ? sharedUploadCache.getCachedUpload(videoBlob, cacheKey) : null;

    let b2FileId = opts.b2FileId || cachedUpload?.b2FileId;
    let b2FileName = opts.b2FileName || cachedUpload?.b2FileName;

    const executeUploadAndPublish = async (forceFreshUpload = false) => {
      let b2FileId = (!forceFreshUpload ? opts.b2FileId : null) || (!forceFreshUpload ? cachedUpload?.b2FileId : null);
      let b2FileName = (!forceFreshUpload ? opts.b2FileName : null) || (!forceFreshUpload ? cachedUpload?.b2FileName : null);

      if (!b2FileName) {
        // Check if another platform (e.g. Facebook) is actively uploading this clip right now
        const inFlight = !forceFreshUpload ? sharedUploadCache.getInFlightUpload(videoBlob, cacheKey) : null;
        if (inFlight) {
          setPublishStage('b2_upload');
          setPublishProgress(50);
          const uploadRes = await inFlight;
          b2FileId = uploadRes.b2FileId;
          b2FileName = uploadRes.b2FileName;
          setPublishProgress(100);
        } else {
          // Step 1: Obtain Backblaze B2 Upload Target
          setPublishStage('b2_upload');

          const uploadPromise = (async () => {
            const target = await getInstagramB2UploadTarget();
            if (!target || !target.uploadUrl) {
              throw new Error('Failed to obtain Backblaze B2 upload target.');
            }

            const tempFileName = `social_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

            // Step 2: Upload Video to Backblaze B2 with progress tracking
            const b2Res = await uploadToB2(
              target.uploadUrl,
              target.authorizationToken,
              videoBlob,
              tempFileName,
              (percent) => {
                setPublishProgress(percent);
              }
            );

            return {
              b2FileId: b2Res.fileId || tempFileName,
              b2FileName: b2Res.fileName || tempFileName
            };
          })();

          // Register in-flight upload to deduplicate simultaneous requests
          const uploadRes = await sharedUploadCache.trackUpload(videoBlob, uploadPromise, cacheKey);
          b2FileId = uploadRes.b2FileId;
          b2FileName = uploadRes.b2FileName;
        }
      } else {
        // Already uploaded to B2! Skip upload and proceed directly
        setPublishStage('ig_processing');
        setPublishProgress(100);
      }

      // Step 3: Trigger Meta Graph API Ingestion & Container Publish via Cloudflare Worker
      setPublishStage('ig_processing');
      setPublishProgress(100);

      const publishResult = await publishToInstagram({
        contentType,
        b2FileId,
        b2FileName,
        caption,
        title,
        hashtags,
        shareToFeed,
        isAiGenerated,
        scheduledAt,
        igUserId: igUserId || igAccount.ig_user_id,
        retainB2: Boolean(opts.retainB2)
      });

      if (!publishResult || !publishResult.success) {
        throw new Error(publishResult?.error || 'Instagram publishing failed.');
      }

      return publishResult;
    };

    try {
      let publishResult;
      try {
        publishResult = await executeUploadAndPublish(false);
      } catch (firstErr) {
        const isStaleB2 = /B2_FILE_NOT_FOUND|2207076|not found in temporary storage|does not exist in temporary/i.test(firstErr.message || '') ||
          firstErr?.status === 404 ||
          firstErr?.code === 'B2_FILE_NOT_FOUND';

        if (!isBlobLike(videoBlob) && (opts.outputUrl || opts.url)) {
          try {
            const fetchRes = await fetch(opts.outputUrl || opts.url);
            videoBlob = await fetchRes.blob();
          } catch {}
        }

        if (isStaleB2 && isBlobLike(videoBlob)) {
          console.warn(`[Instagram] Stale or missing B2 file detected (${firstErr.message}). Invalidate cache and auto-retry fresh upload...`);
          sharedUploadCache.removeCachedUpload(videoBlob, cacheKey);
          if (b2FileName) sharedUploadCache.invalidateByFileName(b2FileName);
          cachedUpload = null;
          setPublishStage('b2_upload');
          setPublishProgress(0);
          publishResult = await executeUploadAndPublish(true);
        } else {
          throw firstErr;
        }
      }

      // Clean up cache once published unless caller requested retention for another platform
      if (videoBlob && !opts.retainCache) {
        sharedUploadCache.removeCachedUpload(videoBlob, cacheKey);
      }

      setPublishStage('done');
      setLastPublishedPost({
        mediaId: publishResult.media_id || publishResult.mediaId,
        postUrl: publishResult.postUrl,
        status: publishResult.status,
        scheduledAt
      });

      return publishResult;
    } catch (err) {
      if (videoBlob) {
        sharedUploadCache.removeCachedUpload(videoBlob, cacheKey);
      }
      console.error('Instagram publish pipeline error:', err);
      setPublishStage('error');
      setPublishError(err.message);
      throw err;
    } finally {
      setIsPublishing(false);
    }
  }, [isConnected, igAccount]);

  return {
    igAccount,
    availableAccounts,
    isConnected,
    isUserConnected,
    isAccountConnected,
    isLoadingAccount,
    accountError,
    connectInstagram,
    connectAccountById,
    isConnectingAccount,
    accountConnectError,
    setAccountConnectError,
    switchAccount,
    disconnectInstagram,
    refreshIgAccount,
    checkAccountDiagnostics,
    igSettings,
    updateIgSettings,
    renderIgTemplate,
    publishToInstagramPipeline,
    isPublishing,
    publishProgress,
    publishStage,
    publishError,
    lastPublishedPost,
    apiAvailable
  };
}
