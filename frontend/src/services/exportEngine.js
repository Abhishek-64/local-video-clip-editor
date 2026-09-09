/**
 * High-Performance Resolution-Independent Video Export Engine
 * Integrates WebCodecs (Hardware H.264), GPU WebGL Shader Pipeline, OffscreenCanvas,
 * Dedicated Web Worker, Streaming ISOBMFF Demuxer, Offline Audio Mixing,
 * and ISOBMFF MP4 Muxer with seamless MediaRecorder fallback.
 */

import { detectCapabilities } from './capabilityDetector';
import { MP4Muxer } from './mp4Muxer';
import { mixAudioTracksOffline } from './audioEngine';
import { calculateCropDimensions } from '../utils/crop';
import { MP4Demuxer } from './export/mp4Demuxer';
import { ExportVideoDecoder } from './export/exportVideoDecoder';
import { ExportTimelineMapper } from './export/exportTimelineMapper';
import { ExportRenderer } from './export/exportRenderer';
import { runExportInWorker } from './export/exportWorkerBridge';
import { getOptimalH264Codec, getRecommendedVideoBitrate } from './export/exportConfig';
import { ExportTelemetry, EXPORT_DEBUG } from './export/exportTelemetry';
import { clipResourceManager } from './export/exportResourceManager';

/**
 * Calculate optimal encoding bitrate based on target resolution and preset
 */
export function calculateTargetBitrate(resolution, bitratePreset = 'high') {
  return getRecommendedVideoBitrate({ resolution, quality: bitratePreset, fps: 30 });
}

/**
 * Parse output FPS
 */
export function parseTargetFps(fpsSetting) {
  if (!fpsSetting || fpsSetting === 'original') return 30;
  const parsed = parseFloat(fpsSetting);
  return isNaN(parsed) || parsed <= 0 ? 30 : parsed;
}

/**
 * Robust, deterministic frame seek with decoder readiness guarantee and adaptive timeout.
 * PRESERVED for interactive preview, timeline scrubbing, and isolated frame extraction.
 * NOT used during high-performance WebCodecs sequential export.
 */
export function seekVideoToTime(videoEl, targetTime, signal, isInitialSeek = false) {
  if (signal?.aborted) {
    return Promise.reject(new Error('Export cancelled by user'));
  }

  // Fast path: if video is already at target time, not actively seeking, and has current data
  if (Math.abs(videoEl.currentTime - targetTime) < 0.005 && !videoEl.seeking && videoEl.readyState >= 2) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let resolved = false;
    let timer = null;
    let rVfcId = null;

    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      if (timer) clearTimeout(timer);
      if (rVfcId && typeof videoEl.cancelVideoFrameCallback === 'function') {
        try {
          videoEl.cancelVideoFrameCallback(rVfcId);
        } catch (e) {}
      }
      videoEl.removeEventListener('seeked', onSeeked);
      videoEl.removeEventListener('error', onError);
    };

    const checkFrameReadyAndResolve = () => {
      if (videoEl.readyState >= 2 && !videoEl.seeking) {
        cleanup();
        resolve();
      } else {
        const onCanPlay = () => {
          videoEl.removeEventListener('canplay', onCanPlay);
          cleanup();
          resolve();
        };
        videoEl.addEventListener('canplay', onCanPlay, { once: true });
        setTimeout(() => {
          videoEl.removeEventListener('canplay', onCanPlay);
          cleanup();
          resolve();
        }, isInitialSeek ? 1000 : 200);
      }
    };

    const onSeeked = () => {
      if (typeof videoEl.requestVideoFrameCallback === 'function') {
        try {
          rVfcId = videoEl.requestVideoFrameCallback(() => {
            cleanup();
            resolve();
          });
          setTimeout(checkFrameReadyAndResolve, isInitialSeek ? 200 : 50);
          return;
        } catch (e) {}
      }
      checkFrameReadyAndResolve();
    };

    const onError = () => {
      cleanup();
      resolve();
    };

    videoEl.addEventListener('seeked', onSeeked, { once: true });
    videoEl.addEventListener('error', onError, { once: true });

    try {
      videoEl.currentTime = targetTime;
    } catch (e) {
      cleanup();
      resolve();
      return;
    }

    const timeoutMs = isInitialSeek ? 5000 : 1500;
    timer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);
  });
}

/**
 * Master Video Clip Exporter
 */
export async function exportVideoClip({
  jobId,
  clipId,
  videoSource,
  startTime,
  endTime,
  segments,
  partNumber = 1,
  settings = {},
  onProgress = () => {},
  signal
}) {
  const capabilities = await detectCapabilities();

  // If WebCodecs VideoEncoder is supported and user requested MP4, use the high-performance pipeline
  const targetFormat = settings.export?.format || 'mp4';
  const canUseWebCodecs = capabilities.videoEncoder &&
                          capabilities.h264EncoderSupported &&
                          targetFormat === 'mp4' &&
                          typeof VideoFrame !== 'undefined';

  if (canUseWebCodecs) {
    try {
      return await runWebCodecsExportPipeline({
        jobId,
        clipId,
        videoSource,
        startTime,
        endTime,
        segments,
        partNumber,
        settings,
        onProgress,
        signal
      });
    } catch (webCodecsErr) {
      if (signal?.aborted) {
        throw webCodecsErr;
      }
      console.warn('WebCodecs high-performance export failed, falling back to MediaRecorder:', webCodecsErr);
    }
  }

  // Fallback to Enhanced Hardware MediaRecorder pipeline
  return await runMediaRecorderExportPipeline({
    videoSource,
    startTime,
    endTime,
    segments,
    partNumber,
    settings,
    onProgress,
    signal
  });
}

/**
 * Resolve video source into a Blob / File object
 */
async function resolveSourceFile(videoSource) {
  if (videoSource instanceof Blob || (typeof File !== 'undefined' && videoSource instanceof File)) {
    return videoSource;
  }
  if (videoSource?.file instanceof Blob) {
    return videoSource.file;
  }
  const url = typeof videoSource === 'string'
    ? videoSource
    : (videoSource?.url || videoSource?.src || '');

  if (url) {
    const res = await fetch(url);
    return await res.blob();
  }
  throw new Error('Unable to resolve video source file for high-performance export');
}

/**
 * Helper to inspect video dimensions
 */
async function getVideoDimensions(sourceFile) {
  return new Promise((resolve) => {
    const tempUrl = URL.createObjectURL(sourceFile);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () => {
      const w = v.videoWidth || 1920;
      const h = v.videoHeight || 1080;
      URL.revokeObjectURL(tempUrl);
      resolve({ width: w, height: h });
    };
    v.onerror = () => {
      URL.revokeObjectURL(tempUrl);
      resolve({ width: 1920, height: 1080 });
    };
    v.src = tempUrl;
  });
}

/**
 * PATH A: Ultra-Fast WebCodecs Pipeline (Worker Preferred -> Main Thread Sequential Fallback)
 * 100% Elimination of seekVideoToTime inside the frame loop.
 */
async function runWebCodecsExportPipeline({
  jobId,
  clipId,
  videoSource,
  startTime,
  endTime,
  segments,
  partNumber,
  settings,
  onProgress,
  signal
}) {
  const telemetry = new ExportTelemetry(clipId || jobId || `export-part-${partNumber}`);
  telemetry.start({
    exportId: clipId || jobId || `export-part-${partNumber}`,
    jobId: jobId || null,
    clipId: clipId || null
  });

  const {
    crop = {},
    audio = {},
    export: exportConfig = {}
  } = settings;

  const activeSegments = (segments && segments.length > 0)
    ? segments.filter((s) => (s.endTime - s.startTime) > 0.05)
    : [{ startTime: startTime || 0, endTime: endTime || 0 }];

  // 1. Resolve source file
  telemetry.recordPhase('Resolve Source');
  const sourceFile = await resolveSourceFile(videoSource);
  if (signal?.aborted) throw new Error('Export cancelled by user');

  // 2. Obtain source dimensions and compute canvas resolution
  const { width: srcWidth, height: srcHeight } = await getVideoDimensions(sourceFile);
  const initialCrop = calculateCropDimensions({
    sourceWidth: srcWidth,
    sourceHeight: srcHeight,
    mode: crop.mode || '9:16',
    fillMode: crop.fillMode || 'fit',
    manualX: crop.x || 0,
    manualY: crop.y || 0,
    customWidth: crop.customWidth ?? 60,
    customHeight: crop.customHeight ?? 85,
    zoom: crop.zoom || 1,
    resolution: exportConfig.resolution || '1080p'
  });

  const canvasWidth = initialCrop.canvasWidth;
  const canvasHeight = initialCrop.canvasHeight;

  // 3. Mix audio offline in parallel (sample-accurate)
  onProgress(5);
  telemetry.recordPhase('Mix Audio Offline');
  let mixedAudioBuffer = null;
  try {
    mixedAudioBuffer = await mixAudioTracksOffline({
      videoSource,
      startTime,
      endTime,
      segments: activeSegments,
      audioSettings: audio
    });
  } catch (audioErr) {
    console.warn('Offline audio mixing skipped:', audioErr);
  }

  if (signal?.aborted) throw new Error('Export cancelled by user');

  // 4. Try Tier 1: Dedicated Web Worker Pipeline with OffscreenCanvas (Section 22, 23, 24)
  const canUseWorker = typeof Worker !== 'undefined' &&
                        typeof OffscreenCanvas !== 'undefined';

  if (canUseWorker) {
    try {
      telemetry.recordPhase('Run Worker Pipeline');
      const result = await runExportInWorker({
        jobId,
        clipId,
        sourceFile,
        startTime,
        endTime,
        segments: activeSegments,
        partNumber,
        settings,
        mixedAudioBuffer,
        canvasWidth,
        canvasHeight,
        onProgress,
        signal
      });

      if (result?.metrics) {
        telemetry.setWorkerMetrics(result.metrics);
      }
      telemetry.finish(result?.blob?.size || 0);
      onProgress(100);
      return result;
    } catch (workerErr) {
      if (signal?.aborted) throw workerErr;
      console.warn('Worker export pipeline failed, falling back to main-thread WebCodecs sequential pipeline:', workerErr);
    }
  }

  // 5. Tier 2: Main-Thread Sequential WebCodecs Pipeline (NO seekVideoToTime)
  telemetry.recordPhase('Run Main-Thread Sequential Pipeline');
  return await runMainThreadSequentialWebCodecsPipeline({
    jobId,
    clipId,
    sourceFile,
    startTime,
    endTime,
    activeSegments,
    partNumber,
    settings,
    mixedAudioBuffer,
    canvasWidth,
    canvasHeight,
    onProgress,
    signal,
    telemetry
  });
}

/**
 * Main-Thread Sequential WebCodecs Pipeline
 * Uses ExportVideoDecoder (sequential frame streaming), ExportRenderer (low-res blur & GPU-first),
 * and VideoEncoder backpressure.
 */
async function runMainThreadSequentialWebCodecsPipeline({
  jobId,
  clipId,
  sourceFile,
  startTime,
  endTime,
  activeSegments,
  partNumber,
  settings,
  mixedAudioBuffer,
  canvasWidth,
  canvasHeight,
  onProgress,
  signal,
  telemetry
}) {
  const {
    logo = {},
    background = {},
    audio = {},
    export: exportConfig = {}
  } = settings;

  const targetFps = parseTargetFps(exportConfig.fps);
  const playbackSpeed = audio.speed || 1.0;

  // 1. Timeline scheduler
  const timelineMapper = new ExportTimelineMapper({
    segments: activeSegments,
    startTime,
    endTime,
    playbackSpeed,
    fps: targetFps
  });

  const totalFrames = timelineMapper.totalFrames;
  const clipDurationSec = timelineMapper.totalDuration;

  // 2. Initialize Demuxer & Sequential Decoder
  const demuxer = new MP4Demuxer(sourceFile);
  await demuxer.initialize();

  const videoDecoder = new ExportVideoDecoder({
    demuxer,
    maxDecodedFrames: 4,
    signal
  });
  await videoDecoder.initialize();

  // 3. Initialize GPU-First Renderer with low-res blur and cached layout
  const renderer = new ExportRenderer({
    width: canvasWidth,
    height: canvasHeight
  });

  if (logo.enabled) {
    await renderer.setLogoSource(logo);
  }
  if (background.type === 'image') {
    await renderer.setBackgroundSource(background);
  }
  renderer.prepareStaticOverlay(settings, partNumber);

  // 4. Setup MP4 Muxer
  const mp4Muxer = new MP4Muxer({
    width: canvasWidth,
    height: canvasHeight,
    fps: targetFps,
    audioSampleRate: mixedAudioBuffer ? 48000 : 44100,
    hasAudio: Boolean(mixedAudioBuffer)
  });

  // 5. Negotiate optimal H.264 profile and bitrate
  const recommendedBitrate = getRecommendedVideoBitrate({
    resolution: exportConfig.resolution,
    quality: exportConfig.bitrate,
    fps: targetFps,
    width: canvasWidth,
    height: canvasHeight
  });

  const { codec } = await getOptimalH264Codec({
    width: canvasWidth,
    height: canvasHeight,
    fps: targetFps,
    bitrate: recommendedBitrate
  });

  // 6. Setup VideoEncoder
  let encoderError = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, metadata) => {
      if (metadata?.decoderConfig?.description) {
        const desc = new Uint8Array(metadata.decoderConfig.description);
        if (desc.length > 8) {
          try {
            const spsLen = (desc[6] << 8) | desc[7];
            const sps = desc.slice(8, 8 + spsLen);
            const ppsOffset = 8 + spsLen + 1;
            const ppsLen = (desc[ppsOffset] << 8) | desc[ppsOffset + 1];
            const pps = desc.slice(ppsOffset + 2, ppsOffset + 2 + ppsLen);
            mp4Muxer.setVideoDescription(sps, pps);
          } catch (e) {}
        }
      }

      const chunkData = new Uint8Array(chunk.byteLength);
      chunk.copyTo(chunkData);

      const frameDurationUs = Math.round((1 / targetFps) * 1_000_000);
      const safeDurationUs = (typeof chunk.duration === 'number' && !isNaN(chunk.duration) && chunk.duration > 0)
        ? chunk.duration
        : frameDurationUs;

      mp4Muxer.addVideoChunk(chunkData, chunk.type === 'key', safeDurationUs);
    },
    error: (e) => {
      encoderError = e;
      console.error('VideoEncoder error:', e);
    }
  });

  videoEncoder.configure({
    codec,
    width: canvasWidth,
    height: canvasHeight,
    bitrate: recommendedBitrate,
    framerate: targetFps,
    avc: { format: 'avc' }
  });

  const keyframeInterval = Math.round(targetFps * 2);
  let capturedThumbnailBlob = null;

  try {
    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      if (signal?.aborted) {
        throw new Error('Export cancelled by user');
      }
      if (encoderError) {
        throw encoderError;
      }

      const frameInfo = timelineMapper.getFrameInfo(frameIdx);

      // Decode sequentially up to exact timestamp — NO seekVideoToTime!
      const sourceVideoFrame = await videoDecoder.decodeUntil(frameInfo.sourceTimeUs);
      if (!sourceVideoFrame) {
        const nextFrame = await videoDecoder.decodeNextFrame();
        if (!nextFrame) break;
      }

      telemetry?.recordFrameDecoded(videoDecoder.decodedQueue.length);

      // Render frame and composite all layers onto canvas
      const renderedFrame = await renderer.renderFrame({
        sourceVideoFrame,
        frameIdx,
        timelineTimeSec: frameInfo.timelineTimeSec,
        clipElapsedSec: frameInfo.clipElapsedSec,
        clipDurationSec,
        partNumber,
        settings
      });

      // Capture lightweight thumbnail poster at first frame with zero extra rendering overhead
      if (frameIdx === 0 && renderer.canvas) {
        try {
          if (typeof renderer.canvas.convertToBlob === 'function') {
            capturedThumbnailBlob = await renderer.canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
          } else if (typeof renderer.canvas.toBlob === 'function') {
            capturedThumbnailBlob = await new Promise((res) => renderer.canvas.toBlob(res, 'image/jpeg', 0.85));
          }
        } catch (thumbErr) {}
      }

      telemetry?.recordFrameRendered();

      // Release source frame immediately
      sourceVideoFrame.close();

      // Encoder backpressure: bounded queue size <= 4
      if (videoEncoder.encodeQueueSize > 4) {
        await new Promise((resolve) => {
          const onDequeue = () => {
            if (videoEncoder.encodeQueueSize <= 2) {
              videoEncoder.removeEventListener('dequeue', onDequeue);
              resolve();
            }
          };
          videoEncoder.addEventListener('dequeue', onDequeue);
          setTimeout(resolve, 50);
        });
      }

      const isKeyframe = frameIdx % keyframeInterval === 0;
      videoEncoder.encode(renderedFrame, { keyFrame: isKeyframe });
      telemetry?.recordFrameEncoded(videoEncoder.encodeQueueSize);

      renderedFrame.close();

      // Report progress (10% to 88%)
      const pct = 10 + Math.round((frameIdx / totalFrames) * 78);
      onProgress(pct);

      // Micro-yield every 4 frames to keep browser UI and cancel listeners fluid
      if (frameIdx % 4 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    // Flush VideoEncoder
    onProgress(90);
    await videoEncoder.flush();
    videoEncoder.close();

    // 7. Encode Mixed Audio Track if present
    if (mixedAudioBuffer && typeof AudioEncoder !== 'undefined') {
      onProgress(92);
      try {
        const audioEncoder = new AudioEncoder({
          output: (chunk, metadata) => {
            if (metadata?.decoderConfig?.description) {
              mp4Muxer.setAudioDescription(new Uint8Array(metadata.decoderConfig.description));
            }
            const chunkData = new Uint8Array(chunk.byteLength);
            chunk.copyTo(chunkData);

            const nominalAudioChunkDurationUs = Math.round((1024 / 48000) * 1_000_000);
            const safeAudioDurationUs = (typeof chunk.duration === 'number' && !isNaN(chunk.duration) && chunk.duration > 0)
              ? chunk.duration
              : nominalAudioChunkDurationUs;

            mp4Muxer.addAudioChunk(chunkData, safeAudioDurationUs);
          },
          error: (e) => console.warn('AudioEncoder error:', e)
        });

        audioEncoder.configure({
          codec: 'mp4a.40.2',
          sampleRate: 48000,
          numberOfChannels: 2,
          bitrate: 192000
        });

        const leftChannel = mixedAudioBuffer.getChannelData(0);
        const rightChannel = mixedAudioBuffer.numberOfChannels > 1
          ? mixedAudioBuffer.getChannelData(1)
          : leftChannel;
        const sampleCount = leftChannel.length;
        // Audio encoding with reusable buffer
        const chunkSize = 1024;
        const reusableInterleaved = new Float32Array(chunkSize * 2);

        for (let i = 0; i < sampleCount; i += chunkSize) {
          if (signal?.aborted) throw new Error('Export cancelled by user');

          if (audioEncoder.encodeQueueSize > 8) {
            await new Promise((resolve) => {
              const onDequeue = () => {
                if (audioEncoder.encodeQueueSize <= 4) {
                  audioEncoder.removeEventListener('dequeue', onDequeue);
                  resolve();
                }
              };
              audioEncoder.addEventListener('dequeue', onDequeue);
              setTimeout(resolve, 40);
            });
          }

          const currentChunkSize = Math.min(chunkSize, sampleCount - i);
          const chunkData = (currentChunkSize === chunkSize)
            ? reusableInterleaved
            : reusableInterleaved.subarray(0, currentChunkSize * 2);

          for (let j = 0; j < currentChunkSize; j++) {
            chunkData[j * 2] = leftChannel[i + j];
            chunkData[j * 2 + 1] = rightChannel[i + j];
          }

          const audioData = new AudioData({
            format: 'f32',
            sampleRate: 48000,
            numberOfFrames: currentChunkSize,
            numberOfChannels: 2,
            timestamp: Math.round((i / 48000) * 1_000_000),
            data: chunkData
          });

          audioEncoder.encode(audioData);
          audioData.close();
        }

        await audioEncoder.flush();
        audioEncoder.close();
      } catch (audioEncErr) {
        console.warn('AudioEncoder encoding skipped:', audioEncErr);
      }
    }

    // 8. Finalize MP4 File
    onProgress(98);
    const finalMp4Blob = mp4Muxer.finalize();
    const generatedKey = clipId || jobId || `clip-${partNumber}-${Date.now()}`;
    const resources = clipResourceManager.registerClip(generatedKey, {
      blob: finalMp4Blob,
      thumbnailBlob: capturedThumbnailBlob
    });

    telemetry?.finish(finalMp4Blob.size);
    onProgress(100);

    return {
      blob: finalMp4Blob,
      url: resources.videoUrl,
      thumbnailBlob: capturedThumbnailBlob,
      thumbnailUrl: resources.thumbnailUrl,
      duration: clipDurationSec,
      format: 'mp4',
      size: finalMp4Blob.size
    };
  } finally {
    renderer.destroy();
    videoDecoder.close();
    if (videoEncoder.state !== 'closed') {
      try { videoEncoder.close(); } catch (e) {}
    }
  }
}

/**
 * PATH B: Enhanced Real-Time Hardware MediaRecorder + Web Audio Pipeline Fallback
 */
async function runMediaRecorderExportPipeline({
  videoSource,
  startTime,
  endTime,
  segments,
  partNumber,
  settings,
  onProgress,
  signal
}) {
  const { processVideoClipLegacy } = await import('./videoProcessingEngine');
  return processVideoClipLegacy({
    videoSource,
    startTime,
    endTime,
    segments,
    partNumber,
    settings,
    onProgress,
    signal
  });
}
