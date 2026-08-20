import React, { useRef } from 'react';
import { Image as ImageIcon, Upload, Sparkles, X, Sliders, SunMedium, Eye } from 'lucide-react';

export default function BackgroundEditor({
  bgSettings,
  onChange,
  cropSettings,
  onCropChange
}) {
  const fileInputRef = useRef(null);

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
  };

  const currentBgType = bgSettings?.type || 'blur-video';

  // Blur percentage (0% to 100%) mapped to 0px - 40px
  const blurPx = bgSettings?.blur ?? 20;
  const blurPercent = Math.round((blurPx / 40) * 100);

  const handleBlurPercentChange = (pct) => {
    const px = Math.round((pct / 100) * 40);
    updateBg('blur', px);
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <ImageIcon className="w-5 h-5 text-amber-400" />
          <div>
            <h4 className="text-sm font-semibold text-white">Background Backdrop &amp; Blur</h4>
            <p className="text-xs text-slate-400">
              Custom picture or blurred video behind the full horizontal video in 9:16 vertical mode
            </p>
          </div>
        </div>

        <span className="text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-mono">
          9:16 BACKDROP
        </span>
      </div>

      {/* Background Style Selector */}
      <div className="space-y-3">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Choose Background Style
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Custom Picture Upload Option */}
          <button
            onClick={() => {
              if (bgSettings.imageUrl) {
                updateBg('type', 'image');
              } else {
                fileInputRef.current?.click();
              }
            }}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              currentBgType === 'image'
                ? 'bg-orange-500/10 border-orange-500 text-white shadow-md ring-1 ring-orange-500/30'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center space-x-2 mb-1">
              <Upload className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-xs text-white">Custom Picture</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Upload any wallpaper, poster, or image from your device.
            </p>
          </button>

          {/* Auto Blurred Video Option */}
          <button
            onClick={() => updateBg('type', 'blur-video')}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              currentBgType === 'blur-video'
                ? 'bg-orange-500/10 border-orange-500 text-white shadow-md ring-1 ring-orange-500/30'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center space-x-2 mb-1">
              <Sparkles className="w-4 h-4 text-orange-400" />
              <span className="font-bold text-xs text-white">Blurred Video</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Auto-generates a blurred video backdrop filling the frame.
            </p>
          </button>

          {/* Solid Color Option */}
          <button
            onClick={() => updateBg('type', 'color')}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              currentBgType === 'color'
                ? 'bg-orange-500/10 border-orange-500 text-white shadow-md ring-1 ring-orange-500/30'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center space-x-2 mb-1">
              <div className="w-3.5 h-3.5 rounded-full border border-slate-600 bg-black" />
              <span className="font-bold text-xs text-white">Solid Color</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Clean black or custom solid background color.
            </p>
          </button>
        </div>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />

      {/* Custom Picture Upload Box */}
      {currentBgType === 'image' && (
        <div className="space-y-3 bg-slate-950/80 border border-slate-800 rounded-xl p-4">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Uploaded Background Picture
          </label>

          {bgSettings?.imageUrl ? (
            <div className="flex items-center justify-between bg-slate-900 p-3.5 rounded-xl border border-slate-800">
              <div className="flex items-center space-x-3 min-w-0">
                <img
                  src={bgSettings.imageUrl}
                  alt="Background preview"
                  className="w-14 h-14 object-cover rounded-lg border border-slate-700 shrink-0 shadow"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">
                    {bgSettings.imageFile?.name || 'Custom Background Picture'}
                  </p>
                  <p className="text-[11px] text-emerald-400 mt-0.5">✓ Picture Loaded Successfully</p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 cursor-pointer transition-colors"
                >
                  Replace
                </button>
                <button
                  onClick={handleRemoveImage}
                  className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg cursor-pointer"
                  title="Remove picture"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-orange-500 bg-slate-900/50 p-6 rounded-xl text-center cursor-pointer transition-all hover:bg-slate-900/80"
            >
              <Upload className="w-7 h-7 text-orange-400 mx-auto mb-2" />
              <p className="text-xs font-bold text-white">Click to Select or Drop Background Picture</p>
              <p className="text-[11px] text-slate-400 mt-1">Supports JPG, PNG, WEBP wallpapers &amp; posters</p>
            </div>
          )}
        </div>
      )}

      {/* Blur Percentage & Dimming Sliders */}
      {(currentBgType === 'image' || currentBgType === 'blur-video') && (
        <div className="space-y-5 bg-slate-950/80 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center space-x-1.5">
              <Sliders className="w-4 h-4 text-orange-400" />
              <span>Blur Percentage &amp; Brightness</span>
            </label>
            <span className="text-[11px] font-mono text-amber-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
              {blurPercent}% Blur
            </span>
          </div>

          {/* Blur Percentage Slider (0% to 100%) */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-slate-300">
              <span className="font-medium">Background Blur Intensity</span>
              <span className="font-mono text-amber-400 font-bold">{blurPercent}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="2"
              value={blurPercent}
              onChange={(e) => handleBlurPercentChange(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 pt-0.5">
              <span>0% (Crystal Clear)</span>
              <span>50% (Medium Blur)</span>
              <span>100% (Maximum Blur)</span>
            </div>
          </div>

          {/* Background Brightness / Darkness Slider (20% to 100%) */}
          <div className="space-y-1.5 pt-2 border-t border-slate-900">
            <div className="flex justify-between text-xs text-slate-300">
              <span className="flex items-center space-x-1">
                <SunMedium className="w-3.5 h-3.5 text-amber-400" />
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
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 pt-0.5">
              <span>Dark / High Contrast</span>
              <span>Balanced (65%)</span>
              <span>100% Full Brightness</span>
            </div>
          </div>
        </div>
      )}

      {/* Solid Color Picker */}
      {currentBgType === 'color' && (
        <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
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
