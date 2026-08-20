import { useState, useRef, useEffect, useCallback } from 'react';
import { processVideoClip } from '../services/videoProcessingEngine';
import { downloadClipsAsZip } from '../services/zipService';

export function useProcessingQueue() {
  const [queue, setQueue] = useState([]);
  const [completedClips, setCompletedClips] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

  const abortControllersRef = useRef(new Map());
  const processingRef = useRef(false);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      completedClips.forEach((clip) => {
        if (clip.outputUrl) {
          try {
            URL.revokeObjectURL(clip.outputUrl);
          } catch (e) {}
        }
      });
    };
  }, [completedClips]);

  /**
   * Set jobs in queue and start processing immediately
   */
  const setAndStartQueue = useCallback((newJobs, videoSource, concurrency = 1) => {
    // Revoke previous URLs
    completedClips.forEach((clip) => {
      if (clip.outputUrl) {
        try {
          URL.revokeObjectURL(clip.outputUrl);
        } catch (e) {}
      }
    });

    setQueue(newJobs);
    setCompletedClips([]);
    setIsProcessing(true);
    processingRef.current = true;

    runQueue(newJobs, videoSource, concurrency);
  }, [completedClips]);

  /**
   * Internal queue runner handling concurrency limit
   */
  const runQueue = async (initialJobs, videoSource, concurrencyLimit = 1) => {
    let currentJobs = [...initialJobs];
    const maxConcurrent = Math.max(1, concurrencyLimit || 1);

    const executeJob = async (job) => {
      if (!processingRef.current) return;

      const controller = new AbortController();
      abortControllersRef.current.set(job.id, controller);

      // Update status to processing
      setQueue((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, status: 'processing', progress: 0 } : j))
      );

      try {
        const result = await processVideoClip({
          videoSource,
          startTime: job.startTime,
          endTime: job.endTime,
          partNumber: job.partNumber,
          settings: job.settings,
          onProgress: (pct) => {
            setQueue((prev) =>
              prev.map((j) => (j.id === job.id ? { ...j, progress: pct } : j))
            );
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

        // Update queue item
        setQueue((prev) =>
          prev.map((j) => (j.id === job.id ? completedJob : j))
        );

        // Add to completed clips immediately so user can download/preview right away
        setCompletedClips((prev) => [...prev, completedJob]);
      } catch (err) {
        if (err.message?.includes('cancelled')) {
          setQueue((prev) =>
            prev.map((j) => (j.id === job.id ? { ...j, status: 'cancelled' } : j))
          );
        } else {
          console.error(`Error processing clip ${job.name}:`, err);
          setQueue((prev) =>
            prev.map((j) => (j.id === job.id ? { ...j, status: 'failed', error: err.message } : j))
          );
        }
      } finally {
        abortControllersRef.current.delete(job.id);
      }
    };

    // Concurrency runner pool
    const pendingPool = [...currentJobs];
    const workers = Array.from({ length: maxConcurrent }).map(async () => {
      while (pendingPool.length > 0 && processingRef.current) {
        const nextJob = pendingPool.shift();
        if (nextJob) {
          await executeJob(nextJob);
        }
      }
    });

    await Promise.all(workers);
    setIsProcessing(false);
    processingRef.current = false;
  };

  /**
   * Cancel an individual running job
   */
  const cancelJob = useCallback((id) => {
    const controller = abortControllersRef.current.get(id);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(id);
    }
    setQueue((prev) =>
      prev.map((j) => (j.id === id ? { ...j, status: 'cancelled' } : j))
    );
  }, []);

  /**
   * Clear all queue items and revoke URLs
   */
  const clearQueue = useCallback(() => {
    processingRef.current = false;
    abortControllersRef.current.forEach((c) => c.abort());
    abortControllersRef.current.clear();

    completedClips.forEach((c) => {
      if (c.outputUrl) {
        try {
          URL.revokeObjectURL(c.outputUrl);
        } catch (e) {}
      }
    });

    setQueue([]);
    setCompletedClips([]);
    setIsProcessing(false);
  }, [completedClips]);

  /**
   * Download a single completed clip
   */
  const downloadClip = useCallback((clip) => {
    if (!clip.outputUrl && !clip.blob) {
      console.warn('Clip is not ready for download yet');
      return;
    }

    const url = clip.outputUrl || URL.createObjectURL(clip.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = clip.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  /**
   * Download all completed clips as a ZIP
   */
  const downloadAllZip = useCallback(
    async (movieName = 'Clips') => {
      if (completedClips.length === 0) return;

      setIsZipping(true);
      setZipProgress(0);

      try {
        await downloadClipsAsZip(completedClips, `${movieName} - Clips`, (pct) => {
          setZipProgress(pct);
        });
      } catch (err) {
        console.error('ZIP generation error:', err);
      } finally {
        setIsZipping(false);
        setZipProgress(0);
      }
    },
    [completedClips]
  );

  return {
    queue,
    setQueue,
    completedClips,
    isProcessing,
    isZipping,
    zipProgress,
    setAndStartQueue,
    cancelJob,
    clearQueue,
    downloadClip,
    downloadAllZip
  };
}
