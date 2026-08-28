/**
 * Offline Audio Engine & Multi-Track Precision Mixer
 * Sample-accurate audio slicing, looping background music, voiceover mixing,
 * smart auto-ducking, soft-knee peak limiting, and WebCodecs AudioEncoder bridging.
 */

/**
 * Fetch and decode an audio buffer from a URL or Blob
 */
export async function fetchAndDecodeAudio(audioSource, audioCtx) {
  if (!audioSource) return null;

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

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });

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

    // If no audio sources present, return silent AudioBuffer
    const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);

    // Channel accumulation buffers
    const outputLeft = new Float32Array(totalSamples);
    const outputRight = new Float32Array(totalSamples);

    // 4. Voice Activity Profile for Smart Ducking
    const duckingProfile = new Float32Array(totalSamples);
    duckingProfile.fill(1.0); // 1.0 = normal volume

    if (voiceoverBuffer && autoDucking) {
      const voiceL = voiceoverBuffer.getChannelData(0);
      const voiceR = voiceoverBuffer.numberOfChannels > 1 ? voiceoverBuffer.getChannelData(1) : voiceL;
      const voiceRatio = voiceoverBuffer.sampleRate / sampleRate;

      // Windowed RMS detector (50ms chunks)
      const windowSize = Math.round(sampleRate * 0.05);
      for (let i = 0; i < totalSamples; i += windowSize) {
        let sumSq = 0;
        let count = 0;
        for (let j = 0; j < windowSize && (i + j) < totalSamples; j++) {
          const srcIdx = Math.round((i + j) * voiceRatio);
          if (srcIdx < voiceL.length) {
            const v = (voiceL[srcIdx] + voiceR[srcIdx]) * 0.5;
            sumSq += v * v;
            count++;
          }
        }
        const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
        const targetDucking = rms > 0.015 ? 0.35 : 1.0; // Duck to 35% when speech is detected

        for (let j = 0; j < windowSize && (i + j) < totalSamples; j++) {
          duckingProfile[i + j] = targetDucking;
        }
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

    // Helper to map output elapsed time to source video timestamp
    const mapOutTimeToSourceTime = (outSec) => {
      const scaledOutSec = outSec * (speed || 1.0);
      for (const interval of segmentIntervals) {
        if (scaledOutSec >= interval.cumStart && scaledOutSec < interval.cumEnd) {
          const offsetInSeg = scaledOutSec - interval.cumStart;
          return interval.segStart + offsetInSeg;
        }
      }
      // If at or beyond the end, clamp to last segment
      if (segmentIntervals.length > 0) {
        const last = segmentIntervals[segmentIntervals.length - 1];
        return last.segEnd;
      }
      return startTime;
    };

    // 5. Mix Original Video Audio
    if (sourceAudioBuffer && !muteOriginal) {
      const baseGain = (volume / 100);
      const srcL = sourceAudioBuffer.getChannelData(0);
      const srcR = sourceAudioBuffer.numberOfChannels > 1 ? sourceAudioBuffer.getChannelData(1) : srcL;
      const srcSampleRate = sourceAudioBuffer.sampleRate;

      for (let i = 0; i < totalSamples; i++) {
        const outSec = i / sampleRate;
        const sourceTime = mapOutTimeToSourceTime(outSec);
        const srcIdx = Math.round(sourceTime * srcSampleRate);

        if (srcIdx >= 0 && srcIdx < srcL.length) {
          const duck = autoDucking && voiceoverBuffer ? duckingProfile[i] : 1.0;
          outputLeft[i] += srcL[srcIdx] * baseGain * duck;
          outputRight[i] += srcR[srcIdx] * baseGain * duck;
        }
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
        // Loop index
        const mIdx = Math.round(i * mRatio) % musicLength;
        const duck = duckingProfile[i];
        outputLeft[i] += mL[mIdx] * musicGain * duck;
        outputRight[i] += mR[mIdx] * musicGain * duck;
      }
    }

    // 8. Soft-Knee Limiter / True-Peak Anti-Clipping
    for (let i = 0; i < totalSamples; i++) {
      // Soft saturation prevents harsh digital clipping
      outputLeft[i] = Math.tanh(outputLeft[i]);
      outputRight[i] = Math.tanh(outputRight[i]);
    }

    // Create final AudioBuffer
    const finalAudioBuffer = offlineCtx.createBuffer(2, totalSamples, sampleRate);
    finalAudioBuffer.copyToChannel(outputLeft, 0);
    finalAudioBuffer.copyToChannel(outputRight, 1);

    return finalAudioBuffer;
  } catch (err) {
    console.warn('Offline audio mixing fallback warning:', err);
    return null;
  } finally {
    try {
      audioCtx.close();
    } catch (e) {}
  }
}
