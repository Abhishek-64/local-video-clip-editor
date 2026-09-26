import { useState, useRef, useEffect, useCallback } from 'react';
import { processVideoClip } from '../services/videoProcessingEngine';
import { downloadClipsAsZip } from '../services/zipService';
import { clipResourceManager } from '../services/export/exportResourceManager';

export const EXPORT_SCHEDULER_CONFIG = {
  longDurationSec: 120,    // 2 minutes or longer is classified as a heavy export
  longFrameCount: 3600,    // 3600 frames or more
  maxHeavyConcurrency: 1,  // Strict exclusive execution for long/heavy exports to avoid hardware context thrashing
  normalConcurrency: 2     // Concurrency for light/short clips if device and settings permit
};

/**
 * Calculate estimated job workload and complexity
 */
export function calculateJobComplexity(job) {
  if (!job) return { duration: 0, fps: 30, estimatedFrames: 0, estimatedPixels: 0, isHeavy: false };
  const duration = Math.max(0, parseFloat(job.duration || (job.endTime - job.startTime) || 0));
  const fps = parseFloat(job.exportSettings?.fps || job.settings?.export?.fps || 30) || 30;
  const estimatedFrames = Math.round(duration * fps);
  const resolution = job.exportSettings?.resolution || job.settings?.export?.resolution || 'original';
  const width = job.videoData?.width || (resolution === '4k' ? 3840 : resolution === '1440p' ? 2560 : resolution === '720p' ? 1280 : 1920);
  const height = job.videoData?.height || (resolution === '4k' ? 2160 : resolution === '1440p' ? 1440 : resolution === '720p' ? 720 : 1080);
  const estimatedPixels = width * height * estimatedFrames;
  const isFaceTracking = Boolean(job.cropSettings?.faceTracking || job.settings?.crop?.faceTracking);

  const isHeavy =
    duration >= EXPORT_SCHEDULER_CONFIG.longDurationSec ||
    estimatedFrames >= EXPORT_SCHEDULER_CONFIG.longFrameCount ||
    estimatedPixels >= (1920 * 1080 * 3600);

  return {
    duration,
    fps,
    estimatedFrames,
    estimatedPixels,
    isHeavy,
    isFaceTracking
  };
}

export function useProcessingQueue({ onClipCompleted } = {}) {
  const [queue, setQueue] = useState([]);
  const [completedClips, setCompletedClips] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

  const onClipCompletedRef = useRef(onClipCompleted);
  useEffect(() => {
    onClipCompletedRef.current = onClipCompleted;
  }, [onClipCompleted]);

  const queueRef = useRef([]);
  const completedClipsRef = useRef([]);
  const abortControllersRef = useRef(new Map());
  const activeWorkersRef = useRef(0);
  const isDestroyedRef = useRef(false);
  const wakeLockRef = useRef(null);

  // Screen WakeLock Management: prevents mobile browser from dimming/sleeping during export
  const acquireWakeLock = async () => {
    try {
      if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => {
          wakeLockRef.current = null;
        });
      }
    } catch (e) {
      console.warn('Screen WakeLock not available or denied:', e);
    }
  };

  const releaseWakeLock = async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    } catch (e) {}
  };

  // Sync WakeLock with processing state
  useEffect(() => {
    if (isProcessing) {
      acquireWakeLock();
    } else {
      releaseWakeLock();
    }
  }, [isProcessing]);

  // Re-acquire WakeLock on visibilitychange if user returns to tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isProcessing) {
        acquireWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isProcessing]);

  // Keep refs in sync with state
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    completedClipsRef.current = completedClips;
  }, [completedClips]);

  // Clean up object URLs and abort pending controllers on unmount
  useEffect(() => {
    isDestroyedRef.current = false;
    return () => {
      isDestroyedRef.current = true;
      releaseWakeLock();
      abortControllersRef.current.forEach((c) => {
        try {
          c.abort();
        } catch (e) {}
      });
      abortControllersRef.current.clear();
      clipResourceManager.cleanupAll();
    };
  }, []);

  /**
   * Internal runner to process next pending jobs in queue with adaptive scheduler
   */
  const triggerQueueProcessor = useCallback(() => {
    if (isDestroyedRef.current) return;

    const waitingJobs = queueRef.current.filter((j) => j.status === 'waiting');

    if (waitingJobs.length === 0) {
      if (activeWorkersRef.current === 0) {
        setIsProcessing(false);
      }
      return;
    }

    setIsProcessing(true);

    // Inspect active running jobs
    const runningJobs = queueRef.current.filter((j) => j.status === 'processing');
    const hasRunningHeavyJob = runningJobs.some((j) => calculateJobComplexity(j).isHeavy);

    // If a heavy long export is currently running, no subsequent job can start until it releases resources
    if (hasRunningHeavyJob && activeWorkersRef.current >= EXPORT_SCHEDULER_CONFIG.maxHeavyConcurrency) {
      return;
    }

    // Determine adaptive concurrency limit
    const nextWaiting = waitingJobs[0];
    const nextComplexity = calculateJobComplexity(nextWaiting);
    const userConcurrency = parseInt(nextWaiting?.exportSettings?.concurrency || nextWaiting?.settings?.export?.concurrency || 1, 10);

    const concurrencyLimit = nextComplexity.isHeavy
      ? EXPORT_SCHEDULER_CONFIG.maxHeavyConcurrency
      : Math.max(1, Math.min(EXPORT_SCHEDULER_CONFIG.normalConcurrency, userConcurrency));

    while (activeWorkersRef.current < concurrencyLimit) {
      const nextJob = queueRef.current.find((j) => j.status === 'waiting');
      if (!nextJob) break;

      // If next job is heavy and another job is already running, wait for the heavy exclusive slot
      if (calculateJobComplexity(nextJob).isHeavy && activeWorkersRef.current > 0) {
        break;
      }

      // Mark this job as processing
      nextJob.status = 'processing';
      nextJob.progress = 0;

      queueRef.current = [...queueRef.current];
      setQueue([...queueRef.current]);

      activeWorkersRef.current += 1;
      runSingleJob(nextJob);
    }
  }, []);

  /**
   * Execute single video clip processing job
   */
  const runSingleJob = async (job) => {
    const controller = new AbortController();
    abortControllersRef.current.set(job.id, controller);

    try {
      const videoSource =
        job.videoSource ||
        job.videoData?.url ||
        job.videoData?.file ||
        job.videoData;

      const settings = job.settings || {
        crop: job.cropSettings || {},
        background: job.bgSettings || {},
        text: job.textSettings || {},
        logo: job.logoSettings || {},
        effects: job.effectsSettings || {},
        audio: job.audioSettings || {},
        export: job.exportSettings || {}
      };

      let lastProgressUpdate = 0;
      let lastReportedPct = 0;

      const result = await processVideoClip({
        jobId: job.id,
        clipId: job.id,
        videoSource,
        startTime: job.startTime,
        endTime: job.endTime,
        segments: job.segments,
        partNumber: job.partNumber || 1,
        settings,
        onProgress: (pct) => {
          if (isDestroyedRef.current) return;
          const target = queueRef.current.find((j) => j.id === job.id);
          if (target && target.status === 'processing') {
            target.progress = pct;
            const now = performance.now();
            // Throttled UI progress updates: target ~6-8 updates/sec (125ms interval)
            // Always guarantee 0%, 100%, and updates when progress moves by at least 1%
            if (pct === 100 || (pct !== lastReportedPct && now - lastProgressUpdate >= 125)) {
              lastProgressUpdate = now;
              lastReportedPct = pct;
              setQueue([...queueRef.current]);
            }
          }
        },
        signal: controller.signal
      });

      const completedJob = {
        ...job,
        status: 'completed',
        progress: 100,
        outputUrl: result.url,
        thumbnailUrl: result.thumbnailUrl,
        // Null out raw blob data — the Object URL (outputUrl) is all that's needed
        // for playback and download. Keeping the raw blob in React state pins ~200 MB
        // of heap per 2-min clip and is the single largest source of generation lag.
        blob: null,
        thumbnailBlob: null,
        format: result.format,
        size: result.size,
        duration: result.duration
      };

      // NOTE: clipResourceManager.registerClip() is intentionally NOT called here.
      // The export pipeline (exportWorkerBridge.js / exportEngine.js) already registers
      // the clip and creates its Object URL before returning result.url.
      // A second registerClip() call would create a redundant Object URL for the same
      // blob, wasting browser memory with a URL that never gets revoked.

      // Update in queue
      queueRef.current = queueRef.current.map((j) =>
        j.id === job.id ? completedJob : j
      );
      setQueue([...queueRef.current]);

      // Add to completedClips
      setCompletedClips((prev) => [...prev, completedJob]);

      // Trigger completion callback if supplied (pass result.blob so scheduling/uploading has access)
      if (onClipCompletedRef.current) {
        try {
          onClipCompletedRef.current({
            ...completedJob,
            blob: result.blob || null,
            thumbnailBlob: result.thumbnailBlob || null
          });
        } catch (callbackErr) {
          console.error('[useProcessingQueue] onClipCompleted error:', callbackErr);
        }
      }
    } catch (err) {
      if (isDestroyedRef.current) return;

      const isCancelled = controller.signal.aborted || err.message?.includes('cancelled');
      const updatedJob = {
        ...job,
        status: isCancelled ? 'cancelled' : 'failed',
        error: isCancelled ? 'Cancelled by user' : (err.message || 'Processing failed')
      };

      queueRef.current = queueRef.current.map((j) =>
        j.id === job.id ? updatedJob : j
      );
      setQueue([...queueRef.current]);

      if (!isCancelled) {
        console.error(`Error processing clip ${job.name}:`, err);
      }
    } finally {
      abortControllersRef.current.delete(job.id);
      activeWorkersRef.current = Math.max(0, activeWorkersRef.current - 1);
      // Trigger next job in queue
      triggerQueueProcessor();
    }
  };

  /**
   * Add a single job to queue and start processing
   */
  const addJob = useCallback(
    (newJob) => {
      const jobWithDefaults = {
        status: 'waiting',
        progress: 0,
        ...newJob,
        id: newJob.id || `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
      };

      queueRef.current = [...queueRef.current, jobWithDefaults];
      setQueue([...queueRef.current]);

      setTimeout(() => {
        triggerQueueProcessor();
      }, 0);
    },
    [triggerQueueProcessor]
  );

  /**
   * Add multiple jobs to queue at once and start processing
   */
  const addJobs = useCallback(
    (newJobs) => {
      if (!Array.isArray(newJobs) || newJobs.length === 0) return;

      const formattedJobs = newJobs.map((j, idx) => ({
        status: 'waiting',
        progress: 0,
        ...j,
        id: j.id || `job-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`
      }));

      queueRef.current = [...queueRef.current, ...formattedJobs];
      setQueue([...queueRef.current]);

      setTimeout(() => {
        triggerQueueProcessor();
      }, 0);
    },
    [triggerQueueProcessor]
  );

  /**
   * Reset & set new jobs in queue and start processing immediately (batch replacement)
   */
  const setAndStartQueue = useCallback(
    (newJobs, videoSource, concurrency = 1) => {
      // Revoke previous URLs via centralized resource manager
      clipResourceManager.cleanupAll();

      const formattedJobs = (newJobs || []).map((j, idx) => ({
        status: 'waiting',
        progress: 0,
        videoSource: videoSource || j.videoSource || j.videoData?.url || j.videoData?.file,
        exportSettings: {
          ...(j.exportSettings || {}),
          concurrency
        },
        ...j,
        id: j.id || `job-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`
      }));

      setCompletedClips([]);
      queueRef.current = formattedJobs;
      setQueue(formattedJobs);

      setTimeout(() => {
        triggerQueueProcessor();
      }, 0);
    },
    [triggerQueueProcessor]
  );

  /**
   * Cancel an individual running or waiting job
   */
  const cancelJob = useCallback((id) => {
    const controller = abortControllersRef.current.get(id);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(id);
    }

    queueRef.current = queueRef.current.map((j) =>
      j.id === id ? { ...j, status: 'cancelled' } : j
    );
    setQueue([...queueRef.current]);
  }, []);

  /**
   * Remove an individual completed clip and revoke its object URLs immediately
   */
  const removeClip = useCallback((id) => {
    clipResourceManager.revokeClip(id);
    completedClipsRef.current = completedClipsRef.current.filter((c) => c.id !== id);
    setCompletedClips((prev) => prev.filter((c) => c.id !== id));
    queueRef.current = queueRef.current.filter((j) => j.id !== id);
    setQueue((prev) => prev.filter((j) => j.id !== id));
  }, []);

  /**
   * Clear all queue items and revoke object URLs
   */
  const clearQueue = useCallback(() => {
    abortControllersRef.current.forEach((c) => {
      try {
        c.abort();
      } catch (e) {}
    });
    abortControllersRef.current.clear();
    activeWorkersRef.current = 0;

    clipResourceManager.cleanupAll();

    queueRef.current = [];
    setQueue([]);
    setCompletedClips([]);
    setIsProcessing(false);
  }, []);

  /**
   * Download a single completed clip
   */
  const downloadClip = useCallback((clip) => {
    if (!clip) return;
    const url = clip.outputUrl || clipResourceManager.getVideoUrl(clip.id, clip.blob);
    if (!url) {
      console.warn('Clip is not ready for download yet');
      return;
    }

    const a = document.createElement('a');
    a.href = url;
    a.download = clip.name || `clip-${clip.partNumber || 1}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  /**
   * Download all completed clips as a ZIP archive
   */
  const downloadAllZip = useCallback(
    async (movieName = 'Clips') => {
      if (completedClipsRef.current.length === 0) return;

      setIsZipping(true);
      setZipProgress(0);

      try {
        await downloadClipsAsZip(completedClipsRef.current, `${movieName} - Clips`, (pct) => {
          setZipProgress(pct);
        });
      } catch (err) {
        console.error('ZIP generation error:', err);
        throw err;
      } finally {
        setIsZipping(false);
        setZipProgress(0);
      }
    },
    []
  );

  /**
   * Stop/halt all active video clip generation jobs immediately
   */
  const stopGenerating = useCallback(() => {
    abortControllersRef.current.forEach((c) => {
      try {
        c.abort();
      } catch (e) {}
    });
    abortControllersRef.current.clear();
    activeWorkersRef.current = 0;

    queueRef.current = queueRef.current.map((j) =>
      j.status === 'processing' || j.status === 'waiting'
        ? { ...j, status: 'cancelled', error: 'Stopped by user' }
        : j
    );
    setQueue([...queueRef.current]);
    setIsProcessing(false);
    releaseWakeLock();
  }, []);

  /**
   * Permanently remove multiple selected jobs from the queue and cleanup memory
   * @param {string[]} jobIds
   */
  const deleteSelectedJobs = useCallback((jobIds = []) => {
    if (!Array.isArray(jobIds) || jobIds.length === 0) return;
    const targetSet = new Set(jobIds);

    jobIds.forEach((id) => {
      const controller = abortControllersRef.current.get(id);
      if (controller) {
        try { controller.abort(); } catch (e) {}
        abortControllersRef.current.delete(id);
      }
      clipResourceManager.revokeClip(id);
    });

    completedClipsRef.current = completedClipsRef.current.filter((c) => !targetSet.has(c.id));
    setCompletedClips([...completedClipsRef.current]);

    queueRef.current = queueRef.current.filter((j) => !targetSet.has(j.id));
    setQueue([...queueRef.current]);

    const remainingActive = queueRef.current.some((j) => j.status === 'processing' || j.status === 'waiting');
    if (!remainingActive) {
      activeWorkersRef.current = 0;
      setIsProcessing(false);
      releaseWakeLock();
    }
  }, []);

  return {
    queue,
    setQueue,
    completedClips,
    isProcessing,
    isZipping,
    zipProgress,
    addJob,
    addJobs,
    setAndStartQueue,
    cancelJob,
    stopGenerating,
    clearQueue,
    removeClip,
    deleteSelectedJobs,
    downloadClip,
    downloadAllZip
  };
}
