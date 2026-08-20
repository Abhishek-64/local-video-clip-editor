import React from 'react';
import { Type, Palette, AlignLeft, Hash, MoveVertical, MoveHorizontal, Plus, Trash2, Eye, EyeOff, Sparkles, MessageSquare } from 'lucide-react';

export default function TextEditor({
  textSettings,
  onChange
}) {
  const updateSetting = (key, value) => {
    onChange({
      ...textSettings,
      [key]: value
    });
  };

  const extraTexts = textSettings?.extraTexts || [];

  const updateExtraText = (id, key, value) => {
    const updated = extraTexts.map((item) => {
      if (item.id === id) {
        return { ...item, [key]: value };
      }
      return item;
    });
    onChange({
      ...textSettings,
      extraTexts: updated
    });
  };

  const handleAddExtraText = () => {
    const newId = `extra-${Date.now()}`;
    const newTextItem = {
      id: newId,
      text: 'Follow for next part! 🔥',
      enabled: true,
      font: 'Inter, sans-serif',
      fontSize: 22,
      color: '#ffffff',
      outline: true,
      outlineColor: '#000000',
      outlineThickness: 3,
      bgEnabled: true,
      bgColor: 'rgba(0, 0, 0, 0.75)',
      customX: 50, // center %
      customY: 88  // bottom %
    };

    onChange({
      ...textSettings,
      extraTexts: [...extraTexts, newTextItem]
    });
  };

  const handleDeleteExtraText = (id) => {
    const filtered = extraTexts.filter((item) => item.id !== id);
    onChange({
      ...textSettings,
      extraTexts: filtered
    });
  };

  const positions = [
    { id: 'top-left', label: 'Top Left' },
    { id: 'top-center', label: 'Top Center (Default)' },
    { id: 'top-right', label: 'Top Right' },
    { id: 'center', label: 'Center' },
    { id: 'bottom-left', label: 'Bottom Left' },
    { id: 'bottom-center', label: 'Bottom Center' },
    { id: 'bottom-right', label: 'Bottom Right' }
  ];

  const fonts = [
    { id: 'Inter, sans-serif', name: 'Clean Sans (Inter)' },
    { id: 'Impact, sans-serif', name: 'Impact (Viral Bold)' },
    { id: 'Arial, sans-serif', name: 'Arial' },
    { id: 'Georgia, serif', name: 'Georgia' },
    { id: 'monospace', name: 'Monospace' }
  ];

  const templatePresets = [
    { label: 'Single Line', value: '{movie} - Part {part}' },
    { label: 'Two Lines', value: '{movie}\nPart {part}' },
    { label: 'Part First', value: 'Part {part} | {movie}' },
    { label: 'Part Only', value: 'PART {part}' }
  ];

  return (
    <div className="space-y-6">
      {/* ── SECTION 1: PRIMARY TITLE & PART NUMBERING ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <Type className="w-5 h-5 text-orange-400" />
            <div>
              <h4 className="text-sm font-semibold text-white">Title &amp; Automatic Part Numbering</h4>
              <p className="text-xs text-slate-400">Overlays movie title and sequential part numbers on each clip</p>
            </div>
          </div>

          <button
            onClick={() => updateSetting('enabled', !textSettings.enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
              textSettings.enabled ? 'bg-orange-500' : 'bg-slate-800'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                textSettings.enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {textSettings.enabled && (
          <div className="space-y-4">
            {/* Movie Name & Template */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Movie / Series Name</label>
                <input
                  type="text"
                  value={textSettings.movieName}
                  onChange={(e) => updateSetting('movieName', e.target.value)}
                  placeholder="e.g. Inception, Podcast Episode 4"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Naming Template</label>
                <input
                  type="text"
                  value={textSettings.template}
                  onChange={(e) => updateSetting('template', e.target.value)}
                  placeholder="{movie} - Part {part}"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono focus:border-orange-500 focus:outline-none"
                />
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-500">Presets:</span>
                  {templatePresets.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => updateSetting('template', p.value)}
                      className="px-2 py-0.5 text-[10px] bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded border border-slate-800 cursor-pointer"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Part Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-300">Starting Part Number:</span>
                <input
                  type="number"
                  min="1"
                  max="999"
                  value={textSettings.startPart || 1}
                  onChange={(e) => updateSetting('startPart', Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white text-center font-mono focus:border-orange-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-300">Zero-Pad Numbers:</span>
                <button
                  onClick={() => updateSetting('zeroPad', !textSettings.zeroPad)}
                  className={`px-3 py-1 rounded-lg text-xs font-mono font-medium border cursor-pointer ${
                    textSettings.zeroPad
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  {textSettings.zeroPad ? 'Part 01, 02...' : 'Part 1, 2...'}
                </button>
              </div>
            </div>

            {/* Position Selector */}
            <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Screen Position Preset
                </label>
                <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded font-mono">
                  🖱️ DRAG ON VIDEO SUPPORTED
                </span>
              </div>

              <p className="text-[11px] text-slate-400 -mt-1">
                Click and drag the main title directly on the video player to place it anywhere!
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {positions.map((pos) => (
                  <button
                    key={pos.id}
                    onClick={() => {
                      updateSetting('position', pos.id);
                      if (pos.id.startsWith('top')) updateSetting('customY', 10);
                      else if (pos.id.startsWith('bottom')) updateSetting('customY', 88);
                      else updateSetting('customY', 50);
                    }}
                    className={`px-3 py-2 text-xs rounded-lg border text-left transition-colors cursor-pointer ${
                      textSettings.position === pos.id
                        ? 'bg-orange-500/10 border-orange-500 text-white font-medium shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>

              {/* Fine-Tuning Sliders */}
              <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-800/80">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span className="flex items-center space-x-1">
                      <MoveVertical className="w-3 h-3 text-orange-400" />
                      <span>Vertical Position (Y-Height)</span>
                    </span>
                    <span className="font-mono text-amber-400">{textSettings.customY ?? 10}%</span>
                  </div>
                  <input
                    type="range"
                    min="4"
                    max="96"
                    value={textSettings.customY ?? 10}
                    onChange={(e) => updateSetting('customY', parseInt(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span className="flex items-center space-x-1">
                      <MoveHorizontal className="w-3 h-3 text-orange-400" />
                      <span>Horizontal Offset (X-Axis)</span>
                    </span>
                    <span className="font-mono text-amber-400">{textSettings.customX ?? 50}%</span>
                  </div>
                  <input
                    type="range"
                    min="4"
                    max="96"
                    value={textSettings.customX ?? 50}
                    onChange={(e) => updateSetting('customX', parseInt(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                </div>
              </div>
            </div>

            {/* Typography & Styling */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-300">Font</label>
                <select
                  value={textSettings.font}
                  onChange={(e) => updateSetting('font', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-orange-500 focus:outline-none"
                >
                  {fonts.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Font Size</span>
                  <span className="font-mono text-amber-400">{textSettings.fontSize}px</span>
                </div>
                <input
                  type="range"
                  min="16"
                  max="64"
                  value={textSettings.fontSize}
                  onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-300">Text Color</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={textSettings.color}
                    onChange={(e) => updateSetting('color', e.target.value)}
                    className="w-8 h-8 rounded border border-slate-700 bg-transparent cursor-pointer"
                  />
                  <span className="text-xs font-mono text-slate-400">{textSettings.color}</span>
                </div>
              </div>
            </div>

            {/* Outline & Background */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950/40 p-3 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="outlineToggle"
                    checked={textSettings.outline}
                    onChange={(e) => updateSetting('outline', e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-orange-500 focus:ring-0 cursor-pointer"
                  />
                  <label htmlFor="outlineToggle" className="text-xs text-slate-300 cursor-pointer">
                    Text Outline Shadow
                  </label>
                </div>
                {textSettings.outline && (
                  <input
                    type="color"
                    value={textSettings.outlineColor}
                    onChange={(e) => updateSetting('outlineColor', e.target.value)}
                    className="w-6 h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                  />
                )}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="bgToggle"
                    checked={textSettings.bgEnabled}
                    onChange={(e) => updateSetting('bgEnabled', e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-orange-500 focus:ring-0 cursor-pointer"
                  />
                  <label htmlFor="bgToggle" className="text-xs text-slate-300 cursor-pointer">
                    Pill Box Background
                  </label>
                </div>
                {textSettings.bgEnabled && (
                  <input
                    type="color"
                    value={textSettings.bgColor && textSettings.bgColor.startsWith('#') ? textSettings.bgColor : '#000000'}
                    onChange={(e) => updateSetting('bgColor', e.target.value)}
                    className="w-6 h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── SECTION 2: EXTRA CUSTOM TEXT OVERLAYS & POSITIONS ── */}
      <div className="pt-4 border-t border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <MessageSquare className="w-5 h-5 text-emerald-400" />
            <div>
              <h4 className="text-sm font-semibold text-white">Extra Custom Text Overlays</h4>
              <p className="text-xs text-slate-400">Add call-to-actions, social handles, or subtitles at any position</p>
            </div>
          </div>

          <button
            onClick={handleAddExtraText}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl flex items-center space-x-1.5 shadow-md shadow-emerald-500/20 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Extra Text</span>
          </button>
        </div>

        {extraTexts.length === 0 ? (
          <div
            onClick={handleAddExtraText}
            className="border-2 border-dashed border-slate-800 hover:border-slate-700 bg-slate-950/40 p-5 rounded-xl text-center cursor-pointer transition-colors"
          >
            <Sparkles className="w-5 h-5 text-slate-500 mx-auto mb-1.5" />
            <p className="text-xs font-medium text-slate-300">No extra text added yet</p>
            <p className="text-[11px] text-slate-500">Click to add "Follow for Part 2", "@channel", or custom banner</p>
          </div>
        ) : (
          <div className="space-y-3">
            {extraTexts.map((item, index) => (
              <div
                key={item.id}
                className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 space-y-3 shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px] flex items-center justify-center font-mono">
                      #{index + 1}
                    </span>
                    <span className="text-xs font-bold text-white truncate max-w-[180px]">
                      {item.text || 'Custom Text'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => updateExtraText(item.id, 'enabled', !item.enabled)}
                      className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                        item.enabled
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : 'bg-slate-900 border-slate-800 text-slate-500'
                      }`}
                      title={item.enabled ? 'Hide text' : 'Show text'}
                    >
                      {item.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      onClick={() => handleDeleteExtraText(item.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                      title="Delete extra text"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {item.enabled && (
                  <div className="space-y-3 pt-1">
                    {/* Text Input */}
                    <input
                      type="text"
                      value={item.text}
                      onChange={(e) => updateExtraText(item.id, 'text', e.target.value)}
                      placeholder="e.g. Follow for Part 2! 🔥 or @myhandle"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:border-orange-500 focus:outline-none"
                    />

                    {/* Position Sliders & Drag tip */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-slate-400">
                          <span>Vertical Position (Y)</span>
                          <span className="font-mono text-amber-400">{item.customY ?? 88}%</span>
                        </div>
                        <input
                          type="range"
                          min="4"
                          max="96"
                          value={item.customY ?? 88}
                          onChange={(e) => updateExtraText(item.id, 'customY', parseInt(e.target.value))}
                          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-slate-400">
                          <span>Horizontal Position (X)</span>
                          <span className="font-mono text-amber-400">{item.customX ?? 50}%</span>
                        </div>
                        <input
                          type="range"
                          min="4"
                          max="96"
                          value={item.customX ?? 50}
                          onChange={(e) => updateExtraText(item.id, 'customX', parseInt(e.target.value))}
                          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                      </div>
                    </div>

                    {/* Size, Color & Background */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-slate-400">
                          <span>Size</span>
                          <span className="font-mono text-amber-400">{item.fontSize || 22}px</span>
                        </div>
                        <input
                          type="range"
                          min="14"
                          max="48"
                          value={item.fontSize || 22}
                          onChange={(e) => updateExtraText(item.id, 'fontSize', parseInt(e.target.value))}
                          className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <span className="text-[11px] text-slate-400">Color</span>
                        <div className="flex items-center space-x-1.5">
                          <input
                            type="color"
                            value={item.color || '#ffffff'}
                            onChange={(e) => updateExtraText(item.id, 'color', e.target.value)}
                            className="w-6 h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                          />
                          <span className="text-[10px] font-mono text-slate-400">{item.color || '#ffffff'}</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 pt-3">
                        <input
                          type="checkbox"
                          id={`bg-${item.id}`}
                          checked={item.bgEnabled}
                          onChange={(e) => updateExtraText(item.id, 'bgEnabled', e.target.checked)}
                          className="rounded bg-slate-900 border-slate-700 text-orange-500 focus:ring-0 cursor-pointer"
                        />
                        <label htmlFor={`bg-${item.id}`} className="text-[11px] text-slate-300 cursor-pointer">
                          Pill Box
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
