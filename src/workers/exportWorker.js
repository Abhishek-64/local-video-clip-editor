/**
 * Web Worker for Off-Thread Video Export Processing
 * Handles WebCodecs decoding, GPU OffscreenCanvas rendering, audio mixing, and MP4 muxing.
 */

/* eslint-disable no-restricted-globals */
let currentAbortController = null;

self.onmessage = async (e) => {
  const { type, jobId, payload } = e.data || {};

  if (type === 'EXPORT_START') {
    currentAbortController = new AbortController();

    try {
      // Dynamic import of export engine in worker
      const { exportVideoClip } = await import('../services/exportEngine');

      const result = await exportVideoClip({
        ...payload,
        onProgress: (pct) => {
          self.postMessage({
            type: 'EXPORT_PROGRESS',
            jobId,
            progress: pct
          });
        },
        signal: currentAbortController.signal
      });

      self.postMessage({
        type: 'EXPORT_COMPLETE',
        jobId,
        result
      });
    } catch (err) {
      if (currentAbortController?.signal.aborted) {
        self.postMessage({
          type: 'EXPORT_CANCELLED',
          jobId
        });
      } else {
        self.postMessage({
          type: 'EXPORT_ERROR',
          jobId,
          error: err.message || 'Worker export failed'
        });
      }
    } finally {
      currentAbortController = null;
    }
  } else if (type === 'EXPORT_CANCEL') {
    if (currentAbortController) {
      currentAbortController.abort();
    }
  }
};
