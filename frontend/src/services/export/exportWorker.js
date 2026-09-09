/**
 * Dedicated Web Worker for High-Performance Video Export
 * Runs Demuxing, VideoDecoder, OffscreenCanvas rendering, VideoEncoder,
 * AudioEncoder, and MP4Muxer off the main UI thread.
 * Features strict VideoFrame/AudioData lifecycle cleanup, reusable audio chunk buffers,
 * and detailed execution telemetry.
 */

import { MP4Demuxer } from './mp4Demuxer';
import { ExportVideoDecoder } from './exportVideoDecoder';
import { ExportTimelineMapper } from './exportTimelineMapper';
import { ExportRenderer } from './exportRenderer';
import { MP4Muxer } from '../mp4Muxer';
import { getOptimalH264Codec, getRecommendedVideoBitrate } from './exportConfig';

let isCancelled = false;

self.onmessage = async (e) => {
  const message = e.data;

  if (message.type === 'cancel') {
    isCancelled = true;
    return;
  }

  if (message.type === 'start') {
    isCancelled = false;
    try {
      await runExportInWorker(message.payload);
    } catch (err) {
      self.postMessage({
        type: 'error',
        message: err?.message || String(err)
      });
    }
  }
};

async function runExportInWorker(payload) {
  const workerStartTime = performance.now();
  let totalDemuxMs = 0;
  let totalDecodeMs = 0;
  let totalRenderMs = 0;
  let totalEncodeMs = 0;
  let totalMuxMs = 0;
  let totalThumbMs = 0;
  let maxEncodeQueue = 0;

  const {
    jobId,
    clipId,
    sourceFile,
    startTime,
    endTime,
    segments,
    partNumber = 1,
    settings = {},
    mixedAudioData = null, // { leftChannel, rightChannel, sampleRate }
    canvasWidth,
    canvasHeight
  } = payload;

  const exportConfig = settings.export || {};
  const audioSettings = settings.audio || {};
  const playbackSpeed = audioSettings.speed || 1.0;
  const targetFps = exportConfig.fps === 'original' || !exportConfig.fps
    ? 30
    : (parseFloat(exportConfig.fps) || 30);

  // 1. Initialize Timeline Mapper
  const timelineMapper = new ExportTimelineMapper({
    segments,
    startTime,
    endTime,
    playbackSpeed,
    fps: targetFps
  });

  const totalFrames = timelineMapper.totalFrames;
  const clipDurationSec = timelineMapper.totalDuration;

  self.postMessage({ type: 'progress', progress: 5, phase: 'Initializing Demuxer' });

  // 2. Initialize Demuxer & Sequential Video Decoder
  const demuxT0 = performance.now();
  const demuxer = new MP4Demuxer(sourceFile);
  await demuxer.initialize();
  totalDemuxMs = performance.now() - demuxT0;

  const videoDecoder = new ExportVideoDecoder({
    demuxer,
    maxDecodedFrames: 4
  });
  await videoDecoder.initialize();

  // 3. Initialize OffscreenCanvas GPU/2D Renderer
  self.postMessage({ type: 'progress', progress: 10, phase: 'Initializing GPU Pipeline' });
  const renderer = new ExportRenderer({
    width: canvasWidth,
    height: canvasHeight
  });

  if (settings.logo) {
    await renderer.setLogoSource(settings.logo);
  }
  if (settings.background) {
    await renderer.setBackgroundSource(settings.background);
  }

  // Pre-render static text overlays and logo once if invariant across frames
  renderer.prepareStaticOverlay(settings, partNumber);

  // 4. Setup MP4 Muxer
  const mp4Muxer = new MP4Muxer({
    width: canvasWidth,
    height: canvasHeight,
    fps: targetFps,
    audioSampleRate: mixedAudioData?.sampleRate || 48000,
    hasAudio: Boolean(mixedAudioData)
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

  // 6. Setup VideoEncoder with hardware acceleration
  let encoderError = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, metadata) => {
      const muxT0 = performance.now();
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
      totalMuxMs += (performance.now() - muxT0);
    },
    error: (e) => {
      encoderError = e;
      console.error('Worker VideoEncoder error:', e);
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

  // 7. Video Encoding Loop with Backpressure & Guaranteed VideoFrame Cleanup
  const keyframeInterval = Math.round(targetFps * 2);
  let lastProgressReported = 10;
  let capturedThumbnailBlob = null;

  try {
    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      if (isCancelled) {
        throw new Error('Export cancelled by user');
      }
      if (encoderError) {
        throw encoderError;
      }

      const frameInfo = timelineMapper.getFrameInfo(frameIdx);

      // Decode frame for exact source timestamp without HTMLVideoElement seek
      const decodeT0 = performance.now();
      const sourceVideoFrame = await videoDecoder.decodeUntil(frameInfo.sourceTimeUs);
      if (!sourceVideoFrame) {
        const nextFrame = await videoDecoder.decodeNextFrame();
        if (!nextFrame) break;
      }
      totalDecodeMs += (performance.now() - decodeT0);

      // Render frame and composite all layers onto canvas
      const renderT0 = performance.now();
      let renderedFrame = null;
      try {
        renderedFrame = await renderer.renderFrame({
          sourceVideoFrame,
          frameIdx,
          timelineTimeSec: frameInfo.timelineTimeSec,
          clipElapsedSec: frameInfo.clipElapsedSec,
          clipDurationSec,
          partNumber,
          settings
        });
      } finally {
        // Guaranteed immediate closure of source frame
        sourceVideoFrame.close();
      }
      totalRenderMs += (performance.now() - renderT0);

      // Capture lightweight thumbnail poster at first frame with zero extra rendering overhead
      if (frameIdx === 0 && renderer.canvas && typeof renderer.canvas.convertToBlob === 'function') {
        const thumbT0 = performance.now();
        try {
          capturedThumbnailBlob = await renderer.canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
        } catch (thumbErr) {
          console.warn('Thumbnail generation skipped:', thumbErr);
        }
        totalThumbMs = Math.round(performance.now() - thumbT0);
      }

      // Backpressure check: wait if encoder queue size exceeds 4
      if (videoEncoder.encodeQueueSize > 4) {
        if (videoEncoder.encodeQueueSize > maxEncodeQueue) {
          maxEncodeQueue = videoEncoder.encodeQueueSize;
        }
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

      const encodeT0 = performance.now();
      try {
        const isKeyframe = frameIdx % keyframeInterval === 0;
        videoEncoder.encode(renderedFrame, { keyFrame: isKeyframe });
      } finally {
        // Guaranteed immediate closure of rendered frame
        renderedFrame.close();
      }
      totalEncodeMs += (performance.now() - encodeT0);

      // Throttled worker progress calculation (10% to 88%)
      const progress = 10 + Math.round((frameIdx / totalFrames) * 78);
      if (progress > lastProgressReported) {
        lastProgressReported = progress;
        self.postMessage({ type: 'progress', progress, phase: `Encoding frame ${frameIdx + 1}/${totalFrames}` });
      }
    }

    // Flush VideoEncoder
    self.postMessage({ type: 'progress', progress: 90, phase: 'Finalizing video stream' });
    await videoEncoder.flush();
    videoEncoder.close();

    // 8. Encode Mixed Audio Track with Pre-Allocated Reusable Chunk Buffer
    if (mixedAudioData && typeof AudioEncoder !== 'undefined') {
      self.postMessage({ type: 'progress', progress: 92, phase: 'Encoding AAC audio' });
      try {
        const audioEncoder = new AudioEncoder({
          output: (chunk, metadata) => {
            const muxT0 = performance.now();
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
            totalMuxMs += (performance.now() - muxT0);
          },
          error: (e) => console.warn('Worker AudioEncoder error:', e)
        });

        audioEncoder.configure({
          codec: 'mp4a.40.2',
          sampleRate: 48000,
          numberOfChannels: 2,
          bitrate: 192000
        });

        const leftChannel = new Float32Array(mixedAudioData.leftChannel);
        const rightChannel = new Float32Array(mixedAudioData.rightChannel);
        const sampleCount = leftChannel.length;
        const chunkSize = 1024;

        // Reusable pre-allocated interleaved buffer (eliminates 28,125 heap allocations for a 10-min clip)
        const reusableInterleaved = new Float32Array(chunkSize * 2);

        for (let i = 0; i < sampleCount; i += chunkSize) {
          if (isCancelled) throw new Error('Export cancelled by user');

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
          const chunkInterleaved = (currentChunkSize === chunkSize)
            ? reusableInterleaved
            : reusableInterleaved.subarray(0, currentChunkSize * 2);

          for (let j = 0; j < currentChunkSize; j++) {
            chunkInterleaved[j * 2] = leftChannel[i + j];
            chunkInterleaved[j * 2 + 1] = rightChannel[i + j];
          }

          const audioData = new AudioData({
            format: 'f32',
            sampleRate: 48000,
            numberOfFrames: currentChunkSize,
            numberOfChannels: 2,
            timestamp: Math.round((i / 48000) * 1_000_000),
            data: chunkInterleaved
          });

          try {
            audioEncoder.encode(audioData);
          } finally {
            audioData.close();
          }
        }

        await audioEncoder.flush();
        audioEncoder.close();
      } catch (audioErr) {
        console.warn('Worker AudioEncoder encoding skipped:', audioErr);
      }
    }

    // 9. Finalize MP4 container
    self.postMessage({ type: 'progress', progress: 98, phase: 'Generating final MP4 container' });
    const muxFinalT0 = performance.now();
    const finalMp4Blob = mp4Muxer.finalize();
    totalMuxMs += (performance.now() - muxFinalT0);

    const workerEndTime = performance.now();

    self.postMessage({
      type: 'complete',
      blob: finalMp4Blob,
      thumbnailBlob: capturedThumbnailBlob,
      duration: clipDurationSec,
      format: 'mp4',
      size: finalMp4Blob.size,
      metrics: {
        workerStartTime,
        workerEndTime,
        demuxMs: Math.round(totalDemuxMs),
        decodeMs: Math.round(totalDecodeMs),
        renderMs: Math.round(totalRenderMs),
        encodeMs: Math.round(totalEncodeMs),
        muxMs: Math.round(totalMuxMs),
        thumbnailMs: totalThumbMs,
        decodeFps: Math.round(totalFrames / Math.max(0.001, totalDecodeMs / 1000)),
        renderFps: Math.round(totalFrames / Math.max(0.001, totalRenderMs / 1000)),
        encodeFps: Math.round(totalFrames / Math.max(0.001, totalEncodeMs / 1000)),
        maxEncodeQueue,
        framesProcessed: totalFrames,
        outputBytes: finalMp4Blob.size
      }
    });
  } finally {
    renderer.destroy();
    videoDecoder.close();
    if (videoEncoder && videoEncoder.state !== 'closed') {
      try { videoEncoder.close(); } catch (e) {}
    }
  }
}
