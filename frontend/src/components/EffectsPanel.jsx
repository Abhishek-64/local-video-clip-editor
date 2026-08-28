import React from 'react';
import { Sliders, Wand2, Sparkles, RotateCcw } from 'lucide-react';

export default function EffectsPanel({
  effectsSettings,
  onChange,
  onReset
}) {
  const presets = [
    { id: 'normal', name: 'Normal / None', settings: { brightness: 100, contrast: 100, saturation: 100, sepia: 0, grayscale: 0, invert: 0, blur: 0 } },
    { id: 'cinematic', name: 'Cinematic', settings: { brightness: 95, contrast: 120, saturation: 110, sepia: 10, grayscale: 0, invert: 0, blur: 0 } },
    { id: 'vintage', name: 'Vintage 70s', settings: { brightness: 105, contrast: 90, saturation: 80, sepia: 35, grayscale: 0, invert: 0, blur: 0 } },
    { id: 'warm', name: 'Warm Sunset', settings: { brightness: 100, contrast: 105, saturation: 120, sepia: 20, grayscale: 0, invert: 0, blur: 0 } },
    { id: 'cool', name: 'Cool Nordic', settings: { brightness: 100, contrast: 110, saturation: 85, sepia: 0, grayscale: 0, invert: 0, blur: 0 } },
    { id: 'bw', name: 'Black & White', settings: { brightness: 105, contrast: 130, saturation: 0, sepia: 0, grayscale: 100, invert: 0, blur: 0 } },
    { id: 'sepia', name: 'Classic Sepia', settings: { brightness: 100, contrast: 100, saturation: 90, sepia: 85, grayscale: 0, invert: 0, blur: 0 } },
    { id: 'high-contrast', name: 'High Contrast', settings: { brightness: 100, contrast: 145, saturation: 125, sepia: 0, grayscale: 0, invert: 0, blur: 0 } },
    { id: 'faded', name: 'Faded Film', settings: { brightness: 110, contrast: 80, saturation: 75, sepia: 10, grayscale: 0, invert: 0, blur: 0 } }
  ];

  const updateField = (key, value) => {
    onChange({
      ...effectsSettings,
      [key]: value
    });
  };

  const applyPreset = (preset) => {
    onChange({
      ...effectsSettings,
      preset: preset.id,
      ...preset.settings
    });
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Visual Style Presets */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5 min-w-0">
            <Wand2 className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            <span className="truncate">Visual Color Presets</span>
          </label>
          <button
            onClick={onReset}
            className="text-xs text-slate-400 hover:text-white flex items-center space-x-1 cursor-pointer shrink-0 touch-manipulation"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p)}
              className={`px-3 py-2 text-xs rounded-xl border text-left transition-all cursor-pointer touch-manipulation ${
                effectsSettings.preset === p.id
                  ? 'bg-orange-500/10 border-orange-500 text-white font-medium shadow-sm'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Basic Fine-Tuning Sliders */}
      <div className="space-y-3.5 sm:space-y-4 bg-slate-950/60 p-3.5 sm:p-4 rounded-xl border border-slate-800">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
          <Sliders className="w-3.5 h-3.5 text-orange-400" />
          <span>Color &amp; Lighting Adjustments</span>
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {/* Brightness */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Brightness</span>
              <span className="font-mono text-amber-400">{effectsSettings.brightness}%</span>
            </div>
            <input
              type="range"
              min="50"
              max="150"
              value={effectsSettings.brightness}
              onChange={(e) => updateField('brightness', parseInt(e.target.value))}
              className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
            />
          </div>

          {/* Contrast */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Contrast</span>
              <span className="font-mono text-amber-400">{effectsSettings.contrast}%</span>
            </div>
            <input
              type="range"
              min="50"
              max="180"
              value={effectsSettings.contrast}
              onChange={(e) => updateField('contrast', parseInt(e.target.value))}
              className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
            />
          </div>

          {/* Saturation */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Saturation</span>
              <span className="font-mono text-amber-400">{effectsSettings.saturation}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="200"
              value={effectsSettings.saturation}
              onChange={(e) => updateField('saturation', parseInt(e.target.value))}
              className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
            />
          </div>
        </div>
      </div>

      {/* Fade In & Out Transitions */}
      <div className="space-y-3 bg-slate-950/60 p-3.5 sm:p-4 rounded-xl border border-slate-800">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Fade In / Fade Out Transitions
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div className="flex items-center justify-between bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="fadeIn"
                checked={effectsSettings.fadeIn}
                onChange={(e) => updateField('fadeIn', e.target.checked)}
                className="rounded bg-slate-950 border-slate-700 text-orange-500 cursor-pointer"
              />
              <label htmlFor="fadeIn" className="text-xs text-slate-300 cursor-pointer">
                Fade In (Black)
              </label>
            </div>
            <select
              value={effectsSettings.fadeInDuration}
              onChange={(e) => updateField('fadeInDuration', parseFloat(e.target.value))}
              disabled={!effectsSettings.fadeIn}
              className="bg-slate-950 border border-slate-800 text-xs text-white rounded px-2 py-1 disabled:opacity-40"
            >
              <option value="0.25">0.25s</option>
              <option value="0.5">0.5s</option>
              <option value="1.0">1.0s</option>
              <option value="2.0">2.0s</option>
            </select>
          </div>

          <div className="flex items-center justify-between bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="fadeOut"
                checked={effectsSettings.fadeOut}
                onChange={(e) => updateField('fadeOut', e.target.checked)}
                className="rounded bg-slate-950 border-slate-700 text-orange-500 cursor-pointer"
              />
              <label htmlFor="fadeOut" className="text-xs text-slate-300 cursor-pointer">
                Fade Out (Black)
              </label>
            </div>
            <select
              value={effectsSettings.fadeOutDuration}
              onChange={(e) => updateField('fadeOutDuration', parseFloat(e.target.value))}
              disabled={!effectsSettings.fadeOut}
              className="bg-slate-950 border border-slate-800 text-xs text-white rounded px-2 py-1 disabled:opacity-40"
            >
              <option value="0.25">0.25s</option>
              <option value="0.5">0.5s</option>
              <option value="1.0">1.0s</option>
              <option value="2.0">2.0s</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
