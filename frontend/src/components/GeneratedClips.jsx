import React, { useState, memo, useMemo, useCallback, useEffect } from 'react';
import {
  Film, Download, Archive, CheckCircle2, Eye, X, CheckSquare, Square, Filter,
  Youtube, ExternalLink, Upload, RotateCcw, Calendar, Clock, Sparkles, Share2,
  RefreshCw, Instagram, Zap, Play, ChevronDown
} from 'lucide-react';
import { formatTime } from '../utils/time';
import { formatScheduledDateTime } from '../utils/scheduler';
import { downloadClipsAsZip } from '../services/zipService';
import { clipResourceManager } from '../services/export/exportResourceManager';
import GeneratedVideoPlayer from './GeneratedVideoPlayer';

// ── Lightweight, Memoized Individual Clip Card ──────────────────────────────
const GeneratedClipCard = memo(function GeneratedClipCard({
  clip,
  isSelected,
  uploadState,
  fbPublishedUrl,
  igPublishedUrl,
  isFbPublishing,
  isIgPublishing,
  fbPublishProgress = 0,
  igPublishProgress = 0,
  canPublishAny,
  onOpenPublish,
  onToggleSelect,
  onPreview,
  onDownload,
  onRetryUpload
}) {
  const [thumbUrl, setThumbUrl] = useState(clip.thumbnailUrl || null);

  useEffect(() => {
    if (clip.thumbnailUrl && clip.thumbnailUrl !== thumbUrl) {
      setThumbUrl(clip.thumbnailUrl);
    }
  }, [clip.thumbnailUrl]);

  // Lazy thumbnail extraction fallback if clip was created without a thumbnail
  useEffect(() => {
    let isCancelled = false;
    if (!thumbUrl && clip.blob) {
      clipResourceManager.ensureThumbnail(clip.id, clip.blob).then((url) => {
        if (!isCancelled && url) {
          setThumbUrl(url);
        }
      });
    }
    return () => {
      isCancelled = true;
    };
  }, [clip.id, clip.blob, thumbUrl]);

  // YouTube Upload Status Chip
  const ytChip = useMemo(() => {
    if (!uploadState) return null;
    switch (uploadState.status) {
      case 'queued':
        return (
          <span className="inline-flex items-center space-x-1 text-[10px] bg-blue-500/15 text-blue-400 border border-blue-500/25 px-1.5 py-0.5 rounded-full">
            <Upload className="w-2.5 h-2.5" />
            <span>Queued</span>
          </span>
        );
      case 'uploading':
        return (
          <span className="inline-flex items-center space-x-1 text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded-full animate-pulse">
            <Upload className="w-2.5 h-2.5 animate-bounce" />
            <span>{uploadState.progress || 0}%</span>
          </span>
        );
      case 'uploaded':
        return (
          <span className="inline-flex items-center space-x-1 text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 px-1.5 py-0.5 rounded-full font-semibold">
            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
            <span>Uploaded</span>
          </span>
        );
      case 'scheduled':
        return (
          <span className="inline-flex items-center space-x-1 text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded-full font-semibold">
            <Calendar className="w-2.5 h-2.5 text-purple-400" />
            <span>{uploadState.scheduledAt ? formatScheduledDateTime(uploadState.scheduledAt) : 'Scheduled'}</span>
          </span>
        );
      case 'upload_failed':
        return (
          <span className="inline-flex items-center space-x-1 text-[10px] bg-rose-500/15 text-rose-400 border border-rose-500/25 px-1.5 py-0.5 rounded-full font-semibold">
            <span>Failed</span>
          </span>
        );
      default:
        return null;
    }
  }, [uploadState]);

  // Facebook Reel Status Chip
  const fbChip = useMemo(() => {
    if (isFbPublishing) {
      return (
        <span className="inline-flex items-center space-x-1 text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded-full animate-pulse font-semibold">
          <Share2 className="w-2.5 h-2.5 animate-spin text-blue-400" />
          <span>FB {fbPublishProgress || 0}%</span>
        </span>
      );
    }
    if (fbPublishedUrl) {
      return (
        <a
          href={fbPublishedUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center space-x-1 text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 px-1.5 py-0.5 rounded-full font-semibold transition-colors"
        >
          <Share2 className="w-2.5 h-2.5 text-blue-400" />
          <span>FB Reel ↗</span>
        </a>
      );
    }
    return null;
  }, [isFbPublishing, fbPublishProgress, fbPublishedUrl]);

  // Instagram Reel Status Chip
  const igChip = useMemo(() => {
    if (isIgPublishing) {
      return (
        <span className="inline-flex items-center space-x-1 text-[10px] bg-pink-500/20 text-pink-300 border border-pink-500/30 px-1.5 py-0.5 rounded-full animate-pulse font-semibold">
          <Instagram className="w-2.5 h-2.5 animate-spin text-pink-400" />
          <span>IG {igPublishProgress || 0}%</span>
        </span>
      );
    }
    if (igPublishedUrl) {
      return (
        <a
          href={igPublishedUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center space-x-1 text-[10px] bg-pink-500/20 text-pink-300 border border-pink-500/30 hover:bg-pink-500/30 px-1.5 py-0.5 rounded-full font-semibold transition-colors"
        >
          <Instagram className="w-2.5 h-2.5 text-pink-400" />
          <span>IG Reel ↗</span>
        </a>
      );
    }
    return null;
  }, [isIgPublishing, igPublishProgress, igPublishedUrl]);

  const uploadFailed = uploadState?.status === 'upload_failed';

  return (
    <div
      onClick={() => onToggleSelect(clip.id)}
      className={`border rounded-xl p-3 sm:p-3.5 flex flex-col justify-between space-y-2.5 sm:space-y-3 transition-all cursor-pointer touch-manipulation ${
        isSelected
          ? 'bg-orange-500/5 border-orange-500/60 ring-1 ring-orange-500/30'
          : 'bg-slate-950 border-slate-800/90 hover:border-slate-700'
      }`}
    >
      <div>
        {/* Card Header: Checkbox & Name */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2 min-w-0">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => {}} // Handled by card click
              className="rounded bg-slate-900 border-slate-700 text-orange-500 pointer-events-none shrink-0"
            />
            <span className="text-xs font-bold text-white truncate max-w-[140px] sm:max-w-xs">
              {clip.name}
            </span>
          </div>

          <div className="flex items-center space-x-1 shrink-0">
            {ytChip}
            {fbChip}
            {igChip}
            {!ytChip && clip.scheduledAt && (
              <span className="inline-flex items-center space-x-1 text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded-full font-semibold">
                <Calendar className="w-2.5 h-2.5 text-purple-400" />
                <span>{formatScheduledDateTime(clip.scheduledAt)}</span>
              </span>
            )}
          </div>
        </div>

        {/* Thumbnail Preview (Never live <video>) */}
        <div
          className="relative mt-2 aspect-video bg-black/60 rounded-lg overflow-hidden border border-slate-800/80 group/thumb cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onPreview(clip);
          }}
        >
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt={clip.name}
              className="w-full h-full object-cover transition-transform duration-300 group-hover/thumb:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-900/90 text-slate-500">
              <Film className="w-8 h-8 opacity-30" />
            </div>
          )}
          <div className="absolute inset-0 bg-black/30 group-hover/thumb:bg-black/10 transition-colors flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-slate-900/80 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white shadow-lg group-hover/thumb:scale-110 transition-transform">
              <Play className="w-4 h-4 ml-0.5 fill-current text-orange-400" />
            </div>
          </div>
        </div>

        {/* Metadata */}
        <div className="flex items-center space-x-2 text-[11px] text-slate-400 font-mono mt-1">
          <span>{formatTime(clip.duration)}</span>
          <span>•</span>
          <span>{clip.size ? `${(clip.size / (1024 * 1024)).toFixed(1)} MB` : '1080p'}</span>
        </div>

        {/* Upload progress indicator (shows percentage instead of the line) */}
        {(uploadState?.status === 'uploading' || isFbPublishing || isIgPublishing) && (
          <div className="flex items-center justify-between text-[11px] font-mono mt-2 pt-1 border-t border-slate-800/80">
            <span className="text-slate-400">
              {isFbPublishing ? 'Facebook Upload:' : isIgPublishing ? 'Instagram Upload:' : 'YouTube Upload:'}
            </span>
            <span className="font-bold text-white px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 shadow-inner">
              {isFbPublishing
                ? `${fbPublishProgress || 0}%`
                : isIgPublishing
                ? `${igPublishProgress || 0}%`
                : `${uploadState?.progress || 0}%`}
            </span>
          </div>
        )}
      </div>

      {/* Action Buttons Strip */}
      <div
        className="flex items-center space-x-1.5 pt-2 border-t border-slate-900 flex-wrap gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => onPreview(clip)}
          className="flex-1 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg flex items-center justify-center space-x-1 transition-colors cursor-pointer touch-manipulation"
          title="Preview clip in dedicated player"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>View</span>
        </button>

        <button
          onClick={() => onDownload(clip)}
          className="flex-1 py-1.5 text-xs font-semibold text-emerald-300 bg-emerald-950/50 hover:bg-emerald-900/70 border border-emerald-500/30 rounded-lg flex items-center justify-center space-x-1 transition-colors cursor-pointer touch-manipulation"
          title="Download MP4"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Save</span>
        </button>

        {/* Central Unified Publish / Schedule Action */}
        {onOpenPublish && (
          <button
            onClick={() => onOpenPublish(clip)}
            className="flex-1 py-1.5 px-2 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:opacity-95 active:scale-98 border border-purple-500/40 rounded-lg flex items-center justify-center space-x-1 transition-all cursor-pointer touch-manipulation shadow-sm shadow-purple-500/20"
            title="Publish or schedule clip to YouTube, Facebook, or Instagram"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Publish / Schedule</span>
          </button>
        )}

        {/* Retry failed upload */}
        {uploadFailed && onRetryUpload && (
          <button
            onClick={() => onRetryUpload(clip)}
            className="flex-1 py-1.5 text-xs font-semibold text-amber-300 bg-amber-950/50 hover:bg-amber-900/70 border border-amber-500/30 rounded-lg flex items-center justify-center space-x-1.5 transition-colors cursor-pointer touch-manipulation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        )}
      </div>
    </div>
  );
});

// ── Main Generated Clips Section Component ──────────────────────────────────
function GeneratedClips({
  completedClips = [],
  onDownloadClip,
  onDownloadAllZip,
  isZipping = false,
  zipProgress = 0,
  movieName = 'Movie',
  youtubeName,
  textSettings = {},
  // YouTube upload integration
  uploadJobs = {},
  onUploadClip,
  onRetryUpload,
  isConnected = false,
  ytAccount = null,
  ytSettings = {},
  // Facebook upload integration
  isFbConnected = false,
  fbAccount = null,
  fbSettings = {},
  onPublishFbClip,
  onBatchPublishFb,
  isPublishingFb = false,
  fbPublishProgress = 0,
  fbPublishStage = '',
  fbPublishingClipId = null,
  fbPublishedMap = {},
  // Instagram upload integration
  isIgConnected = false,
  igAccount = null,
  igSettings = {},
  onPublishIgClip,
  onBatchPublishIg,
  isPublishingIg = false,
  igPublishProgress = 0,
  igPublishStage = '',
  igPublishingClipId = null,
  igPublishedMap = {},
  // Dual platform FB + IG integration
  onPublishBothClip,
  onBatchPublishBoth,
  isPublishingBoth = false,
  onUnifiedPublish,
  onOpenPublish,
  onPauseBackgroundVideo,
  onResumeBackgroundVideo
}) {
  const [activePreviewClip, setActivePreviewClip] = useState(null);
  const [selectedClipIds, setSelectedClipIds] = useState(new Set());
  const [isZippingSelected, setIsZippingSelected] = useState(false);
  const [zipSelectedProgress, setZipSelectedProgress] = useState(0);

  const canPublishAny = Boolean(isConnected || isFbConnected || isIgConnected);
  const isPublishingAny = Boolean(isPublishingFb || isPublishingIg || isPublishingBoth);

  // Windowed display limit for large clip counts (> 24) to keep DOM lightweight
  const [displayLimit, setDisplayLimit] = useState(24);

  const allIds = useMemo(() => (completedClips || []).map((c) => c.id), [completedClips]);
  const isAllSelected = allIds.length > 0 && allIds.every((id) => selectedClipIds.has(id));

  const toggleSelectAll = useCallback(() => {
    setSelectedClipIds((prev) => {
      if (allIds.length > 0 && allIds.every((id) => prev.has(id))) {
        return new Set();
      }
      return new Set(allIds);
    });
  }, [allIds]);

  const toggleClipSelect = useCallback((id) => {
    setSelectedClipIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectFirstN = useCallback((n) => {
    setSelectedClipIds(new Set((completedClips || []).slice(0, n).map((c) => c.id)));
  }, [completedClips]);

  // Download selected clips as ZIP
  const handleDownloadSelectedZip = async () => {
    const selectedClips = (completedClips || []).filter((c) => selectedClipIds.has(c.id));
    if (selectedClips.length === 0) return;

    setIsZippingSelected(true);
    setZipSelectedProgress(0);

    try {
      await downloadClipsAsZip(selectedClips, `${movieName} - Selected (${selectedClips.length} Clips)`, (pct) => {
        setZipSelectedProgress(pct);
      });
    } catch (err) {
      console.error('ZIP error:', err);
    } finally {
      setIsZippingSelected(false);
      setZipSelectedProgress(0);
    }
  };

  // Batch Facebook Publish for Selected Clips
  const handlePublishSelectedFb = () => {
    const selectedClips = (completedClips || []).filter((c) => selectedClipIds.has(c.id));
    if (selectedClips.length === 0) return;
    if (onBatchPublishFb) {
      onBatchPublishFb(selectedClips);
    }
  };

  // Batch Instagram Publish for Selected Clips
  const handlePublishSelectedIg = () => {
    const selectedClips = (completedClips || []).filter((c) => selectedClipIds.has(c.id));
    if (selectedClips.length === 0) return;
    if (onBatchPublishIg) {
      onBatchPublishIg(selectedClips);
    }
  };

  // Dual platform FB + IG Batch publish selected clips
  const handlePublishSelectedBoth = async () => {
    const selectedClips = (completedClips || []).filter((c) => selectedClipIds.has(c.id));
    if (selectedClips.length > 0 && onBatchPublishBoth) {
      onBatchPublishBoth(selectedClips);
    }
  };

  const selectedCount = selectedClipIds.size;

  // Windowed visible clips for render
  const visibleClips = useMemo(() => {
    return (completedClips || []).slice(0, displayLimit);
  }, [completedClips, displayLimit]);

  const hasMoreClips = (completedClips || []).length > displayLimit;

  if (!completedClips || completedClips.length === 0) {
    return null;
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-5 shadow-lg space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2.5 sm:space-x-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-emerald-500/20 shrink-0">
            <Film className="w-4 h-4 sm:w-5 sm:h-5 text-slate-900" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Generated Video Clips
              </h3>
              <span className="text-xs font-mono font-semibold px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full">
                {completedClips.length} Ready
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              High-definition clips ready to preview, download, schedule to YouTube, and publish to Facebook & Instagram Reels.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:flex sm:items-center gap-2 flex-wrap">
          {/* Download Selected Button */}
          {selectedCount > 0 && (
            <button
              onClick={handleDownloadSelectedZip}
              disabled={isZippingSelected}
              className="px-3.5 py-2 text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 active:scale-98 rounded-xl shadow-md shadow-orange-500/20 flex items-center justify-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50 touch-manipulation"
            >
              <Download className="w-4 h-4" />
              <span>
                {isZippingSelected
                  ? `Zipping (${zipSelectedProgress}%)...`
                  : `Download Selected (${selectedCount})`}
              </span>
            </button>
          )}

          {/* Central Unified Batch Publish / Schedule Selected Button */}
          {selectedCount > 0 && onOpenPublish && (
            <button
              onClick={() => {
                const selectedClips = (completedClips || []).filter((c) => selectedClipIds.has(c.id));
                if (selectedClips.length > 0) {
                  onOpenPublish(selectedClips);
                }
              }}
              disabled={isPublishingAny}
              className="px-3.5 py-2 text-xs font-bold text-white bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:opacity-95 active:scale-98 rounded-xl shadow-md shadow-purple-500/20 flex items-center justify-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50 touch-manipulation"
              title="Publish or schedule selected clips to YouTube, Facebook, or Instagram"
            >
              <Share2 className="w-4 h-4" />
              <span>Publish / Schedule Selected ({selectedCount})</span>
            </button>
          )}

          {/* Download All Button */}
          <button
            onClick={onDownloadAllZip}
            disabled={isZipping}
            className="px-4 py-2 text-xs font-bold text-slate-900 bg-emerald-400 hover:bg-emerald-300 active:scale-98 rounded-xl shadow-md shadow-emerald-500/20 flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-50 touch-manipulation"
          >
            <Archive className="w-4 h-4" />
            <span>{isZipping ? `Creating ZIP (${zipProgress || 0}%)...` : `Download All (${completedClips.length}) ZIP`}</span>
          </button>
        </div>
      </div>

      {/* Selection Toolbar */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-xl px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2.5">
          <button
            onClick={toggleSelectAll}
            className="text-xs text-slate-300 hover:text-white flex items-center space-x-1.5 cursor-pointer font-medium touch-manipulation"
          >
            {isAllSelected ? (
              <CheckSquare className="w-4 h-4 text-orange-400 shrink-0" />
            ) : (
              <Square className="w-4 h-4 text-slate-500 shrink-0" />
            )}
            <span>{isAllSelected ? 'Deselect All' : 'Select All'}</span>
          </button>

          <span className="text-slate-600">•</span>
          <span className="text-xs text-slate-400 font-mono">
            {selectedCount} of {completedClips.length} selected
          </span>
        </div>

        {/* Quick select first N chips */}
        <div className="flex items-center space-x-1 text-xs text-slate-400">
          <span className="text-[10px] text-slate-500 mr-1 hidden xs:inline">Quick:</span>
          {[1, 2, 3, 5].filter((n) => n <= completedClips.length).map((n) => (
            <button
              key={n}
              onClick={() => selectFirstN(n)}
              className="px-2 py-0.5 text-[10px] sm:text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded cursor-pointer touch-manipulation"
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Completed Clips (Rendered using memoized GeneratedClipCard) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
        {visibleClips.map((clip) => {
          const isSelected = selectedClipIds.has(clip.id);
          const uploadState = uploadJobs[clip.id];
          const canUploadYt = isConnected && onUploadClip && (!uploadState || uploadState.status === 'upload_cancelled' || uploadState.status === 'upload_failed') && (clip.blob || clip.outputUrl);
          const canPublishFb = isFbConnected && onPublishFbClip && (clip.blob || clip.outputUrl);
          const canPublishIg = isIgConnected && onPublishIgClip && (clip.blob || clip.outputUrl);
          const isFbPublishing = isPublishingFb && fbPublishingClipId === clip.id;
          const isIgPublishing = isPublishingIg && igPublishingClipId === clip.id;

          return (
            <GeneratedClipCard
              key={clip.id}
              clip={clip}
              isSelected={isSelected}
              uploadState={uploadState}
              fbPublishedUrl={fbPublishedMap[clip.id]}
              igPublishedUrl={igPublishedMap[clip.id]}
              isFbPublishing={isFbPublishing}
              isIgPublishing={isIgPublishing}
              fbPublishProgress={fbPublishProgress}
              igPublishProgress={igPublishProgress}
              canPublishAny={canPublishAny}
              onOpenPublish={onOpenPublish}
              onToggleSelect={toggleClipSelect}
              onPreview={setActivePreviewClip}
              onDownload={onDownloadClip}
              onRetryUpload={onRetryUpload}
            />
          );
        })}
      </div>

      {/* Pagination / Windowed View for 30-min long source videos with 24+ clips */}
      {hasMoreClips && (
        <div className="flex flex-col sm:flex-row items-center justify-between p-3 bg-slate-950/40 border border-slate-800/80 rounded-xl gap-2 text-xs">
          <span className="text-slate-400">
            Showing <strong className="text-white">{visibleClips.length}</strong> of <strong className="text-white">{completedClips.length}</strong> clips
          </span>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setDisplayLimit((prev) => prev + 24)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors cursor-pointer"
            >
              Load More (+24)
            </button>
            <button
              onClick={() => setDisplayLimit(completedClips.length)}
              className="px-3 py-1.5 bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 border border-orange-500/30 rounded-lg font-medium transition-colors cursor-pointer"
            >
              Show All ({completedClips.length})
            </button>
          </div>
        </div>
      )}

      {/* Dedicated Single Reusable Video Preview Player */}
      {activePreviewClip && (
        <GeneratedVideoPlayer
          clip={activePreviewClip}
          allClips={completedClips}
          onSelectClip={setActivePreviewClip}
          onClose={() => {
            setActivePreviewClip(null);
            if (onResumeBackgroundVideo) onResumeBackgroundVideo();
          }}
          onDownload={onDownloadClip}
          onPauseBackgroundVideo={onPauseBackgroundVideo}
          onResumeBackgroundVideo={onResumeBackgroundVideo}
        />
      )}
    </div>
  );
}

export default memo(GeneratedClips);

