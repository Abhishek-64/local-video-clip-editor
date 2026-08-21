import React, { useState } from 'react';
import { Film, Download, Archive, CheckCircle2, Eye, X, CheckSquare, Square, Filter, Youtube, ExternalLink, Upload, RotateCcw, Calendar } from 'lucide-react';
import { formatTime } from '../utils/time';
import { downloadClipsAsZip } from '../services/zipService';

export default function GeneratedClips({
  completedClips,
  onDownloadClip,
  onDownloadAllZip,
  isZipping,
  zipProgress,
  movieName = 'Movie',
  // YouTube upload integration (optional — all existing features work without these)
  uploadJobs = {},
  onUploadClip,
  onRetryUpload,
  isConnected = false
}) {
  const [activePreviewClip, setActivePreviewClip] = useState(null);
  const [selectedClipIds, setSelectedClipIds] = useState(new Set());
  const [isZippingSelected, setIsZippingSelected] = useState(false);
  const [zipSelectedProgress, setZipSelectedProgress] = useState(0);

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
          <span className="inline-flex items-center space-x-1 text-[10px] bg-blue-500/15 text-blue-400 border border-blue-500/25 px-1.5 py-0.5 rounded-full animate-pulse">
            <Upload className="w-2.5 h-2.5" />
            <span>⬆ {state.progress || 0}%</span>
          </span>
        );
      case 'uploaded':
        return (
          <a
            href={state.videoId ? `https://www.youtube.com/watch?v=${state.videoId}` : undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center space-x-1 text-[10px] bg-red-500/15 text-red-400 border border-red-500/25 px-1.5 py-0.5 rounded-full hover:bg-red-500/25 transition-colors"
          >
            <Youtube className="w-2.5 h-2.5" />
            <span>✓ Uploaded</span>
          </a>
        );
      case 'scheduled':
        return (
          <span className="inline-flex items-center space-x-1 text-[10px] bg-purple-500/15 text-purple-400 border border-purple-500/25 px-1.5 py-0.5 rounded-full">
            <Calendar className="w-2.5 h-2.5" />
            <span>Scheduled</span>
          </span>
        );
      case 'upload_failed':
        return (
          <span className="inline-flex items-center space-x-1 text-[10px] bg-rose-500/15 text-rose-400 border border-rose-500/25 px-1.5 py-0.5 rounded-full">
            <span>Upload Failed</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-5 shadow-lg space-y-4">
      {/* Header & Quick Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <Film className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <h3 className="font-semibold text-xs sm:text-sm text-white">
              Generated Clips ({completedClips.length})
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-400">
              Download individual clips or download all as a ZIP archive
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:flex sm:items-center gap-2">
          {/* Download Selected Button */}
          {selectedCount > 0 && (
            <button
              onClick={handleDownloadSelectedZip}
              disabled={isZippingSelected}
              className="px-3.5 py-2.5 sm:py-2 text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 active:scale-98 rounded-xl shadow-md shadow-orange-500/20 flex items-center justify-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50 touch-manipulation"
            >
              <Download className="w-4 h-4" />
              <span>
                {isZippingSelected
                  ? `Zipping (${zipSelectedProgress}%)...`
                  : `Download Selected (${selectedCount})`}
              </span>
            </button>
          )}

          {/* Download All Button */}
          <button
            onClick={onDownloadAllZip}
            disabled={isZipping}
            className="px-4 py-2.5 sm:py-2 text-xs font-bold text-slate-900 bg-emerald-400 hover:bg-emerald-300 active:scale-98 rounded-xl shadow-md shadow-emerald-500/20 flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-50 touch-manipulation"
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

          <span className="text-slate-600">&bull;</span>
          <span className="text-xs text-slate-400 font-mono">
            {selectedCount} of {completedClips.length}
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
          const canUpload = isConnected && onUploadClip && !uploadState && clip.blob;
          const uploadFailed = uploadState?.status === 'upload_failed';

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
                  <div className="flex items-center space-x-1.5 shrink-0">
                    {getYouTubeChip(clip)}
                    <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 rounded shrink-0">
                      {clip.format ? clip.format.toUpperCase() : 'MP4'}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 font-mono mt-1 pl-6">
                  <span>{formatTime(clip.startTime)} &rarr; {formatTime(clip.endTime)}</span>
                  <span className="mx-1.5">&bull;</span>
                  <span>{formatTime(clip.endTime - clip.startTime)}</span>
                </div>

                {/* Upload progress bar */}
                {uploadState?.status === 'uploading' && uploadState.progress != null && (
                  <div className="w-full bg-slate-800 h-1 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-red-500 to-orange-400 h-full rounded-full transition-all duration-300"
                      style={{ width: `${uploadState.progress}%` }}
                    />
                  </div>
                )}
              </div>

              <div
                className="flex items-center space-x-2 pt-2 border-t border-slate-900 flex-wrap gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                {clip.outputUrl && (
                  <button
                    onClick={() => setActivePreviewClip(clip)}
                    className="flex-1 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg flex items-center justify-center space-x-1.5 transition-colors cursor-pointer touch-manipulation"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview</span>
                  </button>
                )}

                <button
                  onClick={() => onDownloadClip(clip)}
                  className="flex-1 py-1.5 text-xs font-semibold text-emerald-300 bg-emerald-950/50 hover:bg-emerald-900/70 border border-emerald-500/30 rounded-lg flex items-center justify-center space-x-1.5 transition-colors cursor-pointer touch-manipulation"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>

                {/* Upload to YouTube */}
                {canUpload && (
                  <button
                    onClick={() => onUploadClip(clip)}
                    className="flex-1 py-1.5 text-xs font-semibold text-red-300 bg-red-950/50 hover:bg-red-900/70 border border-red-500/30 rounded-lg flex items-center justify-center space-x-1.5 transition-colors cursor-pointer touch-manipulation"
                  >
                    <Youtube className="w-3.5 h-3.5" />
                    <span>Upload</span>
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

      {/* Modal Preview */}
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

            <div className="flex justify-end pt-1">
              <button
                onClick={() => {
                  onDownloadClip(activePreviewClip);
                  setActivePreviewClip(null);
                }}
                className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 active:scale-98 rounded-xl flex items-center justify-center space-x-1.5 cursor-pointer touch-manipulation"
              >
                <Download className="w-4 h-4" />
                <span>Download Clip</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
