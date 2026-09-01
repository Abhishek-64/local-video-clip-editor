import React, { useState } from 'react';
import {
  Film, Download, Archive, CheckCircle2, Eye, X, CheckSquare, Square, Filter,
  Youtube, ExternalLink, Upload, RotateCcw, Calendar, Clock, Sparkles, Share2,
  RefreshCw, Instagram, Zap
} from 'lucide-react';
import { formatTime } from '../utils/time';
import { formatScheduledDateTime } from '../utils/scheduler';
import { downloadClipsAsZip } from '../services/zipService';
import YouTubeScheduleModal from './YouTubeScheduleModal';

export default function GeneratedClips({
  completedClips,
  onDownloadClip,
  onDownloadAllZip,
  isZipping,
  zipProgress,
  movieName = 'Movie',
  youtubeName,
  // YouTube upload integration
  uploadJobs = {},
  onUploadClip,
  onRetryUpload,
  isConnected = false,
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
  isPublishingBoth = false
}) {
  const [activePreviewClip, setActivePreviewClip] = useState(null);
  const [selectedClipIds, setSelectedClipIds] = useState(new Set());
  const [isZippingSelected, setIsZippingSelected] = useState(false);
  const [zipSelectedProgress, setZipSelectedProgress] = useState(0);

  // YouTube Schedule Modal State
  const [scheduleModalClip, setScheduleModalClip] = useState(null);

  if (completedClips.length === 0) {
    return null;
  }

  const allIds = completedClips.map((c) => c.id);
  const isAllSelected = allIds.length > 0 && allIds.every((id) => selectedClipIds.has(id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedClipIds(new Set());
    } else {
      setSelectedClipIds(new Set(allIds));
    }
  };

  const toggleClipSelect = (id) => {
    const next = new Set(selectedClipIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedClipIds(next);
  };

  const selectFirstN = (n) => {
    const selected = new Set(completedClips.slice(0, n).map((c) => c.id));
    setSelectedClipIds(selected);
  };

  // Download selected clips as ZIP
  const handleDownloadSelectedZip = async () => {
    const selectedClips = completedClips.filter((c) => selectedClipIds.has(c.id));
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
    const selectedClips = completedClips.filter((c) => selectedClipIds.has(c.id));
    if (selectedClips.length === 0) return;
    if (onBatchPublishFb) {
      onBatchPublishFb(selectedClips);
    }
  };

  // Batch Instagram Publish for Selected Clips
  const handlePublishSelectedIg = () => {
    const selectedClips = completedClips.filter((c) => selectedClipIds.has(c.id));
    if (selectedClips.length === 0) return;
    if (onBatchPublishIg) {
      onBatchPublishIg(selectedClips);
    }
  };

  // Dual platform FB + IG Batch publish selected clips
  const handlePublishSelectedBoth = async () => {
    const selectedClips = completedClips.filter((c) => selectedClipIds.has(c.id));
    if (selectedClips.length > 0 && onBatchPublishBoth) {
      onBatchPublishBoth(selectedClips);
    }
  };

  const selectedCount = selectedClipIds.size;

  // Helper: get YouTube upload chip for a clip
  const getYouTubeChip = (clip) => {
    const state = uploadJobs[clip.id];
    if (!state) return null;

    switch (state.status) {
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
            <span>{state.progress || 0}%</span>
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
            <span>{state.scheduledAt ? formatScheduledDateTime(state.scheduledAt) : 'Scheduled'}</span>
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
  };

  // Helper: get Facebook Reel published chip
  const getFacebookChip = (clip) => {
    const isCurrentlyPublishing = isPublishingFb && fbPublishingClipId === clip.id;
    if (isCurrentlyPublishing) {
      return (
        <span className="inline-flex items-center space-x-1 text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded-full animate-pulse font-semibold">
          <RefreshCw className="w-2.5 h-2.5 animate-spin text-blue-400" />
          <span>Publishing...</span>
        </span>
      );
    }

    const reelUrl = fbPublishedMap[clip.id];
    if (reelUrl) {
      return (
        <a
          href={reelUrl}
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
  };

  // Helper: get Instagram Reel published chip
  const getInstagramChip = (clip) => {
    const isCurrentlyPublishing = isPublishingIg && igPublishingClipId === clip.id;
    if (isCurrentlyPublishing) {
      return (
        <span className="inline-flex items-center space-x-1 text-[10px] bg-pink-500/20 text-pink-300 border border-pink-500/30 px-1.5 py-0.5 rounded-full animate-pulse font-semibold">
          <RefreshCw className="w-2.5 h-2.5 animate-spin text-pink-400" />
          <span>IG Reel...</span>
        </span>
      );
    }

    const reelUrl = igPublishedMap[clip.id];
    if (reelUrl) {
      return (
        <a
          href={reelUrl}
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
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-5 shadow-lg space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2.5 sm:space-x-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-emerald-500/20 shrink-0">
            <Film className="w-4 h-4 sm:w-5 sm:h-5 text-slate-900" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center space-x-2">
              <span>Generated Video Clips</span>
              <span className="text-xs font-mono font-semibold px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full">
                {completedClips.length} {completedClips.length === 1 ? 'Ready' : 'Ready'}
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              High-definition clips ready to download, schedule to YouTube, and publish to Facebook & Instagram Reels.
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

          {/* Dual FB + IG Batch Publish Selected Button */}
          {selectedCount > 0 && isFbConnected && isIgConnected && onBatchPublishBoth && (
            <button
              onClick={handlePublishSelectedBoth}
              disabled={isPublishingFb || isPublishingIg || isPublishingBoth}
              className="px-3.5 py-2 text-xs font-bold text-white bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:opacity-95 active:scale-98 rounded-xl shadow-md shadow-purple-500/20 flex items-center justify-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50 touch-manipulation"
              title="Publish selected clips to both Facebook & Instagram"
            >
              <Zap className="w-4 h-4 text-amber-300 fill-current" />
              <span>⚡ Both FB + IG ({selectedCount})</span>
            </button>
          )}

          {/* Facebook Batch Publish Selected Button */}
          {selectedCount > 0 && isFbConnected && onBatchPublishFb && (
            <button
              onClick={handlePublishSelectedFb}
              disabled={isPublishingFb || isPublishingBoth}
              className="px-3.5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 active:scale-98 rounded-xl shadow-md shadow-blue-500/20 flex items-center justify-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50 touch-manipulation"
            >
              <Share2 className="w-4 h-4" />
              <span>Facebook ({selectedCount})</span>
            </button>
          )}

          {/* Instagram Batch Publish Selected Button */}
          {selectedCount > 0 && isIgConnected && onBatchPublishIg && (
            <button
              onClick={handlePublishSelectedIg}
              disabled={isPublishingIg || isPublishingBoth}
              className="px-3.5 py-2 text-xs font-bold text-white bg-gradient-to-r from-pink-500 via-rose-500 to-purple-600 hover:opacity-95 active:scale-98 rounded-xl shadow-md shadow-pink-500/20 flex items-center justify-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50 touch-manipulation"
            >
              <Instagram className="w-4 h-4" />
              <span>Instagram ({selectedCount})</span>
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

      {/* Grid of Completed Clips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
        {completedClips.map((clip) => {
          const isSelected = selectedClipIds.has(clip.id);
          const uploadState = uploadJobs[clip.id];
          const canUploadYt = isConnected && onUploadClip && (!uploadState || uploadState.status === 'upload_cancelled' || uploadState.status === 'upload_failed') && clip.blob;
          const uploadFailed = uploadState?.status === 'upload_failed';
          const canPublishFb = isFbConnected && onPublishFbClip && clip.blob;
          const canPublishIg = isIgConnected && onPublishIgClip && clip.blob;

          return (
            <div
              key={clip.id}
              onClick={() => toggleClipSelect(clip.id)}
              className={`border rounded-xl p-3 sm:p-3.5 flex flex-col justify-between space-y-2.5 sm:space-y-3 transition-all cursor-pointer touch-manipulation ${
                isSelected
                  ? 'bg-orange-500/5 border-orange-500/60 ring-1 ring-orange-500/30'
                  : 'bg-slate-950 border-slate-800/90 hover:border-slate-700'
              }`}
            >
              <div>
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
                    {getYouTubeChip(clip)}
                    {getFacebookChip(clip)}
                    {getInstagramChip(clip)}
                  </div>
                </div>

                <div className="flex items-center space-x-2 text-[11px] text-slate-400 font-mono mt-1">
                  <span>{formatTime(clip.duration)}</span>
                  <span>•</span>
                  <span>{clip.size ? `${(clip.size / (1024 * 1024)).toFixed(1)} MB` : '1080p'}</span>
                </div>

                {uploadState && uploadState.status === 'uploading' && (
                  <div className="w-full bg-slate-800 h-1 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-red-500 h-full transition-all duration-300"
                      style={{ width: `${uploadState.progress}%` }}
                    />
                  </div>
                )}
              </div>

              <div
                className="flex items-center space-x-1.5 pt-2 border-t border-slate-900 flex-wrap gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                {clip.outputUrl && (
                  <button
                    onClick={() => setActivePreviewClip(clip)}
                    className="flex-1 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg flex items-center justify-center space-x-1 transition-colors cursor-pointer touch-manipulation"
                    title="Preview clip"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View</span>
                  </button>
                )}

                <button
                  onClick={() => onDownloadClip(clip)}
                  className="flex-1 py-1.5 text-xs font-semibold text-emerald-300 bg-emerald-950/50 hover:bg-emerald-900/70 border border-emerald-500/30 rounded-lg flex items-center justify-center space-x-1 transition-colors cursor-pointer touch-manipulation"
                  title="Download MP4"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>

                {/* Schedule & Upload to YouTube */}
                {canUploadYt && (
                  <button
                    onClick={() => setScheduleModalClip(clip)}
                    className="flex-1 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 border border-red-500/40 rounded-lg flex items-center justify-center space-x-1 transition-all cursor-pointer touch-manipulation shadow-sm shadow-red-500/20"
                    title="Upload / Schedule to YouTube Shorts"
                  >
                    <Youtube className="w-3.5 h-3.5" />
                    <span>YouTube</span>
                  </button>
                )}

                {/* Publish to Facebook & Instagram Reels (Dual) */}
                {canPublishFb && canPublishIg && onPublishBothClip && (
                  <button
                    onClick={() => onPublishBothClip(clip)}
                    disabled={isPublishingFb || isPublishingIg || isPublishingBoth}
                    className="flex-1 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:opacity-95 border border-purple-500/40 rounded-lg flex items-center justify-center space-x-1 transition-all cursor-pointer touch-manipulation shadow-sm shadow-purple-500/20 disabled:opacity-50"
                    title="Publish to both Facebook and Instagram Reels (Single B2 Upload)"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-300 fill-current" />
                    <span>⚡ Both</span>
                  </button>
                )}

                {/* Publish to Facebook Reels */}
                {canPublishFb && (
                  <button
                    onClick={() => onPublishFbClip(clip)}
                    disabled={isPublishingFb || isPublishingBoth}
                    className="flex-1 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 border border-blue-500/40 rounded-lg flex items-center justify-center space-x-1 transition-all cursor-pointer touch-manipulation shadow-sm shadow-blue-500/20 disabled:opacity-50"
                    title="Publish directly to Facebook Reels"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Facebook</span>
                  </button>
                )}

                {/* Publish to Instagram Reels */}
                {canPublishIg && (
                  <button
                    onClick={() => onPublishIgClip(clip)}
                    disabled={isPublishingIg || isPublishingBoth}
                    className="flex-1 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-pink-500 via-rose-500 to-purple-600 hover:opacity-95 border border-pink-500/40 rounded-lg flex items-center justify-center space-x-1 transition-all cursor-pointer touch-manipulation shadow-sm shadow-pink-500/20 disabled:opacity-50"
                    title="Publish directly to Instagram Reels"
                  >
                    <Instagram className="w-3.5 h-3.5" />
                    <span>Instagram</span>
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
        })}
      </div>

      {/* Modal Video Preview */}
      {activePreviewClip && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-3.5 sm:p-4 space-y-3 shadow-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="font-bold text-xs sm:text-sm text-white truncate max-w-[200px] sm:max-w-md">{activePreviewClip.name}</span>
              <button
                onClick={() => setActivePreviewClip(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer touch-manipulation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-black rounded-xl overflow-hidden flex items-center justify-center flex-1 min-h-0">
              <video
                src={activePreviewClip.outputUrl}
                controls
                autoPlay
                className="max-h-[60vh] w-auto object-contain"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => onDownloadClip(activePreviewClip)}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors cursor-pointer touch-manipulation flex items-center space-x-1.5"
              >
                <Download className="w-4 h-4" />
                <span>Download MP4</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* YouTube Schedule Modal */}
      {scheduleModalClip && (
        <YouTubeScheduleModal
          key={scheduleModalClip.id}
          isOpen={Boolean(scheduleModalClip)}
          onClose={() => setScheduleModalClip(null)}
          clip={scheduleModalClip}
          movieName={youtubeName || movieName}
          ytSettings={ytSettings}
          onConfirmUpload={(clipToUpload, scheduleData) => {
            if (onUploadClip) {
              onUploadClip(clipToUpload, scheduleData);
            }
            setScheduleModalClip(null);
          }}
          onUpload={(clipToUpload, scheduleData) => {
            if (onUploadClip) {
              onUploadClip(clipToUpload, scheduleData);
            }
            setScheduleModalClip(null);
          }}
        />
      )}
    </div>
  );
}
