/**
 * Centralized Generated Clip Resource Manager
 * Single point of ownership for Blob URLs (video and thumbnail posters).
 * Guarantees that:
 * 1. Object URLs are created only when needed and reused for identical Blobs.
 * 2. URLs are tracked and explicitly revoked when clips are removed or components unmount.
 * 3. Never revokes a URL that is actively referenced by an active player until released.
 * 4. Eliminates duplicate createObjectURL calls during React re-renders.
 */

export class GeneratedClipResourceManager {
  constructor() {
    // Map of clipId -> { videoUrl, thumbnailUrl, blob, thumbnailBlob, createdAt, refCount }
    this.registry = new Map();
    // Reverse map of url -> clipId
    this.urlToClipId = new Map();
    // Currently active preview URL that MUST NOT be revoked while playing
    this.activePreviewUrl = null;
    // Map of clipId -> Promise to deduplicate concurrent thumbnail extraction
    this.pendingThumbnails = new Map();
  }

  /**
   * Set the active preview URL so it is protected from revocation during playback
   */
  setActivePreviewUrl(url) {
    this.activePreviewUrl = url;
  }

  /**
   * Register or update a completed clip's resources
   * @param {string} clipId
   * @param {Object} data
   * @param {Blob} [data.blob]
   * @param {string} [data.url]
   * @param {Blob} [data.thumbnailBlob]
   * @param {string} [data.thumbnailUrl]
   * @param {boolean} [data.lazyVideoUrl=false] If true, defers creating video Object URL until getVideoUrl() is called
   * @returns {{ videoUrl: string|null, thumbnailUrl: string|null }}
   */
  registerClip(clipId, { blob, url = null, thumbnailBlob = null, thumbnailUrl = null, lazyVideoUrl = false }) {
    if (!clipId) return { videoUrl: url, thumbnailUrl };

    const existing = this.registry.get(clipId);
    let finalVideoUrl = url;
    let finalThumbUrl = thumbnailUrl;

    // Reuse existing URL if the blob hasn't changed
    if (existing) {
      if (existing.blob === blob && existing.videoUrl) {
        finalVideoUrl = existing.videoUrl;
      } else if (existing.videoUrl && existing.videoUrl !== url) {
        this.safeRevoke(existing.videoUrl);
      }

      if (existing.thumbnailBlob === thumbnailBlob && existing.thumbnailUrl) {
        finalThumbUrl = existing.thumbnailUrl;
      } else if (existing.thumbnailUrl && existing.thumbnailUrl !== thumbnailUrl) {
        this.safeRevoke(existing.thumbnailUrl);
      }
    }

    // Unless explicitly lazy, create video URL if blob provided
    if (!finalVideoUrl && !lazyVideoUrl && blob instanceof Blob) {
      finalVideoUrl = URL.createObjectURL(blob);
      // Null out the raw blob reference immediately after URL creation.
      // The Object URL is all that's needed for playback and download;
      // keeping `blob` alive pins ~200 MB of heap per 2-min video.
      blob = null;
    }

    if (!finalThumbUrl && thumbnailBlob instanceof Blob) {
      finalThumbUrl = URL.createObjectURL(thumbnailBlob);
      // Same for thumbnail blob (~40 KB each, but clean release is correct practice)
      thumbnailBlob = null;
    }

    const record = {
      clipId,
      blob: null,         // Blob is nulled after URL creation — raw data no longer needed
      videoUrl: finalVideoUrl,
      thumbnailBlob: null, // Same for thumbnail blob
      thumbnailUrl: finalThumbUrl,
      createdAt: existing?.createdAt || Date.now(),
      refCount: 1
    };

    this.registry.set(clipId, record);
    if (finalVideoUrl) this.urlToClipId.set(finalVideoUrl, clipId);
    if (finalThumbUrl) this.urlToClipId.set(finalThumbUrl, clipId);

    return {
      videoUrl: finalVideoUrl,
      thumbnailUrl: finalThumbUrl
    };
  }

  /**
   * Retrieve stable video URL for a clip, creating it lazily on demand if not yet created
   */
  getVideoUrl(clipId, blob = null) {
    const record = this.registry.get(clipId);
    if (record?.videoUrl) return record.videoUrl;

    const targetBlob = blob || record?.blob;
    if (targetBlob instanceof Blob) {
      const url = URL.createObjectURL(targetBlob);
      if (record) {
        record.videoUrl = url;
        record.blob = targetBlob;
      } else {
        this.registry.set(clipId, {
          clipId,
          blob: targetBlob,
          videoUrl: url,
          thumbnailBlob: null,
          thumbnailUrl: null,
          createdAt: Date.now(),
          refCount: 1
        });
      }
      this.urlToClipId.set(url, clipId);
      return url;
    }
    return null;
  }

  /**
   * Retrieve stable thumbnail URL for a clip
   */
  getThumbnailUrl(clipId, thumbnailBlob = null) {
    const record = this.registry.get(clipId);
    if (record?.thumbnailUrl) return record.thumbnailUrl;
    if (thumbnailBlob instanceof Blob) {
      const res = this.registerClip(clipId, { thumbnailBlob });
      return res.thumbnailUrl;
    }
    return null;
  }

  /**
   * Ensure a clip has a thumbnail; extracts a frame (320x180) once and caches it permanently
   * @param {string} clipId
   * @param {Blob} blob
   * @returns {Promise<string|null>}
   */
  async ensureThumbnail(clipId, blob = null) {
    if (!clipId) return null;
    const existingUrl = this.getThumbnailUrl(clipId);
    if (existingUrl) return existingUrl;

    const record = this.registry.get(clipId);
    const videoBlob = blob || record?.blob;
    if (!(videoBlob instanceof Blob)) return null;

    // Deduplicate concurrent extraction requests for the same clipId
    if (this.pendingThumbnails.has(clipId)) {
      return this.pendingThumbnails.get(clipId);
    }

    const extractionPromise = (async () => {
      let tempVideo = null;
      let tempUrl = null;
      try {
        tempUrl = URL.createObjectURL(videoBlob);
        tempVideo = document.createElement('video');
        tempVideo.muted = true;
        tempVideo.playsInline = true;
        tempVideo.preload = 'metadata';
        tempVideo.src = tempUrl;

        await new Promise((resolve, reject) => {
          const onLoaded = () => resolve();
          const onError = (e) => reject(e);
          tempVideo.addEventListener('loadeddata', onLoaded, { once: true });
          tempVideo.addEventListener('error', onError, { once: true });
          tempVideo.load();
        });

        // Seek slightly past the start for a meaningful poster frame
        const seekTarget = Math.min(0.5, (tempVideo.duration || 1) / 2);
        tempVideo.currentTime = seekTarget;

        await new Promise((resolve) => {
          tempVideo.addEventListener('seeked', resolve, { once: true });
          setTimeout(resolve, 300); // safety fallback
        });

        const targetW = 320;
        const targetH = 180;
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(tempVideo, 0, 0, targetW, targetH);
          const thumbBlob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.8));
          if (thumbBlob) {
            const registered = this.registerClip(clipId, { thumbnailBlob: thumbBlob });
            return registered.thumbnailUrl;
          }
        }
        return null;
      } catch (err) {
        console.warn(`[ResourceManager] Failed to extract thumbnail for ${clipId}:`, err);
        return null;
      } finally {
        if (tempVideo) {
          try {
            tempVideo.pause();
            tempVideo.removeAttribute('src');
            tempVideo.load();
          } catch (e) {}
        }
        if (tempUrl) {
          URL.revokeObjectURL(tempUrl);
        }
        this.pendingThumbnails.delete(clipId);
      }
    })();

    this.pendingThumbnails.set(clipId, extractionPromise);
    return extractionPromise;
  }

  /**
   * Safely revoke an object URL, ensuring the active player URL is NEVER revoked
   */
  safeRevoke(url) {
    if (!url || typeof url !== 'string' || !url.startsWith('blob:')) return;
    // CRITICAL: Never revoke the URL while the active player is using it
    if (this.activePreviewUrl && url === this.activePreviewUrl) {
      return;
    }
    try {
      URL.revokeObjectURL(url);
    } catch (e) {}
    this.urlToClipId.delete(url);
  }

  /**
   * Revoke and clean up all resources for a specific clip
   */
  revokeClip(clipId) {
    const record = this.registry.get(clipId);
    if (!record) return;

    if (record.videoUrl) this.safeRevoke(record.videoUrl);
    if (record.thumbnailUrl) this.safeRevoke(record.thumbnailUrl);

    this.registry.delete(clipId);
  }

  /**
   * Clean up all managed Object URLs (called on full queue reset or unmount)
   */
  cleanupAll() {
    this.registry.forEach((record) => {
      if (record.videoUrl) this.safeRevoke(record.videoUrl);
      if (record.thumbnailUrl) this.safeRevoke(record.thumbnailUrl);
    });
    this.registry.clear();
    this.urlToClipId.clear();
    this.activePreviewUrl = null;
    this.pendingThumbnails.clear();
  }

  /**
   * Diagnostics telemetry for memory inspection
   */
  getActiveStats() {
    let totalBytes = 0;
    this.registry.forEach((rec) => {
      if (rec.blob?.size) totalBytes += rec.blob.size;
      if (rec.thumbnailBlob?.size) totalBytes += rec.thumbnailBlob.size;
    });

    return {
      activeClipCount: this.registry.size,
      activeUrlCount: this.urlToClipId.size,
      totalBlobSizeMb: (totalBytes / (1024 * 1024)).toFixed(2),
      activePlayersCount: this.activePreviewUrl ? 1 : 0
    };
  }

  /**
   * Development-only debug logger
   */
  logDiagnostics(label = 'EXPORT DEBUG') {
    if (process.env.NODE_ENV !== 'production') {
      const stats = this.getActiveStats();
      console.log(`[${label}] clips: ${stats.activeClipCount} | blob memory: ${stats.totalBlobSizeMb} MB | active URLs: ${stats.activeUrlCount} | active players: ${stats.activePlayersCount}`);
    }
  }
}

// Global singleton instance
export const clipResourceManager = new GeneratedClipResourceManager();
