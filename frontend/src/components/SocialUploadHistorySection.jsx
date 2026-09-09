import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  History, Trash2, Filter, Instagram, Share2, ExternalLink,
  CheckCircle2, XCircle, AlertCircle, RefreshCw, Clock, Calendar,
  ChevronDown, AlertTriangle, ShieldCheck, Youtube, RotateCcw
} from 'lucide-react';
import {
  getSocialUploadHistory,
  clearSocialUploadHistory,
  clearPlatformHistory,
  retryUploadJob
} from '../services/apiService';

function formatDateTime(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return '—';
  }
}

/**
 * SocialUploadHistorySection
 * 
 * Displays unified upload/publishing history across YouTube, Facebook Reels, and Instagram Reels
 * in a consistent, clean table layout with live status indicators, external post links,
 * retry upload buttons for all platforms, and safe history clearing.
 */
export default function SocialUploadHistorySection({
  refreshTrigger = 0,
  showToast = (msg, type) => console.log(type, msg),
  uploadHistory = [],
  uploadJobs = {},
  isLoadingHistory = false,
  onRetryUpload,
  refreshHistory,
  completedClips = [],
  publishToFacebookPipeline,
  publishToInstagramPipeline,
  fbSettings,
  igSettings,
  fbAccount,
  igAccount,
  isFbConnected = false,
  isIgConnected = false
}) {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryingId, setRetryingId] = useState(null);

  // Filters: platform ('all' | 'youtube' | 'instagram' | 'facebook'), status ('all' | 'published' | 'failed')
  const [platformFilter, setPlatformFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Clear History Modal State
  const [showClearModal, setShowClearModal] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Error Details Modal State
  const [errorModalItem, setErrorModalItem] = useState(null);

  // Fetch Social History from API
  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (platformFilter !== 'youtube') {
        const res = await getSocialUploadHistory({
          platform: platformFilter === 'youtube' ? 'all' : platformFilter,
          status: statusFilter,
          limit: 100
        });
        if (res && res.success) {
          setHistory(res.history || []);
        }
      }
      refreshHistory?.();
    } catch (err) {
      console.warn('[SocialHistory] Error fetching upload history:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [platformFilter, statusFilter, refreshHistory]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory, refreshTrigger]);

  const handleRefreshAll = async () => {
    await Promise.allSettled([
      fetchHistory(),
      refreshHistory ? refreshHistory() : Promise.resolve()
    ]);
  };

  // Normalize YouTube history items with live upload jobs
  const normalizedYtHistory = useMemo(() => {
    if (!uploadHistory || uploadHistory.length === 0) return [];
    return uploadHistory.map(record => {
      const liveState = uploadJobs?.[record.id];
      const rawStatus = liveState?.status || record.status;
      const status =
        rawStatus === 'upload_failed' ? 'failed' :
        rawStatus === 'upload_cancelled' ? 'cancelled' :
        rawStatus === 'uploaded' ? 'published' :
        rawStatus === 'scheduled' ? 'scheduled' :
        rawStatus === 'uploading' ? 'uploading' :
        rawStatus === 'queued' ? 'uploading' :
        rawStatus === 'published' ? 'published' :
        record.status === 'uploaded' ? 'published' :
        record.status;

      const videoId = liveState?.videoId || record.youtube_video_id;

      return {
        id: record.id,
        platform: 'youtube',
        title: record.title || (record.part_number ? `Part ${String(record.part_number).padStart(2, '0')}` : 'YouTube Video'),
        subtitle: record.part_number
          ? `Part ${String(record.part_number).padStart(2, '0')}${record.visibility ? ` · ${record.visibility}` : ''}`
          : (record.visibility ? `Visibility: ${record.visibility}` : 'YouTube Video'),
        scheduled_at: record.scheduled_at || null,
        published_at: (status === 'published' || record.status === 'uploaded') ? (record.updated_at || record.created_at) : null,
        created_at: record.created_at,
        updated_at: record.updated_at,
        status,
        progress: liveState?.progress ?? null,
        post_url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
        error_message: liveState?.error || record.error_message,
        rawItem: record
      };
    });
  }, [uploadHistory, uploadJobs]);

  // Normalize Facebook & Instagram history items
  const normalizedSocialHistory = useMemo(() => {
    if (!history || history.length === 0) return [];
    return history.map(item => ({
      id: item.id,
      platform: item.platform,
      title: item.title || item.b2_file_name || `${item.platform === 'instagram' ? 'Instagram' : 'Facebook'} Video`,
      subtitle: item.b2_file_name || (item.title ? '' : 'Social Video'),
      scheduled_at: item.scheduled_at || null,
      published_at: item.published_at || item.updated_at || item.created_at,
      created_at: item.created_at,
      updated_at: item.updated_at,
      status: item.status,
      progress: item.progress ?? null,
      post_url: item.facebook_post_url || item.instagram_post_url || (item.facebook_video_id ? `https://www.facebook.com/reel/${item.facebook_video_id}` : null) || (item.instagram_media_id ? `https://www.instagram.com/reel/${item.instagram_media_id}` : null),
      error_message: item.error_message,
      rawItem: item
    }));
  }, [history]);

  // Unified history combining all platforms, filtered and sorted newest-first
  const unifiedHistory = useMemo(() => {
    let combined = [];
    if (platformFilter === 'youtube') {
      combined = [...normalizedYtHistory];
    } else if (platformFilter === 'instagram') {
      combined = normalizedSocialHistory.filter(h => h.platform === 'instagram');
    } else if (platformFilter === 'facebook') {
      combined = normalizedSocialHistory.filter(h => h.platform === 'facebook');
    } else {
      combined = [...normalizedSocialHistory, ...normalizedYtHistory];
    }

    if (statusFilter === 'published') {
      combined = combined.filter(h => h.status === 'published' || h.status === 'uploaded');
    } else if (statusFilter === 'failed') {
      combined = combined.filter(h => h.status === 'failed' || h.status === 'upload_failed');
    }

    // Sort newest first
    return combined.sort((a, b) => {
      const timeA = new Date(a.published_at || a.scheduled_at || a.created_at || a.updated_at || 0).getTime();
      const timeB = new Date(b.published_at || b.scheduled_at || b.created_at || b.updated_at || 0).getTime();
      return timeB - timeA;
    });
  }, [platformFilter, statusFilter, normalizedYtHistory, normalizedSocialHistory]);

  // Total records count calculation
  const totalRecordsCount = useMemo(() => {
    if (platformFilter === 'youtube') return normalizedYtHistory.length;
    if (platformFilter === 'instagram') return normalizedSocialHistory.filter(h => h.platform === 'instagram').length;
    if (platformFilter === 'facebook') return normalizedSocialHistory.filter(h => h.platform === 'facebook').length;
    return normalizedSocialHistory.length + normalizedYtHistory.length;
  }, [platformFilter, normalizedSocialHistory, normalizedYtHistory]);

  // Check if any records exist to clear
  const hasRecordsToClear = useMemo(() => {
    return totalRecordsCount > 0;
  }, [totalRecordsCount]);

  // Retry upload handler across YouTube, Facebook, and Instagram
  const handleRetry = async (item) => {
    if (retryingId) return;
    setRetryingId(item.id);

    try {
      if (item.platform === 'youtube') {
        const matchingClip = completedClips?.find(c =>
          c.id === item.id ||
          (item.rawItem?.part_number && c.partNumber === item.rawItem.part_number) ||
          (item.title && c.name && c.name.toLowerCase().includes(item.title.toLowerCase()))
        );

        if (matchingClip?.blob) {
          if (onRetryUpload) {
            onRetryUpload(matchingClip);
            showToast(`Retrying YouTube upload for "${item.title}"...`, 'info');
          } else {
            await retryUploadJob(item.id);
            showToast(`YouTube upload job reset.`, 'info');
            refreshHistory?.();
          }
        } else {
          try {
            await retryUploadJob(item.id);
            refreshHistory?.();
            showToast(`YouTube upload job reset for retry. If clip blob is needed, please re-export clip.`, 'info');
          } catch (err) {
            if (onRetryUpload && matchingClip) {
              onRetryUpload(matchingClip);
            } else {
              showToast('Clip blob is no longer in memory. Please re-export this clip to retry uploading to YouTube.', 'error');
            }
          }
        }
      } else if (item.platform === 'facebook') {
        if (!isFbConnected) {
          showToast('Please connect your Facebook Page before retrying upload.', 'error');
          return;
        }
        if (!publishToFacebookPipeline) {
          showToast('Facebook publish service is not available.', 'error');
          return;
        }

        const matchingClip = completedClips?.find(c =>
          c.id === item.id ||
          (item.title && c.name && c.name.toLowerCase().includes(item.title.toLowerCase())) ||
          (item.rawItem?.b2_file_name && c.fileName === item.rawItem.b2_file_name)
        );

        const targetBlob = matchingClip?.blob || null;
        const b2FileId = item.rawItem?.b2_file_id;
        const b2FileName = item.rawItem?.b2_file_name;

        if (!targetBlob && !b2FileId && !b2FileName) {
          showToast('No video blob or cloud asset available to retry Facebook upload. Please re-export clip.', 'error');
          return;
        }

        showToast(`Retrying Facebook upload for "${item.title}"...`, 'info');

        await publishToFacebookPipeline(targetBlob, {
          clipId: item.id,
          b2FileId,
          b2FileName,
          fileName: b2FileName || `${item.title || 'Facebook_Reel'}.mp4`,
          title: item.title || 'Facebook Reel',
          caption: item.rawItem?.caption || item.title || 'Facebook Reel',
          hashtags: ['reels', 'facebookreels', 'viral'],
          contentType: item.rawItem?.content_type || fbSettings?.fb_content_type || 'reel',
          pageId: item.rawItem?.page_id || item.rawItem?.facebook_account_id || fbAccount?.page_id,
          scheduledAt: null
        });

        showToast(`Facebook upload retried successfully!`, 'success');
        await fetchHistory();
      } else if (item.platform === 'instagram') {
        if (!isIgConnected) {
          showToast('Please connect your Instagram Account before retrying upload.', 'error');
          return;
        }
        if (!publishToInstagramPipeline) {
          showToast('Instagram publish service is not available.', 'error');
          return;
        }

        const matchingClip = completedClips?.find(c =>
          c.id === item.id ||
          (item.title && c.name && c.name.toLowerCase().includes(item.title.toLowerCase())) ||
          (item.rawItem?.b2_file_name && c.fileName === item.rawItem.b2_file_name)
        );

        const targetBlob = matchingClip?.blob || null;
        const b2FileId = item.rawItem?.b2_file_id;
        const b2FileName = item.rawItem?.b2_file_name;

        if (!targetBlob && !b2FileId && !b2FileName) {
          showToast('No video blob or cloud asset available to retry Instagram upload. Please re-export clip.', 'error');
          return;
        }

        showToast(`Retrying Instagram upload for "${item.title}"...`, 'info');

        await publishToInstagramPipeline(targetBlob, {
          clipId: item.id,
          b2FileId,
          b2FileName,
          fileName: b2FileName || `${item.title || 'Instagram_Reel'}.mp4`,
          title: item.title || 'Instagram Reel',
          caption: item.rawItem?.caption || item.title || '#Reels #InstagramReels #Viral',
          hashtags: ['reels', 'instagramreels', 'viral'],
          shareToFeed: igSettings?.ig_share_to_feed !== false,
          contentType: item.rawItem?.content_type || igSettings?.ig_content_type || 'reel',
          igUserId: item.rawItem?.ig_user_id || item.rawItem?.instagram_account_id || igAccount?.ig_user_id,
          scheduledAt: null
        });

        showToast(`Instagram upload retried successfully!`, 'success');
        await fetchHistory();
      }
    } catch (err) {
      console.error(`Retry error on ${item.platform}:`, err);
      showToast(`Retry failed on ${item.platform}: ${err.message}`, 'error');
    } finally {
      setRetryingId(null);
    }
  };

  // Handle Safe Clear History
  const handleConfirmClear = async () => {
    setIsClearing(true);
    try {
      let clearedCount = 0;
      if (platformFilter === 'youtube') {
        const res = await clearPlatformHistory('youtube');
        if (res && res.success) {
          clearedCount = res.deletedCount || 0;
        }
        await refreshHistory?.();
      } else if (platformFilter === 'all') {
        const [socialRes, ytRes] = await Promise.allSettled([
          clearSocialUploadHistory('all'),
          clearPlatformHistory('youtube')
        ]);
        if (socialRes.status === 'fulfilled' && socialRes.value?.success) {
          clearedCount += socialRes.value.deletedCount || 0;
        }
        if (ytRes.status === 'fulfilled' && ytRes.value?.success) {
          clearedCount += ytRes.value.deletedCount || 0;
        }
        await refreshHistory?.();
        await fetchHistory();
      } else {
        const res = await clearSocialUploadHistory(platformFilter);
        if (res && res.success) {
          clearedCount = res.deletedCount || 0;
        }
        await fetchHistory();
      }
      showToast(
        `Upload history cleared (${clearedCount} records removed). Active scheduled videos were preserved!`,
        'success'
      );
      setShowClearModal(false);
    } catch (err) {
      console.error('Clear history error:', err);
      showToast(`Failed to clear history: ${err.message}`, 'error');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl mt-2">
      {/* Header & Section Title */}
      <div className="p-4 sm:p-5 border-b border-slate-800/80 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-inner">
            <History className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-bold text-white tracking-tight">Upload History</h3>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-800 border border-slate-700 text-slate-300 rounded-full">
                {totalRecordsCount} records
              </span>
            </div>
          </div>
        </div>

        {/* Refresh & Clear Actions */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleRefreshAll}
            disabled={isLoading || isLoadingHistory}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
            title="Refresh history"
          >
            <RefreshCw className={`w-4 h-4 ${(isLoading || isLoadingHistory) ? 'animate-spin text-blue-400' : ''}`} />
          </button>

          {hasRecordsToClear && (
            <button
              type="button"
              onClick={() => setShowClearModal(true)}
              className="px-3 py-2 bg-slate-800/80 hover:bg-rose-950/40 border border-slate-700 hover:border-rose-500/40 text-slate-300 hover:text-rose-300 text-xs font-semibold rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer"
              title="Clear completed publishing logs"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Clear Upload History</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="p-3 sm:px-5 py-2.5 bg-slate-950/40 border-b border-slate-800/60 flex flex-wrap items-center justify-between gap-2 text-xs">
        {/* Platform Filters */}
        <div className="flex items-center space-x-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 px-2">Platform:</span>
          <button
            type="button"
            onClick={() => setPlatformFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              platformFilter === 'all'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setPlatformFilter('youtube')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center space-x-1 ${
              platformFilter === 'youtube'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Youtube className="w-3 h-3 text-red-400" />
            <span>YouTube</span>
          </button>
          <button
            type="button"
            onClick={() => setPlatformFilter('instagram')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center space-x-1 ${
              platformFilter === 'instagram'
                ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Instagram className="w-3 h-3 text-pink-400" />
            <span>Instagram</span>
          </button>
          <button
            type="button"
            onClick={() => setPlatformFilter('facebook')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center space-x-1 ${
              platformFilter === 'facebook'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Share2 className="w-3 h-3 text-blue-400" />
            <span>Facebook</span>
          </button>
        </div>

        {/* Status Filters */}
        <div className="flex items-center space-x-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 px-2">Status:</span>
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              statusFilter === 'all'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('published')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              statusFilter === 'published'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Published
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('failed')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              statusFilter === 'failed'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Failed
          </button>
        </div>
      </div>

      {/* Unified History Table Rendering (Same format for YouTube, Facebook, and Instagram) */}
      <div className="p-0 overflow-x-auto">
        {error && (
          <div className="p-4 bg-rose-500/10 border-b border-rose-500/20 text-xs text-rose-300 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {unifiedHistory.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <History className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-xs font-semibold text-slate-400">No upload history found</p>
            <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
              Completed and published posts across YouTube, Facebook, and Instagram will appear here once publishing has started.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-semibold text-slate-400 bg-slate-950/50">
                <th className="py-3 px-4">Video</th>
                <th className="py-3 px-4">Platform</th>
                <th className="py-3 px-4">Scheduled</th>
                <th className="py-3 px-4">Published</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {unifiedHistory.map((item) => {
                const isYt = item.platform === 'youtube';
                const isIg = item.platform === 'instagram';
                const isUploading = item.status === 'uploading';
                const isFailed = item.status === 'failed' || item.status === 'upload_failed';
                const isRetrying = retryingId === item.id;

                return (
                  <tr key={`${item.platform}_${item.id}`} className="hover:bg-slate-800/30 transition-colors">
                    {/* Video Name & Subtitle */}
                    <td className="py-3 px-4 max-w-[200px] sm:max-w-[260px]">
                      <div className="font-semibold text-slate-200 truncate" title={item.title}>
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div className="text-[10px] text-slate-400 truncate font-mono">
                          {item.subtitle}
                        </div>
                      )}
                    </td>

                    {/* Platform Badge */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-md font-bold text-[10px] shadow-sm ${
                          isYt
                            ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                            : isIg
                            ? 'bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-300 border border-pink-500/30'
                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        }`}
                      >
                        {isYt ? (
                          <Youtube className="w-3 h-3 text-red-400" />
                        ) : isIg ? (
                          <Instagram className="w-3 h-3 text-pink-400" />
                        ) : (
                          <Share2 className="w-3 h-3 text-blue-400" />
                        )}
                        <span className="capitalize">{item.platform}</span>
                      </span>
                    </td>

                    {/* Scheduled Time */}
                    <td className="py-3 px-4 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                      {item.scheduled_at ? formatDateTime(item.scheduled_at) : 'Immediate'}
                    </td>

                    {/* Published Time */}
                    <td className="py-3 px-4 whitespace-nowrap text-slate-300 font-mono text-[11px]">
                      {formatDateTime(item.published_at)}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      {item.status === 'published' || item.status === 'uploaded' ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Published</span>
                        </span>
                      ) : isFailed ? (
                        <button
                          type="button"
                          onClick={() => setErrorModalItem(item)}
                          className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 transition-colors cursor-pointer"
                          title="Click to view error details"
                        >
                          <XCircle className="w-3 h-3 text-rose-400" />
                          <span>Failed (View)</span>
                        </button>
                      ) : item.status === 'cancelled' || item.status === 'upload_cancelled' ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                          <span>Cancelled</span>
                        </span>
                      ) : isUploading ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40 animate-pulse">
                          <span>Uploading {item.progress != null ? `${item.progress}%` : ''}</span>
                        </span>
                      ) : item.status === 'scheduled' ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          <Clock className="w-3 h-3 text-purple-400" />
                          <span>Scheduled</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                          <span>{item.status}</span>
                        </span>
                      )}
                    </td>

                    {/* Action Column: Open Link + Retry Upload Button for All Platforms */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end space-x-2">
                        {item.post_url && (
                          <a
                            href={item.post_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center space-x-1 text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/50"
                            title={`Open video on ${item.platform}`}
                          >
                            <span>Open</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={() => handleRetry(item)}
                          disabled={isRetrying || isUploading}
                          className={`inline-flex items-center space-x-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                            isRetrying
                              ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 animate-pulse'
                              : isFailed
                              ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/40 hover:border-amber-500/60 shadow-sm'
                              : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700 hover:border-slate-600'
                          }`}
                          title={
                            isFailed
                              ? `Retry failed ${item.platform} upload`
                              : `Re-upload this video to ${item.platform}`
                          }
                        >
                          <RotateCcw className={`w-3 h-3 ${isRetrying ? 'animate-spin text-blue-400' : isFailed ? 'text-amber-400' : 'text-slate-400'}`} />
                          <span>{isRetrying ? 'Retrying...' : 'Retry'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Confirmation Modal for Clearing History */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>

            <div className="text-center space-y-1.5">
              <h4 className="text-sm font-bold text-white">
                {platformFilter === 'youtube'
                  ? 'Clear YouTube Upload History?'
                  : platformFilter === 'instagram'
                  ? 'Clear Instagram Upload History?'
                  : platformFilter === 'facebook'
                  ? 'Clear Facebook Upload History?'
                  : 'Clear All Upload History?'}
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                This will permanently remove completed publishing history.
                <br />
                <strong className="text-emerald-400 block mt-1">
                  ✓ Active scheduled videos will NOT be deleted.
                </strong>
              </p>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                disabled={isClearing}
                className="flex-1 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClear}
                disabled={isClearing}
                className="flex-1 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 active:scale-98 rounded-xl shadow-lg shadow-rose-600/20 transition-all cursor-pointer flex items-center justify-center space-x-1"
              >
                {isClearing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <span>Clear History</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Details Modal */}
      {errorModalItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="font-bold text-sm text-white">Publishing Error Details</span>
              <button
                onClick={() => setErrorModalItem(null)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <span className="text-slate-400 block">Platform:</span>
                <span className="font-semibold text-white capitalize">{errorModalItem.platform}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Video:</span>
                <span className="font-mono text-slate-200">{errorModalItem.title || errorModalItem.subtitle}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Error Message:</span>
                <pre className="mt-1 p-2.5 bg-rose-950/40 border border-rose-500/30 rounded-xl text-rose-300 font-mono text-[11px] whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {errorModalItem.error_message || 'Unknown publishing error from API'}
                </pre>
              </div>
            </div>

            <div className="pt-2 flex justify-between items-center">
              <button
                type="button"
                onClick={() => {
                  const itemToRetry = errorModalItem;
                  setErrorModalItem(null);
                  handleRetry(itemToRetry);
                }}
                className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-xl font-semibold text-xs flex items-center space-x-1.5 cursor-pointer transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry Upload Now</span>
              </button>
              <button
                type="button"
                onClick={() => setErrorModalItem(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
