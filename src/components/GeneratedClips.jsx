import React, { useState } from 'react';
import { Film, Download, Archive, CheckCircle2, Eye, X, CheckSquare, Square, Filter } from 'lucide-react';
import { formatTime } from '../utils/time';
import { downloadClipsAsZip } from '../services/zipService';

export default function GeneratedClips({
  completedClips,
  onDownloadClip,
  onDownloadAllZip,
  isZipping,
  zipProgress,
  movieName = 'Movie'
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

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
      {/* Header & Quick Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <Film className="w-5 h-5 text-emerald-400" />
          <div>
            <h3 className="font-semibold text-sm text-white">
              Generated Clips ({completedClips.length})
            </h3>
            <p className="text-xs text-slate-400">
              Select which parts you want to download or download all as a ZIP
            </p>
          </div>
        </div>

        {/* Top Buttons */}
        <div className="flex items-center space-x-2 flex-wrap gap-2">
          {/* Download Selected Button */}
          {selectedCount > 0 && (
            <button
              onClick={handleDownloadSelectedZip}
              disabled={isZippingSelected}
              className="px-3.5 py-2 text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-xl shadow-md shadow-orange-500/20 flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
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
            className="px-4 py-2 text-xs font-bold text-slate-900 bg-emerald-400 hover:bg-emerald-300 rounded-xl shadow-md shadow-emerald-500/20 flex items-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
          >
            <Archive className="w-4 h-4" />
            <span>{isZipping ? `Creating ZIP (${zipProgress || 0}%)...` : `Download All (${completedClips.length}) as ZIP`}</span>
          </button>
        </div>
      </div>

      {/* Selection Toolbar */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <button
            onClick={toggleSelectAll}
            className="text-xs text-slate-300 hover:text-white flex items-center space-x-1.5 cursor-pointer font-medium"
          >
            {isAllSelected ? (
              <CheckSquare className="w-4 h-4 text-orange-400" />
            ) : (
              <Square className="w-4 h-4 text-slate-500" />
            )}
            <span>{isAllSelected ? 'Deselect All' : 'Select All Parts'}</span>
          </button>

          <span className="text-slate-600">&bull;</span>
          <span className="text-xs text-slate-400 font-mono">
            {selectedCount} of {completedClips.length} selected
          </span>
        </div>

        {/* Quick select first N chips */}
        <div className="flex items-center space-x-1.5 text-xs text-slate-400">
          <span className="text-[11px] text-slate-500">Quick select:</span>
          {[1, 2, 3, 5].filter((n) => n <= completedClips.length).map((n) => (
            <button
              key={n}
              onClick={() => selectFirstN(n)}
              className="px-2 py-0.5 text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded cursor-pointer"
            >
              First {n}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Completed Clips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {completedClips.map((clip) => {
          const isSelected = selectedClipIds.has(clip.id);

          return (
            <div
              key={clip.id}
              onClick={() => toggleClipSelect(clip.id)}
              className={`border rounded-xl p-3.5 flex flex-col justify-between space-y-3 transition-all cursor-pointer ${
                isSelected
                  ? 'bg-orange-500/5 border-orange-500/60 ring-1 ring-orange-500/30'
                  : 'bg-slate-950 border-slate-800/90 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}} // Handled by card click
                      className="rounded bg-slate-900 border-slate-700 text-orange-500 pointer-events-none"
                    />
                    <span className="text-xs font-bold text-white truncate max-w-[150px]">
                      {clip.name}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 rounded shrink-0">
                    {clip.format ? clip.format.toUpperCase() : 'MP4'}
                  </span>
                </div>

                <div className="text-[11px] text-slate-400 font-mono mt-1 pl-6">
                  <span>{formatTime(clip.startTime)} &rarr; {formatTime(clip.endTime)}</span>
                  <span className="mx-1.5">&bull;</span>
                  <span>{formatTime(clip.endTime - clip.startTime)}</span>
                </div>
              </div>

              <div
                className="flex items-center space-x-2 pt-2 border-t border-slate-900"
                onClick={(e) => e.stopPropagation()}
              >
                {clip.outputUrl && (
                  <button
                    onClick={() => setActivePreviewClip(clip)}
                    className="flex-1 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview</span>
                  </button>
                )}

                <button
                  onClick={() => onDownloadClip(clip)}
                  className="flex-1 py-1.5 text-xs font-semibold text-emerald-300 bg-emerald-950/50 hover:bg-emerald-900/70 border border-emerald-500/30 rounded-lg flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Preview */}
      {activePreviewClip && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="font-bold text-sm text-white">{activePreviewClip.name}</span>
              <button
                onClick={() => setActivePreviewClip(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-black rounded-xl overflow-hidden flex items-center justify-center max-h-96">
              <video
                src={activePreviewClip.outputUrl}
                controls
                autoPlay
                className="max-h-96 w-auto object-contain"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => {
                  onDownloadClip(activePreviewClip);
                  setActivePreviewClip(null);
                }}
                className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl flex items-center space-x-1.5 cursor-pointer"
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
