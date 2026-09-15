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
  Paintbrush,
  Youtube,
  Share2,
  Instagram,
  Clock,
  Italic,
  SlidersHorizontal,
  Wand2
} from 'lucide-react';

export default function TextEditor({
  textSettings = {},
  onChange,
  ytSettings = {},
  fbSettings = {},
  igSettings = {}
}) {
  const updateSetting = (key, value) => {
    onChange({
      ...textSettings,
      [key]: value
    });
  };

  const updateMultipleSettings = (newSettings) => {
    onChange({
      ...textSettings,
      ...newSettings
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

  const updateMultipleExtraText = (id, newProps) => {
    const updated = extraTexts.map((item) => {
      if (item.id === id) {
        return { ...item, ...newProps };
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
      opacity: 100,
      outline: true,
      outlineColor: '#000000',
      outlineThickness: 3,
      bgEnabled: true,
      bgColor: '#000000',
      bgOpacity: 75,
      bgPadding: 6,
      bgRadius: 8,
      textTransform: 'none',
      fontStyle: 'normal',
      letterSpacing: 0,
      displayMode: 'all',
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

  const stylePresets = [
    {
      id: 'viral-meme',
      name: 'Viral Meme',
      badge: '🔥 Top Trend',
      description: 'Impact bold with black outline for high CTR',
      previewBg: 'bg-black',
      previewText: 'VIRAL MEME',
      previewTextColor: '#ffffff',
      previewFont: 'Impact, sans-serif',
      settings: {
        font: 'Impact, sans-serif',
        color: '#ffffff',
        opacity: 100,
        outline: true,
        outlineColor: '#000000',
        outlineThickness: 4,
        bgEnabled: false,
        textTransform: 'uppercase',
        fontStyle: 'normal',
        letterSpacing: 2
      }
    },
    {
      id: 'neon-cyber',
      name: 'Neon Cyber',
      badge: '⚡ Gaming',
      description: 'Cyan glow with pink shadow & dark backdrop',
      previewBg: 'bg-slate-950 border border-cyan-500/40',
      previewText: 'NEON CYBER',
      previewTextColor: '#00ffff',
      previewFont: 'Inter, sans-serif',
      settings: {
        font: 'Inter, sans-serif',
        color: '#00ffff',
        opacity: 100,
        outline: true,
        outlineColor: '#ff007f',
        outlineThickness: 3,
        bgEnabled: true,
        bgColor: '#090a0f',
        bgOpacity: 85,
        bgPadding: 8,
        textTransform: 'uppercase',
        fontStyle: 'normal',
        letterSpacing: 4
      }
    },
    {
      id: 'movie-cinema',
      name: 'Movie Cinema',
      badge: '🎬 Dramatic',
      description: 'Elegant serif subtitle with golden yellow warmth',
      previewBg: 'bg-black/90',
      previewText: 'Movie Cinema',
      previewTextColor: '#fef08a',
      previewFont: 'Georgia, serif',
      settings: {
        font: 'Georgia, serif',
        color: '#fef08a',
        opacity: 100,
        outline: true,
        outlineColor: '#000000',
        outlineThickness: 2,
        bgEnabled: true,
        bgColor: '#000000',
        bgOpacity: 75,
        bgPadding: 8,
        textTransform: 'none',
        fontStyle: 'italic',
        letterSpacing: 2
      }
    },
    {
      id: 'red-alert',
      name: 'Red Alert',
      badge: '🚨 Urgent',
      description: 'Punchy red badge for suspense & news hooks',
      previewBg: 'bg-red-600',
      previewText: 'RED ALERT',
      previewTextColor: '#ffffff',
      previewFont: 'Impact, sans-serif',
      settings: {
        font: 'Impact, sans-serif',
        color: '#ffffff',
        opacity: 100,
        outline: true,
        outlineColor: '#7f1d1d',
        outlineThickness: 3,
        bgEnabled: true,
        bgColor: '#ef4444',
        bgOpacity: 90,
        bgPadding: 8,
        textTransform: 'uppercase',
        fontStyle: 'normal',
        letterSpacing: 2
      }
    },
    {
      id: 'golden-luxe',
      name: 'Golden Luxe',
      badge: '👑 Premium',
      description: 'Warm gold typography with deep espresso contrast',
      previewBg: 'bg-stone-900',
      previewText: 'Golden Luxe',
      previewTextColor: '#fbbf24',
      previewFont: 'Georgia, serif',
      settings: {
        font: 'Georgia, serif',
        color: '#fbbf24',
        opacity: 100,
        outline: true,
        outlineColor: '#78350f',
        outlineThickness: 2,
        bgEnabled: true,
        bgColor: '#1c1917',
        bgOpacity: 85,
        bgPadding: 8,
        textTransform: 'capitalize',
        fontStyle: 'normal',
        letterSpacing: 2
      }
    },
    {
      id: 'minimal-clean',
      name: 'Minimal Clean',
      badge: '✨ Subtle',
      description: 'Semi-transparent modern pill for documentary & vlogs',
      previewBg: 'bg-slate-900/80',
      previewText: 'Minimal Clean',
      previewTextColor: '#ffffff',
      previewFont: 'Inter, sans-serif',
      settings: {
        font: 'Inter, sans-serif',
        color: '#ffffff',
        opacity: 95,
        outline: false,
        outlineColor: '#000000',
        outlineThickness: 2,
        bgEnabled: true,
        bgColor: '#000000',
        bgOpacity: 60,
        bgPadding: 8,
        textTransform: 'none',
        fontStyle: 'normal',
        letterSpacing: 0
      }
    }
  ];

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
    { id: 'Georgia, serif', name: 'Georgia (Cinema)' },
    { id: 'monospace', name: 'Monospace' }
  ];

  const displayModes = [
    { id: 'all', label: 'All Parts (Full Series)', desc: 'Visible on every generated clip' },
    { id: 'first', label: 'Part 1 Only', desc: 'Introduces title on first part only' },
    { id: 'last', label: 'Final Part Only', desc: 'Call to action on concluding part' }
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

  let rawPreview = (textSettings.template || '{movie} - Part {part}')
    .replace(/\{movie\}/gi, overlayTitle)
    .replace(/\{title\}/gi, overlayTitle)
    .replace(/\{text\}/gi, overlayTitle)
    .replace(/\{part\}/gi, partFormatted);

  if (textSettings.textTransform === 'uppercase') rawPreview = rawPreview.toUpperCase();
  else if (textSettings.textTransform === 'lowercase') rawPreview = rawPreview.toLowerCase();
  else if (textSettings.textTransform === 'capitalize') rawPreview = rawPreview.replace(/\b\w/g, c => c.toUpperCase());

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
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <label className="text-xs font-semibold text-slate-200">
                  Movie / Video Title
                </label>
                <div className="flex flex-wrap items-center gap-1">
                  {ytSettings?.yt_name && ytSettings.yt_name !== textSettings.movieName && (
                    <button
                      type="button"
                      onClick={() => updateSetting('movieName', ytSettings.yt_name)}
                      className="text-[10px] text-red-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-red-500/30 rounded-lg px-2 py-0.5 transition-colors cursor-pointer flex items-center space-x-1 shrink-0 touch-manipulation"
                      title="Copy series title from YouTube"
                    >
                      <Youtube className="w-2.5 h-2.5 text-red-400" />
                      <span>Sync YT</span>
                    </button>
                  )}
                  {fbSettings?.fb_name && fbSettings.fb_name !== textSettings.movieName && (
                    <button
                      type="button"
                      onClick={() => updateSetting('movieName', fbSettings.fb_name)}
                      className="text-[10px] text-blue-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-blue-500/30 rounded-lg px-2 py-0.5 transition-colors cursor-pointer flex items-center space-x-1 shrink-0 touch-manipulation"
                      title="Copy series title from Facebook"
                    >
                      <Share2 className="w-2.5 h-2.5 text-blue-400" />
                      <span>Sync FB</span>
                    </button>
                  )}
                  {igSettings?.ig_name && igSettings.ig_name !== textSettings.movieName && (
                    <button
                      type="button"
                      onClick={() => updateSetting('movieName', igSettings.ig_name)}
                      className="text-[10px] text-pink-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-pink-500/30 rounded-lg px-2 py-0.5 transition-colors cursor-pointer flex items-center space-x-1 shrink-0 touch-manipulation"
                      title="Copy series title from Instagram"
                    >
                      <Instagram className="w-2.5 h-2.5 text-pink-400" />
                      <span>Sync IG</span>
                    </button>
                  )}
                </div>
              </div>
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

            {/* Field 4: Staying / Display Mode in Clip Sequence */}
            <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
                  <Clock className="w-3.5 h-3.5 text-orange-400" />
                  <span>Display Mode (Staying Across Clips)</span>
                </label>
                <span className="text-[10px] font-mono text-slate-400">
                  {displayModes.find((m) => m.id === (textSettings.displayMode || 'all'))?.label}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-2">
                {displayModes.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => updateSetting('displayMode', mode.id)}
                    className={`p-2 rounded-xl border text-left transition-all cursor-pointer touch-manipulation ${
                      (textSettings.displayMode || 'all') === mode.id
                        ? 'bg-orange-500/20 border-orange-500 text-white shadow-sm'
                        : 'bg-slate-900/80 hover:bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="text-xs font-bold leading-tight">{mode.label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{mode.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Field 5: Live Rendered Overlay Text Preview */}
            <div className="bg-slate-900/90 border border-orange-500/20 rounded-xl p-3 sm:p-3.5 flex items-center justify-between gap-2 shadow-sm">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider block mb-0.5">
                  Live Overlay Text Preview:
                </span>
                <p className="text-xs font-bold text-white font-mono break-words" style={{ fontStyle: textSettings.fontStyle || 'normal' }}>
                  "{rawPreview}"
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
          {/* ── CARD 2: ONE-CLICK TEXT STYLING PRESETS ── */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-lg animate-fadeIn">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Wand2 className="w-4 h-4 text-orange-400" />
                <h4 className="text-xs sm:text-sm font-bold text-white">1-Click Style Presets</h4>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                Click any style to apply instantly
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              {stylePresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => updateMultipleSettings(preset.settings)}
                  className="group p-2.5 rounded-xl border bg-slate-900/80 hover:bg-slate-900 border-slate-800 hover:border-orange-500/50 text-left transition-all cursor-pointer touch-manipulation hover:shadow-md flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                        {preset.badge}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-white group-hover:text-orange-300 transition-colors">
                      {preset.name}
                    </div>
                    <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
                      {preset.description}
                    </div>
                  </div>

                  <div className={`mt-2 py-1 px-2 rounded-lg text-center font-bold text-[11px] ${preset.previewBg}`} style={{ color: preset.previewTextColor, fontFamily: preset.previewFont }}>
                    {preset.previewText}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── CARD 3: POSITION & PLACEMENT ── */}
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
                  min="2"
                  max="98"
                  step="2"
                  value={textSettings.customY ?? 10}
                  onChange={(e) => updateSetting('customY', Math.max(2, parseInt(e.target.value)))}
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
                  min="2"
                  max="98"
                  step="2"
                  value={textSettings.customX ?? 50}
                  onChange={(e) => updateSetting('customX', Math.max(2, parseInt(e.target.value)))}
                  className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
                />
              </div>
            </div>
          </div>

          {/* ── CARD 4: TYPOGRAPHY, OPACITY & STYLING CONTROLS ── */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-lg animate-fadeIn">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Palette className="w-4 h-4 text-orange-400" />
                <h4 className="text-xs sm:text-sm font-bold text-white">Typography &amp; Styling</h4>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                Min 2px Stepping / Opacity Sliders
              </span>
            </div>

            {/* Row 1: Font Family, Font Size (min 2px) & Text Color */}
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
                  <span>Font Size (min 2px)</span>
                  <span className="font-mono text-amber-400 font-bold">{Math.max(2, textSettings.fontSize || 28)}px</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="96"
                  step="2"
                  value={Math.max(2, textSettings.fontSize || 28)}
                  onChange={(e) => updateSetting('fontSize', Math.max(2, parseInt(e.target.value)))}
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

            {/* Row 2: Text Opacity Bar (0 - 100%) & Letter Spacing (min 0, step 2px) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-1 border-t border-slate-800/80">
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300 font-medium">
                  <span className="flex items-center space-x-1.5">
                    <Sliders className="w-3.5 h-3.5 text-orange-400" />
                    <span>Text Opacity</span>
                  </span>
                  <span className="font-mono text-amber-400 font-bold">{textSettings.opacity ?? 100}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="2"
                  value={textSettings.opacity ?? 100}
                  onChange={(e) => updateSetting('opacity', parseInt(e.target.value))}
                  className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300 font-medium">
                  <span>Letter Spacing (min 2px step)</span>
                  <span className="font-mono text-amber-400 font-bold">{textSettings.letterSpacing || 0}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="20"
                  step="2"
                  value={textSettings.letterSpacing || 0}
                  onChange={(e) => updateSetting('letterSpacing', parseInt(e.target.value))}
                  className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
                />
              </div>
            </div>

            {/* Row 3: Text Case (Transform) and Font Style (Italic) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-300 font-medium block">Text Transform Case</label>
                <div className="flex items-center space-x-1">
                  {[
                    { id: 'none', label: 'Normal' },
                    { id: 'uppercase', label: 'UPPER' },
                    { id: 'lowercase', label: 'lower' },
                    { id: 'capitalize', label: 'Capital' }
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => updateSetting('textTransform', t.id)}
                      className={`px-2.5 py-1 text-[11px] rounded-lg border font-medium transition-colors cursor-pointer touch-manipulation ${
                        (textSettings.textTransform || 'none') === t.id
                          ? 'bg-orange-500/20 border-orange-500 text-orange-300 font-bold'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-300 font-medium block">Font Style</label>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => updateSetting('fontStyle', textSettings.fontStyle === 'italic' ? 'normal' : 'italic')}
                    className={`px-3 py-1 text-[11px] rounded-lg border font-medium flex items-center space-x-1.5 cursor-pointer touch-manipulation transition-colors ${
                      textSettings.fontStyle === 'italic'
                        ? 'bg-orange-500/20 border-orange-500 text-orange-300 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Italic className="w-3.5 h-3.5" />
                    <span>Italic Accent</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Row 4: Outline Shadow & Background Pill Box with Opacity Bar */}
            <div className="space-y-3 bg-slate-900/40 p-3.5 rounded-xl border border-slate-800">
              {/* Outline Shadow */}
              <div className="space-y-2 pb-2.5 border-b border-slate-800/80">
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

                {textSettings.outline !== false && (
                  <div className="space-y-1 pl-6">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Outline Thickness (min 2px step)</span>
                      <span className="font-mono text-amber-400 font-bold">{Math.max(2, textSettings.outlineThickness || 3)}px</span>
                    </div>
                    <input
                      type="range"
                      min="2"
                      max="16"
                      step="2"
                      value={Math.max(2, textSettings.outlineThickness || 3)}
                      onChange={(e) => updateSetting('outlineThickness', Math.max(2, parseInt(e.target.value)))}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
                    />
                  </div>
                )}
              </div>

              {/* Background Pill Box & Opacity Bar */}
              <div className="space-y-2.5">
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

                {textSettings.bgEnabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6 pt-1">
                    {/* Background Opacity Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Background Opacity Bar</span>
                        <span className="font-mono text-amber-400 font-bold">{textSettings.bgOpacity ?? 75}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="2"
                        value={textSettings.bgOpacity ?? 75}
                        onChange={(e) => updateSetting('bgOpacity', parseInt(e.target.value))}
                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
                      />
                    </div>

                    {/* Box Padding (min 2px) */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Box Padding (min 2px step)</span>
                        <span className="font-mono text-amber-400 font-bold">{Math.max(2, textSettings.bgPadding ?? 8)}px</span>
                      </div>
                      <input
                        type="range"
                        min="2"
                        max="32"
                        step="2"
                        value={Math.max(2, textSettings.bgPadding ?? 8)}
                        onChange={(e) => updateSetting('bgPadding', Math.max(2, parseInt(e.target.value)))}
                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
                      />
                    </div>
                  </div>
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
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">Social handles, CTA banners, callouts</p>
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
            <p className="text-[11px] text-slate-500">Click to add handle, CTA, or custom overlay</p>
          </div>
        ) : (
          <div className="space-y-4">
            {extraTexts.map((item, index) => (
              <div
                key={item.id}
                className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3.5 sm:p-4 space-y-3.5 shadow-lg"
              >
                {/* Header with Title and Visibility/Delete controls */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                  <div className="flex items-center space-x-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px] flex items-center justify-center font-mono shrink-0">
                      #{index + 1}
                    </span>
                    <span className="text-xs font-bold text-white truncate max-w-[170px] sm:max-w-xs">
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
                  <div className="space-y-3.5 pt-0.5">
                    {/* 1. Text Input & Quick Suggestions */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <label className="text-slate-300 font-medium">Text Content</label>
                        <span className="text-[10px] font-mono text-slate-500">Overlay Line</span>
                      </div>
                      <input
                        type="text"
                        value={item.text || ''}
                        onChange={(e) => updateExtraText(item.id, 'text', e.target.value)}
                        placeholder="e.g. Follow for Part 2! 🔥 or @myhandle"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:border-emerald-500 focus:outline-none"
                      />
                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        <span className="text-[10px] text-slate-500 mr-1">Quick:</span>
                        {[
                          'Follow for Part 2! 🔥',
                          '@mychannel',
                          'Link in bio 🔗',
                          'Part 2 tomorrow! 🎬',
                          'Subscribe for more! ⭐'
                        ].map((quickText) => (
                          <button
                            key={quickText}
                            type="button"
                            onClick={() => updateExtraText(item.id, 'text', quickText)}
                            className="px-2 py-0.5 text-[10px] bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 rounded transition-colors cursor-pointer"
                          >
                            {quickText}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 2. 1-Click Style Presets for this Extra Text */}
                    <div className="space-y-1.5 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                          <Wand2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>1-Click Style Presets</span>
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">Apply to #{index + 1}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {stylePresets.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => updateMultipleExtraText(item.id, preset.settings)}
                            className="p-1.5 rounded-lg border bg-slate-950/80 hover:bg-slate-900 border-slate-800 hover:border-emerald-500/50 text-left transition-all cursor-pointer flex items-center justify-between gap-1"
                          >
                            <span className="text-[11px] font-medium text-slate-300 truncate">{preset.name}</span>
                            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400 shrink-0">
                              {preset.badge.split(' ')[0]}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 3. Staying / Display Mode across Video Clips */}
                    <div className="space-y-1.5 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                          <Clock className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Staying Display Mode</span>
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {displayModes.find((m) => m.id === (item.displayMode || 'all'))?.label}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                        {displayModes.map((mode) => (
                          <button
                            key={mode.id}
                            type="button"
                            onClick={() => updateExtraText(item.id, 'displayMode', mode.id)}
                            className={`px-2 py-1.5 rounded-lg border text-left transition-all cursor-pointer touch-manipulation ${
                              (item.displayMode || 'all') === mode.id
                                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-semibold shadow-sm'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <div className="text-[11px] font-bold leading-tight">{mode.label}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 4. Placement & Position Sliders */}
                    <div className="space-y-2 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                          <Layout className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Position &amp; Placement</span>
                        </span>
                        <span className="text-[10px] text-amber-400 font-mono">🖱️ Drag on player enabled</span>
                      </div>

                      {/* Quick position alignment buttons */}
                      <div className="grid grid-cols-4 sm:grid-cols-7 gap-1">
                        {[
                          { label: 'Top L', x: 15, y: 12 },
                          { label: 'Top C', x: 50, y: 12 },
                          { label: 'Top R', x: 85, y: 12 },
                          { label: 'Center', x: 50, y: 50 },
                          { label: 'Bot L', x: 15, y: 88 },
                          { label: 'Bot C', x: 50, y: 88 },
                          { label: 'Bot R', x: 85, y: 88 }
                        ].map((pos) => (
                          <button
                            key={pos.label}
                            type="button"
                            onClick={() => updateMultipleExtraText(item.id, { customX: pos.x, customY: pos.y })}
                            className="px-1.5 py-1 text-[10px] bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 rounded text-center transition-colors cursor-pointer"
                          >
                            {pos.label}
                          </button>
                        ))}
                      </div>

                      {/* Fine-tuning sliders */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-slate-400">
                            <span className="flex items-center space-x-1">
                              <MoveVertical className="w-3 h-3 text-emerald-400" />
                              <span>Vertical Height (Y)</span>
                            </span>
                            <span className="font-mono text-amber-400 font-bold">{item.customY ?? 88}%</span>
                          </div>
                          <input
                            type="range"
                            min="2"
                            max="98"
                            step="2"
                            value={item.customY ?? 88}
                            onChange={(e) => updateExtraText(item.id, 'customY', Math.max(2, parseInt(e.target.value)))}
                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 touch-manipulation"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-slate-400">
                            <span className="flex items-center space-x-1">
                              <MoveHorizontal className="w-3 h-3 text-emerald-400" />
                              <span>Horizontal Offset (X)</span>
                            </span>
                            <span className="font-mono text-amber-400 font-bold">{item.customX ?? 50}%</span>
                          </div>
                          <input
                            type="range"
                            min="2"
                            max="98"
                            step="2"
                            value={item.customX ?? 50}
                            onChange={(e) => updateExtraText(item.id, 'customX', Math.max(2, parseInt(e.target.value)))}
                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 touch-manipulation"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 5. Typography & Styling Controls */}
                    <div className="space-y-3 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                          <Palette className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Typography &amp; Opacity</span>
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">Min 2px Stepping</span>
                      </div>

                      {/* Font Family, Size (min 2px) & Color */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-300 font-medium">Font Family</label>
                          <select
                            value={item.font || 'Inter, sans-serif'}
                            onChange={(e) => updateExtraText(item.id, 'font', e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none cursor-pointer"
                          >
                            {fonts.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-slate-300 font-medium">
                            <span>Font Size (min 2px)</span>
                            <span className="font-mono text-amber-400 font-bold">{Math.max(2, item.fontSize || 22)}px</span>
                          </div>
                          <input
                            type="range"
                            min="2"
                            max="96"
                            step="2"
                            value={Math.max(2, item.fontSize || 22)}
                            onChange={(e) => updateExtraText(item.id, 'fontSize', Math.max(2, parseInt(e.target.value)))}
                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 touch-manipulation"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-300 font-medium">Text Color</label>
                          <div className="flex items-center space-x-2">
                            <input
                              type="color"
                              value={item.color || '#ffffff'}
                              onChange={(e) => updateExtraText(item.id, 'color', e.target.value)}
                              className="w-7 h-7 rounded border border-slate-700 bg-transparent cursor-pointer"
                            />
                            <span className="text-[11px] font-mono text-slate-400">{item.color || '#ffffff'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Text Opacity Bar (0 - 100%) & Letter Spacing (min 0, step 2px) */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-800/80">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-slate-300 font-medium">
                            <span className="flex items-center space-x-1">
                              <Sliders className="w-3 h-3 text-emerald-400" />
                              <span>Text Opacity Bar</span>
                            </span>
                            <span className="font-mono text-amber-400 font-bold">{item.opacity ?? 100}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="2"
                            value={item.opacity ?? 100}
                            onChange={(e) => updateExtraText(item.id, 'opacity', parseInt(e.target.value))}
                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 touch-manipulation"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-slate-300 font-medium">
                            <span>Letter Spacing (min 2px step)</span>
                            <span className="font-mono text-amber-400 font-bold">{item.letterSpacing || 0}px</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="20"
                            step="2"
                            value={item.letterSpacing || 0}
                            onChange={(e) => updateExtraText(item.id, 'letterSpacing', parseInt(e.target.value))}
                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 touch-manipulation"
                          />
                        </div>
                      </div>

                      {/* Text Transform Case & Italic Accent */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-300 font-medium block">Text Transform Case</label>
                          <div className="flex items-center space-x-1">
                            {[
                              { id: 'none', label: 'Normal' },
                              { id: 'uppercase', label: 'UPPER' },
                              { id: 'lowercase', label: 'lower' },
                              { id: 'capitalize', label: 'Capital' }
                            ].map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => updateExtraText(item.id, 'textTransform', t.id)}
                                className={`px-2 py-0.5 text-[10px] rounded border font-medium transition-colors cursor-pointer ${
                                  (item.textTransform || 'none') === t.id
                                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                                }`}
                              >
                                {t.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-300 font-medium block">Font Style</label>
                          <button
                            type="button"
                            onClick={() => updateExtraText(item.id, 'fontStyle', item.fontStyle === 'italic' ? 'normal' : 'italic')}
                            className={`px-3 py-1 text-[11px] rounded-lg border font-medium flex items-center space-x-1.5 cursor-pointer touch-manipulation transition-colors ${
                              item.fontStyle === 'italic'
                                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <Italic className="w-3.5 h-3.5" />
                            <span>Italic Accent</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 6. Outline Shadow & Pill Box Background with Opacity Bar */}
                    <div className="space-y-3 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800">
                      {/* Outline Shadow */}
                      <div className="space-y-2 pb-2 border-b border-slate-800/80">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id={`outline-${item.id}`}
                              checked={item.outline !== false}
                              onChange={(e) => updateExtraText(item.id, 'outline', e.target.checked)}
                              className="rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-0 cursor-pointer"
                            />
                            <label htmlFor={`outline-${item.id}`} className="text-xs text-slate-300 cursor-pointer font-medium">
                              Text Shadow Outline
                            </label>
                          </div>
                          {item.outline !== false && (
                            <input
                              type="color"
                              value={item.outlineColor || '#000000'}
                              onChange={(e) => updateExtraText(item.id, 'outlineColor', e.target.value)}
                              className="w-6 h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                            />
                          )}
                        </div>

                        {item.outline !== false && (
                          <div className="space-y-1 pl-6">
                            <div className="flex justify-between text-[11px] text-slate-400">
                              <span>Outline Thickness (min 2px step)</span>
                              <span className="font-mono text-amber-400 font-bold">{Math.max(2, item.outlineThickness || 3)}px</span>
                            </div>
                            <input
                              type="range"
                              min="2"
                              max="16"
                              step="2"
                              value={Math.max(2, item.outlineThickness || 3)}
                              onChange={(e) => updateExtraText(item.id, 'outlineThickness', Math.max(2, parseInt(e.target.value)))}
                              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 touch-manipulation"
                            />
                          </div>
                        )}
                      </div>

                      {/* Pill Box Background & Opacity Bar */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id={`bg-${item.id}`}
                              checked={Boolean(item.bgEnabled)}
                              onChange={(e) => updateExtraText(item.id, 'bgEnabled', e.target.checked)}
                              className="rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-0 cursor-pointer"
                            />
                            <label htmlFor={`bg-${item.id}`} className="text-xs text-slate-300 cursor-pointer font-medium">
                              Pill Box Background
                            </label>
                          </div>
                          {item.bgEnabled && (
                            <input
                              type="color"
                              value={item.bgColor && item.bgColor.startsWith('#') ? item.bgColor : '#000000'}
                              onChange={(e) => updateExtraText(item.id, 'bgColor', e.target.value)}
                              className="w-6 h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                            />
                          )}
                        </div>

                        {item.bgEnabled && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6 pt-1">
                            {/* Background Opacity Bar */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-[11px] text-slate-400">
                                <span>Background Opacity Bar</span>
                                <span className="font-mono text-amber-400 font-bold">{item.bgOpacity ?? 75}%</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                step="2"
                                value={item.bgOpacity ?? 75}
                                onChange={(e) => updateExtraText(item.id, 'bgOpacity', parseInt(e.target.value))}
                                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 touch-manipulation"
                              />
                            </div>

                            {/* Box Padding (min 2px) */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-[11px] text-slate-400">
                                <span>Box Padding (min 2px step)</span>
                                <span className="font-mono text-amber-400 font-bold">{Math.max(2, item.bgPadding ?? 6)}px</span>
                              </div>
                              <input
                                type="range"
                                min="2"
                                max="32"
                                step="2"
                                value={Math.max(2, item.bgPadding ?? 6)}
                                onChange={(e) => updateExtraText(item.id, 'bgPadding', Math.max(2, parseInt(e.target.value)))}
                                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 touch-manipulation"
                              />
                            </div>
                          </div>
                        )}
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


