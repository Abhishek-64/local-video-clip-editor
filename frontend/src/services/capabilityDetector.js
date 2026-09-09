/**
 * Browser & Device Capability Detection Layer
 * Detects WebCodecs, WebGL, WebGPU, Web Audio, MediaRecorder, and hardware encoding limits.
 */

let cachedCapabilities = null;

export async function detectCapabilities() {
  if (cachedCapabilities) {
    return cachedCapabilities;
  }

  const isBrowser = typeof window !== 'undefined';
  if (!isBrowser) {
    return {
      webCodecs: false,
      videoEncoder: false,
      videoDecoder: false,
      audioEncoder: false,
      audioDecoder: false,
      webGL: false,
      webGL2: false,
      webGPU: false,
      webWorker: false,
      offscreenCanvas: false,
      mediaRecorder: false,
      isHardwareAccelerated: false,
      deviceCores: 2,
      recommendedConcurrency: 1,
      maxExportResolution: '1080p'
    };
  }

  // 1. WebCodecs Detection
  const hasVideoEncoder = typeof window.VideoEncoder !== 'undefined';
  const hasVideoDecoder = typeof window.VideoDecoder !== 'undefined';
  const hasAudioEncoder = typeof window.AudioEncoder !== 'undefined';
  const hasAudioDecoder = typeof window.AudioDecoder !== 'undefined';

  let h264EncoderSupported = false;
  let h264_4k_Supported = false;
  let aacEncoderSupported = false;

  if (hasVideoEncoder) {
    try {
      const support = await window.VideoEncoder.isConfigSupported({
        codec: 'avc1.42E01E', // Baseline profile
        width: 1080,
        height: 1920,
        bitrate: 8_000_000,
        framerate: 30
      });
      h264EncoderSupported = Boolean(support && support.supported);
    } catch (e) {
      h264EncoderSupported = false;
    }

    try {
      const support4k = await window.VideoEncoder.isConfigSupported({
        codec: 'avc1.640033', // High Profile Level 5.1
        width: 2160,
        height: 3840,
        bitrate: 35_000_000,
        framerate: 30
      });
      h264_4k_Supported = Boolean(support4k && support4k.supported);
    } catch (e) {
      h264_4k_Supported = false;
    }
  }

  if (hasAudioEncoder) {
    try {
      const support = await window.AudioEncoder.isConfigSupported({
        codec: 'mp4a.40.2', // AAC-LC
        sampleRate: 48000,
        numberOfChannels: 2,
        bitrate: 192000
      });
      aacEncoderSupported = Boolean(support && support.supported);
    } catch (e) {
      aacEncoderSupported = false;
    }
  }

  // 2. WebGL & WebGL2 Detection
  let hasWebGL = false;
  let hasWebGL2 = false;
  try {
    const canvas = document.createElement('canvas');
    hasWebGL2 = Boolean(canvas.getContext('webgl2'));
    hasWebGL = Boolean(hasWebGL2 || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch (e) {}

  // 3. WebGPU Detection
  const hasWebGPU = Boolean(typeof navigator !== 'undefined' && navigator.gpu);

  // 4. Web Worker & OffscreenCanvas Detection
  const hasWebWorker = typeof window.Worker !== 'undefined';
  const hasOffscreenCanvas = typeof window.OffscreenCanvas !== 'undefined';

  // 5. MediaRecorder & Codec Support Detection
  let hasMediaRecorder = typeof window.MediaRecorder !== 'undefined';
  let mediaRecorderMp4 = false;
  let mediaRecorderWebm = false;

  if (hasMediaRecorder) {
    try {
      mediaRecorderMp4 = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E,mp4a.40.2') ||
                         MediaRecorder.isTypeSupported('video/mp4;codecs=avc1') ||
                         MediaRecorder.isTypeSupported('video/mp4');
      mediaRecorderWebm = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ||
                          MediaRecorder.isTypeSupported('video/webm');
    } catch (e) {}
  }

  // 6. Device Hardware Profiling
  const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
  const memoryGb = typeof navigator !== 'undefined' && navigator.deviceMemory ? navigator.deviceMemory : 4;

  let recommendedConcurrency = 1;
  if (cores >= 8 && memoryGb >= 8) {
    recommendedConcurrency = 2;
  }

  let maxExportResolution = '1080p';
  if (cores >= 8 && memoryGb >= 8 && (hasWebGL2 || hasWebGL)) {
    maxExportResolution = '4k';
  } else if (cores >= 4 && memoryGb >= 4) {
    maxExportResolution = '1440p';
  }

  cachedCapabilities = {
    webCodecs: hasVideoEncoder && hasVideoDecoder,
    videoEncoder: hasVideoEncoder,
    videoDecoder: hasVideoDecoder,
    audioEncoder: hasAudioEncoder,
    audioDecoder: hasAudioDecoder,
    h264EncoderSupported,
    h264_4k_Supported,
    aacEncoderSupported,
    webGL: hasWebGL,
    webGL2: hasWebGL2,
    webGPU: hasWebGPU,
    webWorker: hasWebWorker,
    offscreenCanvas: hasOffscreenCanvas,
    mediaRecorder: hasMediaRecorder,
    mediaRecorderMp4,
    mediaRecorderWebm,
    isHardwareAccelerated: hasVideoEncoder && h264EncoderSupported && hasWebGL,
    deviceCores: cores,
    deviceMemoryGb: memoryGb,
    recommendedConcurrency,
    maxExportResolution
  };

  return cachedCapabilities;
}

export function getCachedCapabilities() {
  return cachedCapabilities;
}
