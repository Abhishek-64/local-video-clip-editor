import { calculateCropDimensions } from '../utils/crop';
import { detectFaceInFrame, FaceTrackerSmoother } from './faceDetectionService';

/**
 * Determine supported MediaRecorder MIME types with universal hardware compatibility
 * @param {string} requestedFormat - 'mp4' | 'webm'
 * @returns {string} Supported MIME type
 */
export function getSupportedMimeType(requestedFormat = 'mp4') {
  const mp4Types = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2', // H.264 Baseline Profile (Universal Hardware Playback)
    'video/mp4;codecs=avc1.4d401f,mp4a.40.2', // H.264 Main Profile
    'video/mp4;codecs=avc1',
    'video/mp4;codecs=h264',
    'video/mp4'
  ];

  const webmTypes = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=h264,opus',
    'video/webm'
  ];

  if (typeof MediaRecorder === 'undefined') {
    return 'video/webm';
  }

  if (requestedFormat === 'mp4') {
    for (const type of mp4Types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    for (const type of webmTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
  } else {
    for (const type of webmTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    for (const type of mp4Types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
  }

  return '';
}

/**
 * Parse bitrate setting into bits per second optimized for hardware decoding
 */
function getBitrateBps(bitratePreset = 'high') {
  switch (bitratePreset) {
    case 'standard':
      return 5_000_000;
    case 'high':
      return 8_000_000; // Optimal 8 Mbps for smooth 1080p hardware playback
    case 'ultra':
      return 14_000_000;
    default:
      return 8_000_000;
  }
}

/**
 * Draw an image into a designated letterbox slot respecting fit ('contain' | 'cover' | 'fill'),
 * slot background color, and opacity.
 */
function drawSlotImageHelper(ctx, img, slotX, slotY, slotW, slotH, fit = 'contain', bgColor = '#000000', opacity = 1) {
  if (!img || slotW <= 0 || slotH <= 0) return;

  ctx.save();
  if (bgColor && bgColor !== 'transparent') {
    ctx.fillStyle = bgColor;
    ctx.fillRect(slotX, slotY, slotW, slotH);
  }

  const imgW = img.naturalWidth || img.width || slotW;
  const imgH = img.naturalHeight || img.height || slotH;
  if (!imgW || !imgH) {
    ctx.restore();
    return;
  }

  const imgAspect = imgW / imgH;
  const slotAspect = slotW / slotH;

  let drawX = slotX;
  let drawY = slotY;
  let drawW = slotW;
  let drawH = slotH;

  if (fit === 'contain') {
    // 100% visible, ZERO cropping
    if (imgAspect > slotAspect) {
      drawW = slotW;
      drawH = slotW / imgAspect;
      drawX = slotX;
      drawY = slotY + (slotH - drawH) / 2;
    } else {
      drawH = slotH;
      drawW = slotH * imgAspect;
      drawX = slotX + (slotW - drawW) / 2;
      drawY = slotY;
    }
  } else if (fit === 'cover') {
    // Fill the entire slot
    ctx.beginPath();
    ctx.rect(slotX, slotY, slotW, slotH);
    ctx.clip();

    if (imgAspect > slotAspect) {
      drawH = slotH;
      drawW = slotH * imgAspect;
      drawX = slotX + (slotW - drawW) / 2;
      drawY = slotY;
    } else {
      drawW = slotW;
      drawH = slotW / imgAspect;
      drawX = slotX;
      drawY = slotY + (slotH - drawH) / 2;
    }
  } else {
    // Stretch
    drawX = slotX;
    drawY = slotY;
    drawW = slotW;
    drawH = slotH;
  }

  if (opacity !== undefined && opacity < 1) {
    ctx.globalAlpha = opacity;
  }

  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  ctx.restore();
}

// Stable cache for wrapped text lines to eliminate redundant text measurements during export
const TEXT_LAYOUT_CACHE = new Map();

/**
 * Auto-wrap and fit text within a maximum allowed canvas width.
 * Prevents text from overflowing canvas bounds on any resolution.
 */
function wrapAndFitText(ctx, rawText, maxAllowedWidth, initialFontSize, font, minFontSize = 18) {
  const cacheKey = `${rawText}_${font}_${initialFontSize}_${Math.round(maxAllowedWidth)}`;
  if (TEXT_LAYOUT_CACHE.has(cacheKey)) {
    return TEXT_LAYOUT_CACHE.get(cacheKey);
  }

  let currentFontSize = initialFontSize;
  const paragraphs = String(rawText).split('\n');

  const getWrappedLines = (fontSize) => {
    ctx.font = `bold ${fontSize}px ${font}`;
    const wrapped = [];

    paragraphs.forEach((p) => {
      const words = p.split(' ');
      let currentLine = '';

      words.forEach((word) => {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxAllowedWidth && currentLine) {
          wrapped.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      });

      if (currentLine) {
        wrapped.push(currentLine);
      }
    });

    return wrapped.length > 0 ? wrapped : [''];
  };

  let lines = getWrappedLines(currentFontSize);
  let maxW = 0;
  lines.forEach((l) => {
    const w = ctx.measureText(l).width;
    if (w > maxW) maxW = w;
  });

  // Scale down font size step-by-step if any line overflows
  while (maxW > maxAllowedWidth && currentFontSize > minFontSize) {
    currentFontSize -= 2;
    lines = getWrappedLines(currentFontSize);
    maxW = 0;
    lines.forEach((l) => {
      const w = ctx.measureText(l).width;
      if (w > maxW) maxW = w;
    });
  }

  const result = {
    lines,
    fontSize: currentFontSize,
    maxLineWidth: maxW,
    lineHeight: Math.round(currentFontSize * 1.28)
  };

  // Proper LRU eviction: cap at 50 entries, evict oldest 25 in one batch.
  // The previous single-entry eviction at 150 caused the cache to balloon
  // to 150 string-array entries across multiple exports.
  if (TEXT_LAYOUT_CACHE.size >= 50) {
    const keys = TEXT_LAYOUT_CACHE.keys();
    for (let i = 0; i < 25; i++) {
      const { value: oldKey, done } = keys.next();
      if (done) break;
      TEXT_LAYOUT_CACHE.delete(oldKey);
    }
  }
  TEXT_LAYOUT_CACHE.set(cacheKey, result);


  return result;
}

import { exportVideoClip } from './exportEngine';

/**
 * Process and render a single video clip with maximum speed, zero dropped frames,
 * deterministic timestamps, and universal hardware compatibility.
 */
export async function processVideoClip(params) {
  return exportVideoClip(params);
}

/**
 * Enhanced Real-Time Hardware MediaRecorder Fallback Pipeline
 */
export async function processVideoClipLegacy({
  videoSource,
  startTime,
  endTime,
  segments = null,
  partNumber = 1,
  settings,
  onProgress = () => {},
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

  const rawSegments = (segments && segments.length > 0)
    ? segments.filter((s) => (s.endTime - s.startTime) > 0.05)
    : [{ startTime: startTime || 0, endTime: endTime || 0 }];
  const activeSegments = [...rawSegments].sort((a, b) => a.startTime - b.startTime);

  const clipDuration = Math.max(0.5, activeSegments.reduce(
    (sum, s) => sum + Math.max(0, s.endTime - s.startTime),
    0
  ));
  const targetFormat = exportConfig.format || 'mp4';
  const mimeType = getSupportedMimeType(targetFormat);
  const isMp4 = mimeType.includes('mp4');
  const finalExt = isMp4 ? 'mp4' : 'webm';

  const fpsValue = exportConfig.fps === 'original' || !exportConfig.fps
    ? 30
    : parseInt(exportConfig.fps, 10);

  return new Promise(async (resolve, reject) => {
    let videoEl = null;
    let musicEl = null;
    let voiceoverEl = null;
    let audioCtx = null;
    let mediaRecorder = null;
    let logoImage = null;
    let bgImage = null;
    let topReelImg = null;
    let bottomReelImg = null;
    let hiddenContainer = null;
    let animFrameId = null;
    let heartbeatTimer = null;
    let watchdogTimer = null;
    let temporaryObjectUrl = null;
    let isFinished = false;
    const recordedChunks = [];

    const cleanup = () => {
      isFinished = true;
      if (temporaryObjectUrl) {
        try {
          URL.revokeObjectURL(temporaryObjectUrl);
        } catch (e) {}
        temporaryObjectUrl = null;
      }
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      if (watchdogTimer) {
        clearTimeout(watchdogTimer);
        watchdogTimer = null;
      }
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try {
          mediaRecorder.stop();
        } catch (e) {}
      }
      if (videoEl) {
        try {
          videoEl.pause();
          videoEl.removeAttribute('src');
          videoEl.load();
        } catch (e) {}
      }
      if (musicEl) {
        try {
          musicEl.pause();
          musicEl.removeAttribute('src');
          musicEl.load();
        } catch (e) {}
      }
      if (voiceoverEl) {
        try {
          voiceoverEl.pause();
          voiceoverEl.removeAttribute('src');
          voiceoverEl.load();
        } catch (e) {}
      }
      if (hiddenContainer && hiddenContainer.parentNode) {
        try {
          hiddenContainer.parentNode.removeChild(hiddenContainer);
        } catch (e) {}
      }
      if (audioCtx && audioCtx.state !== 'closed') {
        try {
          audioCtx.close();
        } catch (e) {}
      }
    };

    const finishRecording = () => {
      if (isFinished) return;
      isFinished = true;
      onProgress(100);

      try {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          try {
            mediaRecorder.requestData();
          } catch (e) {}

          setTimeout(() => {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
              try {
                mediaRecorder.stop();
              } catch (e) {}
            }
          }, 150);
        } else if (mediaRecorder && mediaRecorder.state === 'inactive' && recordedChunks.length > 0) {
          const finalBlob = new Blob(recordedChunks, { type: mimeType || 'video/mp4' });
          const outputUrl = URL.createObjectURL(finalBlob);
          cleanup();
          resolve({
            blob: finalBlob,
            url: outputUrl,
            duration: clipDuration,
            format: finalExt,
            size: finalBlob.size
          });
        }
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    if (signal) {
      signal.addEventListener('abort', () => {
        cleanup();
        reject(new Error('Job was cancelled by user'));
      });
    }

    try {
      // 1. Create a DOM-attached container with active GPU layer to prevent Chromium background throttling
      hiddenContainer = document.createElement('div');
      hiddenContainer.style.cssText = 'position:fixed;bottom:0;right:0;width:320px;height:180px;opacity:0.002;pointer-events:none;z-index:99999;overflow:hidden;transform:translateZ(0);';
      document.body.appendChild(hiddenContainer);

      // 2. Setup Video Element
      videoEl = document.createElement('video');
      videoEl.crossOrigin = 'anonymous';
      videoEl.playsInline = true;
      videoEl.preload = 'auto';
      videoEl.muted = false;
      videoEl.playbackRate = audio.speed || 1.0;
      videoEl.style.cssText = 'width:100%;height:100%;object-fit:contain;';
      hiddenContainer.appendChild(videoEl);

      let srcUrl = '';
      if (typeof videoSource === 'string') {
        srcUrl = videoSource;
      } else if (videoSource?.url) {
        srcUrl = videoSource.url;
      } else if (videoSource?.src) {
        srcUrl = videoSource.src;
      } else if (videoSource?.file && typeof window !== 'undefined') {
        temporaryObjectUrl = URL.createObjectURL(videoSource.file);
        srcUrl = temporaryObjectUrl;
      } else if (videoSource instanceof Blob && typeof window !== 'undefined') {
        temporaryObjectUrl = URL.createObjectURL(videoSource);
        srcUrl = temporaryObjectUrl;
      }

      if (!srcUrl) {
        throw new Error('No valid video source provided for processing');
      }

      videoEl.src = srcUrl;

      await new Promise((res, rej) => {
        videoEl.onloadedmetadata = () => res();
        videoEl.onerror = () => rej(new Error('Failed to load source video stream'));
      });

      const srcWidth = videoEl.videoWidth || 1920;
      const srcHeight = videoEl.videoHeight || 1080;

      // 3. Preload Background Image if custom image background is enabled
      if (background.type === 'image' && background.imageUrl) {
        bgImage = new Image();
        bgImage.crossOrigin = 'anonymous';
        await new Promise((res) => {
          bgImage.onload = () => res();
          bgImage.onerror = () => {
            bgImage = null;
            res();
          };
          bgImage.src = background.imageUrl;
        });
      }

      // 4. Preload Logo Image if enabled
      if (logo.enabled && logo.url) {
        logoImage = new Image();
        logoImage.crossOrigin = 'anonymous';
        await new Promise((res) => {
          logoImage.onload = () => res();
          logoImage.onerror = () => {
            logoImage = null;
            res();
          };
          logoImage.src = logo.url;
        });
      }

      // 4b. Preload Top & Bottom Reel Images
      if (crop?.reelImages?.top?.url) {
        topReelImg = new Image();
        topReelImg.crossOrigin = 'anonymous';
        await new Promise((res) => {
          topReelImg.onload = () => res();
          topReelImg.onerror = () => {
            topReelImg = null;
            res();
          };
          topReelImg.src = crop.reelImages.top.url;
        });
      }
      if (crop?.reelImages?.bottom?.url) {
        bottomReelImg = new Image();
        bottomReelImg.crossOrigin = 'anonymous';
        await new Promise((res) => {
          bottomReelImg.onload = () => res();
          bottomReelImg.onerror = () => {
            bottomReelImg = null;
            res();
          };
          bottomReelImg.src = crop.reelImages.bottom.url;
        });
      }

      // 5a. Preload Background Music if enabled
      if (audio.bgMusicEnabled && audio.bgMusicUrl) {
        musicEl = document.createElement('audio');
        musicEl.crossOrigin = 'anonymous';
        musicEl.src = audio.bgMusicUrl;
        musicEl.loop = true;
        hiddenContainer.appendChild(musicEl);
        await new Promise((res) => {
          musicEl.onloadedmetadata = () => res();
          musicEl.onerror = () => {
            musicEl = null;
            res();
          };
        });
      }

      // 5b. Preload Another Voice / Voiceover Track if enabled
      if (audio.voiceoverEnabled && audio.voiceoverUrl) {
        voiceoverEl = document.createElement('audio');
        voiceoverEl.crossOrigin = 'anonymous';
        voiceoverEl.src = audio.voiceoverUrl;
        hiddenContainer.appendChild(voiceoverEl);
        await new Promise((res) => {
          voiceoverEl.onloadedmetadata = () => res();
          voiceoverEl.onerror = () => {
            voiceoverEl = null;
            res();
          };
        });
      }

      // 6. Calculate Resolution & Setup Canvas
      const initialCrop = calculateCropDimensions({
        sourceWidth: srcWidth,
        sourceHeight: srcHeight,
        mode: crop.mode || 'original',
        fillMode: crop.fillMode || 'fit',
        manualX: crop.x || 0,
        manualY: crop.y || 0,
        customWidth: crop.customWidth ?? 60,
        customHeight: crop.customHeight ?? 85,
        zoom: crop.zoom || 1,
        resolution: exportConfig.resolution || 'original'
      });

      const canvas = document.createElement('canvas');
      canvas.width = initialCrop.canvasWidth;
      canvas.height = initialCrop.canvasHeight;
      const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

      // Hardware-Accelerated Fast Offscreen Blur Canvas (240x426)
      const blurCanvas = document.createElement('canvas');
      blurCanvas.width = 240;
      blurCanvas.height = 426;
      const blurCtx = blurCanvas.getContext('2d', { alpha: false });

      // 7. Setup Web Audio Routing & Multi-Track Mixing
      let streamAudioTracks = [];
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          audioCtx = new AudioContextClass();
          const audioDest = audioCtx.createMediaStreamDestination();

          const videoSourceNode = audioCtx.createMediaElementSource(videoEl);
          const videoGain = audioCtx.createGain();

          // Base video volume
          let baseVideoVol = (audio.volume ?? 100) / 100;
          if (audio.muteOriginal) {
            baseVideoVol = 0;
          } else if (voiceoverEl && audio.autoDucking) {
            // Auto-duck original audio to 35% when another voice is present
            baseVideoVol = baseVideoVol * 0.35;
          }

          videoGain.gain.value = baseVideoVol;
          videoSourceNode.connect(videoGain);
          videoGain.connect(audioDest);

          // Mix Another Voice / Voiceover Track
          if (voiceoverEl) {
            const voiceSourceNode = audioCtx.createMediaElementSource(voiceoverEl);
            const voiceGain = audioCtx.createGain();
            voiceGain.gain.value = (audio.voiceoverVolume ?? 100) / 100;
            voiceSourceNode.connect(voiceGain);
            voiceGain.connect(audioDest);
          }

          // Mix Background Music Track
          if (musicEl) {
            const musicSourceNode = audioCtx.createMediaElementSource(musicEl);
            const musicGain = audioCtx.createGain();
            musicGain.gain.value = (audio.bgMusicVolume ?? 30) / 100;
            musicSourceNode.connect(musicGain);
            musicGain.connect(audioDest);
          }

          streamAudioTracks = audioDest.stream.getAudioTracks();
        }
      } catch (audioErr) {
        console.warn('Web Audio node initialization warning:', audioErr);
      }

      // 8. Setup MediaStream & MediaRecorder
      const canvasStream = canvas.captureStream(fpsValue);
      const videoTrack = canvasStream.getVideoTracks()[0];

      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...streamAudioTracks
      ]);

      const bitrateBps = getBitrateBps(exportConfig.bitrate);
      const recorderOptions = {
        videoBitsPerSecond: bitrateBps,
        audioBitsPerSecond: 192000
      };
      if (mimeType) {
        recorderOptions.mimeType = mimeType;
      }

      mediaRecorder = new MediaRecorder(combinedStream, recorderOptions);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunks.push(e.data);
        }
      };

      mediaRecorder.onerror = (err) => {
        cleanup();
        reject(new Error(`Recording error: ${err.message || 'MediaRecorder failed'}`));
      };

      mediaRecorder.onstop = () => {
        const finalBlob = new Blob(recordedChunks, { type: mimeType || 'video/mp4' });
        const outputUrl = URL.createObjectURL(finalBlob);
        cleanup();

        resolve({
          blob: finalBlob,
          url: outputUrl,
          duration: clipDuration,
          format: finalExt,
          size: finalBlob.size
        });
      };

      // 9. Face Tracker setup
      const faceSmoother = new FaceTrackerSmoother(0.12);
      let lastFaceCheckTime = 0;
      let cachedFaceCenter = null;

      // 10. Multi-Segment Seek & Progression State
      let currentSegmentIdx = 0;
      let isSeekingSegment = false;

      videoEl.currentTime = activeSegments[0].startTime;
      await new Promise((res) => {
        videoEl.onseeked = () => res();
      });

      // Resume audio context BEFORE playback to guarantee sync
      if (audioCtx && audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      // Start recording with 250ms chunk slicing for clean container writing
      mediaRecorder.start(250);

      if (musicEl) {
        musicEl.currentTime = 0;
        musicEl.play().catch(() => {});
      }
      if (voiceoverEl) {
        voiceoverEl.currentTime = 0;
        voiceoverEl.play().catch(() => {});
      }
      await videoEl.play();

      const advanceSegmentOrFinish = () => {
        if (isFinished || !videoEl) return;
        const curSeg = activeSegments[currentSegmentIdx];
        const isAtSegmentEnd = videoEl.currentTime >= curSeg.endTime - 0.05 || videoEl.ended;

        if (isAtSegmentEnd) {
          if (currentSegmentIdx < activeSegments.length - 1) {
            if (!isSeekingSegment) {
              isSeekingSegment = true;
              currentSegmentIdx++;
              const nextSeg = activeSegments[currentSegmentIdx];
              videoEl.pause();
              videoEl.currentTime = nextSeg.startTime;
              videoEl.onseeked = () => {
                videoEl.onseeked = null;
                isSeekingSegment = false;
                if (!isFinished && !signal?.aborted) {
                  videoEl.play().catch(() => {});
                }
              };
            }
          } else {
            finishRecording();
          }
        }
      };

      videoEl.onended = advanceSegmentOrFinish;

      // 11. Check if non-default visual effects are active
      const hasCustomFilters =
        (effects.brightness ?? 100) !== 100 ||
        (effects.contrast ?? 100) !== 100 ||
        (effects.saturation ?? 100) !== 100 ||
        (effects.sepia ?? 0) > 0 ||
        (effects.grayscale ?? 0) > 0 ||
        (effects.invert ?? 0) > 0 ||
        (effects.blur ?? 0) > 0;

      const filterString = hasCustomFilters
        ? `brightness(${(effects.brightness ?? 100) / 100}) contrast(${(effects.contrast ?? 100) / 100}) saturate(${(effects.saturation ?? 100) / 100}) sepia(${(effects.sepia ?? 0) / 100}) grayscale(${(effects.grayscale ?? 0) / 100}) invert(${(effects.invert ?? 0) / 100}) blur(${effects.blur ?? 0}px)`
        : 'none';

      // Background settings
      const bgType = background.type || 'blur-video';
      const bgBlurAmount = background.blur ?? 20;
      const bgBrightness = (background.opacity ?? 65) / 100;
      const isFitLetterbox = (crop.fillMode !== 'fill') && (crop.mode !== 'original');

      // 12. Safety Watchdog Timer: Guarantees completion if browser video stalls near end
      const expectedDurationSec = clipDuration / (audio.speed || 1.0);
      watchdogTimer = setTimeout(() => {
        if (!isFinished) {
          finishRecording();
        }
      }, Math.max(3000, (expectedDurationSec + 2.5) * 1000));

      // 13. Secondary Heartbeat Timer to check completion every 150ms
      heartbeatTimer = setInterval(() => {
        if (isFinished || !videoEl) return;
        advanceSegmentOrFinish();
        if (videoEl.paused && !isFinished && !isSeekingSegment && !signal?.aborted) {
          // Attempt resume if mobile browser paused playback when backgrounded
          videoEl.play().catch(() => {});
        }
      }, 150);

      // 14. High-Performance Frame Render Loop
      const renderLoop = async () => {
        if (isFinished || signal?.aborted || !videoEl) return;

        const curSeg = activeSegments[currentSegmentIdx];
        const currentPos = videoEl.currentTime;

        // Check if finished or transition segment
        if (currentPos >= curSeg.endTime - 0.05 || videoEl.ended) {
          advanceSegmentOrFinish();
          if (currentSegmentIdx >= activeSegments.length - 1 && (currentPos >= curSeg.endTime - 0.05 || videoEl.ended)) {
            return;
          }
        }

        // Progress update calculated across active segments
        let elapsed = 0;
        for (let i = 0; i < currentSegmentIdx; i++) {
          elapsed += Math.max(0, activeSegments[i].endTime - activeSegments[i].startTime);
        }
        if (!isSeekingSegment) {
          elapsed += Math.max(0, Math.min(curSeg.endTime, currentPos) - curSeg.startTime);
        }
        const progressPct = Math.min(99, Math.max(0, Math.round((elapsed / clipDuration) * 100)));
        onProgress(progressPct);

        // Non-blocking Face Detection
        if (crop.faceTracking && Date.now() - lastFaceCheckTime > 500) {
          lastFaceCheckTime = Date.now();
          setTimeout(() => {
            detectFaceInFrame(videoEl).then((face) => {
              if (face) cachedFaceCenter = faceSmoother.update(face);
              else cachedFaceCenter = faceSmoother.update(null);
            }).catch(() => {});
          }, 0);
        }

        // Dynamic Crop Calculations
        const cropBox = calculateCropDimensions({
          sourceWidth: srcWidth,
          sourceHeight: srcHeight,
          mode: crop.mode || 'original',
          fillMode: crop.fillMode || 'fit',
          manualX: crop.x || 0,
          manualY: crop.y || 0,
          customWidth: crop.customWidth ?? 60,
          customHeight: crop.customHeight ?? 85,
          zoom: crop.zoom || 1,
          faceCenter: crop.faceTracking ? cachedFaceCenter : null,
          resolution: exportConfig.resolution || 'original'
        });

        // 15. Render Background Layer (Ultra-Fast Hardware Bilinear Blur)
        if (isFitLetterbox) {
          if (bgType === 'blur-video') {
            const canvasAspect = canvas.width / canvas.height;
            const videoAspect = srcWidth / srcHeight;
            let bgSx = 0, bgSy = 0, bgSW = srcWidth, bgSH = srcHeight;

            if (videoAspect > canvasAspect) {
              bgSW = srcHeight * canvasAspect;
              bgSx = (srcWidth - bgSW) / 2;
            } else {
              bgSH = srcWidth / canvasAspect;
              bgSy = (srcHeight - bgSH) / 2;
            }

            // Downscaled Fast Gaussian Blur in 240x426 buffer
            const miniBlur = Math.max(2, Math.round(bgBlurAmount * 0.28));
            blurCtx.filter = `blur(${miniBlur}px) brightness(${bgBrightness})`;
            blurCtx.drawImage(videoEl, bgSx, bgSy, bgSW, bgSH, 0, 0, 240, 426);

            // Blit to full canvas with GPU bilinear interpolation
            ctx.drawImage(blurCanvas, 0, 0, canvas.width, canvas.height);
          } else if (bgType === 'image' && bgImage) {
            const imgW = bgImage.naturalWidth || bgImage.width || 1920;
            const imgH = bgImage.naturalHeight || bgImage.height || 1080;
            const canvasAspect = canvas.width / canvas.height;
            const imgAspect = imgW / imgH;
            let bgSx = 0, bgSy = 0, bgSW = imgW, bgSH = imgH;

            if (imgAspect > canvasAspect) {
              bgSW = imgH * canvasAspect;
              bgSx = (imgW - bgSW) / 2;
            } else {
              bgSH = imgW / canvasAspect;
              bgSy = (imgH - bgSH) / 2;
            }

            const miniBlur = Math.max(2, Math.round(bgBlurAmount * 0.28));
            blurCtx.filter = `blur(${miniBlur}px) brightness(${bgBrightness})`;
            blurCtx.drawImage(bgImage, bgSx, bgSy, bgSW, bgSH, 0, 0, 240, 426);

            ctx.drawImage(blurCanvas, 0, 0, canvas.width, canvas.height);
          } else {
            ctx.fillStyle = background.color || '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
        } else {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // 15b. Draw Top & Bottom Reel Cover Images if loaded
        if (isFitLetterbox && cropBox.dy > 0) {
          const reel = crop?.reelImages;
          if (topReelImg) {
            const topFit = reel?.top?.fit || 'contain';
            const topBg = reel?.top?.bgColor || '#000000';
            const topOpacity = (reel?.top?.opacity ?? 100) / 100;
            drawSlotImageHelper(ctx, topReelImg, 0, 0, canvas.width, cropBox.dy, topFit, topBg, topOpacity);
          }
          if (bottomReelImg) {
            const bottomFit = reel?.bottom?.fit || 'contain';
            const bottomBg = reel?.bottom?.bgColor || '#000000';
            const bottomOpacity = (reel?.bottom?.opacity ?? 100) / 100;
            const bottomY = cropBox.dy + cropBox.dHeight;
            const bottomH = Math.max(0, canvas.height - bottomY);
            drawSlotImageHelper(ctx, bottomReelImg, 0, bottomY, canvas.width, bottomH, bottomFit, bottomBg, bottomOpacity);
          }
        }

        // 16. Render Main Sharp Video Frame
        ctx.save();
        if (hasCustomFilters) {
          ctx.filter = filterString;
        }

        ctx.drawImage(
          videoEl,
          cropBox.sx,
          cropBox.sy,
          cropBox.sWidth,
          cropBox.sHeight,
          cropBox.dx,
          cropBox.dy,
          cropBox.dWidth,
          cropBox.dHeight
        );
        ctx.restore();

        // 17. Render Fade Transitions
        const clipElapsed = currentPos - startTime;
        const clipRemaining = endTime - currentPos;

        if (effects.fadeIn && clipElapsed < (effects.fadeInDuration || 0.5)) {
          const fadeAlpha = 1 - (clipElapsed / (effects.fadeInDuration || 0.5));
          ctx.save();
          ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0, Math.min(1, fadeAlpha))})`;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.restore();
        }

        if (effects.fadeOut && clipRemaining < (effects.fadeOutDuration || 0.5)) {
          const fadeAlpha = 1 - (clipRemaining / (effects.fadeOutDuration || 0.5));
          ctx.save();
          ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0, Math.min(1, fadeAlpha))})`;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.restore();
        }

        // 18. Render Text Overlays & Part Numbering
        if (text.enabled || (text.extraTexts && text.extraTexts.length > 0)) {
          renderTextOverlay(ctx, canvas.width, canvas.height, text, partNumber);
        }


        // 19. Render Logo Overlay
        if (logo.enabled && logoImage) {
          renderLogoOverlay(ctx, canvas.width, canvas.height, logo, logoImage);
        }

        // Force explicit hardware frame delivery to MediaRecorder
        if (videoTrack && typeof videoTrack.requestFrame === 'function') {
          try {
            videoTrack.requestFrame();
          } catch (e) {}
        }

        // Schedule next frame
        if (!isFinished) {
          if ('requestVideoFrameCallback' in videoEl) {
            videoEl.requestVideoFrameCallback(renderLoop);
          } else {
            animFrameId = requestAnimationFrame(renderLoop);
          }
        }
      };

      // Start rendering loop
      if ('requestVideoFrameCallback' in videoEl) {
        videoEl.requestVideoFrameCallback(renderLoop);
      } else {
        animFrameId = requestAnimationFrame(renderLoop);
      }
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}

export function hexOrColorToRgba(colorStr, alphaPercent = 75) {
  const alpha = Math.max(0, Math.min(1, (alphaPercent ?? 75) / 100));
  if (!colorStr) return `rgba(0, 0, 0, ${alpha})`;
  if (colorStr.startsWith('rgba(')) {
    return colorStr.replace(/[\d\.]+\)$/g, `${alpha})`);
  }
  if (colorStr.startsWith('rgb(')) {
    return colorStr.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
  }
  if (colorStr.startsWith('#')) {
    let hex = colorStr.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.slice(0, 2), 16) || 0;
    const g = parseInt(hex.slice(2, 4), 16) || 0;
    const b = parseInt(hex.slice(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return colorStr;
}

function applyTextTransform(str, transform) {
  if (!str) return '';
  if (transform === 'uppercase') return str.toUpperCase();
  if (transform === 'lowercase') return str.toLowerCase();
  if (transform === 'capitalize') {
    return str.replace(/\b\w/g, c => c.toUpperCase());
  }
  return str;
}

/**
 * Render dynamic text template, part numbers, and all extra custom text overlays onto canvas
 * with intelligent word wrapping, opacity controls, 2px minimum sizing, and auto-fitting.
 */
export function renderTextOverlay(ctx, canvasWidth, canvasHeight, textSettings, partNumber = 1) {
  if (!textSettings) return;

  const minDim = Math.min(canvasWidth, canvasHeight);
  const scale = minDim / 540;
  const maxAllowedTextWidth = canvasWidth * 0.86;

  // 1. Primary Title Text Overlay
  if (textSettings.enabled) {
    const {
      movieName = 'My Movie',
      template = '{movie} - Part {part}',
      zeroPad = true,
      font = 'Inter, sans-serif',
      fontSize = 28,
      color = '#ffffff',
      opacity = 100,
      outline = true,
      outlineColor = '#000000',
      outlineThickness = 3,
      bgEnabled = false,
      bgColor = 'rgba(0, 0, 0, 0.75)',
      bgOpacity = 75,
      bgPadding = 8,
      bgRadius = 8,
      position = 'top-center',
      customY = null,
      customX = null,
      textTransform = 'none',
      fontStyle = 'normal',
      letterSpacing = 0,
      displayMode = 'all'
    } = textSettings;

    // Check display / staying mode
    const shouldDisplay = displayMode === 'all'
      || (displayMode === 'first' && partNumber === 1)
      || (displayMode === 'last' && textSettings.isLastPart);

    if (shouldDisplay) {
      const formattedPart = zeroPad ? String(partNumber).padStart(2, '0') : String(partNumber);
      const displayText = textSettings.text || movieName || 'My Movie';
      let fullText = (template || '{movie} - Part {part}')
        .replace(/\{movie\}/gi, displayText)
        .replace(/\{title\}/gi, displayText)
        .replace(/\{text\}/gi, displayText)
        .replace(/\{part\}/gi, formattedPart);

      fullText = applyTextTransform(fullText, textTransform);

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, (opacity ?? 100) / 100));

      const initialScaledFontSize = Math.max(2, Math.round(fontSize * scale));
      const layout = wrapAndFitText(ctx, fullText, maxAllowedTextWidth, initialScaledFontSize, font, 2);

      const stylePrefix = fontStyle === 'italic' ? 'italic ' : '';
      ctx.font = `${stylePrefix}bold ${layout.fontSize}px ${font}`;
      ctx.textBaseline = 'middle';

      if (letterSpacing && 'letterSpacing' in ctx) {
        try { ctx.letterSpacing = `${letterSpacing * scale}px`; } catch (e) {}
      }

      const isTop = position.startsWith('top');
      const isBottom = position.startsWith('bottom');
      const isLeft = position.endsWith('left');
      const isRight = position.endsWith('right');

      // X Position
      let x = canvasWidth / 2;
      let textAlign = 'center';

      if (typeof customX === 'number') {
        x = (customX / 100) * canvasWidth;
        textAlign = 'center';
      } else if (isLeft) {
        x = canvasWidth * 0.07;
        textAlign = 'left';
      } else if (isRight) {
        x = canvasWidth * 0.93;
        textAlign = 'right';
      } else {
        x = canvasWidth / 2;
        textAlign = 'center';
      }

      // Y Position
      let y = canvasHeight * 0.10;
      if (typeof customY === 'number') {
        y = (customY / 100) * canvasHeight;
      } else if (isTop) {
        y = canvasHeight * 0.10;
      } else if (isBottom) {
        y = canvasHeight * 0.90;
      } else {
        y = canvasHeight * 0.50;
      }

      ctx.textAlign = textAlign;
      const totalTextHeight = layout.lines.length * layout.lineHeight;

      // Background Pill Box
      if (bgEnabled) {
        const pad = Math.max(2, bgPadding ?? 8);
        const padX = (pad + 4) * scale;
        const padY = pad * scale;
        const radius = (bgRadius ?? 8) * scale;

        let boxX = x - layout.maxLineWidth / 2 - padX;
        if (textAlign === 'left') {
          boxX = x - padX;
        } else if (textAlign === 'right') {
          boxX = x - layout.maxLineWidth - padX;
        }

        const boxY = y - totalTextHeight / 2 - padY;
        const boxW = layout.maxLineWidth + padX * 2;
        const boxH = totalTextHeight + padY * 2;

        ctx.fillStyle = hexOrColorToRgba(bgColor, bgOpacity);
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(boxX, boxY, boxW, boxH, radius);
        } else {
          ctx.rect(boxX, boxY, boxW, boxH);
        }
        ctx.fill();
      }

      // Draw each wrapped line
      const startY = y - ((layout.lines.length - 1) * layout.lineHeight) / 2;

      layout.lines.forEach((line, idx) => {
        const lineY = startY + idx * layout.lineHeight;

        if (outline) {
          ctx.strokeStyle = outlineColor || '#000000';
          ctx.lineWidth = Math.max(2, (outlineThickness || 3) * scale);
          ctx.lineJoin = 'round';
          ctx.strokeText(line, x, lineY);
        }

        ctx.fillStyle = color || '#ffffff';
        ctx.fillText(line, x, lineY);
      });

      ctx.restore();
    }
  }

  // 2. Extra Custom Text Overlays
  if (textSettings.extraTexts && Array.isArray(textSettings.extraTexts)) {
    textSettings.extraTexts.forEach((extra) => {
      if (!extra.enabled || !extra.text) return;

      const shouldDisplayExtra = (extra.displayMode || 'all') === 'all'
        || (extra.displayMode === 'first' && partNumber === 1)
        || (extra.displayMode === 'last' && textSettings.isLastPart);

      if (!shouldDisplayExtra) return;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, (extra.opacity ?? 100) / 100));

      const extraFont = extra.font || 'Inter, sans-serif';
      const initialExtraFontSize = Math.max(2, Math.round((extra.fontSize || 22) * scale));
      const extraTransformedText = applyTextTransform(extra.text, extra.textTransform || 'none');
      const layout = wrapAndFitText(ctx, extraTransformedText, maxAllowedTextWidth, initialExtraFontSize, extraFont, 2);

      const stylePrefix = extra.fontStyle === 'italic' ? 'italic ' : '';
      ctx.font = `${stylePrefix}bold ${layout.fontSize}px ${extraFont}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';

      if (extra.letterSpacing && 'letterSpacing' in ctx) {
        try { ctx.letterSpacing = `${extra.letterSpacing * scale}px`; } catch (e) {}
      }

      const extraX = ((extra.customX ?? 50) / 100) * canvasWidth;
      const extraY = ((extra.customY ?? 88) / 100) * canvasHeight;
      const totalTextHeight = layout.lines.length * layout.lineHeight;

      // Background pill box
      if (extra.bgEnabled) {
        const pad = Math.max(2, extra.bgPadding ?? 6);
        const padX = (pad + 4) * scale;
        const padY = pad * scale;
        const radius = (extra.bgRadius ?? 8) * scale;

        const boxX = extraX - layout.maxLineWidth / 2 - padX;
        const boxY = extraY - totalTextHeight / 2 - padY;
        const boxW = layout.maxLineWidth + padX * 2;
        const boxH = totalTextHeight + padY * 2;

        ctx.fillStyle = hexOrColorToRgba(extra.bgColor || '#000000', extra.bgOpacity ?? 75);
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(boxX, boxY, boxW, boxH, radius);
        } else {
          ctx.rect(boxX, boxY, boxW, boxH);
        }
        ctx.fill();
      }

      // Draw each wrapped line
      const extraStartY = extraY - ((layout.lines.length - 1) * layout.lineHeight) / 2;
      layout.lines.forEach((line, idx) => {
        const lineY = extraStartY + idx * layout.lineHeight;

        if (extra.outline !== false) {
          ctx.strokeStyle = extra.outlineColor || '#000000';
          ctx.lineWidth = Math.max(2, (extra.outlineThickness || 3) * scale);
          ctx.lineJoin = 'round';
          ctx.strokeText(line, extraX, lineY);
        }

        ctx.fillStyle = extra.color || '#ffffff';
        ctx.fillText(line, extraX, lineY);
      });

      ctx.restore();
    });
  }
}

/**
 * Render logo watermark overlay onto canvas with exact preview proportions
 */
export function renderLogoOverlay(ctx, canvasWidth, canvasHeight, logoSettings, logoImage) {
  if (!logoSettings || !logoImage) return;

  const {
    size = 60,
    opacity = 80,
    position = 'top-right'
  } = logoSettings;

  ctx.save();

  // Consistent isotropic scale based on min dimension so 16:9 landscape doesn't blow up
  const minDim = Math.min(canvasWidth, canvasHeight);
  const scale = minDim / 540;
  const scaledWidth = Math.max(20, Math.round((size || 60) * scale));
  const naturalW = logoImage.naturalWidth || logoImage.width || 1;
  const naturalH = logoImage.naturalHeight || logoImage.height || 1;
  const aspect = naturalH / naturalW;
  const scaledHeight = Math.round(scaledWidth * aspect);

  const marginX = canvasWidth * 0.04;
  const marginY = canvasHeight * 0.04;

  let x = canvasWidth - scaledWidth - marginX;
  let y = marginY;

  if (typeof logoSettings.customX === 'number' && typeof logoSettings.customY === 'number') {
    x = (logoSettings.customX / 100) * canvasWidth - scaledWidth / 2;
    y = (logoSettings.customY / 100) * canvasHeight - scaledHeight / 2;
    x = Math.max(0, Math.min(canvasWidth - scaledWidth, x));
    y = Math.max(0, Math.min(canvasHeight - scaledHeight, y));
  } else if (position === 'top-left') {
    x = marginX;
    y = marginY;
  } else if (position === 'top-right') {
    x = canvasWidth - scaledWidth - marginX;
    y = marginY;
  } else if (position === 'bottom-left') {
    x = marginX;
    y = canvasHeight - scaledHeight - marginY;
  } else if (position === 'bottom-right') {
    x = canvasWidth - scaledWidth - marginX;
    y = canvasHeight - scaledHeight - marginY;
  } else if (position === 'center') {
    x = (canvasWidth - scaledWidth) / 2;
    y = (canvasHeight - scaledHeight) / 2;
  }

  ctx.globalAlpha = Math.max(0.05, Math.min(1.0, (opacity || 80) / 100));
  ctx.drawImage(logoImage, x, y, scaledWidth, scaledHeight);

  ctx.restore();
}
