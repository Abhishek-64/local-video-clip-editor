/**
 * Export Performance Telemetry & Diagnostics
 * Collects precise performance metrics across worker and main-thread pipelines:
 * Decode FPS, Render FPS, Encode FPS, Queue Sizes, Execution Timings,
 * Memory Estimates, and Device Concurrency info.
 */

export const EXPORT_DEBUG = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

/**
 * Estimate raw Float32 audio memory in bytes
 * @param {number} channelCount
 * @param {number} sampleRate
 * @param {number} durationSeconds
 * @returns {number}
 */
export function estimateAudioMemoryBytes(channelCount = 2, sampleRate = 48000, durationSeconds = 0) {
  return Math.round(channelCount * sampleRate * Math.max(0, durationSeconds) * Float32Array.BYTES_PER_ELEMENT);
}

export class ExportTelemetry {
  constructor(jobId = 'export', metadata = {}) {
    this.exportId = metadata.exportId || `exp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    this.jobId = jobId;
    this.clipId = metadata.clipId || jobId;

    this.durationSec = metadata.durationSec || 0;
    this.sourceWidth = metadata.sourceWidth || 0;
    this.sourceHeight = metadata.sourceHeight || 0;
    this.outputWidth = metadata.outputWidth || 0;
    this.outputHeight = metadata.outputHeight || 0;
    this.fps = metadata.fps || 30;
    this.workerUsed = metadata.workerUsed ?? true;

    this.startTime = 0;
    this.endTime = 0;
    this.workerStartTime = null;
    this.workerEndTime = null;

    this.framesProcessed = 0;
    this.framesDropped = 0;

    this.decodeTimestamps = [];
    this.renderTimestamps = [];
    this.encodeTimestamps = [];

    this.maxDecodeQueue = 0;
    this.maxEncodeQueue = 0;

    // Detailed phase timings in milliseconds
    this.phaseTimings = {
      audioMixMs: 0,
      demuxMs: 0,
      decodeMs: 0,
      renderMs: 0,
      encodeMs: 0,
      muxMs: 0,
      thumbnailMs: 0,
      mainThreadBlockedMs: 0
    };

    this._activeTimers = new Map();
    this.phaseTimes = {};

    this.outputBytes = 0;

    // Memory tracking (optional diagnostic from performance.memory if supported)
    this.memoryBefore = this._getHeapMemory();
    this.memoryAfter = null;
    this.peakMemoryEstimate = 0;
  }

  _getHeapMemory() {
    if (typeof performance !== 'undefined' && performance.memory?.usedJSHeapSize) {
      return performance.memory.usedJSHeapSize;
    }
    return null;
  }

  start() {
    this.startTime = performance.now();
    this.memoryBefore = this._getHeapMemory();

    // Initial estimate of peak memory:
    // Canvas buffer (RGBA: w * h * 4) * 3 (source frame + canvas + blur buffer) + raw audio
    const frameBytes = (this.outputWidth || 1080) * (this.outputHeight || 1920) * 4;
    const audioBytes = estimateAudioMemoryBytes(2, 48000, this.durationSec);
    this.peakMemoryEstimate = (frameBytes * 4) + audioBytes;

    if (EXPORT_DEBUG) {
      console.log(`[ExportTelemetry:${this.jobId}] Started. Est. Base Memory: ${(this.peakMemoryEstimate / (1024 * 1024)).toFixed(1)} MB`);
    }
  }

  startTimer(phaseName) {
    this._activeTimers.set(phaseName, performance.now());
  }

  stopTimer(phaseName) {
    const start = this._activeTimers.get(phaseName);
    if (start != null) {
      const elapsed = performance.now() - start;
      const key = `${phaseName}Ms`;
      if (key in this.phaseTimings) {
        this.phaseTimings[key] += Math.round(elapsed);
      }
      this._activeTimers.delete(phaseName);
      return elapsed;
    }
    return 0;
  }

  recordPhase(phaseName) {
    const now = performance.now();
    this.phaseTimes[phaseName] = now;
    if (EXPORT_DEBUG) {
      console.log(`[ExportTelemetry:${this.jobId}] Phase: ${phaseName} at ${(now - this.startTime).toFixed(0)}ms`);
    }
  }

  setPhaseDuration(phaseName, durationMs) {
    const key = `${phaseName}Ms`;
    if (key in this.phaseTimings) {
      this.phaseTimings[key] = Math.round(durationMs);
    }
  }

  recordFrameDecoded(queueSize = 0) {
    this.decodeTimestamps.push(performance.now());
    if (queueSize > this.maxDecodeQueue) {
      this.maxDecodeQueue = queueSize;
    }
  }

  recordFrameRendered() {
    this.renderTimestamps.push(performance.now());
  }

  recordFrameEncoded(queueSize = 0) {
    this.encodeTimestamps.push(performance.now());
    this.framesProcessed++;
    if (queueSize > this.maxEncodeQueue) {
      this.maxEncodeQueue = queueSize;
    }
  }

  recordFrameDropped() {
    this.framesDropped++;
  }

  calculateFps(timestamps) {
    if (timestamps.length < 2) return 0;
    const durationSec = (timestamps[timestamps.length - 1] - timestamps[0]) / 1000;
    if (durationSec <= 0) return 0;
    return Math.round((timestamps.length - 1) / durationSec);
  }

  setOutputBytes(bytes) {
    this.outputBytes = bytes || 0;
  }

  setWorkerMetrics(metrics = {}) {
    if (!metrics) return;
    if (metrics.decodeFps) this.decodeFpsOverride = metrics.decodeFps;
    if (metrics.renderFps) this.renderFpsOverride = metrics.renderFps;
    if (metrics.encodeFps) this.encodeFpsOverride = metrics.encodeFps;
    if (metrics.maxDecodeQueue) this.maxDecodeQueue = Math.max(this.maxDecodeQueue, metrics.maxDecodeQueue);
    if (metrics.maxEncodeQueue) this.maxEncodeQueue = Math.max(this.maxEncodeQueue, metrics.maxEncodeQueue);
    if (metrics.framesProcessed) this.framesProcessed = metrics.framesProcessed;
    if (metrics.outputBytes) this.outputBytes = metrics.outputBytes;
    if (metrics.thumbnailMs) this.phaseTimings.thumbnailMs = metrics.thumbnailMs;
    if (metrics.demuxMs) this.phaseTimings.demuxMs = metrics.demuxMs;
    if (metrics.decodeMs) this.phaseTimings.decodeMs = metrics.decodeMs;
    if (metrics.renderMs) this.phaseTimings.renderMs = metrics.renderMs;
    if (metrics.encodeMs) this.phaseTimings.encodeMs = metrics.encodeMs;
    if (metrics.muxMs) this.phaseTimings.muxMs = metrics.muxMs;
    if (metrics.workerStartTime) this.workerStartTime = metrics.workerStartTime;
    if (metrics.workerEndTime) this.workerEndTime = metrics.workerEndTime;
  }

  finish() {
    this.endTime = performance.now();
    this.memoryAfter = this._getHeapMemory();

    const totalDurationSec = Math.max(0.001, (this.endTime - this.startTime) / 1000);
    const overallFps = Math.round(this.framesProcessed / totalDurationSec);

    const decodeFps = this.decodeFpsOverride ?? this.calculateFps(this.decodeTimestamps);
    const renderFps = this.renderFpsOverride ?? this.calculateFps(this.renderTimestamps);
    const encodeFps = this.encodeFpsOverride ?? this.calculateFps(this.encodeTimestamps);

    const summary = {
      exportId: this.exportId,
      jobId: this.jobId,
      clipId: this.clipId,

      durationSec: this.durationSec || parseFloat(totalDurationSec.toFixed(2)),
      totalDurationMs: Math.round(this.endTime - this.startTime),

      sourceWidth: this.sourceWidth,
      sourceHeight: this.sourceHeight,
      outputWidth: this.outputWidth,
      outputHeight: this.outputHeight,
      fps: this.fps,

      workerUsed: this.workerUsed,

      audioMixMs: this.phaseTimings.audioMixMs,
      demuxMs: this.phaseTimings.demuxMs,
      decodeMs: this.phaseTimings.decodeMs,
      renderMs: this.phaseTimings.renderMs,
      encodeMs: this.phaseTimings.encodeMs,
      muxMs: this.phaseTimings.muxMs,
      thumbnailMs: this.phaseTimings.thumbnailMs,
      mainThreadBlockedMs: this.phaseTimings.mainThreadBlockedMs,

      overallFps,
      decodeFps,
      renderFps,
      encodeFps,

      maxDecodeQueue: this.maxDecodeQueue,
      maxEncodeQueue: this.maxEncodeQueue,

      framesProcessed: this.framesProcessed,
      framesDropped: this.framesDropped,
      outputBytes: this.outputBytes,

      memoryBefore: this.memoryBefore,
      memoryAfter: this.memoryAfter,
      peakMemoryEstimate: this.peakMemoryEstimate,

      workerStartTime: this.workerStartTime,
      workerEndTime: this.workerEndTime,

      deviceMemory: typeof navigator !== 'undefined' ? navigator.deviceMemory || null : null,
      hardwareConcurrency: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || null : null
    };

    if (EXPORT_DEBUG) {
      console.log(`[ExportTelemetry:${this.jobId}] Complete Summary:`, summary);
    }

    return summary;
  }
}
