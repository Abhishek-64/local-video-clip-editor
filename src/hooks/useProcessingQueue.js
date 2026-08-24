import { useState, useRef, useEffect, useCallback } from 'react';
import { processVideoClip } from '../services/videoProcessingEngine';
import { downloadClipsAsZip } from '../services/zipService';

export function useProcessingQueue() {
  const [queue, setQueue] = useState([]);
  const [completedClips, setCompletedClips] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

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

      completedClipsRef.current.forEach((clip) => {
        if (clip.outputUrl) {
          try {
            URL.revokeObjectURL(clip.outputUrl);
          } catch (e) {}
        }
      });
    };
  }, []);

  /**
   * Internal runner to process next pending jobs in queue
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

    // Determine concurrency limit from first job export config (capped between 1 and 2 for browser canvas/GPU stability)
    const concurrencyLimit = Math.max(
      1,
      Math.min(2, parseInt(waitingJobs[0]?.exportSettings?.concurrency || waitingJobs[0]?.settings?.export?.concurrency || 1, 10))
    );

    while (activeWorkersRef.current < concurrencyLimit) {
      const nextJob = queueRef.current.find((j) => j.status === 'waiting');
      if (!nextJob) break;

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
        export: job.exportSettings || {},
        captions: job.captionSettings || {}
      };

      const result = await processVideoClip({
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
            setQueue([...queueRef.current]);
          }
        },
        signal: controller.signal
      });

      const completedJob = {
        ...job,
        status: 'completed',
        progress: 100,
        outputUrl: result.url,
        blob: result.blob,
        format: result.format,
        size: result.size,
        duration: result.duration
      };

      // Update in queue
      queueRef.current = queueRef.current.map((j) =>
        j.id === job.id ? completedJob : j
      );
      setQueue([...queueRef.current]);

      // Add to completedClips
      setCompletedClips((prev) => [...prev, completedJob]);
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
      // Revoke previous URLs
      completedClipsRef.current.forEach((clip) => {
        if (clip.outputUrl) {
          try {
            URL.revokeObjectURL(clip.outputUrl);
          } catch (e) {}
        }
      });

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

    completedClipsRef.current.forEach((c) => {
      if (c.outputUrl) {
        try {
          URL.revokeObjectURL(c.outputUrl);
        } catch (e) {}
      }
    });

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
    if (!clip.outputUrl && !clip.blob) {
      console.warn('Clip is not ready for download yet');
      return;
    }

    const url = clip.outputUrl || URL.createObjectURL(clip.blob);
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
    clearQueue,
    downloadClip,
    downloadAllZip
  };
}
