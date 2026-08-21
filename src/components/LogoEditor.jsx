import React, { useRef } from 'react';
import { Image, Upload, Trash2, Move, MoveHorizontal, MoveVertical } from 'lucide-react';

export default function LogoEditor({
  logoSettings,
  onChange
}) {
  const fileInputRef = useRef(null);

  const updateSetting = (key, value) => {
    onChange({
      ...logoSettings,
      [key]: value
    });
  };

  const handleLogoFile = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const url = URL.createObjectURL(file);
      onChange({
        ...logoSettings,
        file,
        url,
        enabled: true
      });
    }
  };

  const clearLogo = () => {
    if (logoSettings.url) {
      URL.revokeObjectURL(logoSettings.url);
    }
    onChange({
      ...logoSettings,
      file: null,
      url: null,
      enabled: false
    });
  };

  const positions = [
    { id: 'top-left', label: 'Top Left' },
    { id: 'top-right', label: 'Top Right' },
    { id: 'bottom-left', label: 'Bottom Left' },
    { id: 'bottom-right', label: 'Bottom Right' }
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Enable Logo Toggle */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 gap-2">
        <div className="flex items-center space-x-2 min-w-0">
          <Image className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400 shrink-0" />
          <div className="min-w-0">
            <h4 className="text-xs sm:text-sm font-semibold text-white truncate">Logo &amp; Watermark</h4>
            <p className="text-[11px] sm:text-xs text-slate-400 truncate">Brand logo or watermark on all clips</p>
          </div>
        </div>

        <button
          onClick={() => updateSetting('enabled', !logoSettings.enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer shrink-0 touch-manipulation ${
            logoSettings.enabled ? 'bg-orange-500' : 'bg-slate-800'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              logoSettings.enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {logoSettings.enabled && (
        <div className="space-y-4 sm:space-y-5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleLogoFile}
            className="hidden"
          />

          {/* Logo Upload Box */}
          {!logoSettings.url ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-800 hover:border-slate-700 bg-slate-950/60 p-5 sm:p-6 rounded-xl text-center cursor-pointer transition-colors touch-manipulation"
            >
              <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
              <p className="text-xs font-medium text-white">Select Logo Image</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Supports PNG with transparency, JPG, WEBP</p>
            </div>
          ) : (
            <div className="flex items-center justify-between bg-slate-950 p-3 sm:p-3.5 rounded-xl border border-slate-800 gap-2">
              <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-black/40 border border-slate-800 flex items-center justify-center p-1 overflow-hidden shrink-0">
                  <img src={logoSettings.url} alt="Logo" className="max-h-full max-w-full object-contain" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate max-w-[140px] sm:max-w-xs">{logoSettings.file?.name || 'Watermark Image'}</p>
                  <p className="text-[10px] sm:text-[11px] text-emerald-400">✓ Loaded &amp; Draggable</p>
                </div>
              </div>

              <div className="flex items-center space-x-1.5 shrink-0">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 text-xs bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md text-slate-300 transition-colors cursor-pointer touch-manipulation"
                >
                  Replace
                </button>
                <button
                  onClick={clearLogo}
                  className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-md transition-colors cursor-pointer touch-manipulation"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Size & Opacity Sliders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Logo Width</span>
                <span className="font-mono text-amber-400 font-bold">{logoSettings.size || 60}px</span>
              </div>
              <input
                type="range"
                min="25"
                max="250"
                value={logoSettings.size || 60}
                onChange={(e) => updateSetting('size', parseInt(e.target.value))}
                className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Opacity</span>
                <span className="font-mono text-amber-400 font-bold">{logoSettings.opacity || 80}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                value={logoSettings.opacity || 80}
                onChange={(e) => updateSetting('opacity', parseInt(e.target.value))}
                className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
              />
            </div>
          </div>

          {/* Position Selector & Drag Controls */}
          <div className="space-y-3 bg-slate-950/60 p-3.5 sm:p-4 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Logo Position
              </label>
              <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono">
                🖱️ DRAG ON VIDEO
              </span>
            </div>

            <p className="text-[11px] text-slate-400 -mt-1">
              Drag the logo anywhere on the video preview screen to reposition it:
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
              {positions.map((pos) => (
                <button
                  key={pos.id}
                  onClick={() => {
                    updateSetting('position', pos.id);
                    if (pos.id === 'top-left') { updateSetting('customX', 6); updateSetting('customY', 6); }
                    else if (pos.id === 'top-right') { updateSetting('customX', 94); updateSetting('customY', 6); }
                    else if (pos.id === 'bottom-left') { updateSetting('customX', 6); updateSetting('customY', 94); }
                    else if (pos.id === 'bottom-right') { updateSetting('customX', 94); updateSetting('customY', 94); }
                  }}
                  className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors cursor-pointer touch-manipulation ${
                    logoSettings.position === pos.id
                      ? 'bg-orange-500/10 border-orange-500 text-white font-semibold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {pos.label}
                </button>
              ))}
            </div>

            {/* Fine Tuning Sliders */}
            <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 border-t border-slate-800/80">
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-400">
                  <span className="flex items-center space-x-1">
                    <MoveVertical className="w-3 h-3 text-orange-400" />
                    <span>Vertical Position (Y)</span>
                  </span>
                  <span className="font-mono text-amber-400">{logoSettings.customY ?? 6}%</span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="97"
                  value={logoSettings.customY ?? 6}
                  onChange={(e) => updateSetting('customY', parseInt(e.target.value))}
                  className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-400">
                  <span className="flex items-center space-x-1">
                    <MoveHorizontal className="w-3 h-3 text-orange-400" />
                    <span>Horizontal Position (X)</span>
                  </span>
                  <span className="font-mono text-amber-400">{logoSettings.customX ?? 94}%</span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="97"
                  value={logoSettings.customX ?? 94}
                  onChange={(e) => updateSetting('customX', parseInt(e.target.value))}
                  className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
