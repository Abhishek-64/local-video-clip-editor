import React, { useEffect, useState } from 'react';
import {
  Settings,
  Cpu,
  Sparkles,
  Zap,
  CheckCircle2,
  FileText,
  Copy,
  Check,
  Video,
  Activity,
  Volume2,
  SlidersHorizontal
} from 'lucide-react';
import { detectCapabilities } from '../services/capabilityDetector';
import { sanitizeFilename } from '../utils/filename';
import { cleanVideoFilename } from '../utils/titleCleaner';

export default function ExportPanel({
  exportSettings = {},
  onChange,
  sourceResolution,
  detectedQuality,
  detectedFps,
  textSettings = {},
  onTextChange,
  movieName,
  videoData,
  ytSettings = {},
  fbSettings = {},
  igSettings = {},
  onUpdateYtSettings,
  onUpdateFbSettings,
  onUpdateIgSettings
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

  const fileTemplatePresets = [
    { label: 'Standard', value: '{movie} - Part {part}' },
    { label: 'Underscores', value: '{movie}_Part_{part}' },
    { label: 'Part First', value: 'Part_{part}_{movie}' },
    { label: 'Short', value: '{movie}_{part}' }
  ];

  const handleMovieNameChange = (val) => {
    updateSetting('movieName', val);
    if (onTextChange && textSettings) {
      onTextChange({
        ...textSettings,
        movieName: val
      });
    }
    if (onUpdateYtSettings) {
      onUpdateYtSettings({ yt_name: val });
    }
    if (onUpdateFbSettings) {
      onUpdateFbSettings({ fb_name: val });
    }
    if (onUpdateIgSettings) {
      onUpdateIgSettings({ ig_name: val });
    }
  };

  const handleFileTemplateChange = (val) => {
    updateSetting('fileTemplate', val);
    if (onTextChange && textSettings) {
      onTextChange({
        ...textSettings,
        fileTemplate: val
      });
    }
  };

  const insertToken = (token) => {
    const current = exportSettings.fileTemplate || textSettings?.fileTemplate || textSettings?.template || '{movie} - Part {part}';
    const updated = `${current}${current ? ' ' : ''}${token}`;
    handleFileTemplateChange(updated);
  };

  const handleMatchOverlay = () => {
    const overlayTpl = textSettings?.template || '{movie} - Part {part}';
    handleFileTemplateChange(overlayTpl);
  };

  const movieTitle = (exportSettings?.movieName !== undefined
    ? exportSettings.movieName
    : (textSettings?.movieName || movieName || ytSettings?.yt_name || igSettings?.ig_name || fbSettings?.fb_name || (videoData?.preset?.movieName || (videoData?.file?.name ? cleanVideoFilename(videoData.file.name) : '')) || 'My Movie')) || 'My Movie';
  const startPart = Math.max(1, parseInt(textSettings?.startPart) || 1);
  const partFormatted = textSettings?.zeroPad !== false ? String(startPart).padStart(2, '0') : String(startPart);
  const activeFileTemplate = exportSettings.fileTemplate || textSettings?.fileTemplate || textSettings?.template || '{movie} - Part {part}';
  const ext = exportSettings.format || 'mp4';
  const previewSampleFilename = `${sanitizeFilename(
    activeFileTemplate
      .replace(/\{movie\}/gi, movieTitle)
      .replace(/\{title\}/gi, movieTitle)
      .replace(/\{text\}/gi, movieTitle)
      .replace(/\{part\}/gi, partFormatted)
  )}.${ext}`;

  const displayResolution = sourceResolution
    ? `${sourceResolution.width} × ${sourceResolution.height}`
    : videoData?.width && videoData?.height
    ? `${videoData.width} × ${videoData.height}`
    : 'Original Native Resolution';

  const displayFps = detectedFps
    ? `${detectedFps} FPS (Source Matched)`
    : videoData?.fps
    ? `${videoData.fps} FPS (Source Matched)`
    : 'Auto-Matched Source FPS';

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* ── HARDWARE ACCELERATION & EXPORT ENGINE STATUS ── */}
      <div className="bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-slate-900 border border-orange-500/30 p-3 sm:p-3.5 rounded-xl space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-white truncate block">
                {capabilities?.isHardwareAccelerated ? 'Hardware Acceleration Active' : 'Deterministic GPU/WebCodecs Export Engine'}
              </span>
              <span className="text-[10px] text-slate-400 block truncate">
                Zero quality loss • 100% Original source video &amp; audio preservation
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 100% ORIGINAL SOURCE MEDIA STREAM SPECIFICATIONS ── */}
      <div className="bg-slate-950/85 border border-emerald-500/30 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h4 className="text-xs sm:text-sm font-bold text-white">Original Source Media Form</h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">
                  100% Original
                </span>
              </div>
            </div>
          </div>
          <span className="text-[10px] text-slate-400">
            Auto-synced to uploaded video
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 pt-1">
          {/* 1. Resolution / Dimensions */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex items-start space-x-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
              <Video className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-medium text-slate-400 block">Video Resolution &amp; Dimensions</span>
              <p className="text-xs font-bold font-mono text-emerald-300 truncate">
                {displayResolution}
              </p>
              <span className="text-[10px] text-slate-500 block">Preserves native pixel matrix</span>
            </div>
          </div>

          {/* 2. Framerate (FPS) */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex items-start space-x-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
              <Activity className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-medium text-slate-400 block">Frame Rate (FPS)</span>
              <p className="text-xs font-bold font-mono text-emerald-300 truncate">
                {displayFps}
              </p>
              <span className="text-[10px] text-slate-500 block">Full original motion smoothness</span>
            </div>
          </div>

          {/* 3. Bitrate & Stream Quality */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex items-start space-x-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-medium text-slate-400 block">Video Bitrate &amp; Quality</span>
              <p className="text-xs font-bold text-emerald-300 truncate">
                Ultra Lossless Adaptive Rate
              </p>
              <span className="text-[10px] text-slate-500 block">Original macroblock &amp; color fidelity</span>
            </div>
          </div>

          {/* 4. Audio Quality */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex items-start space-x-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
              <Volume2 className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-medium text-slate-400 block">Audio Quality</span>
              <p className="text-xs font-bold text-emerald-300 truncate">
                Original Audio Stream (AAC Studio)
              </p>
              <span className="text-[10px] text-slate-500 block">Lossless multi-track &amp; sample rate</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── EXPORT FILE NAMING TEMPLATE CARD ── */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h4 className="text-xs sm:text-sm font-bold text-white">Export File Naming Template</h4>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-300">
                  Local File Naming
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleMatchOverlay}
            className="flex items-center space-x-1 px-2.5 py-1 text-[10px] sm:text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-lg transition-colors cursor-pointer touch-manipulation shrink-0"
            title="Copy template from On-Screen Text Template"
          >
            <Copy className="w-3 h-3 text-slate-400" />
            <span>Match Overlay</span>
          </button>
        </div>

        <div className="space-y-3">
          {/* 1. File Name / Series Title Field */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <label className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
                <span>File Name / Series Title:</span>
              </label>
              {videoData?.file?.name && (
                <button
                  type="button"
                  onClick={() => handleMovieNameChange(cleanVideoFilename(videoData.file.name))}
                  className="text-[10px] text-blue-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-blue-500/30 rounded-lg px-2 py-0.5 transition-colors cursor-pointer flex items-center space-x-1 shrink-0 touch-manipulation"
                  title="Use original loaded video filename"
                >
                  <Sparkles className="w-2.5 h-2.5 text-blue-400" />
                  <span>Use Video Name</span>
                </button>
              )}
            </div>
            <input
              type="text"
              value={exportSettings.movieName !== undefined ? exportSettings.movieName : (textSettings?.movieName || '')}
              onChange={(e) => handleMovieNameChange(e.target.value)}
              placeholder="e.g. Inception, Epic Moments, My Clip"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:border-blue-500 focus:outline-none shadow-inner"
            />
            <p className="text-[10px] text-slate-400 leading-tight">
              Directly replaces the <code className="text-blue-400 font-mono">{'{movie}'}</code> token in export filenames.
            </p>
          </div>

          {/* 2. File Naming Template Field */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300">File Naming Template:</label>
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => insertToken('{movie}')}
                  className="px-1.5 py-0.5 text-[9px] bg-slate-900 hover:bg-slate-800 text-blue-300 border border-blue-500/30 rounded font-mono cursor-pointer touch-manipulation"
                >
                  +{'{movie}'}
                </button>
                <button
                  type="button"
                  onClick={() => insertToken('{part}')}
                  className="px-1.5 py-0.5 text-[9px] bg-slate-900 hover:bg-slate-800 text-blue-300 border border-blue-500/30 rounded font-mono cursor-pointer touch-manipulation"
                >
                  +{'{part}'}
                </button>
              </div>
            </div>

            <input
              type="text"
              value={exportSettings.fileTemplate || textSettings?.fileTemplate || textSettings?.template || '{movie} - Part {part}'}
              onChange={(e) => handleFileTemplateChange(e.target.value)}
              placeholder="{movie} - Part {part}"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-white font-mono focus:border-blue-500 focus:outline-none shadow-inner"
            />

            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              <span className="text-[10px] text-slate-500 mr-1">Presets:</span>
              {fileTemplatePresets.map((p) => {
                const currentVal = exportSettings.fileTemplate || textSettings?.fileTemplate || textSettings?.template || '{movie} - Part {part}';
                const isSelected = currentVal === p.value;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => handleFileTemplateChange(p.value)}
                    className={`px-2 py-0.5 text-[10px] rounded border transition-colors cursor-pointer touch-manipulation ${
                      isSelected
                        ? 'bg-blue-500/20 border-blue-500/50 text-blue-300 font-bold'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-800'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Filename Preview */}
          <div className="bg-slate-900/90 border border-blue-500/20 rounded-xl p-3 flex items-center justify-between gap-2 shadow-sm">
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider block mb-0.5">
                Output File Name Preview:
              </span>
              <p className="text-xs font-bold text-white font-mono truncate">
                {previewSampleFilename}
              </p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-300 shrink-0">
              Auto-Sanitized
            </span>
          </div>
        </div>
      </div>

      {/* ── TARGET CONTAINER FORMAT & CONCURRENCY ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Container Format (2 Cols) */}
        <div className="sm:col-span-2 space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Target Container Format
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={() => updateSetting('format', 'mp4')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer touch-manipulation ${
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
              <p className="text-[10px] text-slate-400 mt-1">Reels, Shorts, TikTok, YouTube &amp; mobile players.</p>
            </button>

            <button
              onClick={() => updateSetting('format', 'webm')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer touch-manipulation ${
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
              <p className="text-[10px] text-slate-400 mt-1">Efficient open web recording container.</p>
            </button>
          </div>
        </div>

        {/* Worker Concurrency (1 Col) */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
            <Cpu className="w-3.5 h-3.5 text-orange-400" />
            <span>Worker Queue</span>
          </label>
          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
            <select
              value={exportSettings.concurrency || 1}
              onChange={(e) => updateSetting('concurrency', parseInt(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-2.5 py-2 focus:border-orange-500 focus:outline-none"
            >
              <option value="1">1 Job at a time (Stable)</option>
              <option value="2">2 Jobs parallel (Fast)</option>
            </select>
            <p className="text-[10px] text-slate-500 leading-tight">
              Hardware-accelerated parallel clip rendering.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
