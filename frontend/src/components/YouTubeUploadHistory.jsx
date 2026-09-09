/**
 * YouTubeUploadHistory — Upload history panel
 * Shows D1-persisted upload records with statuses, YouTube links, and retry options.
 * Rendered below GeneratedClips.
 */

import React, { useState, useMemo } from 'react';
import {
  Youtube, ExternalLink, RefreshCw, AlertCircle, CheckCircle2,
  Clock, Calendar, Upload, ChevronDown, ChevronUp, RotateCcw
} from 'lucide-react';

function StatusBadge({ status, progress = null }) {
  switch (status) {
    case 'pending':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 shrink-0">
          <Clock className="w-2.5 h-2.5 mr-1" /> Pending
        </span>
      );
    case 'uploading':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/20 text-red-300 border border-red-500/30 animate-pulse shrink-0">
          <Upload className="w-2.5 h-2.5 mr-1 animate-bounce" /> Uploading {progress != null ? `${progress}%` : ''}
        </span>
      );
    case 'uploaded':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 shrink-0">
          <CheckCircle2 className="w-2.5 h-2.5 mr-1" /> Uploaded
        </span>
      );
    case 'scheduled':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/25 shrink-0">
          <Calendar className="w-2.5 h-2.5 mr-1" /> Scheduled
        </span>
      );
    case 'published':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
          <CheckCircle2 className="w-2.5 h-2.5 mr-1" /> Published
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/25 shrink-0">
          <AlertCircle className="w-2.5 h-2.5 mr-1" /> Failed
        </span>
      );
    case 'cancelled':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-500 shrink-0">
          Cancelled
        </span>
      );
    default:
      return null;
  }
}

function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

export default function YouTubeUploadHistory({
  uploadHistory = [],
  uploadJobs = {},        // live upload states from useUploadQueue (overrides D1 status for active jobs)
  isLoadingHistory = false,
  onRetry,           // (clip) => void — called when user clicks retry
  onRefresh,
  completedClips = [], // used to check if blob is still available for retry
  initialExpanded = true,
  statusFilter = 'all'
}) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  // Merge live upload states on top of D1 history
  const mergedHistory = useMemo(() => {
    if (!uploadHistory || uploadHistory.length === 0) return [];
    return uploadHistory.map(record => {
      const liveState = uploadJobs?.[record.id];
      if (liveState) {
        return {
          ...record,
          status: liveState.status === 'upload_failed' ? 'failed'
                 : liveState.status === 'upload_cancelled' ? 'cancelled'
                 : liveState.status === 'uploaded' ? 'uploaded'
                 : liveState.status === 'scheduled' ? 'scheduled'
                 : liveState.status === 'uploading' ? 'uploading'
                 : liveState.status === 'queued' ? 'uploading'
                 : record.status,
          youtube_video_id: liveState.videoId || record.youtube_video_id,
          error_message: liveState.error || record.error_message,
          _liveProgress: liveState.progress
        };
      }
      return record;
    });
  }, [uploadHistory, uploadJobs]);

  const filteredHistory = useMemo(() => {
    if (!statusFilter || statusFilter === 'all') return mergedHistory;
    if (statusFilter === 'published') {
      return mergedHistory.filter(r => r.status === 'uploaded' || r.status === 'published');
    }
    if (statusFilter === 'failed') {
      return mergedHistory.filter(r => r.status === 'failed' || r.status === 'upload_failed');
    }
    return mergedHistory;
  }, [mergedHistory, statusFilter]);

  if (!uploadHistory || uploadHistory.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-2 shadow-lg">
        <Youtube className="w-8 h-8 text-red-500/60 mx-auto" />
        <p className="text-xs font-semibold text-slate-400">No YouTube upload history found</p>
        <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
          Completed, scheduled, or queued YouTube uploads will appear here once publishing has started.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(v => !v)}
        className="w-full px-3.5 sm:px-5 py-3.5 flex items-center justify-between gap-2 hover:bg-slate-800/40 transition-colors cursor-pointer touch-manipulation"
      >
        <div className="flex items-center space-x-2.5">
          <Youtube className="w-4 h-4 text-red-400 shrink-0" />
          <div className="text-left">
            <p className="text-xs font-semibold text-white">YouTube Upload History</p>
            <p className="text-[11px] text-slate-400">
              {uploadHistory.length} record{uploadHistory.length !== 1 ? 's' : ''}
              {mergedHistory.filter(r => r.status === 'uploaded' || r.status === 'published').length > 0 &&
                ` · ${mergedHistory.filter(r => r.status === 'uploaded' || r.status === 'published').length} uploaded`}
              {mergedHistory.filter(r => r.status === 'scheduled').length > 0 &&
                ` · ${mergedHistory.filter(r => r.status === 'scheduled').length} scheduled`}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          {isLoadingHistory && <RefreshCw className="w-3.5 h-3.5 text-slate-500 animate-spin" />}
          <button
            onClick={e => { e.stopPropagation(); onRefresh?.(); }}
            className="p-1.5 text-slate-500 hover:text-slate-300 rounded-lg transition-colors touch-manipulation"
            title="Refresh history"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-slate-800 divide-y divide-slate-800/70 max-h-[500px] overflow-y-auto">
          {filteredHistory.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No YouTube uploads match the selected status filter.
            </div>
          ) : (
            filteredHistory.map(record => {
            const hasVideo = Boolean(record.youtube_video_id);
            const ytUrl = hasVideo ? `https://www.youtube.com/watch?v=${record.youtube_video_id}` : null;
            const isUploading = record.status === 'uploading';
            const isFailed = record.status === 'failed';
            const blobAvailable = completedClips?.some(c => c.id === record.id && c.blob);

            return (
              <div key={record.id} className="px-3.5 sm:px-5 py-3 hover:bg-slate-800/20 transition-colors">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0 flex-1 space-y-1">
                    {/* Title + Status */}
                    <div className="flex items-center flex-wrap gap-1.5">
                      <span className="text-xs font-semibold text-white truncate max-w-[200px] sm:max-w-sm">
                        {record.title || `Part ${String(record.part_number || '?').padStart(2, '0')}`}
                      </span>
                      <StatusBadge status={record.status} progress={record._liveProgress} />
                    </div>

                    {/* Meta */}
                    <div className="flex items-center space-x-2 text-[10px] text-slate-500 flex-wrap gap-1">
                      {record.part_number && (
                        <span>Part {String(record.part_number).padStart(2, '0')}</span>
                      )}
                      {record.visibility && (
                        <span className="capitalize">· {record.visibility}</span>
                      )}
                      {record.created_at && (
                        <span>· {formatDateTime(record.created_at)}</span>
                      )}
                      {record.scheduled_at && (
                        <span className="text-purple-400">· Scheduled {formatDateTime(record.scheduled_at)}</span>
                      )}
                    </div>

                    {/* Upload progress percentage (shows percentage instead of the line) */}
                    {isUploading && record._liveProgress != null && (
                      <div className="flex items-center space-x-1.5 text-[11px] font-mono mt-1">
                        <span className="text-slate-400">Upload progress:</span>
                        <span className="text-red-400 font-bold px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 shadow-inner">
                          {record._liveProgress}%
                        </span>
                      </div>
                    )}

                    {/* Error message */}
                    {isFailed && record.error_message && (
                      <p className="text-[10px] text-rose-400 mt-0.5 max-w-xs truncate">{record.error_message}</p>
                    )}

                    {/* Video ID */}
                    {hasVideo && (
                      <p className="text-[10px] text-slate-600 font-mono">{record.youtube_video_id}</p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center space-x-1.5 shrink-0">
                    {hasVideo && (
                      <a
                        href={ytUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 text-[11px] font-semibold text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg flex items-center space-x-1 transition-colors touch-manipulation"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>YouTube</span>
                      </a>
                    )}

                    {isFailed && (
                      <button
                        onClick={() => {
                          const matchingClip = completedClips?.find(c => c.id === record.id);
                          onRetry?.(matchingClip || { id: record.id, partNumber: record.part_number, blob: matchingClip?.blob });
                        }}
                        className="px-2.5 py-1.5 text-[11px] font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg flex items-center space-x-1 transition-colors cursor-pointer touch-manipulation"
                        title={blobAvailable ? 'Retry upload' : 'Re-export required — blob no longer in memory'}
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>{blobAvailable ? 'Retry' : 'Re-export'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          }))}
        </div>
      )}
    </div>
  );
}
