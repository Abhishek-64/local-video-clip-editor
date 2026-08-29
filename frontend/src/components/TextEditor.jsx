import React from 'react';
import {
  Type,
  Palette,
  Hash,
  MoveVertical,
  MoveHorizontal,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Sparkles,
  MessageSquare,
  Layers,
  Check,
  Layout,
  Sliders,
  Paintbrush
} from 'lucide-react';

export default function TextEditor({
  textSettings = {},
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
    { id: 'top-center', label: 'Top Center' },
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

  const overlayTemplatePresets = [
    { label: 'Standard', value: '{movie} - Part {part}' },
    { label: 'Part First', value: 'Part {part} | {movie}' },
    { label: 'Two Lines', value: '{movie}\nPart {part}' },
    { label: 'Part Only', value: 'PART {part}' },
    { label: 'Title Only', value: '{movie}' }
  ];

  // Helper to insert tokens at the end of input
  const insertToken = (settingKey, token) => {
    const current = textSettings[settingKey] || '';
    updateSetting(settingKey, `${current}${current ? ' ' : ''}${token}`);
  };

  // Preview computations
  const overlayTitle = textSettings.movieName || 'My Movie';
  const startPart = Math.max(1, parseInt(textSettings.startPart) || 1);
  const partFormatted = textSettings.zeroPad ? String(startPart).padStart(2, '0') : String(startPart);

  const previewRenderedOverlay = (textSettings.template || '{movie} - Part {part}')
    .replace(/\{movie\}/gi, overlayTitle)
    .replace(/\{title\}/gi, overlayTitle)
    .replace(/\{text\}/gi, overlayTitle)
    .replace(/\{part\}/gi, partFormatted);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ── CARD 1: MAIN ON-SCREEN TEXT OVERLAY & TITLE ── */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-lg">
        {/* Section Header with Enable/Disable Switch */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 gap-2">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 shrink-0">
              <Type className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h4 className="text-xs sm:text-sm font-bold text-white truncate">On-Screen Text Overlay</h4>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-orange-500/10 border border-orange-500/30 text-orange-300">
                  Video Overlay
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                Direct text drawn onto video frames for titles and episode parts
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => updateSetting('enabled', !textSettings.enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer shrink-0 touch-manipulation ${
              textSettings.enabled ? 'bg-orange-500' : 'bg-slate-800'
            }`}
            title={textSettings.enabled ? 'Disable video text overlay' : 'Enable video text overlay'}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                textSettings.enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {textSettings.enabled && (
          <div className="space-y-4 animate-fadeIn">
            {/* Field 1: Movie / Video Title */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-200 flex items-center justify-between">
                <span>Movie / Video Title</span>
                <span className="text-[10px] text-orange-400 font-mono">Custom text</span>
              </label>
              <input
                type="text"
                value={textSettings.movieName || ''}
                onChange={(e) => updateSetting('movieName', e.target.value)}
                placeholder="e.g. Inception, Episode 1, Epic Clutch"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-white focus:border-orange-500 focus:outline-none shadow-inner"
              />
              <p className="text-[10px] text-slate-400 leading-tight">
                Replaces the <code className="text-orange-400 font-mono">{'{movie}'}</code> token in templates.
              </p>
            </div>

            {/* Field 2: On-Screen Overlay Template */}
            <div className="space-y-2 pt-1 border-t border-slate-800/80">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <label className="text-xs font-semibold text-slate-200">Overlay Template</label>
                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={() => insertToken('template', '{movie}')}
                    className="px-1.5 py-0.5 text-[9px] bg-slate-900 hover:bg-slate-800 text-orange-300 border border-orange-500/30 rounded font-mono cursor-pointer"
                    title="Insert {movie} token"
                  >
                    +{'{movie}'}
                  </button>
                  <button
                    type="button"
                    onClick={() => insertToken('template', '{part}')}
                    className="px-1.5 py-0.5 text-[9px] bg-slate-900 hover:bg-slate-800 text-orange-300 border border-orange-500/30 rounded font-mono cursor-pointer"
                    title="Insert {part} token"
                  >
                    +{'{part}'}
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={textSettings.template || ''}
                onChange={(e) => updateSetting('template', e.target.value)}
                placeholder="{movie} - Part {part}"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-white font-mono focus:border-orange-500 focus:outline-none shadow-inner"
              />
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] text-slate-500 mr-1">Presets:</span>
                {overlayTemplatePresets.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => updateSetting('template', p.value)}
                    className={`px-2 py-0.5 text-[10px] rounded border transition-colors cursor-pointer touch-manipulation ${
                      textSettings.template === p.value
                        ? 'bg-orange-500/20 border-orange-500/50 text-orange-300 font-bold'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-800'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Field 3: Part Numbering Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-300 font-medium">Start Part Number:</span>
                <input
                  type="number"
                  min="1"
                  max="999"
                  value={textSettings.startPart || 1}
                  onChange={(e) => updateSetting('startPart', Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white text-center font-mono font-bold focus:border-orange-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-300 font-medium">Part Zero-Padding:</span>
                <button
                  type="button"
                  onClick={() => updateSetting('zeroPad', !textSettings.zeroPad)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium border cursor-pointer touch-manipulation transition-colors ${
                    textSettings.zeroPad
                      ? 'bg-orange-500/20 border-orange-500/40 text-orange-300 font-bold'
                      : 'bg-slate-950 border-slate-700 text-slate-400'
                  }`}
                >
                  {textSettings.zeroPad ? 'Part 01, 02...' : 'Part 1, 2...'}
                </button>
              </div>
            </div>

            {/* Field 4: Live Rendered Overlay Text Preview */}
            <div className="bg-slate-900/90 border border-orange-500/20 rounded-xl p-3 sm:p-3.5 flex items-center justify-between gap-2 shadow-sm">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider block mb-0.5">
                  Live Overlay Text Preview:
                </span>
                <p className="text-xs font-bold text-white font-mono break-words">
                  "{previewRenderedOverlay}"
                </p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-orange-500/10 border border-orange-500/30 text-orange-300 shrink-0">
                Part #{partFormatted}
              </span>
            </div>
          </div>
        )}
      </div>

      {textSettings.enabled && (
        <>
          {/* ── CARD 2: POSITION & PLACEMENT ── */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-lg animate-fadeIn">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Layout className="w-4 h-4 text-orange-400" />
                <h4 className="text-xs sm:text-sm font-bold text-white">Placement &amp; Position</h4>
              </div>
              <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded font-mono">
                🖱️ Drag on player enabled
              </span>
            </div>

            {/* Preset Alignment Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
              {positions.map((pos) => (
                <button
                  key={pos.id}
                  type="button"
                  onClick={() => {
                    updateSetting('position', pos.id);
                    if (pos.id.startsWith('top')) updateSetting('customY', 10);
                    else if (pos.id.startsWith('bottom')) updateSetting('customY', 88);
                    else updateSetting('customY', 50);
                  }}
                  className={`px-2.5 py-1.5 text-xs rounded-lg border text-left transition-colors cursor-pointer touch-manipulation ${
                    textSettings.position === pos.id
                      ? 'bg-orange-500/20 border-orange-500 text-white font-medium shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {pos.label}
                </button>
              ))}
            </div>

            {/* Fine-Tuning Sliders */}
            <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 border-t border-slate-800/80">
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-400">
                  <span className="flex items-center space-x-1">
                    <MoveVertical className="w-3.5 h-3.5 text-orange-400" />
                    <span>Vertical Height (Y)</span>
                  </span>
                  <span className="font-mono text-amber-400 font-bold">{textSettings.customY ?? 10}%</span>
                </div>
                <input
                  type="range"
                  min="4"
                  max="96"
                  value={textSettings.customY ?? 10}
                  onChange={(e) => updateSetting('customY', parseInt(e.target.value))}
                  className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-400">
                  <span className="flex items-center space-x-1">
                    <MoveHorizontal className="w-3.5 h-3.5 text-orange-400" />
                    <span>Horizontal Offset (X)</span>
                  </span>
                  <span className="font-mono text-amber-400 font-bold">{textSettings.customX ?? 50}%</span>
                </div>
                <input
                  type="range"
                  min="4"
                  max="96"
                  value={textSettings.customX ?? 50}
                  onChange={(e) => updateSetting('customX', parseInt(e.target.value))}
                  className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
                />
              </div>
            </div>
          </div>

          {/* ── CARD 3: TYPOGRAPHY, COLORS & STYLING ── */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-lg animate-fadeIn">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Palette className="w-4 h-4 text-orange-400" />
                <h4 className="text-xs sm:text-sm font-bold text-white">Typography &amp; Styling</h4>
              </div>
            </div>

            {/* Font Family, Size & Color */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-300 font-medium">Font Family</label>
                <select
                  value={textSettings.font || 'Inter, sans-serif'}
                  onChange={(e) => updateSetting('font', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-orange-500 focus:outline-none cursor-pointer"
                >
                  {fonts.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300 font-medium">
                  <span>Font Size</span>
                  <span className="font-mono text-amber-400 font-bold">{textSettings.fontSize || 28}px</span>
                </div>
                <input
                  type="range"
                  min="16"
                  max="64"
                  value={textSettings.fontSize || 28}
                  onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
                  className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-300 font-medium">Text Color</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={textSettings.color || '#ffffff'}
                    onChange={(e) => updateSetting('color', e.target.value)}
                    className="w-8 h-8 rounded-lg border border-slate-700 bg-transparent cursor-pointer"
                  />
                  <span className="text-xs font-mono text-slate-400">{textSettings.color || '#ffffff'}</span>
                </div>
              </div>
            </div>

            {/* Outline Shadow & Background Pill */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="outlineToggle"
                    checked={textSettings.outline !== false}
                    onChange={(e) => updateSetting('outline', e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-orange-500 focus:ring-0 cursor-pointer"
                  />
                  <label htmlFor="outlineToggle" className="text-xs text-slate-300 cursor-pointer font-medium">
                    Text Shadow Outline
                  </label>
                </div>
                {textSettings.outline !== false && (
                  <input
                    type="color"
                    value={textSettings.outlineColor || '#000000'}
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
                    checked={Boolean(textSettings.bgEnabled)}
                    onChange={(e) => updateSetting('bgEnabled', e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-orange-500 focus:ring-0 cursor-pointer"
                  />
                  <label htmlFor="bgToggle" className="text-xs text-slate-300 cursor-pointer font-medium">
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
        </>
      )}

      {/* ── EXTRA CUSTOM TEXT OVERLAYS ── */}
      <div className="pt-2 border-t border-slate-800 space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2 min-w-0">
            <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <h4 className="text-xs sm:text-sm font-semibold text-white truncate">Extra Text Overlays</h4>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">Social handles, CTA, custom banners</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddExtraText}
            className="px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl flex items-center space-x-1.5 shadow-md shadow-emerald-500/20 transition-colors cursor-pointer shrink-0 touch-manipulation"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Text</span>
          </button>
        </div>

        {extraTexts.length === 0 ? (
          <div
            onClick={handleAddExtraText}
            className="border-2 border-dashed border-slate-800 hover:border-slate-700 bg-slate-950/40 p-4 sm:p-5 rounded-xl text-center cursor-pointer transition-colors touch-manipulation"
          >
            <Sparkles className="w-5 h-5 text-slate-500 mx-auto mb-1.5" />
            <p className="text-xs font-medium text-slate-300">No extra text added yet</p>
            <p className="text-[11px] text-slate-500">Click to add "Follow for Part 2", "@mychannel", or a custom banner</p>
          </div>
        ) : (
          <div className="space-y-3">
            {extraTexts.map((item, index) => (
              <div
                key={item.id}
                className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 sm:p-3.5 space-y-3 shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px] flex items-center justify-center font-mono shrink-0">
                      #{index + 1}
                    </span>
                    <span className="text-xs font-bold text-white truncate max-w-[150px] sm:max-w-xs">
                      {item.text || 'Custom Text'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateExtraText(item.id, 'enabled', !item.enabled)}
                      className={`p-1.5 rounded-lg border transition-colors cursor-pointer touch-manipulation ${
                        item.enabled
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : 'bg-slate-900 border-slate-800 text-slate-500'
                      }`}
                      title={item.enabled ? 'Hide text' : 'Show text'}
                    >
                      {item.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteExtraText(item.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer touch-manipulation"
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

                    {/* Position Sliders */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-slate-400">
                          <span>Vertical Height (Y)</span>
                          <span className="font-mono text-amber-400 font-bold">{item.customY ?? 88}%</span>
                        </div>
                        <input
                          type="range"
                          min="4"
                          max="96"
                          value={item.customY ?? 88}
                          onChange={(e) => updateExtraText(item.id, 'customY', parseInt(e.target.value))}
                          className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 touch-manipulation"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-slate-400">
                          <span>Horizontal Offset (X)</span>
                          <span className="font-mono text-amber-400 font-bold">{item.customX ?? 50}%</span>
                        </div>
                        <input
                          type="range"
                          min="4"
                          max="96"
                          value={item.customX ?? 50}
                          onChange={(e) => updateExtraText(item.id, 'customX', parseInt(e.target.value))}
                          className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 touch-manipulation"
                        />
                      </div>
                    </div>

                    {/* Size, Color & Background */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-slate-400">
                          <span>Size</span>
                          <span className="font-mono text-amber-400 font-bold">{item.fontSize || 22}px</span>
                        </div>
                        <input
                          type="range"
                          min="14"
                          max="48"
                          value={item.fontSize || 22}
                          onChange={(e) => updateExtraText(item.id, 'fontSize', parseInt(e.target.value))}
                          className="w-full h-2 sm:h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
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
                          checked={Boolean(item.bgEnabled)}
                          onChange={(e) => updateExtraText(item.id, 'bgEnabled', e.target.checked)}
                          className="rounded bg-slate-950 border-slate-700 text-orange-500 focus:ring-0 cursor-pointer"
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
