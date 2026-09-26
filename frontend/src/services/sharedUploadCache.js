/**
 * Shared Video Upload Cache Service
 *
 * Prevents re-uploading the exact same video file to Backblaze B2 when publishing
 * across multiple platforms (e.g. Facebook Reels AND Instagram Reels).
 *
 * Stores B2 upload identifiers { b2FileId, b2FileName } in memory and sessionStorage with a TTL of 2 hours.
 * Includes in-flight Promise deduplication so simultaneous dual-publish requests await the exact same upload.
 */

const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes (sufficient for simultaneous dual-platform publish)
const SESSION_STORAGE_KEY = 'video_clip_editor_b2_shared_uploads';

class SharedUploadCache {
  constructor() {
    this.cache = new Map();
    this.inFlightUploads = new Map(); // key -> Promise<{ b2FileId, b2FileName }>
    // Purge any legacy stale sessionStorage entries so old uploads don't cause 404 B2 errors
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      } catch {}
    }
  }

  hydrateFromSession() {
    // Ephemeral uploads are held in memory only
  }

  saveToSession() {
    // Ephemeral uploads are held in memory only
  }

  /**
   * Generate unique cache key for a clip or video file
   */
  getCacheKey(clipOrBlob, extraKey = null) {
    if (extraKey) return String(extraKey);
    if (!clipOrBlob) return null;
    if (typeof clipOrBlob === 'string') return clipOrBlob;
    if (clipOrBlob.id) return String(clipOrBlob.id);
    if (clipOrBlob.clipId) return String(clipOrBlob.clipId);
    if (clipOrBlob.name && clipOrBlob.size) return `${clipOrBlob.name}_${clipOrBlob.size}`;
    if (clipOrBlob.blob && clipOrBlob.blob.size) {
      return `${clipOrBlob.blob.name || 'blob'}_${clipOrBlob.blob.size}_${clipOrBlob.blob.type || ''}`;
    }
    if (typeof Blob !== 'undefined' && clipOrBlob instanceof Blob) {
      return `blob_${clipOrBlob.size}_${clipOrBlob.type || 'video_mp4'}`;
    }
    return null;
  }

  /**
   * Get cached active B2 upload data
   */
  getCachedUpload(clipOrBlob, extraKey = null) {
    const key = this.getCacheKey(clipOrBlob, extraKey);
    if (!key) return null;

    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.saveToSession();
      return null;
    }

    return entry;
  }

  /**
   * Set cached B2 upload data
   */
  setCachedUpload(clipOrBlob, { b2FileId, b2FileName, b2Url = null }, extraKey = null) {
    const key = this.getCacheKey(clipOrBlob, extraKey);
    if (!key || !b2FileName) return null;

    const entry = {
      b2FileId: b2FileId || b2FileName,
      b2FileName,
      b2Url,
      timestamp: Date.now(),
      expiresAt: Date.now() + CACHE_TTL_MS
    };

    this.cache.set(key, entry);
    this.saveToSession();
    return entry;
  }

  /**
   * Check if an upload is currently in-flight for this key
   */
  getInFlightUpload(clipOrBlob, extraKey = null) {
    const key = this.getCacheKey(clipOrBlob, extraKey);
    if (!key) return null;
    return this.inFlightUploads.get(key) || null;
  }

  /**
   * Track an active upload promise to deduplicate simultaneous requests
   */
  trackUpload(clipOrBlob, uploadPromise, extraKey = null) {
    const key = this.getCacheKey(clipOrBlob, extraKey);
    if (!key) return uploadPromise;

    this.inFlightUploads.set(key, uploadPromise);

    uploadPromise
      .then((result) => {
        if (result && result.b2FileName) {
          this.setCachedUpload(key, result);
        }
      })
      .catch(() => {
        // Clear in-flight on failure
      })
      .finally(() => {
        this.inFlightUploads.delete(key);
      });

    return uploadPromise;
  }

  /**
   * Invalidate or remove a specific clip from cache
   */
  removeCachedUpload(clipOrBlob, extraKey = null) {
    const key = this.getCacheKey(clipOrBlob, extraKey);
    if (key) {
      this.cache.delete(key);
      this.inFlightUploads.delete(key);
    }
    if (extraKey && typeof extraKey === 'string') {
      this.cache.delete(extraKey);
      this.inFlightUploads.delete(extraKey);
    }
    if (clipOrBlob && typeof clipOrBlob === 'string') {
      this.cache.delete(clipOrBlob);
      this.inFlightUploads.delete(clipOrBlob);
    }
    this.saveToSession();
  }

  /**
   * Invalidate any cache entries referencing a specific B2 file name
   */
  invalidateByFileName(b2FileName) {
    if (!b2FileName) return;
    for (const [key, entry] of this.cache.entries()) {
      if (entry && (entry.b2FileName === b2FileName || entry.b2FileId === b2FileName)) {
        this.cache.delete(key);
        this.inFlightUploads.delete(key);
      }
    }
  }

  /**
   * Clear all cached uploads
   */
  clear() {
    this.cache.clear();
    this.inFlightUploads.clear();
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }
}

export const sharedUploadCache = new SharedUploadCache();
export default sharedUploadCache;
