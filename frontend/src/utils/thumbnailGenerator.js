/**
 * Video Filmstrip Thumbnail Generator
 * Extracts evenly spaced video frames as low-res JPEG data URLs for timeline preview.
 * Includes in-memory caching and AbortSignal support.
 */

const thumbnailCache = new Map();

/**
 * Generate an array of thumbnail frames from a video URL.
 * @param {string} videoUrl - Source video URL or Blob URL
 * @param {number} duration - Video duration in seconds
 * @param {Object} options - Configuration options
 * @param {number} [options.count=12] - Number of thumbnail frames to generate
 * @param {AbortSignal} [options.signal] - AbortSignal to cancel generation
 * @param {Function} [options.onProgress] - Callback for progressive loading
 * @returns {Promise<Array<{ id: number, time: number, dataUrl: string }>>}
 */
export async function generateTimelineThumbnails(videoUrl, duration, options = {}) {
  const { count = 12, signal, onProgress } = options;

  if (!videoUrl || !duration || duration <= 0) {
    return [];
  }

  const cacheKey = `${videoUrl}_${Math.round(duration)}_${count}`;
  if (thumbnailCache.has(cacheKey)) {
    const cached = thumbnailCache.get(cacheKey);
    if (onProgress) onProgress(cached);
    return cached;
  }

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException('Aborted', 'AbortError'));
    }

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const ctx = canvas.getContext('2d', { willReadFrequently: false });

    const step = duration / count;
    const timestamps = [];
    for (let i = 0; i < count; i++) {
      // Sample slightly inside each interval to avoid black opening frames
      const time = Math.min(duration - 0.05, Math.max(0.1, i * step + step * 0.3));
      timestamps.push(time);
    }

    const results = [];
    let currentIndex = 0;
    let isCleanedUp = false;

    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      video.removeAttribute('src');
      video.load();
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
    };

    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };

    if (signal) {
      signal.addEventListener('abort', onAbort);
    }

    const captureCurrentFrame = () => {
      if (signal?.aborted || isCleanedUp) return;

      try {
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.55);
          results.push({
            id: currentIndex,
            time: timestamps[currentIndex],
            dataUrl
          });

          if (onProgress) {
            onProgress([...results]);
          }
        }
      } catch (err) {
        // Cross-origin taint or canvas draw failure fallback
        console.warn('Frame capture notice:', err);
      }

      currentIndex++;
      if (currentIndex < timestamps.length && !signal?.aborted) {
        video.currentTime = timestamps[currentIndex];
      } else {
        cleanup();
        thumbnailCache.set(cacheKey, results);
        resolve(results);
      }
    };

    video.addEventListener('seeked', () => {
      captureCurrentFrame();
    });

    video.addEventListener('error', (e) => {
      cleanup();
      // Resolve whatever partial frames we got rather than throwing hard
      if (results.length > 0) {
        resolve(results);
      } else {
        reject(e);
      }
    });

    video.addEventListener('loadeddata', () => {
      if (signal?.aborted) return;
      video.currentTime = timestamps[0];
    });

    video.src = videoUrl;
    video.load();
  });
}
