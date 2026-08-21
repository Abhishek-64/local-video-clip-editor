import React, { useEffect, useState } from 'react';
import { Settings, Cpu, HardDrive, Sparkles, Film, Zap, CheckCircle2, Gauge, Layers } from 'lucide-react';
import { detectCapabilities } from '../services/capabilityDetector';

export default function ExportPanel({
  exportSettings,
  onChange,
  sourceResolution,
  detectedQuality,
  detectedFps
}) {
  const [capabilities, setCapabilities] = useState(null);

  useEffect(() => {
    detectCapabilities().then(setCapabilities).catch(() => {});
  }, []);

  const updateSetting = (key, value) => {
    onChange({
      ...exportSettings,
      [key]: value
    });
  };

  const presets = [
    {
      id: 'fast',
      label: 'Fast',
      desc: '720p / Standard Bitrate',
      config: { resolution: '720p', bitrate: 'standard', fps: '30' }
    },
    {
      id: 'balanced',
      label: 'Balanced (Rec.)',
      desc: '1080p / High Bitrate / Smooth',
      config: { resolution: '1080p', bitrate: 'high', fps: '30' }
    },
    {
      id: 'high',
      label: 'High Quality',
      desc: '1080p / Ultra Bitrate / 60 FPS',
      config: { resolution: '1080p', bitrate: 'ultra', fps: '60' }
    },
    {
      id: 'ultra',
      label: 'Ultra 4K',
      desc: '4K / Maximum Quality',
      config: { resolution: '4k', bitrate: 'ultra', fps: '60' }
    }
  ];

  const applyPreset = (preset) => {
    onChange({
      ...exportSettings,
      ...preset.config
    });
  };

  const resolutions = [
    { id: '1080p', label: '1080p Full HD', desc: '1080 × 1920 (9:16) / 1920 × 1080' },
    { id: '720p', label: '720p HD', desc: '720 × 1280 (9:16) / 1280 × 720' },
    { id: '1440p', label: '1440p 2K', desc: '1440 × 2560 (9:16) / 2560 × 1440' },
    { id: '4k', label: '4K Ultra HD', desc: '2160 × 3840 (9:16) / 3840 × 2160' },
    { id: 'original', label: 'Original Source', desc: sourceResolution ? `${sourceResolution.width} × ${sourceResolution.height}` : 'Match original input' }
  ];

  const bitrates = [
    { id: 'standard', label: 'Standard (5 Mbps)', mbps: 5 },
    { id: 'high', label: 'High (8.5 Mbps - Rec.)', mbps: 8.5 },
    { id: 'ultra', label: 'Ultra (16 Mbps)', mbps: 16 }
  ];

  const frameRates = [
    { id: 'original', label: 'Auto (Match Source FPS)' },
    { id: '60', label: '60 FPS (Smooth)' },
    { id: '30', label: '30 FPS (Standard)' },
    { id: '24', label: '24 FPS (Cinematic)' }
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* ── HARDWARE ACCELERATION & AUTO PROFILE BADGE ── */}
      <div className="bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-slate-900 border border-orange-500/30 p-3 sm:p-3.5 rounded-xl space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-white truncate block">
                {capabilities?.isHardwareAccelerated ? 'Hardware Acceleration Active' : 'Deterministic Export Engine'}
              </span>
              <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">
                {capabilities?.webCodecs
                  ? 'WebCodecs GPU H.264 Encoder + Offline Audio Mixer'
                  : 'Fast Hardware Stream Recorder + GPU Canvas'}
              </p>
            </div>
          </div>
          <span className="text-[11px] text-emerald-400 font-medium flex items-center shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1 inline" /> 100% Private Local
          </span>
        </div>

        {/* Capability Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-orange-500/20">
          {capabilities?.h264EncoderSupported && (
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono">
              ⚡ WebCodecs H.264
            </span>
          )}
          {capabilities?.webGL && (
            <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-mono">
              🎮 WebGL Shader Pipeline
            </span>
          )}
          {detectedQuality && (
            <span className="text-[10px] bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded font-mono">
              🎬 {detectedQuality.label}
            </span>
          )}
          {detectedFps && (
            <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono">
              ⚡ {detectedFps.label}
            </span>
          )}
        </div>
      </div>

      {/* ── SMART EXPORT PRESETS ── */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
          <Gauge className="w-3.5 h-3.5 text-orange-400" />
          <span>Smart Export Profiles</span>
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {presets.map((p) => {
            const isActive = exportSettings.resolution === p.config.resolution &&
                             exportSettings.bitrate === p.config.bitrate;
            return (
              <button
                key={p.id}
                onClick={() => applyPreset(p)}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer touch-manipulation ${
                  isActive
                    ? 'bg-orange-500/15 border-orange-500 text-white ring-1 ring-orange-500/40 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="font-bold text-xs text-white block">{p.label}</span>
                <span className="text-[10px] text-slate-400 mt-0.5 block leading-tight">{p.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Container Format */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Target Container Format
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
          <button
            onClick={() => updateSetting('format', 'mp4')}
            className={`p-3 sm:p-3.5 rounded-xl border text-left transition-all cursor-pointer touch-manipulation ${
              exportSettings.format === 'mp4'
                ? 'bg-orange-500/10 border-orange-500 text-white shadow-sm ring-1 ring-orange-500/30'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs sm:text-sm text-white">MP4 (H.264 / AAC)</span>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded font-medium">
                Universal
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Reels, Shorts, TikTok, YouTube &amp; mobile players.</p>
          </button>

          <button
            onClick={() => updateSetting('format', 'webm')}
            className={`p-3 sm:p-3.5 rounded-xl border text-left transition-all cursor-pointer touch-manipulation ${
              exportSettings.format === 'webm'
                ? 'bg-orange-500/10 border-orange-500 text-white shadow-sm ring-1 ring-orange-500/30'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs sm:text-sm text-white">WebM (VP9 / Opus)</span>
              <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                Web
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Efficient open web recording container.</p>
          </button>
        </div>
      </div>

      {/* Target Resolution */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Export Resolution
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-2.5">
          {resolutions.map((res) => (
            <button
              key={res.id}
              onClick={() => updateSetting('resolution', res.id)}
              className={`p-2.5 sm:p-3 rounded-xl border text-left transition-all cursor-pointer touch-manipulation ${
                exportSettings.resolution === res.id
                  ? 'bg-orange-500/10 border-orange-500 text-white shadow-sm ring-1 ring-orange-500/30 font-semibold'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="font-bold text-xs text-white truncate">{res.label}</div>
              <div className="text-[10px] text-slate-400 mt-0.5 truncate">{res.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Bitrate & FPS Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {/* Video Bitrate */}
        <div className="space-y-2 bg-slate-950/60 p-3 sm:p-3.5 rounded-xl border border-slate-800">
          <label className="text-xs font-medium text-slate-300">Video Bitrate</label>
          <div className="space-y-1.5">
            {bitrates.map((b) => (
              <button
                key={b.id}
                onClick={() => updateSetting('bitrate', b.id)}
                className={`w-full px-3 py-2 text-xs rounded-lg border text-left flex justify-between items-center transition-colors cursor-pointer touch-manipulation ${
                  exportSettings.bitrate === b.id
                    ? 'bg-orange-500/10 border-orange-500 text-white font-medium'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{b.label}</span>
                <span className="font-mono text-[11px] text-amber-400 font-bold">{b.mbps} Mbps</span>
              </button>
            ))}
          </div>
        </div>

        {/* Frame Rate */}
        <div className="space-y-2 bg-slate-950/60 p-3 sm:p-3.5 rounded-xl border border-slate-800">
          <label className="text-xs font-medium text-slate-300">Frame Rate (FPS)</label>
          <div className="space-y-1.5">
            {frameRates.map((fps) => (
              <button
                key={fps.id}
                onClick={() => updateSetting('fps', fps.id)}
                className={`w-full px-3 py-2 text-xs rounded-lg border text-left transition-colors cursor-pointer touch-manipulation ${
                  exportSettings.fps === fps.id
                    ? 'bg-orange-500/10 border-orange-500 text-white font-medium'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {fps.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Audio Bitrate & Concurrency Safety */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 bg-slate-950/60 p-3 sm:p-3.5 rounded-xl border border-slate-800">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-300">Audio Quality (AAC)</label>
          <select
            value={exportSettings.audioBitrate || '256k'}
            onChange={(e) => updateSetting('audioBitrate', e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-3 py-2 focus:border-orange-500 focus:outline-none"
          >
            <option value="128k">128 kbps (Standard)</option>
            <option value="192k">192 kbps (High)</option>
            <option value="256k">256 kbps (Studio Default)</option>
            <option value="320k">320 kbps (Maximum)</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-300 flex items-center space-x-1.5">
            <Cpu className="w-3.5 h-3.5 text-orange-400" />
            <span>Worker Concurrency</span>
          </label>
          <select
            value={exportSettings.concurrency || 1}
            onChange={(e) => updateSetting('concurrency', parseInt(e.target.value))}
            className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-3 py-2 focus:border-orange-500 focus:outline-none"
          >
            <option value="1">1 Job at a time (Stable)</option>
            <option value="2">2 Jobs parallel (High RAM)</option>
          </select>
        </div>
      </div>
    </div>
  );
}
