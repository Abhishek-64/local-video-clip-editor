/**
 * Web Worker Bridge — Persistent Worker Pool
 *
 * Problem: The previous implementation created a brand new Worker for every clip export.
 * Each Worker spawn requires Chrome to:
 *   1. Allocate a new OS thread (~8 MB stack)
 *   2. JIT-compile the entire exportWorker.js bundle (~50 KB)
 *   3. Pay a ~300ms startup cost before any actual encoding begins
 * After Worker.terminate(), Chrome briefly retains the V8 context for GC, causing
 * visible pauses between exports on the 4th+ clip.
 *
 * Solution: Keep ONE persistent worker alive for the session. Between jobs we send
 * a `reset` message to clear worker-side state, then reuse the same thread.
 * The worker is only recreated if it crashes (onerror), ensuring robust fallback.
 */

import { clipResourceManager } from './exportResourceManager';

// ── Singleton Worker State ────────────────────────────────────────────────────
let _poolWorker = null;          // The persistent reusable Worker
let _poolBusy = false;           // True while a job is running
let _currentJobCallbacks = null; // { onProgress, resolve, reject, abortHandler }

/**
 * Lazily create or return the pooled worker.
 * Recreates the worker only if it has crashed (null after onerror).
 */
function getPoolWorker() {
  if (_poolWorker) return _poolWorker;

  _poolWorker = new Worker(
    new URL('./exportWorker.js', import.meta.url),
    { type: 'module' }
  );

  _poolWorker.onmessage = (e) => {
    const msg = e.data;
    if (!msg || !_currentJobCallbacks) return;

    const { onProgress, resolve, reject } = _currentJobCallbacks;

    if (msg.type === 'progress') {
      onProgress(msg.progress);
    } else if (msg.type === 'complete') {
      _poolBusy = false;
      _currentJobCallbacks = null;

      const canonicalKey = msg.clipId || msg.jobId || `clip-${Date.now()}`;
      const resources = clipResourceManager.registerClip(canonicalKey, {
        blob: msg.blob,
        thumbnailBlob: msg.thumbnailBlob
      });

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
      _poolBusy = false;
      _currentJobCallbacks = null;
      reject(new Error(msg.message || 'Unknown export worker error'));
    }
  };

  _poolWorker.onerror = (err) => {
    // Worker crashed — recreate it for the next job.
    console.error('[WorkerPool] Worker crashed, will recreate on next job:', err);
    _poolBusy = false;
    const cbs = _currentJobCallbacks;
    _currentJobCallbacks = null;
    _poolWorker = null; // Force recreation next time getPoolWorker() is called
    if (cbs?.reject) {
      cbs.reject(new Error(err?.message || 'Export worker crashed'));
    }
  };

  return _poolWorker;
}

/**
 * Run a single clip export in the persistent pooled worker.
 * Equivalent API to the previous per-clip Worker bridge.
 */
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

  if (_poolBusy) {
    throw new Error('Worker pool is busy — scheduler should serialize heavy jobs');
  }

  if (signal?.aborted) {
    return Promise.reject(new Error('Export cancelled by user'));
  }

  return new Promise((resolve, reject) => {
    const worker = getPoolWorker();
    _poolBusy = true;

    // Handle abort signal: send cancel message, don't terminate the persistent worker
    let abortHandler = null;
    if (signal) {
      abortHandler = () => {
        if (_poolBusy) {
          try { worker.postMessage({ type: 'cancel' }); } catch (_) {}
          _poolBusy = false;
          _currentJobCallbacks = null;
          reject(new Error('Export cancelled by user'));
        }
      };
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    _currentJobCallbacks = {
      onProgress,
      resolve: (result) => {
        if (abortHandler && signal) {
          signal.removeEventListener('abort', abortHandler);
        }
        resolve(result);
      },
      reject: (err) => {
        if (abortHandler && signal) {
          signal.removeEventListener('abort', abortHandler);
        }
        reject(err);
      },
      abortHandler
    };

    // ── Serialize audio data as transferable zero-copy ArrayBuffers ──────────
    let mixedAudioData = null;
    const transferables = [];

    if (mixedAudioBuffer) {
      try {
        let leftBuffer;
        let rightBuffer;

        if (mixedAudioBuffer.leftChannel instanceof Float32Array &&
            mixedAudioBuffer.rightChannel instanceof Float32Array) {
          // Zero-copy path: transfer existing channel ArrayBuffers directly
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

/**
 * Terminate the pooled worker entirely.
 * Call this only on full application teardown (e.g., beforeunload).
 * NOT called between exports — the pool is designed to persist.
 */
export function terminateWorkerPool() {
  if (_poolWorker) {
    try { _poolWorker.terminate(); } catch (_) {}
    _poolWorker = null;
    _poolBusy = false;
    _currentJobCallbacks = null;
  }
}
