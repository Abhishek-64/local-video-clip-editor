/**
 * Video Thumbnail Filmstrip Generator
 *
 * Extracts lightweight frame snapshots across video duration for timeline filmstrip visualization.
 * Includes module-level memory caching to ensure extraction only runs once per video URL.
 */

// Global memory cache: key = `${url}_${duration}_${count}`, value = Array of { time, dataUrl }
const thumbnailCache = new Map();

/**
 * Extract evenly-spaced thumbnails from a video source URL.
 *
 * @param {string} videoUrl - Object URL or network URL of the video
 * @param {number} duration - Video duration in seconds
 * @param {object} options
 * @param {number} [options.count=12] - Number of thumbnails to capture across the timeline
 * @param {number} [options.width=120] - Snapshot canvas width in px
 * @param {number} [options.height=68] - Snapshot canvas height in px
 * @param {function} [options.onProgress] - Optional callback fired when each thumbnail is ready: (thumbnails, progressPct) => void
 * @param {AbortSignal} [options.signal] - Optional abort signal to cancel work if video changes
 * @returns {Promise<Array<{ time: number, dataUrl: string }>>}
 */
export async function generateTimelineThumbnails(videoUrl, duration, options = {}) {
  if (!videoUrl || !duration || duration <= 0) {
    return [];
  }

  const count = Math.max(4, Math.min(24, options.count || 12));
  const width = options.width || 120;
  const height = options.height || 68;
  const cacheKey = `${videoUrl}_${Math.round(duration * 10)}_${count}`;

  // Check cache first
  if (thumbnailCache.has(cacheKey)) {
    const cached = thumbnailCache.get(cacheKey);
    if (options.onProgress) {
      options.onProgress(cached, 100);
    }
    return cached;
  }

  return new Promise((resolve) => {
    let isAborted = false;
    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        isAborted = true;
      });
    }

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });

    const capturedThumbnails = [];
    let currentIndex = 0;

    // Calculate sample time points evenly across duration with small padding at ends
    const timePoints = [];
    const step = duration / count;
    for (let i = 0; i < count; i++) {
      const t = Math.max(0.05, Math.min(duration - 0.05, (i + 0.5) * step));
      timePoints.push(Math.round(t * 100) / 100);
    }

    const cleanup = () => {
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch (e) {}
    };

    let seekTimeoutId = null;

    const captureNextFrame = () => {
      if (isAborted) {
        cleanup();
        resolve(capturedThumbnails);
        return;
      }

      if (currentIndex >= timePoints.length) {
        cleanup();
        if (capturedThumbnails.length > 0) {
          thumbnailCache.set(cacheKey, capturedThumbnails);
        }
        resolve(capturedThumbnails);
        return;
      }

      const targetTime = timePoints[currentIndex];

      const onSeeked = () => {
        clearTimeout(seekTimeoutId);
        video.removeEventListener('seeked', onSeeked);

        if (isAborted) {
          cleanup();
          resolve(capturedThumbnails);
          return;
        }

        try {
          if (ctx && video.videoWidth > 0) {
            ctx.drawImage(video, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
            capturedThumbnails.push({
              index: currentIndex,
              time: targetTime,
              dataUrl
            });

            if (options.onProgress) {
              const progressPct = Math.round((capturedThumbnails.length / count) * 100);
              options.onProgress([...capturedThumbnails], progressPct);
            }
          }
        } catch (err) {
          console.warn(`[thumbnailGenerator] Frame draw error at ${targetTime}s:`, err);
        }

        currentIndex++;
        captureNextFrame();
      };

      video.addEventListener('seeked', onSeeked, { once: true });

      // Fallback timeout in case seek stalls (1.5s per frame max)
      seekTimeoutId = setTimeout(() => {
        video.removeEventListener('seeked', onSeeked);
        currentIndex++;
        captureNextFrame();
      }, 1500);

      try {
        video.currentTime = targetTime;
      } catch (e) {
        clearTimeout(seekTimeoutId);
        currentIndex++;
        captureNextFrame();
      }
    };

    video.onloadedmetadata = () => {
      captureNextFrame();
    };

    video.onerror = () => {
      console.warn('[thumbnailGenerator] Video load error for thumbnails:', video.error);
      cleanup();
      resolve(capturedThumbnails);
    };

    video.src = videoUrl;
  });
}

/**
 * Clear cached thumbnails (e.g. on full reset)
 */
export function clearThumbnailCache() {
  thumbnailCache.clear();
}
