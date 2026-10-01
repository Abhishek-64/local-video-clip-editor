import React, { useRef } from 'react';
import ReelImagesEditor from './ReelImagesEditor';
import {
  Crop,
  Smartphone,
  Maximize2,
  Tv,
  Image as ImageIcon,
  Sparkles,
  Upload,
  X,
  Sliders,
  MoveHorizontal,
  MoveVertical,
  RotateCcw,
  Film,
  Instagram,
  Youtube,
  Layers,
  Move,
  ScanFace
} from 'lucide-react';

export default function CropEditor({
  cropSettings,
  onChange,
  onReset,
  bgSettings,
  onBgChange
}) {
  const fileInputRef = useRef(null);

  const platformModes = [
    {
      id: 'original',
      label: 'Original Source Video',
      ratio: 'Native',
      resolution: 'Source Dimensions',
      platformTags: '100% Native',
      icon: Layers,
      color: 'text-emerald-400',
      // desc: 'Preserves 100% original video dimensions, aspect ratio & pixel matrix'
    },
    {
      id: '9:16',
      label: 'Instagram & FB Reels / Shorts',
      ratio: '9:16',
      resolution: '1080 × 1920',
      platformTags: 'Reels • Shorts • TikTok',
      icon: Smartphone,
      color: 'text-rose-400',
      // desc: 'Full vertical screen standard for Instagram Reels, Facebook Reels, YouTube Shorts & TikTok'
    },
    {
      id: '16:9',
      label: 'YouTube & FB Landscape Video',
      ratio: '16:9',
      resolution: '1920 × 1080',
      platformTags: 'YouTube • Facebook Watch',
      icon: Youtube,
      color: 'text-red-400',
      // desc: 'Standard widescreen horizontal format for YouTube and Facebook desktop/feed'
    },
    {
      id: '1:1',
      label: 'Instagram & FB Feed Square',
      ratio: '1:1',
      resolution: '1080 × 1080',
      platformTags: 'IG Feed • FB Feed • Square',
      icon: Instagram,
      color: 'text-pink-400',
      // desc: 'Square feed video standard for Instagram and Facebook feed posts'
    },
    {
      id: '4:5',
      label: 'Instagram & FB Feed Portrait',
      ratio: '4:5',
      resolution: '1080 × 1350',
      platformTags: 'IG Optimal • FB Portrait',
      icon: Instagram,
      color: 'text-purple-400',
      // desc: 'Meta optimal vertical portrait feed ratio for highest mobile screen coverage'
    },
    {
      id: '21:9',
      label: 'YouTube Ultrawide Cinema',
      ratio: '21:9',
      resolution: '2560 × 1080',
      platformTags: 'Cinematic • Banner Widescreen',
      icon: Film,
      color: 'text-amber-400',
      // desc: 'Cinematic widescreen banner format for cinematic YouTube videos'
    },
    {
      id: 'custom',
      label: 'Freeform Custom Area Crop',
      ratio: 'Custom',
      resolution: 'Manual Drag Box',
      platformTags: 'Interactive 8-Point',
      icon: Crop,
      color: 'text-orange-400',
      // desc: 'Drag, resize and position custom 8-point crop handles on video canvas'
    }
  ];

  const updateCrop = (key, value) => {
    onChange({
      ...cropSettings,
      [key]: value
    });
  };

  const updateBg = (key, value) => {
    if (onBgChange) {
      onBgChange({
        ...bgSettings,
        [key]: value
      });
    }
  };

  const setAlignment = (align) => {
    let newX = 0;
    let newY = 0;
    if (align === 'left') newX = -70;
    if (align === 'right') newX = 70;
    if (align === 'top') newY = -70;
    if (align === 'bottom') newY = 70;
    if (align === 'center') {
      newX = 0;
      newY = 0;
    }

    onChange({
      ...cropSettings,
      x: newX,
      y: newY
    });
  };

  const currentMode = cropSettings.mode || 'original';
  const currentFillMode = cropSettings.fillMode || 'fit';

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Platform Aspect Ratio Selector */}
      <div className="space-y-2.5 sm:space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Platform &amp; Video Format
          </label>
          <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded font-mono font-medium">
            {currentMode.toUpperCase()}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
          {platformModes.map((m) => {
            const Icon = m.icon;
            const isSelected = currentMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => updateCrop('mode', m.id)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer touch-manipulation flex flex-col justify-between ${
                  isSelected
                    ? 'bg-orange-500/10 border-orange-500 text-white shadow-md ring-1 ring-orange-500/40'
                    : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-1.5 mb-1.5">
                    <div className="flex items-center space-x-2">
                      <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-orange-400' : m.color}`} />
                      <span className="font-bold text-xs text-white leading-tight">{m.label}</span>
                    </div>
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap font-bold ${
                      isSelected
                        ? 'bg-orange-500/25 text-orange-300 border border-orange-500/40'
                        : 'bg-slate-900 text-slate-400 border border-slate-800'
                    }`}>
                      {m.ratio}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono mb-1.5 text-slate-400">
                    <span className="text-amber-300/90 font-semibold">{m.resolution}</span>
                    <span className="text-slate-500 text-[9px] truncate ml-1">{m.platformTags}</span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 leading-snug">{m.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── SMART AI FACE TRACKING TOGGLE ── */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 sm:p-4 flex items-center justify-between gap-3">
        <div className="flex items-center space-x-3 min-w-0">
          <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center border shrink-0 ${
            cropSettings.faceTracking
              ? 'bg-orange-500/10 border-orange-500/40 text-orange-400'
              : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}>
            <ScanFace className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-1.5 sm:space-x-2">
              <h4 className="text-xs font-bold text-white truncate">Smart AI Face Tracking</h4>
              <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded font-mono font-semibold shrink-0">
                LOCAL AI
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
              Auto-centers the active speaker in vertical clips.
            </p>
          </div>
        </div>

        <button
          onClick={() => updateCrop('faceTracking', !cropSettings.faceTracking)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer shrink-0 touch-manipulation ${
            cropSettings.faceTracking ? 'bg-orange-500' : 'bg-slate-800'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              cropSettings.faceTracking ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* ── 9:16 MOBILE FORMAT (Instagram Reel / Shorts / TikTok) ── */}
      {currentMode === '9:16' && (
        <div className="space-y-3 bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center space-x-1.5">
              <Smartphone className="w-4 h-4 text-orange-400 shrink-0" />
              <span>9:16 Display Style</span>
            </label>
            <span className="text-[9px] sm:text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-1.5 sm:px-2 py-0.5 rounded font-mono shrink-0">
              {currentFillMode === 'fit' ? 'FIT (NO CROP)' : 'ZOOM CROP'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            {/* Fit Mode - Full Horizontal Video */}
            <button
              onClick={() => updateCrop('fillMode', 'fit')}
              className={`p-3 sm:p-3.5 rounded-xl border text-left transition-all cursor-pointer relative touch-manipulation ${
                currentFillMode === 'fit'
                  ? 'bg-orange-500/10 border-orange-500 text-white shadow-md ring-1 ring-orange-500/40'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-2">
                  <Tv className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-bold text-xs text-white">Full Horizontal (Fit)</span>
                </div>
                <span className="text-[8px] sm:text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded font-bold">
                  POPULAR
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Fit full widescreen with backdrop above &amp; below.
              </p>
            </button>

            {/* Fill Mode - Zoom to Full Screen */}
            <button
              onClick={() => updateCrop('fillMode', 'fill')}
              className={`p-3 sm:p-3.5 rounded-xl border text-left transition-all cursor-pointer touch-manipulation ${
                currentFillMode === 'fill'
                  ? 'bg-orange-500/10 border-orange-500 text-white shadow-md ring-1 ring-orange-500/40'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center space-x-2 mb-1">
                <Maximize2 className="w-4 h-4 text-orange-400 shrink-0" />
                <span className="font-bold text-xs text-white">Zoom to Fill</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Fill vertical screen. Crops left &amp; right edges.
              </p>
            </button>
          </div>

          {/* Reel Top & Bottom Cover Images (Letterbox Space) */}
          <ReelImagesEditor
            cropSettings={cropSettings}
            onCropChange={onChange}
          />
        </div>
      )}

      {/* ── MANUAL FREEFORM CROP CONTROLS (Active in Custom Mode) ── */}
      {currentMode === 'custom' && (
        <div className="space-y-4 bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 sm:p-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center space-x-1.5">
              <Crop className="w-4 h-4 text-orange-400 shrink-0" />
              <span>Manual Freeform Crop Box</span>
            </label>
            <button
              onClick={onReset}
              className="text-xs text-slate-400 hover:text-white flex items-center space-x-1 cursor-pointer touch-manipulation"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>

          <p className="text-[11px] text-slate-400">
            Drag the 8 corner and edge handles directly on the video player or adjust below:
          </p>

          {/* Width & Height Sliders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span className="flex items-center space-x-1">
                  <MoveHorizontal className="w-3 h-3 text-orange-400" />
                  <span>Width</span>
                </span>
                <span className="font-mono text-amber-400 font-bold">{cropSettings.customWidth ?? 60}%</span>
              </div>
              <input
                type="range"
                min="15"
                max="100"
                value={cropSettings.customWidth ?? 60}
                onChange={(e) => updateCrop('customWidth', parseInt(e.target.value))}
                className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span className="flex items-center space-x-1">
                  <MoveVertical className="w-3 h-3 text-orange-400" />
                  <span>Height</span>
                </span>
                <span className="font-mono text-amber-400 font-bold">{cropSettings.customHeight ?? 85}%</span>
              </div>
              <input
                type="range"
                min="15"
                max="100"
                value={cropSettings.customHeight ?? 85}
                onChange={(e) => updateCrop('customHeight', parseInt(e.target.value))}
                className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
              />
            </div>
          </div>

          {/* Position X, Y & Zoom */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 pt-2 border-t border-slate-900">
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Center X</span>
                <span className="font-mono text-amber-400">{cropSettings.x || 0}px</span>
              </div>
              <input
                type="range"
                min="-200"
                max="200"
                value={cropSettings.x || 0}
                onChange={(e) => updateCrop('x', parseInt(e.target.value))}
                className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Center Y</span>
                <span className="font-mono text-amber-400">{cropSettings.y || 0}px</span>
              </div>
              <input
                type="range"
                min="-200"
                max="200"
                value={cropSettings.y || 0}
                onChange={(e) => updateCrop('y', parseInt(e.target.value))}
                className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Zoom Scale</span>
                <span className="font-mono text-amber-400">{cropSettings.zoom || 1}x</span>
              </div>
              <input
                type="range"
                min="0.8"
                max="3.0"
                step="0.05"
                value={cropSettings.zoom || 1}
                onChange={(e) => updateCrop('zoom', parseFloat(e.target.value))}
                className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
              />
            </div>
          </div>

          {/* Snap Alignment Shortcuts */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-900">
            <div className="flex items-center space-x-1.5 flex-wrap gap-1">
              <span className="text-xs text-slate-400 mr-1">Snap:</span>
              {['center', 'left', 'right', 'top', 'bottom'].map((pos) => (
                <button
                  key={pos}
                  onClick={() => setAlignment(pos)}
                  className="px-2.5 py-1 text-xs capitalize bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-md transition-colors cursor-pointer touch-manipulation"
                >
                  {pos}
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                updateCrop('customWidth', 100);
                updateCrop('customHeight', 100);
                updateCrop('x', 0);
                updateCrop('y', 0);
                updateCrop('zoom', 1);
              }}
              className="px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg border border-slate-700 cursor-pointer touch-manipulation"
            >
              Full Frame
            </button>
          </div>
        </div>
      )}

      {/* Manual Zoom & Pan for other aspect ratios */}
      {currentMode !== 'custom' && (currentFillMode === 'fill' || currentMode !== '9:16') && currentMode !== 'original' && (
        <div className="space-y-3 sm:space-y-4 bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 sm:p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
              <Move className="w-3.5 h-3.5" />
              <span>Position Pan &amp; Zoom</span>
            </span>
            <button
              onClick={onReset}
              className="text-xs text-slate-400 hover:text-white flex items-center space-x-1 cursor-pointer touch-manipulation"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Horizontal (X)</span>
                <span className="font-mono text-amber-400">{cropSettings.x || 0}px</span>
              </div>
              <input
                type="range"
                min="-200"
                max="200"
                value={cropSettings.x || 0}
                onChange={(e) => updateCrop('x', parseInt(e.target.value))}
                className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Vertical (Y)</span>
                <span className="font-mono text-amber-400">{cropSettings.y || 0}px</span>
              </div>
              <input
                type="range"
                min="-200"
                max="200"
                value={cropSettings.y || 0}
                onChange={(e) => updateCrop('y', parseInt(e.target.value))}
                className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Zoom Scale</span>
                <span className="font-mono text-amber-400">{cropSettings.zoom || 1}x</span>
              </div>
              <input
                type="range"
                min="0.8"
                max="2.5"
                step="0.05"
                value={cropSettings.zoom || 1}
                onChange={(e) => updateCrop('zoom', parseFloat(e.target.value))}
                className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
