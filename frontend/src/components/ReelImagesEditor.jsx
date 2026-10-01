import React, { useRef } from 'react';
import {
  Upload,
  Image as ImageIcon,
  Trash2,
  X,
  Sparkles,
  ArrowUp,
  ArrowDown,
  Palette,
  Check,
  RotateCcw,
  Sliders,
  Eye
} from 'lucide-react';

export default function ReelImagesEditor({
  cropSettings,
  onCropChange,
  className = ''
}) {
  const topInputRef = useRef(null);
  const bottomInputRef = useRef(null);

  const reelImages = cropSettings?.reelImages || {
    top: { url: null, file: null, name: '', fit: 'contain', bgColor: '#000000', opacity: 100 },
    bottom: { url: null, file: null, name: '', fit: 'contain', bgColor: '#000000', opacity: 100 }
  };

  const topImage = reelImages.top || { url: null, fit: 'contain', bgColor: '#000000', opacity: 100 };
  const bottomImage = reelImages.bottom || { url: null, fit: 'contain', bgColor: '#000000', opacity: 100 };

  const updateReelSlot = (slot, updates) => {
    const nextReelImages = {
      ...reelImages,
      [slot]: {
        ...(reelImages[slot] || {}),
        ...updates
      }
    };

    onCropChange({
      ...cropSettings,
      reelImages: nextReelImages
    });
  };

  const handleFileUpload = (slot, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    updateReelSlot(slot, {
      file,
      url,
      name: file.name,
      fit: reelImages[slot]?.fit || 'contain',
      bgColor: reelImages[slot]?.bgColor || '#000000',
      opacity: reelImages[slot]?.opacity ?? 100
    });

    // Auto-switch to fit mode if currently in zoom fill so images are visible
    if (cropSettings?.fillMode === 'fill') {
      onCropChange({
        ...cropSettings,
        fillMode: 'fit',
        reelImages: {
          ...reelImages,
          [slot]: {
            ...(reelImages[slot] || {}),
            file,
            url,
            name: file.name
          }
        }
      });
    }

    // Reset input so same file can be re-uploaded if replaced
    e.target.value = '';
  };

  const handleRemove = (slot) => {
    if (reelImages[slot]?.url) {
      try {
        URL.revokeObjectURL(reelImages[slot].url);
      } catch (err) {}
    }

    updateReelSlot(slot, {
      file: null,
      url: null,
      name: ''
    });
  };

  const handleClearBoth = () => {
    if (topImage.url) {
      try { URL.revokeObjectURL(topImage.url); } catch (e) {}
    }
    if (bottomImage.url) {
      try { URL.revokeObjectURL(bottomImage.url); } catch (e) {}
    }

    onCropChange({
      ...cropSettings,
      reelImages: {
        top: { ...topImage, file: null, url: null, name: '' },
        bottom: { ...bottomImage, file: null, url: null, name: '' }
      }
    });
  };

  const hasAnyImage = Boolean(topImage.url || bottomImage.url);

  return (
    <div className={`space-y-4 bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 sm:p-4 ${className}`}>
      {/* Hidden File Inputs */}
      <input
        ref={topInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => handleFileUpload('top', e)}
        className="hidden"
      />
      <input
        ref={bottomInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => handleFileUpload('bottom', e)}
        className="hidden"
      />

      {/* Header with Title and Clear Both */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-800/80 gap-2">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center shrink-0">
            <ImageIcon className="w-4 h-4 text-orange-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <h4 className="text-xs sm:text-sm font-bold text-white truncate">
                Reel Cover Images (Top &amp; Bottom)
              </h4>
              {hasAnyImage && (
                <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded font-mono font-bold shrink-0">
                  ACTIVE
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              Fill empty space above and below your 16:9 video in 9:16 Reels
            </p>
          </div>
        </div>

        {hasAnyImage && (
          <button
            onClick={handleClearBoth}
            className="text-[11px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-2 py-1 rounded-md transition-colors flex items-center space-x-1 shrink-0 cursor-pointer"
            title="Remove both top and bottom images"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Clear Both</span>
          </button>
        )}
      </div>

      {/* Notice if in Fill Mode */}
      {cropSettings?.fillMode === 'fill' && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 text-xs text-amber-300 flex items-center justify-between gap-2">
          <span className="text-[11px]">
            ⚡ Top &amp; bottom images show when display style is set to <strong>Full Horizontal (Fit)</strong>.
          </span>
          <button
            onClick={() => onCropChange({ ...cropSettings, fillMode: 'fit' })}
            className="px-2 py-1 bg-amber-500 text-slate-950 font-bold rounded text-[10px] uppercase shrink-0 hover:bg-amber-400"
          >
            Switch to Fit
          </button>
        </div>
      )}

      {/* ── 1. TOP IMAGE (ABOVE VIDEO) ── */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 sm:p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="p-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <ArrowUp className="w-3.5 h-3.5" />
            </span>
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">
              Top Image (Above Video)
            </span>
          </div>
          {topImage.url && (
            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
              ✓ Loaded
            </span>
          )}
        </div>

        {topImage.url ? (
          <div className="space-y-3">
            {/* Image Preview & Actions */}
            <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-slate-800 gap-2">
              <div className="flex items-center space-x-2.5 min-w-0">
                <img
                  src={topImage.url}
                  alt="Top Banner Preview"
                  className="w-12 h-12 rounded object-contain bg-black border border-slate-700 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate max-w-[140px] sm:max-w-xs">
                    {topImage.name || 'Top Banner Image'}
                  </p>
                  <p className="text-[10px] text-slate-400">Position: Above video frame</p>
                </div>
              </div>

              <div className="flex items-center space-x-1.5 shrink-0">
                <button
                  onClick={() => topInputRef.current?.click()}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition-colors cursor-pointer"
                >
                  Change
                </button>
                <button
                  onClick={() => handleRemove('top')}
                  className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded cursor-pointer"
                  title="Remove Top Image"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Fit Mode Toggle */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>Display &amp; Fit Style:</span>
                <span className="font-mono text-amber-400 font-bold">
                  {topImage.fit === 'contain' ? 'Fit (No Crop)' : topImage.fit === 'cover' ? 'Fill Area' : 'Stretch'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => updateReelSlot('top', { fit: 'contain' })}
                  className={`py-1.5 px-2 rounded text-[11px] font-medium border text-center transition-all cursor-pointer ${
                    (topImage.fit || 'contain') === 'contain'
                      ? 'bg-orange-500 text-white border-orange-500 shadow-sm font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                  title="Preserves 100% of the image without any cropping"
                >
                  Fit (No Crop)
                </button>
                <button
                  type="button"
                  onClick={() => updateReelSlot('top', { fit: 'cover' })}
                  className={`py-1.5 px-2 rounded text-[11px] font-medium border text-center transition-all cursor-pointer ${
                    topImage.fit === 'cover'
                      ? 'bg-orange-500 text-white border-orange-500 shadow-sm font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                  title="Fills the entire top slot edge-to-edge"
                >
                  Fill Area
                </button>
                <button
                  type="button"
                  onClick={() => updateReelSlot('top', { fit: 'fill' })}
                  className={`py-1.5 px-2 rounded text-[11px] font-medium border text-center transition-all cursor-pointer ${
                    topImage.fit === 'fill'
                      ? 'bg-orange-500 text-white border-orange-500 shadow-sm font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                  title="Stretches to fill slot dimensions"
                >
                  Stretch
                </button>
              </div>
            </div>

            {/* Opacity Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Opacity</span>
                <span className="font-mono text-amber-400">{topImage.opacity ?? 100}%</span>
              </div>
              <input
                type="range"
                min="20"
                max="100"
                value={topImage.opacity ?? 100}
                onChange={(e) => updateReelSlot('top', { opacity: parseInt(e.target.value) })}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
            </div>
          </div>
        ) : (
          <div
            onClick={() => topInputRef.current?.click()}
            className="border-2 border-dashed border-slate-700 hover:border-orange-500 bg-slate-950/60 p-4 rounded-xl text-center cursor-pointer transition-all hover:bg-slate-950 group"
          >
            <Upload className="w-5 h-5 text-slate-400 group-hover:text-orange-400 mx-auto mb-1 transition-colors" />
            <p className="text-xs font-semibold text-white">Click to Upload Image Above Video</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Title card, banner, meme, or header poster</p>
          </div>
        )}
      </div>

      {/* ── 2. BOTTOM IMAGE (BELOW VIDEO) ── */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 sm:p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="p-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <ArrowDown className="w-3.5 h-3.5" />
            </span>
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">
              Bottom Image (Below Video)
            </span>
          </div>
          {bottomImage.url && (
            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
              ✓ Loaded
            </span>
          )}
        </div>

        {bottomImage.url ? (
          <div className="space-y-3">
            {/* Image Preview & Actions */}
            <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-slate-800 gap-2">
              <div className="flex items-center space-x-2.5 min-w-0">
                <img
                  src={bottomImage.url}
                  alt="Bottom Banner Preview"
                  className="w-12 h-12 rounded object-contain bg-black border border-slate-700 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate max-w-[140px] sm:max-w-xs">
                    {bottomImage.name || 'Bottom Banner Image'}
                  </p>
                  <p className="text-[10px] text-slate-400">Position: Below video frame</p>
                </div>
              </div>

              <div className="flex items-center space-x-1.5 shrink-0">
                <button
                  onClick={() => bottomInputRef.current?.click()}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition-colors cursor-pointer"
                >
                  Change
                </button>
                <button
                  onClick={() => handleRemove('bottom')}
                  className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded cursor-pointer"
                  title="Remove Bottom Image"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Fit Mode Toggle */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>Display &amp; Fit Style:</span>
                <span className="font-mono text-amber-400 font-bold">
                  {bottomImage.fit === 'contain' ? 'Fit (No Crop)' : bottomImage.fit === 'cover' ? 'Fill Area' : 'Stretch'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => updateReelSlot('bottom', { fit: 'contain' })}
                  className={`py-1.5 px-2 rounded text-[11px] font-medium border text-center transition-all cursor-pointer ${
                    (bottomImage.fit || 'contain') === 'contain'
                      ? 'bg-orange-500 text-white border-orange-500 shadow-sm font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                  title="Preserves 100% of the image without any cropping"
                >
                  Fit (No Crop)
                </button>
                <button
                  type="button"
                  onClick={() => updateReelSlot('bottom', { fit: 'cover' })}
                  className={`py-1.5 px-2 rounded text-[11px] font-medium border text-center transition-all cursor-pointer ${
                    bottomImage.fit === 'cover'
                      ? 'bg-orange-500 text-white border-orange-500 shadow-sm font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                  title="Fills the entire bottom slot edge-to-edge"
                >
                  Fill Area
                </button>
                <button
                  type="button"
                  onClick={() => updateReelSlot('bottom', { fit: 'fill' })}
                  className={`py-1.5 px-2 rounded text-[11px] font-medium border text-center transition-all cursor-pointer ${
                    bottomImage.fit === 'fill'
                      ? 'bg-orange-500 text-white border-orange-500 shadow-sm font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                  title="Stretches to fill slot dimensions"
                >
                  Stretch
                </button>
              </div>
            </div>

            {/* Opacity Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Opacity</span>
                <span className="font-mono text-amber-400">{bottomImage.opacity ?? 100}%</span>
              </div>
              <input
                type="range"
                min="20"
                max="100"
                value={bottomImage.opacity ?? 100}
                onChange={(e) => updateReelSlot('bottom', { opacity: parseInt(e.target.value) })}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
            </div>
          </div>
        ) : (
          <div
            onClick={() => bottomInputRef.current?.click()}
            className="border-2 border-dashed border-slate-700 hover:border-orange-500 bg-slate-950/60 p-4 rounded-xl text-center cursor-pointer transition-all hover:bg-slate-950 group"
          >
            <Upload className="w-5 h-5 text-slate-400 group-hover:text-orange-400 mx-auto mb-1 transition-colors" />
            <p className="text-xs font-semibold text-white">Click to Upload Image Below Video</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Call-to-action banner, follow prompt, or footer</p>
          </div>
        )}
      </div>

      {/* Helpful Tip */}
      <div className="flex items-start space-x-2 text-[11px] text-slate-400 bg-slate-900/50 p-2.5 rounded-lg border border-slate-800/60">
        <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
        <p className="leading-snug">
          With <strong className="text-slate-200">Fit (No Crop)</strong> selected, your images automatically scale to fit the top and bottom areas without clipping any edges or text.
        </p>
      </div>
    </div>
  );
}
