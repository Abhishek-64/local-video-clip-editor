/**
 * Central Export Configuration & Hardware Codec Preset Engine
 * Defines resolution presets (720p, 1080p, 1440p, 4K), recommended bitrates,
 * and dynamic H.264 profile/level negotiation via VideoEncoder.isConfigSupported.
 */

export const EXPORT_RESOLUTIONS = {
  '720p': {
    id: '720p',
    label: '720p HD',
    landscape: { width: 1280, height: 720 },
    portrait: { width: 720, height: 1280 },
    square: { width: 720, height: 720 }
  },
  '1080p': {
    id: '1080p',
    label: '1080p Full HD',
    landscape: { width: 1920, height: 1080 },
    portrait: { width: 1080, height: 1920 },
    square: { width: 1080, height: 1080 }
  },
  '1440p': {
    id: '1440p',
    label: '1440p 2K QHD',
    landscape: { width: 2560, height: 1440 },
    portrait: { width: 1440, height: 2560 },
    square: { width: 1440, height: 1440 }
  },
  '4k': {
    id: '4k',
    label: '4K Ultra HD',
    landscape: { width: 3840, height: 2160 },
    portrait: { width: 2160, height: 3840 },
    square: { width: 2160, height: 2160 }
  }
};

/**
 * Calculate recommended video bitrate based on output resolution, quality preset, and FPS.
 *
 * Recommended Bitrates:
 * - 720p: 4–6 Mbps
 * - 1080p: 8–12 Mbps
 * - 1440p: 14–20 Mbps
 * - 4K: 30–45 Mbps
 *
 * @param {Object} params
 * @param {string} [params.resolution='1080p']
 * @param {string} [params.quality='high'] - 'standard' | 'high' | 'ultra'
 * @param {number} [params.fps=30]
 * @param {number} [params.width]
 * @param {number} [params.height]
 * @returns {number} Bitrate in bits per second (bps)
 */
export function getRecommendedVideoBitrate({
  resolution = '1080p',
  quality = 'high',
  fps = 30,
  width,
  height
} = {}) {
  // Determine effective resolution category from pixels if dimensions are given
  let resCategory = resolution ? resolution.toLowerCase() : '1080p';
  if (width && height) {
    const totalPixels = width * height;
    if (totalPixels >= 3840 * 2000) {
      resCategory = '4k';
    } else if (totalPixels >= 2560 * 1350) {
      resCategory = '1440p';
    } else if (totalPixels >= 1920 * 950) {
      resCategory = '1080p';
    } else {
      resCategory = '720p';
    }
  }

  // Baseline bitrates at 30 FPS for standard, high, and ultra quality
  const bitrateTable = {
    '720p': {
      standard: 4_000_000,
      high: 5_000_000,
      ultra: 6_500_000
    },
    '1080p': {
      standard: 6_500_000,
      high: 9_000_000,
      ultra: 12_000_000
    },
    '1440p': {
      standard: 14_000_000,
      high: 17_000_000,
      ultra: 20_000_000
    },
    '4k': {
      standard: 30_000_000,
      high: 38_000_000,
      ultra: 45_000_000
    }
  };

  const table = bitrateTable[resCategory] || bitrateTable['1080p'];
  let baseBitrate = table[quality] || table.high;

  // Scale moderately if FPS is 50 or 60 (approx 20% boost to retain macroblock fidelity)
  if (fps >= 50) {
    baseBitrate = Math.round(baseBitrate * 1.25);
  } else if (fps <= 24) {
    baseBitrate = Math.round(baseBitrate * 0.9);
  }

  return baseBitrate;
}

/**
 * Dynamically tests and selects the optimal H.264 profile and level supported by the browser GPU.
 * Prioritizes High/Main Level 5.1/5.2 for 4K and 1440p, Main/Baseline Level 4.0/4.1 for 1080p,
 * and Baseline Level 3.1 for 720p.
 *
 * @param {Object} params
 * @param {number} params.width
 * @param {number} params.height
 * @param {number} params.fps
 * @param {number} params.bitrate
 * @returns {Promise<{ codec: string, supported: boolean }>}
 */
export async function getOptimalH264Codec({
  width,
  height,
  fps = 30,
  bitrate = 8_500_000
}) {
  if (typeof VideoEncoder === 'undefined' || typeof VideoEncoder.isConfigSupported !== 'function') {
    return { codec: 'avc1.42E01E', supported: false };
  }

  const is4K = Math.max(width, height) >= 3500 || Math.min(width, height) >= 2000;
  const is1440p = Math.max(width, height) >= 2400 || Math.min(width, height) >= 1350;
  const is1080p = Math.max(width, height) >= 1600 || Math.min(width, height) >= 900;

  // Candidate codec strings ordered by quality preference for the given resolution
  const candidateCodecs = is4K
    ? [
        'avc1.640033', // High Profile, Level 5.1 (4K 30fps)
        'avc1.640034', // High Profile, Level 5.2 (4K 60fps)
        'avc1.4D0033', // Main Profile, Level 5.1
        'avc1.4D0034', // Main Profile, Level 5.2
        'avc1.420033', // Baseline Profile, Level 5.1
        'avc1.42E01E'  // Generic Baseline Fallback
      ]
    : is1440p
    ? [
        'avc1.640032', // High Profile, Level 5.0
        'avc1.4D0032', // Main Profile, Level 5.0
        'avc1.640033', // High Profile, Level 5.1
        'avc1.4D0033', // Main Profile, Level 5.1
        'avc1.42E01E'  // Baseline Fallback
      ]
    : is1080p
    ? [
        'avc1.640028', // High Profile, Level 4.0 (1080p 30fps optimal)
        'avc1.64002A', // High Profile, Level 4.2 (1080p 60fps)
        'avc1.4D4028', // Main Profile, Level 4.0
        'avc1.4D002A', // Main Profile, Level 4.2
        'avc1.420028', // Baseline Profile, Level 4.0
        'avc1.4D401F', // Main Profile, Level 3.1
        'avc1.42E01E'  // Baseline Fallback
      ]
    : [
        'avc1.64001F', // High Profile, Level 3.1 (720p 30fps optimal)
        'avc1.4D401F', // Main Profile, Level 3.1
        'avc1.42001F', // Baseline Profile, Level 3.1
        'avc1.42E01E'  // Baseline Fallback
      ];

  for (const codec of candidateCodecs) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
        avc: { format: 'avc' }
      });
      if (support && support.supported) {
        return { codec, supported: true };
      }
    } catch (e) {
      // Continue to next candidate
    }
  }

  // Fallback to universal Baseline
  return { codec: 'avc1.42E01E', supported: false };
}
