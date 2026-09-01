/**
 * Shared Video Upload Cache Service
 *
 * Prevents re-uploading the exact same video file to Backblaze B2 when publishing
 * across multiple platforms (e.g. Facebook Reels AND Instagram Reels).
 *
 * Holds temporary presigned public B2 media URLs with a TTL of 2 hours.
 */

const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

class SharedUploadCache {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Generate unique cache key for a clip or video file
   */
  getCacheKey(clipOrBlob) {
    if (!clipOrBlob) return null;
    if (typeof clipOrBlob === 'string') return clipOrBlob;
    if (clipOrBlob.id) return String(clipOrBlob.id);
    if (clipOrBlob.name && clipOrBlob.size) return `${clipOrBlob.name}_${clipOrBlob.size}_${clipOrBlob.lastModified || ''}`;
    if (clipOrBlob.blob && clipOrBlob.blob.name) return `${clipOrBlob.blob.name}_${clipOrBlob.blob.size}`;
    return null;
  }

  /**
   * Get cached active B2 upload data
   */
  getCachedUpload(clipOrBlob) {
    const key = this.getCacheKey(clipOrBlob);
    if (!key) return null;

    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  /**
   * Set cached B2 upload data
   */
  setCachedUpload(clipOrBlob, { b2Url, b2FileId, b2FileName }) {
    const key = this.getCacheKey(clipOrBlob);
    if (!key || !b2Url) return;

    this.cache.set(key, {
      b2Url,
      b2FileId,
      b2FileName,
      timestamp: Date.now(),
      expiresAt: Date.now() + CACHE_TTL_MS
    });
  }

  /**
   * Invalidate or remove a specific clip from cache
   */
  removeCachedUpload(clipOrBlob) {
    const key = this.getCacheKey(clipOrBlob);
    if (key) this.cache.delete(key);
  }

  /**
   * Clear all cached uploads
   */
  clear() {
    this.cache.clear();
  }
}

export const sharedUploadCache = new SharedUploadCache();
export default sharedUploadCache;
