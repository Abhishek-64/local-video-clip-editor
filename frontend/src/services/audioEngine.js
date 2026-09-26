/**
 * Offline Audio Engine & Multi-Track Precision Mixer
 * Sample-accurate audio slicing, looping background music, voiceover mixing,
 * smart auto-ducking, soft-knee peak limiting, and WebCodecs AudioEncoder bridging.
 */

// Stable In-Memory Audio Decode Cache for Batch Queue Performance
// Capped at 1 entry: for a single-video workflow there is only ONE source video.
// Allowing 3 entries caused 3×46 MB = 138 MB of heap permanently occupied and
// a peak spike to 184 MB when a new entry evicts the oldest (before GC collects it).
const AUDIO_DECODE_CACHE = new Map();
const MAX_AUDIO_CACHE_ENTRIES = 1;

// ── Singleton AudioContext ────────────────────────────────────────────────────
// Chrome allows a maximum of 6–12 AudioContext instances. Creating a new one per
// export means after ~6 clips Chrome silently fails or degrades audio decode speed.
// A singleton context is created once, suspended between exports to release the
// audio hardware thread, and resumed only during active decode work.
let _sharedAudioCtx = null;
function getSharedAudioCtx(sampleRate = 48000) {
  if (!_sharedAudioCtx || _sharedAudioCtx.state === 'closed') {
    _sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
  }
  return _sharedAudioCtx;
}

function getAudioCacheKey(audioSource) {
  if (!audioSource) return null;
  if (typeof audioSource === 'string') return `url:${audioSource}`;
  if (audioSource?.file instanceof File) return `file:${audioSource.file.name}_${audioSource.file.size}_${audioSource.file.lastModified}`;
  if (audioSource instanceof File) return `file:${audioSource.name}_${audioSource.size}_${audioSource.lastModified}`;
  if (audioSource?.name && audioSource?.size) return `file:${audioSource.name}_${audioSource.size}_${audioSource.lastModified || 0}`;
  return null;
}

/**
 * Fetch and decode an audio buffer from a URL or Blob with LRU caching
 */
export async function fetchAndDecodeAudio(audioSource, audioCtx) {
  if (!audioSource) return null;

  const cacheKey = getAudioCacheKey(audioSource);
  if (cacheKey && AUDIO_DECODE_CACHE.has(cacheKey)) {
    return AUDIO_DECODE_CACHE.get(cacheKey);
  }

  try {
    let arrayBuffer;
    if (typeof audioSource === 'string') {
      const response = await fetch(audioSource);
      arrayBuffer = await response.arrayBuffer();
    } else if (audioSource instanceof Blob || audioSource instanceof File) {
      arrayBuffer = await audioSource.arrayBuffer();
    } else if (audioSource.url) {
      const response = await fetch(audioSource.url);
      arrayBuffer = await response.arrayBuffer();
    } else if (audioSource.file) {
      arrayBuffer = await audioSource.file.arrayBuffer();
    }

    if (!arrayBuffer || arrayBuffer.byteLength === 0) return null;

    const ctx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));

    if (cacheKey && decoded) {
      if (AUDIO_DECODE_CACHE.size >= MAX_AUDIO_CACHE_ENTRIES) {
        const oldestKey = AUDIO_DECODE_CACHE.keys().next().value;
        AUDIO_DECODE_CACHE.delete(oldestKey);
      }
      AUDIO_DECODE_CACHE.set(cacheKey, decoded);
    }

    return decoded;
  } catch (err) {
    console.warn('Audio decoding warning:', err);
    return null;
  }
}

/**
 * Mixes video source audio, voiceover, and background music offline with sample-level accuracy
 *
 * @param {Object} params
 * @param {string|File|Blob} params.videoSource
 * @param {number} [params.startTime] - start in seconds (for single segment)
 * @param {number} [params.endTime] - end in seconds (for single segment)
 * @param {Array<{startTime: number, endTime: number}>} [params.segments] - array of kept segments
 * @param {Object} params.audioSettings
 * @returns {Promise<AudioBuffer|null>}
 */
export async function mixAudioTracksOffline({
  videoSource,
  startTime = 0,
  endTime = 0,
  segments = null,
  audioSettings = {}
}) {
  // Normalize segments list
  const activeSegments = segments && segments.length > 0
    ? segments.filter(s => (s.endTime - s.startTime) > 0.05)
    : [{ startTime, endTime }];

  const clipDuration = activeSegments.reduce(
    (sum, seg) => sum + Math.max(0, seg.endTime - seg.startTime),
    0
  );
  
  const finalDuration = Math.max(0.1, clipDuration);
  const sampleRate = 48000;
  const totalSamples = Math.round(finalDuration * sampleRate);

  const {
    speed = 1.0,
    volume = 100,
    muteOriginal = false,
    voiceoverEnabled = false,
    voiceoverUrl = null,
    voiceoverFile = null,
    voiceoverVolume = 100,
    autoDucking = true,
    bgMusicEnabled = false,
    bgMusicUrl = null,
    bgMusicFile = null,
    bgMusicVolume = 30
  } = audioSettings;

  // Reuse the singleton context — never create a new AudioContext per export.
  const audioCtx = getSharedAudioCtx(sampleRate);
  // Resume if suspended (browser auto-suspends idle contexts after ~30s)
  if (audioCtx.state === 'suspended') {
    try { await audioCtx.resume(); } catch (_) {}
  }

  try {
    // 1. Decode Source Video Audio
    let sourceAudioBuffer = null;
    if (!muteOriginal && videoSource) {
      sourceAudioBuffer = await fetchAndDecodeAudio(videoSource, audioCtx);
    }

    // 2. Decode Voiceover Track
    let voiceoverBuffer = null;
    if (voiceoverEnabled && (voiceoverUrl || voiceoverFile)) {
      voiceoverBuffer = await fetchAndDecodeAudio(voiceoverFile || voiceoverUrl, audioCtx);
    }

    // 3. Decode Background Music Track
    let musicBuffer = null;
    if (bgMusicEnabled && (bgMusicUrl || bgMusicFile)) {
      musicBuffer = await fetchAndDecodeAudio(bgMusicFile || bgMusicUrl, audioCtx);
    }

    // Manual Float32 mixing below — no OfflineAudioContext needed.
    // (An OfflineAudioContext was previously created here but never rendered;
    //  it wasted 46 MB of audio buffer allocation per export and was removed.)

    // Channel accumulation buffers
    const outputLeft = new Float32Array(totalSamples);
    const outputRight = new Float32Array(totalSamples);

    // 4. Compact Voice Activity Profile for Smart Ducking (Window-Based)
    const windowSize = Math.round(sampleRate * 0.05); // 50ms windows
    const numDuckingWindows = Math.ceil(totalSamples / windowSize);
    const duckingWindowGains = new Float32Array(numDuckingWindows);
    duckingWindowGains.fill(1.0);

    if (voiceoverBuffer && autoDucking) {
      const voiceL = voiceoverBuffer.getChannelData(0);
      const voiceR = voiceoverBuffer.numberOfChannels > 1 ? voiceoverBuffer.getChannelData(1) : voiceL;
      const voiceRatio = voiceoverBuffer.sampleRate / sampleRate;

      for (let w = 0; w < numDuckingWindows; w++) {
        const startSample = w * windowSize;
        let sumSq = 0;
        let count = 0;
        for (let j = 0; j < windowSize && (startSample + j) < totalSamples; j++) {
          const srcIdx = Math.round((startSample + j) * voiceRatio);
          if (srcIdx < voiceL.length) {
            const v = (voiceL[srcIdx] + voiceR[srcIdx]) * 0.5;
            sumSq += v * v;
            count++;
          }
        }
        const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
        duckingWindowGains[w] = rms > 0.015 ? 0.35 : 1.0;
      }
    }

    // Precalculate cumulative time intervals for multi-segment audio lookup
    const segmentIntervals = [];
    let cumTime = 0;
    for (const seg of activeSegments) {
      const segDur = Math.max(0, seg.endTime - seg.startTime);
      segmentIntervals.push({
        segStart: seg.startTime,
        segEnd: seg.endTime,
        segDur,
        cumStart: cumTime,
        cumEnd: cumTime + segDur
      });
      cumTime += segDur;
    }

    // 5. Mix Original Video Audio by Segment (High Performance)
    if (sourceAudioBuffer && !muteOriginal) {
      const baseGain = (volume / 100);
      const srcL = sourceAudioBuffer.getChannelData(0);
      const srcR = sourceAudioBuffer.numberOfChannels > 1 ? sourceAudioBuffer.getChannelData(1) : srcL;
      const srcSampleRate = sourceAudioBuffer.sampleRate;
      const effectiveSpeed = speed || 1.0;

      let currentOutSample = 0;
      for (const seg of segmentIntervals) {
        const outSamplesInSeg = Math.round((seg.segDur / effectiveSpeed) * sampleRate);
        const segEndOutSample = Math.min(totalSamples, currentOutSample + outSamplesInSeg);

        for (let i = currentOutSample; i < segEndOutSample; i++) {
          const timeInSeg = ((i - currentOutSample) / sampleRate) * effectiveSpeed;
          const sourceTime = seg.segStart + timeInSeg;
          const srcIdx = Math.round(sourceTime * srcSampleRate);

          if (srcIdx >= 0 && srcIdx < srcL.length) {
            const wIdx = Math.floor(i / windowSize);
            const duck = autoDucking && voiceoverBuffer && wIdx < numDuckingWindows ? duckingWindowGains[wIdx] : 1.0;
            outputLeft[i] += srcL[srcIdx] * baseGain * duck;
            outputRight[i] += srcR[srcIdx] * baseGain * duck;
          }
        }
        currentOutSample = segEndOutSample;
      }
    }

    // 6. Mix Voiceover Track
    if (voiceoverBuffer) {
      const voiceGain = (voiceoverVolume / 100);
      const vL = voiceoverBuffer.getChannelData(0);
      const vR = voiceoverBuffer.numberOfChannels > 1 ? voiceoverBuffer.getChannelData(1) : vL;
      const vRatio = voiceoverBuffer.sampleRate / sampleRate;

      for (let i = 0; i < totalSamples; i++) {
        const vIdx = Math.round(i * vRatio);
        if (vIdx < vL.length) {
          outputLeft[i] += vL[vIdx] * voiceGain;
          outputRight[i] += vR[vIdx] * voiceGain;
        }
      }
    }

    // 7. Mix Background Music Track (with seamless looping and clip trimming)
    if (musicBuffer) {
      const musicGain = (bgMusicVolume / 100);
      const mL = musicBuffer.getChannelData(0);
      const mR = musicBuffer.numberOfChannels > 1 ? musicBuffer.getChannelData(1) : mL;
      const mRatio = musicBuffer.sampleRate / sampleRate;
      const musicLength = mL.length;

      for (let i = 0; i < totalSamples; i++) {
        const mIdx = Math.round(i * mRatio) % musicLength;
        const wIdx = Math.floor(i / windowSize);
        const duck = autoDucking && voiceoverBuffer && wIdx < numDuckingWindows ? duckingWindowGains[wIdx] : 1.0;
        outputLeft[i] += mL[mIdx] * musicGain * duck;
        outputRight[i] += mR[mIdx] * musicGain * duck;
      }
    }

    // 8. Soft-Knee Limiter / True-Peak Anti-Clipping
    for (let i = 0; i < totalSamples; i++) {
      outputLeft[i] = Math.tanh(outputLeft[i]);
      outputRight[i] = Math.tanh(outputRight[i]);
    }

    // High-performance, zero-duplication audio container.
    // Preserves AudioBuffer API (.getChannelData, .sampleRate, .numberOfChannels, .length, .duration)
    // while eliminating the redundant 230MB copy caused by OfflineAudioContext.createBuffer + copyToChannel.
    return {
      numberOfChannels: 2,
      sampleRate,
      length: totalSamples,
      duration: finalDuration,
      leftChannel: outputLeft,
      rightChannel: outputRight,
      getChannelData(channelIndex) {
        return channelIndex === 0 ? this.leftChannel : this.rightChannel;
      }
    };
  } catch (err) {
    console.warn('Offline audio mixing fallback warning:', err);
    return null;
  } finally {
    // Do NOT close the singleton context — suspend it instead so Chrome
    // releases the audio hardware thread without destroying the context object.
    // Closing would force recreation on the next export (expensive, limited quota).
    try {
      if (audioCtx.state === 'running') {
        audioCtx.suspend().catch(() => {});
      }
    } catch (_) {}
  }
}
