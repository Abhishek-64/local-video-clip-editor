import { useState, useEffect, useCallback } from 'react';
import { getAllUploadHistory, clearPlatformHistory } from '../services/apiService';

/**
 * useAllUploadHistory
 * Manages persistent D1 database upload history across YouTube, Facebook Reels, and Instagram Reels.
 * Provides unified queries, cross-platform clearing, and clip-to-upload status matching.
 */
export function useAllUploadHistory({ isAuthenticated = false } = {}) {
  const [youtubeHistory, setYoutubeHistory] = useState([]);
  const [facebookHistory, setFacebookHistory] = useState([]);
  const [instagramHistory, setInstagramHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const refreshHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getAllUploadHistory();
      if (res && res.success) {
        setYoutubeHistory(res.youtube || []);
        setFacebookHistory(res.facebook || []);
        setInstagramHistory(res.instagram || []);
      }
    } catch (err) {
      console.warn('Failed to fetch unified upload history:', err.message);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory, isAuthenticated]);

  /**
   * Clear history for a given platform ('youtube' | 'facebook' | 'instagram' | 'all')
   * Clears database upload logs without revoking account credentials.
   */
  const clearHistory = useCallback(async (platform = 'all') => {
    setIsLoading(true);
    try {
      await clearPlatformHistory(platform);
      await refreshHistory();
      return { success: true };
    } catch (err) {
      console.error(`Failed to clear ${platform} upload history:`, err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [refreshHistory]);

  /**
   * Helper: Find upload records across platforms matching a specific clip.
   * Matches by clip.id, clip.partNumber, or title content.
   */
  const getClipUploads = useCallback((clip) => {
    if (!clip) return { youtube: null, facebook: null, instagram: null };

    const partNum = clip.partNumber;
    const clipName = clip.name || '';

    // Match YouTube
    const yt = youtubeHistory.find(r => 
      r.id === clip.id || 
      (partNum && r.part_number === partNum) ||
      (clipName && r.title && (r.title.includes(clipName) || clipName.includes(`Part ${r.part_number}`)))
    ) || null;

    // Match Facebook
    const fb = facebookHistory.find(r => 
      r.id === clip.id || 
      (partNum && r.title && r.title.includes(`Part ${partNum}`)) ||
      (clipName && r.title && r.title.includes(clipName))
    ) || null;

    // Match Instagram
    const ig = instagramHistory.find(r => 
      r.id === clip.id || 
      (partNum && r.title && r.title.includes(`Part ${partNum}`)) ||
      (clipName && r.title && r.title.includes(clipName))
    ) || null;

    return { youtube: yt, facebook: fb, instagram: ig };
  }, [youtubeHistory, facebookHistory, instagramHistory]);

  return {
    youtubeHistory,
    facebookHistory,
    instagramHistory,
    totalCount: youtubeHistory.length + facebookHistory.length + instagramHistory.length,
    isLoading,
    error,
    refreshHistory,
    clearHistory,
    getClipUploads
  };
}
