import React, { useRef } from 'react';
import {
  Image as ImageIcon,
  Upload,
  Sparkles,
  X,
  Sliders,
  SunMedium,
  Layers,
  ArrowUp,
  ArrowDown,
  Trash2,
  Tv,
  Check,
  Smartphone,
  Eye,
  Maximize2
} from 'lucide-react';

export default function BackgroundEditor({
  bgSettings,
  onChange,
  cropSettings,
  onCropChange
}) {
  const fileInputRef = useRef(null);
  const topFileInputRef = useRef(null);
  const bottomFileInputRef = useRef(null);

  const updateBg = (key, value) => {
    onChange({
      ...bgSettings,
      [key]: value
    });
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    onChange({
      ...bgSettings,
      imageFile: file,
      imageUrl: url,
      type: 'image'
    });
  };

  const handleRemoveImage = () => {
    if (bgSettings?.imageUrl) {
      try {
        URL.revokeObjectURL(bgSettings.imageUrl);
      } catch (err) {}
    }
    onChange({
      ...bgSettings,
      imageFile: null,
      imageUrl: null,
      type: 'blur-video'
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Top Banner Image (Above Video) Handlers ──
  const handleTopImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (bgSettings?.topImageUrl) {
      try { URL.revokeObjectURL(bgSettings.topImageUrl); } catch (err) {}
    }

    const url = URL.createObjectURL(file);
    onChange({
      ...bgSettings,
      topImageFile: file,
      topImageUrl: url,
      topImageFit: bgSettings?.topImageFit || 'cover'
    });
  };

  const handleRemoveTopImage = () => {
    if (bgSettings?.topImageUrl) {
      try { URL.revokeObjectURL(bgSettings.topImageUrl); } catch (err) {}
    }
    onChange({
      ...bgSettings,
      topImageFile: null,
      topImageUrl: null
    });
    if (topFileInputRef.current) topFileInputRef.current.value = '';
  };

  // ── Bottom Banner Image (Below Video) Handlers ──
  const handleBottomImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (bgSettings?.bottomImageUrl) {
      try { URL.revokeObjectURL(bgSettings.bottomImageUrl); } catch (err) {}
    }

    const url = URL.createObjectURL(file);
    onChange({
      ...bgSettings,
      bottomImageFile: file,
      bottomImageUrl: url,
      bottomImageFit: bgSettings?.bottomImageFit || 'cover'
    });
  };

  const handleRemoveBottomImage = () => {
    if (bgSettings?.bottomImageUrl) {
      try { URL.revokeObjectURL(bgSettings.bottomImageUrl); } catch (err) {}
    }
    onChange({
      ...bgSettings,
      bottomImageFile: null,
      bottomImageUrl: null
    });
    if (bottomFileInputRef.current) bottomFileInputRef.current.value = '';
  };

  const handleClearBothBanners = () => {
    if (bgSettings?.topImageUrl) {
      try { URL.revokeObjectURL(bgSettings.topImageUrl); } catch (err) {}
    }
    if (bgSettings?.bottomImageUrl) {
      try { URL.revokeObjectURL(bgSettings.bottomImageUrl); } catch (err) {}
    }
    onChange({
      ...bgSettings,
      topImageFile: null,
      topImageUrl: null,
      bottomImageFile: null,
      bottomImageUrl: null
    });
    if (topFileInputRef.current) topFileInputRef.current.value = '';
    if (bottomFileInputRef.current) bottomFileInputRef.current.value = '';
  };

  const currentBgType = bgSettings?.type || 'blur-video';

  // Blur percentage (0% to 100%) mapped to 0px - 40px
  const blurPx = bgSettings?.blur ?? 20;
  const blurPercent = Math.round((blurPx / 40) * 100);

  const handleBlurPercentChange = (pct) => {
    const px = Math.round((pct / 100) * 40);
    updateBg('blur', px);
  };

  const hasTopImage = Boolean(bgSettings?.topImageUrl);
  const hasBottomImage = Boolean(bgSettings?.bottomImageUrl);
  const isZoomFill = cropSettings?.fillMode === 'fill' && (cropSettings?.mode === '9:16' || !cropSettings?.mode);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header Info */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 gap-2">
        <div className="flex items-center space-x-2 min-w-0">
          <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <h4 className="text-xs sm:text-sm font-semibold text-white truncate">Backdrop &amp; Reel Banners</h4>
            <p className="text-[11px] sm:text-xs text-slate-400 truncate">
              Add images above &amp; below video for 9:16 reels, shorts &amp; TikToks
            </p>
          </div>
        </div>

        <span className="text-[9px] sm:text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-mono shrink-0">
          9:16 BACKDROP
        </span>
      </div>

      {/* ── TOP & BOTTOM REEL BANNER IMAGES SECTION ── */}
      <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 sm:p-4.5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                <span>Top &amp; Bottom Images</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 font-mono">
                  Reel Format
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Upload image above (top) &amp; image below (bottom) with centered video
              </p>
            </div>
          </div>

          {(hasTopImage || hasBottomImage) && (
            <button
              onClick={handleClearBothBanners}
              className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-rose-500/10 border border-rose-500/20 transition-colors"
              title="Clear both top and bottom images"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Both</span>
            </button>
          )}
        </div>

        {/* Warning & 1-Click Fix if in Zoom Fill Mode */}
        {isZoomFill && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center space-x-2 min-w-0">
              <Tv className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-amber-200 text-[11px] leading-tight">
                Currently in <strong>Zoom to Fill</strong> mode. Switch to <strong>Fit (Full Horizontal)</strong> to show top &amp; bottom banner images!
              </p>
            </div>
            <button
              onClick={() => onCropChange?.({ ...cropSettings, fillMode: 'fit' })}
              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] rounded-lg shrink-0 transition-colors shadow"
            >
              Switch to Fit Mode
            </button>
          </div>
        )}

        {/* Hidden File Inputs */}
        <input
          ref={topFileInputRef}
          type="file"
          accept="image/*"
          onChange={handleTopImageUpload}
          className="hidden"
        />
        <input
          ref={bottomFileInputRef}
          type="file"
          accept="image/*"
          onChange={handleBottomImageUpload}
          className="hidden"
        />

        {/* Dual Upload Cards: Top Image & Bottom Image */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* 🔼 TOP SECTION IMAGE CARD */}
          <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white flex items-center gap-1.5">
                <ArrowUp className="w-3.5 h-3.5 text-orange-400" />
                <span>Top Section (Above Video)</span>
              </label>
              {hasTopImage && (
                <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded font-mono">
                  ✓ Active
                </span>
              )}
            </div>

            {hasTopImage ? (
              <div className="space-y-2">
                <div className="relative rounded-lg overflow-hidden border border-slate-700 bg-black/60 h-24 sm:h-28 flex items-center justify-center group/topImg">
                  <img
                    src={bgSettings.topImageUrl}
                    alt="Top section preview"
                    className="w-full h-full object-cover"
                    style={{ objectFit: bgSettings.topImageFit || 'cover' }}
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/topImg:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={() => topFileInputRef.current?.click()}
                      className="px-2.5 py-1 text-xs bg-slate-800/90 hover:bg-slate-700 text-white rounded-lg border border-slate-600 transition-colors shadow"
                    >
                      Change
                    </button>
                    <button
                      onClick={handleRemoveTopImage}
                      className="p-1 text-rose-400 hover:text-white bg-rose-950/80 hover:bg-rose-600 rounded-lg border border-rose-700/60 transition-colors shadow"
                      title="Remove top image"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-[11px] text-slate-400 truncate max-w-[120px]">
                    {bgSettings.topImageFile?.name || 'Top Banner Image'}
                  </span>
                  <div className="flex items-center gap-1 text-[10px]">
                    <span className="text-slate-400">Fit:</span>
                    <button
                      onClick={() => updateBg('topImageFit', 'cover')}
                      className={`px-1.5 py-0.5 rounded ${
                        bgSettings.topImageFit !== 'contain'
                          ? 'bg-orange-500/30 text-orange-300 font-bold border border-orange-500/40'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      Cover
                    </button>
                    <button
                      onClick={() => updateBg('topImageFit', 'contain')}
                      className={`px-1.5 py-0.5 rounded ${
                        bgSettings.topImageFit === 'contain'
                          ? 'bg-orange-500/30 text-orange-300 font-bold border border-orange-500/40'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      Fit
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                onClick={() => topFileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-orange-500 bg-slate-950/50 hover:bg-slate-900/80 p-4 rounded-xl text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-1.5 h-24 sm:h-28"
              >
                <div className="w-7 h-7 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400 flex items-center justify-center">
                  <Upload className="w-3.5 h-3.5" />
                </div>
                <p className="text-xs font-bold text-white">Upload Top Image</p>
                <p className="text-[10px] text-slate-400">Displays above centered video</p>
              </div>
            )}
          </div>

          {/* 🔽 BOTTOM SECTION IMAGE CARD */}
          <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white flex items-center gap-1.5">
                <ArrowDown className="w-3.5 h-3.5 text-orange-400" />
                <span>Bottom Section (Below Video)</span>
              </label>
              {hasBottomImage && (
                <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded font-mono">
                  ✓ Active
                </span>
              )}
            </div>

            {hasBottomImage ? (
              <div className="space-y-2">
                <div className="relative rounded-lg overflow-hidden border border-slate-700 bg-black/60 h-24 sm:h-28 flex items-center justify-center group/bottomImg">
                  <img
                    src={bgSettings.bottomImageUrl}
                    alt="Bottom section preview"
                    className="w-full h-full object-cover"
                    style={{ objectFit: bgSettings.bottomImageFit || 'cover' }}
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/bottomImg:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={() => bottomFileInputRef.current?.click()}
                      className="px-2.5 py-1 text-xs bg-slate-800/90 hover:bg-slate-700 text-white rounded-lg border border-slate-600 transition-colors shadow"
                    >
                      Change
                    </button>
                    <button
                      onClick={handleRemoveBottomImage}
                      className="p-1 text-rose-400 hover:text-white bg-rose-950/80 hover:bg-rose-600 rounded-lg border border-rose-700/60 transition-colors shadow"
                      title="Remove bottom image"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-[11px] text-slate-400 truncate max-w-[120px]">
                    {bgSettings.bottomImageFile?.name || 'Bottom Banner Image'}
                  </span>
                  <div className="flex items-center gap-1 text-[10px]">
                    <span className="text-slate-400">Fit:</span>
                    <button
                      onClick={() => updateBg('bottomImageFit', 'cover')}
                      className={`px-1.5 py-0.5 rounded ${
                        bgSettings.bottomImageFit !== 'contain'
                          ? 'bg-orange-500/30 text-orange-300 font-bold border border-orange-500/40'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      Cover
                    </button>
                    <button
                      onClick={() => updateBg('bottomImageFit', 'contain')}
                      className={`px-1.5 py-0.5 rounded ${
                        bgSettings.bottomImageFit === 'contain'
                          ? 'bg-orange-500/30 text-orange-300 font-bold border border-orange-500/40'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      Fit
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                onClick={() => bottomFileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-orange-500 bg-slate-950/50 hover:bg-slate-900/80 p-4 rounded-xl text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-1.5 h-24 sm:h-28"
              >
                <div className="w-7 h-7 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400 flex items-center justify-center">
                  <Upload className="w-3.5 h-3.5" />
                </div>
                <p className="text-xs font-bold text-white">Upload Bottom Image</p>
                <p className="text-[10px] text-slate-400">Displays below centered video</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── GENERAL BACKGROUND STYLE SELECTOR ── */}
      <div className="space-y-2.5 sm:space-y-3">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Base Backdrop Style (Behind Content)
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-2.5">
          {/* Custom Picture Upload Option */}
          <button
            onClick={() => {
              if (bgSettings.imageUrl) {
                updateBg('type', 'image');
              } else {
                fileInputRef.current?.click();
              }
            }}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer touch-manipulation ${
              currentBgType === 'image'
                ? 'bg-orange-500/10 border-orange-500 text-white shadow-md ring-1 ring-orange-500/30'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center space-x-2 mb-1">
              <Upload className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-bold text-xs text-white">Custom Picture</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Upload full poster.
            </p>
          </button>

          {/* Auto Blurred Video Option */}
          <button
            onClick={() => updateBg('type', 'blur-video')}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer touch-manipulation ${
              currentBgType === 'blur-video'
                ? 'bg-orange-500/10 border-orange-500 text-white shadow-md ring-1 ring-orange-500/30'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center space-x-2 mb-1">
              <Sparkles className="w-4 h-4 text-orange-400 shrink-0" />
              <span className="font-bold text-xs text-white">Blurred Video</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Auto-generated blur.
            </p>
          </button>

          {/* Solid Color Option */}
          <button
            onClick={() => updateBg('type', 'color')}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer touch-manipulation ${
              currentBgType === 'color'
                ? 'bg-orange-500/10 border-orange-500 text-white shadow-md ring-1 ring-orange-500/30'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center space-x-2 mb-1">
              <div className="w-3.5 h-3.5 rounded-full border border-slate-600 bg-black shrink-0" />
              <span className="font-bold text-xs text-white">Solid Color</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Black or custom color.
            </p>
          </button>
        </div>
      </div>

      {/* Hidden File Input for Full Background Image */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />

      {/* Full Picture Upload Box */}
      {currentBgType === 'image' && (
        <div className="space-y-3 bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 sm:p-4">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Uploaded Full Background Picture
          </label>

          {bgSettings?.imageUrl ? (
            <div className="flex items-center justify-between bg-slate-900 p-3 sm:p-3.5 rounded-xl border border-slate-800 gap-2">
              <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
                <img
                  src={bgSettings.imageUrl}
                  alt="Background preview"
                  className="w-12 h-12 sm:w-14 sm:h-14 object-cover rounded-lg border border-slate-700 shrink-0 shadow"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate max-w-[150px] sm:max-w-xs">
                    {bgSettings.imageFile?.name || 'Custom Background'}
                  </p>
                  <p className="text-[10px] sm:text-[11px] text-emerald-400 mt-0.5">✓ Picture Loaded</p>
                </div>
              </div>

              <div className="flex items-center space-x-1.5 shrink-0">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 sm:px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 cursor-pointer transition-colors touch-manipulation"
                >
                  Replace
                </button>
                <button
                  onClick={handleRemoveImage}
                  className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg cursor-pointer touch-manipulation"
                  title="Remove picture"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-orange-500 bg-slate-900/50 p-5 sm:p-6 rounded-xl text-center cursor-pointer transition-all hover:bg-slate-900/80 touch-manipulation"
            >
              <Upload className="w-6 h-6 text-orange-400 mx-auto mb-1.5" />
              <p className="text-xs font-bold text-white">Click to Select Full Background Picture</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Supports JPG, PNG, WEBP wallpapers &amp; posters</p>
            </div>
          )}
        </div>
      )}

      {/* Blur Percentage & Dimming Sliders */}
      {(currentBgType === 'image' || currentBgType === 'blur-video') && (
        <div className="space-y-4 bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 sm:p-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center space-x-1.5">
              <Sliders className="w-4 h-4 text-orange-400 shrink-0" />
              <span>Base Blur &amp; Brightness</span>
            </label>
            <span className="text-[10px] sm:text-[11px] font-mono text-amber-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
              {blurPercent}% Blur
            </span>
          </div>

          {/* Blur Percentage Slider (0% to 100%) */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-300">
              <span className="font-medium">Blur Intensity</span>
              <span className="font-mono text-amber-400 font-bold">{blurPercent}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="2"
              value={blurPercent}
              onChange={(e) => handleBlurPercentChange(parseInt(e.target.value))}
              className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
            />
            <div className="flex justify-between text-[10px] text-slate-500 pt-0.5">
              <span>0% (Clear)</span>
              <span>50% (Medium)</span>
              <span>100% (Max)</span>
            </div>
          </div>

          {/* Background Brightness / Darkness Slider (20% to 100%) */}
          <div className="space-y-1 pt-2 border-t border-slate-900">
            <div className="flex justify-between text-xs text-slate-300">
              <span className="flex items-center space-x-1">
                <SunMedium className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="font-medium">Background Brightness</span>
              </span>
              <span className="font-mono text-amber-400 font-bold">{bgSettings?.opacity ?? 65}%</span>
            </div>
            <input
              type="range"
              min="15"
              max="100"
              step="5"
              value={bgSettings?.opacity ?? 65}
              onChange={(e) => updateBg('opacity', parseInt(e.target.value))}
              className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
            />
            <div className="flex justify-between text-[10px] text-slate-500 pt-0.5">
              <span>Dark (Contrast)</span>
              <span>Balanced (65%)</span>
              <span>100% Bright</span>
            </div>
          </div>
        </div>
      )}

      {/* Solid Color Picker */}
      {currentBgType === 'color' && (
        <div className="p-3.5 sm:p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Background Color
          </label>
          <div className="flex items-center space-x-3 pt-1">
            <input
              type="color"
              value={bgSettings?.color || '#000000'}
              onChange={(e) => updateBg('color', e.target.value)}
              className="w-10 h-10 rounded-lg border border-slate-700 bg-transparent cursor-pointer"
            />
            <span className="text-xs font-mono text-slate-300">{bgSettings?.color || '#000000'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
