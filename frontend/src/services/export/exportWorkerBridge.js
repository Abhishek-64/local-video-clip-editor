/**
 * Web Worker Bridge for High-Performance Video Export
 * Manages worker lifecycle, audio data serialization, progress reporting,
 * cancellation, and seamless fallback triggers.
 */

import { clipResourceManager } from './exportResourceManager';

export async function runExportInWorker({
  jobId = null,
  clipId = null,
  sourceFile,
  startTime,
  endTime,
  segments,
  partNumber = 1,
  settings = {},
  mixedAudioBuffer = null,
  canvasWidth,
  canvasHeight,
  onProgress = () => {},
  signal = null
}) {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    throw new Error('Web Worker or OffscreenCanvas not supported in this environment');
  }

  return new Promise((resolve, reject) => {
    let worker = null;
    let isTerminated = false;

    const cleanup = () => {
      if (isTerminated) return;
      isTerminated = true;
      if (worker) {
        try {
          worker.terminate();
        } catch (e) {}
        worker = null;
      }
    };

    if (signal) {
      if (signal.aborted) {
        return reject(new Error('Export cancelled by user'));
      }
      signal.addEventListener('abort', () => {
        if (worker) {
          try {
            worker.postMessage({ type: 'cancel' });
          } catch (e) {}
        }
        cleanup();
        reject(new Error('Export cancelled by user'));
      });
    }

    try {
      worker = new Worker(
        new URL('./exportWorker.js', import.meta.url),
        { type: 'module' }
      );
    } catch (workerInitErr) {
      cleanup();
      return reject(new Error(`Failed to instantiate export worker: ${workerInitErr.message}`));
    }

    worker.onmessage = (e) => {
      const msg = e.data;
      if (!msg) return;

      if (msg.type === 'progress') {
        onProgress(msg.progress);
      } else if (msg.type === 'complete') {
        const canonicalKey = clipId || jobId || `clip-${partNumber}-${Date.now()}`;
        const resources = clipResourceManager.registerClip(canonicalKey, {
          blob: msg.blob,
          thumbnailBlob: msg.thumbnailBlob
        });
        cleanup();
        resolve({
          blob: msg.blob,
          url: resources.videoUrl,
          thumbnailBlob: msg.thumbnailBlob,
          thumbnailUrl: resources.thumbnailUrl,
          duration: msg.duration,
          format: msg.format || 'mp4',
          size: msg.size,
          metrics: msg.metrics || null
        });
      } else if (msg.type === 'error') {
        cleanup();
        reject(new Error(msg.message || 'Unknown export worker error'));
      }
    };

    worker.onerror = (err) => {
      cleanup();
      reject(new Error(err?.message || 'Export worker execution error'));
    };

    // Serialize audio data into transferable Float32Array buffers (zero-copy when raw arrays provided)
    let mixedAudioData = null;
    const transferables = [];

    if (mixedAudioBuffer) {
      try {
        let leftBuffer;
        let rightBuffer;

        if (mixedAudioBuffer.leftChannel instanceof Float32Array && mixedAudioBuffer.rightChannel instanceof Float32Array) {
          // Zero-copy path: transfer existing channel ArrayBuffers directly without duplicating 230MB
          leftBuffer = mixedAudioBuffer.leftChannel.buffer;
          rightBuffer = mixedAudioBuffer.rightChannel.buffer;
        } else {
          // Standard AudioBuffer fallback
          const leftChannel = mixedAudioBuffer.getChannelData(0);
          const rightChannel = mixedAudioBuffer.numberOfChannels > 1
            ? mixedAudioBuffer.getChannelData(1)
            : leftChannel;
          leftBuffer = leftChannel.slice(0).buffer;
          rightBuffer = rightChannel.slice(0).buffer;
        }

        mixedAudioData = {
          leftChannel: leftBuffer,
          rightChannel: rightBuffer,
          sampleRate: mixedAudioBuffer.sampleRate
        };

        if (leftBuffer) transferables.push(leftBuffer);
        if (rightBuffer && rightBuffer !== leftBuffer) transferables.push(rightBuffer);
      } catch (e) {
        console.warn('Failed to prepare transferable audio data:', e);
        mixedAudioData = null;
      }
    }

    worker.postMessage(
      {
        type: 'start',
        payload: {
          jobId,
          clipId,
          sourceFile,
          startTime,
          endTime,
          segments,
          partNumber,
          settings,
          mixedAudioData,
          canvasWidth,
          canvasHeight
        }
      },
      transferables
    );
  });
}
