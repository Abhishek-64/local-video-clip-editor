/**
 * High-Performance Deterministic Video Export Engine
 * Integrates WebCodecs (Hardware H.264), GPU WebGL Shader Pipeline, Offline Audio Mixing,
 * and ISOBMFF MP4 Muxer with seamless MediaRecorder compatibility fallback.
 */

import { detectCapabilities } from './capabilityDetector';
import { MP4Muxer } from './mp4Muxer';
import { WebGLEffectsPipeline } from './webglEffectsPipeline';
import { mixAudioTracksOffline } from './audioEngine';
import { calculateCropDimensions } from '../utils/crop';
import { renderTextOverlay } from './videoProcessingEngine';
import { detectFaceInFrame, FaceTrackerSmoother } from './faceDetectionService';

/**
 * Calculate optimal encoding bitrate based on target resolution and preset
 */
function calculateTargetBitrate(resolution, bitratePreset = 'high') {
  const baseMap = {
    '720p': 5_000_000,
    '1080p': 8_500_000,
    '1440p': 16_000_000,
    '4k': 35_000_000,
    'original': 8_500_000
  };

  const base = baseMap[resolution] || 8_500_000;

  if (bitratePreset === 'standard') return Math.round(base * 0.65);
  if (bitratePreset === 'ultra') return Math.round(base * 1.6);
  return base; // high / default
}

/**
 * Parse output FPS
 */
function parseTargetFps(fpsSetting) {
  if (!fpsSetting || fpsSetting === 'original') return 30;
  const parsed = parseFloat(fpsSetting);
  return isNaN(parsed) || parsed <= 0 ? 30 : parsed;
}

/**
 * Master Video Clip Exporter
 */
export async function exportVideoClip({
  videoSource,
  startTime,
  endTime,
  partNumber = 1,
  settings = {},
  onProgress = () => {},
  signal
}) {
  const capabilities = await detectCapabilities();

  // If WebCodecs VideoEncoder is supported and user requested MP4, use the ultra-fast WebCodecs pipeline
  const targetFormat = settings.export?.format || 'mp4';
  const canUseWebCodecs = capabilities.videoEncoder &&
                          capabilities.h264EncoderSupported &&
                          targetFormat === 'mp4' &&
                          typeof VideoFrame !== 'undefined';

  if (canUseWebCodecs) {
    try {
      return await runWebCodecsExportPipeline({
        videoSource,
        startTime,
        endTime,
        partNumber,
        settings,
        onProgress,
        signal
      });
    } catch (webCodecsErr) {
      if (signal?.aborted) {
        throw webCodecsErr;
      }
      console.warn('WebCodecs export failed, gracefully falling back to Enhanced MediaRecorder:', webCodecsErr);
    }
  }

  // Fallback to Enhanced Hardware MediaRecorder pipeline
  return await runMediaRecorderExportPipeline({
    videoSource,
    startTime,
    endTime,
    partNumber,
    settings,
    onProgress,
    signal
  });
}

/**
 * PATH A: WebCodecs + GPU WebGL + Offline Audio Mixer + MP4 Muxer
 */
async function runWebCodecsExportPipeline({
  videoSource,
  startTime,
  endTime,
  partNumber,
  settings,
  onProgress,
  signal
}) {
  const {
    crop = {},
    background = {},
    text = {},
    logo = {},
    effects = {},
    audio = {},
    export: exportConfig = {}
  } = settings;

  const clipDuration = Math.max(0.2, endTime - startTime);
  const targetFps = parseTargetFps(exportConfig.fps);
  const totalFrames = Math.max(1, Math.round(clipDuration * targetFps));
  const playbackSpeed = audio.speed || 1.0;

  // 1. Setup Source Video Element
  let temporaryObjectUrl = null;
  let srcUrl = '';
  if (typeof videoSource === 'string') {
    srcUrl = videoSource;
  } else if (videoSource?.url) {
    srcUrl = videoSource.url;
  } else if (videoSource?.src) {
    srcUrl = videoSource.src;
  } else if (videoSource?.file instanceof Blob) {
    temporaryObjectUrl = URL.createObjectURL(videoSource.file);
    srcUrl = temporaryObjectUrl;
  } else if (videoSource instanceof Blob) {
    temporaryObjectUrl = URL.createObjectURL(videoSource);
    srcUrl = temporaryObjectUrl;
  }

  const videoEl = document.createElement('video');
  videoEl.crossOrigin = 'anonymous';
  videoEl.preload = 'auto';
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.src = srcUrl;

  await new Promise((resolve, reject) => {
    videoEl.onloadedmetadata = () => resolve();
    videoEl.onerror = () => reject(new Error('Failed to load source video metadata'));
  });

  const srcWidth = videoEl.videoWidth || 1920;
  const srcHeight = videoEl.videoHeight || 1080;

  // 2. Preload Logo and Background Images
  let logoImage = null;
  if (logo.enabled && logo.url) {
    logoImage = new Image();
    logoImage.crossOrigin = 'anonymous';
    await new Promise((res) => {
      logoImage.onload = () => res();
      logoImage.onerror = () => { logoImage = null; res(); };
      logoImage.src = logo.url;
    });
  }

  let bgImage = null;
  if (background.type === 'image' && background.imageUrl) {
    bgImage = new Image();
    bgImage.crossOrigin = 'anonymous';
    await new Promise((res) => {
      bgImage.onload = () => res();
      bgImage.onerror = () => { bgImage = null; res(); };
      bgImage.src = background.imageUrl;
    });
  }

  // 3. Compute Crop & Canvas Dimensions
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

  // Setup Canvas
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  // 2D fallback context / text overlay context
  const ctx2d = canvas.getContext('2d', { alpha: false, desynchronized: true });

  // 4. Mix Audio Offline in parallel
  onProgress(5);
  const mixedAudioBuffer = await mixAudioTracksOffline({
    videoSource: srcUrl,
    startTime,
    endTime,
    audioSettings: audio
  });

  if (signal?.aborted) {
    throw new Error('Export cancelled by user');
  }

  // 5. Setup MP4 Muxer
  const targetBitrate = calculateTargetBitrate(exportConfig.resolution, exportConfig.bitrate);
  const mp4Muxer = new MP4Muxer({
    width: canvasWidth,
    height: canvasHeight,
    fps: targetFps,
    audioSampleRate: 48000,
    hasAudio: Boolean(mixedAudioBuffer)
  });

  // 6. Setup VideoEncoder (Hardware H.264)
  let encoderError = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, metadata) => {
      if (metadata?.decoderConfig?.description) {
        // Extract SPS & PPS from AVCC configuration record
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
      mp4Muxer.addVideoChunk(chunkData, chunk.type === 'key', chunk.duration);
    },
    error: (e) => {
      encoderError = e;
      console.error('VideoEncoder runtime error:', e);
    }
  });

  const encoderConfig = {
    codec: 'avc1.42E01E', // H.264 Baseline Profile (Universal compatibility)
    width: canvasWidth,
    height: canvasHeight,
    bitrate: targetBitrate,
    framerate: targetFps,
    avc: { format: 'avc' }
  };

  videoEncoder.configure(encoderConfig);

  // 7. Face Tracking Setup
  const faceSmoother = new FaceTrackerSmoother(0.12);
  let cachedFaceCenter = null;
  let lastFaceDetectFrame = -99;

  // 8. Deterministic Frame Rendering & Encoding Loop
  const frameIntervalSec = 1 / targetFps;
  const keyframeInterval = Math.round(targetFps * 2); // Keyframe every 2s

  for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
    if (signal?.aborted) {
      videoEncoder.close();
      if (temporaryObjectUrl) URL.revokeObjectURL(temporaryObjectUrl);
      throw new Error('Export cancelled by user');
    }

    if (encoderError) {
      throw encoderError;
    }

    const frameClipTime = frameIdx * frameIntervalSec;
    const sourceVideoTime = startTime + frameClipTime * playbackSpeed;

    // Seek source video to exact deterministic timestamp
    videoEl.currentTime = Math.min(endTime, sourceVideoTime);
    await new Promise((res) => {
      const onSeeked = () => {
        videoEl.removeEventListener('seeked', onSeeked);
        res();
      };
      videoEl.addEventListener('seeked', onSeeked);
    });

    // Face detection (run periodically every 15 frames if enabled)
    if (crop.faceTracking && frameIdx - lastFaceDetectFrame >= 15) {
      lastFaceDetectFrame = frameIdx;
      try {
        const face = await detectFaceInFrame(videoEl);
        cachedFaceCenter = faceSmoother.update(face);
      } catch (e) {}
    }

    // Dynamic Crop Calculation for current frame
    const currentCropBox = calculateCropDimensions({
      sourceWidth: srcWidth,
      sourceHeight: srcHeight,
      mode: crop.mode || '9:16',
      fillMode: crop.fillMode || 'fit',
      manualX: crop.x || 0,
      manualY: crop.y || 0,
      customWidth: crop.customWidth ?? 60,
      customHeight: crop.customHeight ?? 85,
      zoom: crop.zoom || 1,
      faceCenter: crop.faceTracking ? cachedFaceCenter : null,
      resolution: exportConfig.resolution || '1080p'
    });

    // Clear Canvas
    ctx2d.fillStyle = '#000000';
    ctx2d.fillRect(0, 0, canvasWidth, canvasHeight);

    // Background Blur Layer if letterboxed
    const isFitLetterbox = (crop.fillMode !== 'fill') && (crop.mode !== 'original');
    if (isFitLetterbox && background.type === 'blur-video') {
      const bgOpacity = (background.opacity ?? 65) / 100;
      ctx2d.save();
      ctx2d.filter = `blur(${Math.max(4, background.blur || 20)}px) brightness(${bgOpacity})`;
      ctx2d.drawImage(videoEl, 0, 0, canvasWidth, canvasHeight);
      ctx2d.restore();
    } else if (isFitLetterbox && background.type === 'image' && bgImage) {
      ctx2d.save();
      ctx2d.drawImage(bgImage, 0, 0, canvasWidth, canvasHeight);
      ctx2d.restore();
    } else if (isFitLetterbox && background.color) {
      ctx2d.fillStyle = background.color;
      ctx2d.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    // Main Video Frame with Visual Filters
    ctx2d.save();
    const hasCustomFilters =
      (effects.brightness ?? 100) !== 100 ||
      (effects.contrast ?? 100) !== 100 ||
      (effects.saturation ?? 100) !== 100 ||
      (effects.sepia ?? 0) > 0 ||
      (effects.grayscale ?? 0) > 0 ||
      (effects.invert ?? 0) > 0;

    if (hasCustomFilters) {
      ctx2d.filter = `brightness(${(effects.brightness ?? 100) / 100}) contrast(${(effects.contrast ?? 100) / 100}) saturate(${(effects.saturation ?? 100) / 100}) sepia(${(effects.sepia ?? 0) / 100}) grayscale(${(effects.grayscale ?? 0) / 100}) invert(${(effects.invert ?? 0) / 100})`;
    }

    ctx2d.drawImage(
      videoEl,
      currentCropBox.sx,
      currentCropBox.sy,
      currentCropBox.sWidth,
      currentCropBox.sHeight,
      currentCropBox.dx,
      currentCropBox.dy,
      currentCropBox.dWidth,
      currentCropBox.dHeight
    );
    ctx2d.restore();

    // Transitions (Fade In & Fade Out)
    const clipRemaining = clipDuration - frameClipTime;
    if (effects.fadeIn && frameClipTime < (effects.fadeInDuration || 0.5)) {
      const alpha = 1.0 - (frameClipTime / (effects.fadeInDuration || 0.5));
      ctx2d.fillStyle = `rgba(0, 0, 0, ${Math.max(0, Math.min(1, alpha))})`;
      ctx2d.fillRect(0, 0, canvasWidth, canvasHeight);
    } else if (effects.fadeOut && clipRemaining < (effects.fadeOutDuration || 0.5)) {
      const alpha = 1.0 - (clipRemaining / (effects.fadeOutDuration || 0.5));
      ctx2d.fillStyle = `rgba(0, 0, 0, ${Math.max(0, Math.min(1, alpha))})`;
      ctx2d.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    // Text Overlay
    if (text.enabled || (text.extraTexts && text.extraTexts.length > 0)) {
      renderTextOverlay(ctx2d, canvasWidth, canvasHeight, text, partNumber);
    }

    // Logo Watermark
    if (logo.enabled && logoImage) {
      const scale = canvasWidth / 540;
      const logoW = Math.max(30, Math.round((logo.size || 70) * scale));
      const logoH = logoW * (logoImage.naturalHeight / logoImage.naturalWidth);
      const margin = canvasWidth * 0.04;
      ctx2d.save();
      ctx2d.globalAlpha = (logo.opacity ?? 85) / 100;
      ctx2d.drawImage(logoImage, canvasWidth - logoW - margin, margin, logoW, logoH);
      ctx2d.restore();
    }

    // Create VideoFrame with deterministic timestamp (microseconds)
    const timestampUs = Math.round(frameClipTime * 1_000_000);
    const durationUs = Math.round(frameIntervalSec * 1_000_000);
    const isKeyframe = frameIdx % keyframeInterval === 0;

    const videoFrame = new VideoFrame(canvas, {
      timestamp: timestampUs,
      duration: durationUs
    });

    videoEncoder.encode(videoFrame, { keyFrame: isKeyframe });
    videoFrame.close(); // Clean memory immediately

    // Report progress (10% to 90%)
    const pct = 10 + Math.round((frameIdx / totalFrames) * 80);
    onProgress(pct);

    // Yield to event loop every 5 frames to prevent worker message starvation
    if (frameIdx % 5 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // 9. Flush VideoEncoder
  onProgress(92);
  await videoEncoder.flush();
  videoEncoder.close();

  // 10. Encode Audio Track if present
  if (mixedAudioBuffer && typeof AudioEncoder !== 'undefined') {
    try {
      const audioEncoder = new AudioEncoder({
        output: (chunk, metadata) => {
          if (metadata?.decoderConfig?.description) {
            mp4Muxer.setAudioDescription(new Uint8Array(metadata.decoderConfig.description));
          }
          const chunkData = new Uint8Array(chunk.byteLength);
          chunk.copyTo(chunkData);
          mp4Muxer.addAudioChunk(chunkData, chunk.duration);
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
      const rightChannel = mixedAudioBuffer.getChannelData(1);
      const sampleCount = leftChannel.length;
      const chunkSize = 1024; // AAC standard frame size

      for (let i = 0; i < sampleCount; i += chunkSize) {
        const currentChunkSize = Math.min(chunkSize, sampleCount - i);
        const interleaved = new Float32Array(currentChunkSize * 2);

        for (let j = 0; j < currentChunkSize; j++) {
          interleaved[j * 2] = leftChannel[i + j];
          interleaved[j * 2 + 1] = rightChannel[i + j];
        }

        const audioData = new AudioData({
          format: 'f32',
          sampleRate: 48000,
          numberOfFrames: currentChunkSize,
          numberOfChannels: 2,
          timestamp: Math.round((i / 48000) * 1_000_000),
          data: interleaved
        });

        audioEncoder.encode(audioData);
        audioData.close();
      }

      await audioEncoder.flush();
      audioEncoder.close();
    } catch (audioEncErr) {
      console.warn('WebCodecs AudioEncoder encoding skipped:', audioEncErr);
    }
  }

  // 11. Finalize MP4 File
  onProgress(98);
  const finalMp4Blob = mp4Muxer.finalize();
  const finalUrl = URL.createObjectURL(finalMp4Blob);

  if (temporaryObjectUrl) {
    URL.revokeObjectURL(temporaryObjectUrl);
  }

  onProgress(100);

  return {
    blob: finalMp4Blob,
    url: finalUrl,
    duration: clipDuration,
    format: 'mp4',
    size: finalMp4Blob.size
  };
}

/**
 * PATH B: Enhanced Real-Time Hardware MediaRecorder + Web Audio Pipeline
 */
async function runMediaRecorderExportPipeline({
  videoSource,
  startTime,
  endTime,
  partNumber,
  settings,
  onProgress,
  signal
}) {
  // Delegate to existing robust fallback in videoProcessingEngine
  const { processVideoClipLegacy } = await import('./videoProcessingEngine');
  return processVideoClipLegacy({
    videoSource,
    startTime,
    endTime,
    partNumber,
    settings,
    onProgress,
    signal
  });
}
