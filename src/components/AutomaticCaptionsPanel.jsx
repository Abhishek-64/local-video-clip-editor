/**
 * AutomaticCaptionsPanel
 * Professional Automatic Captioning UI with speech recognition,
 * viral shorts typography, word-level highlight animation, and timeline editor.
 */

import React, { useState, useRef } from 'react';
import {
  MessageSquareQuote, Sparkles, RefreshCw, Trash2, Plus, Play,
  Download, Upload, Sliders, Type, Palette, Layout, ShieldCheck,
  CheckCircle2, XCircle, Clock, Globe, X, Edit3, Check
} from 'lucide-react';
import { formatTime } from '../utils/time';
import {
  transcribeAudioClientSide,
  isSpeechRecognitionSupported,
  exportToSRT,
  parseSRTorVTT,
  interpolateWordTimestamps
} from '../services/captionService';

const FONT_OPTIONS = [
  { id: 'Inter, sans-serif', label: 'Inter (Clean)' },
  { id: 'Impact, sans-serif', label: 'Impact (Viral Shorts)' },
  { id: 'Montserrat, sans-serif', label: 'Montserrat (Bold)' },
  { id: 'Anton, sans-serif', label: 'Anton (Punchy)' },
  { id: 'Outfit, sans-serif', label: 'Outfit (Modern)' },
  { id: 'Roboto, sans-serif', label: 'Roboto (Standard)' },
  { id: 'Poppins, sans-serif', label: 'Poppins (Smooth)' }
];

const LANGUAGE_OPTIONS = [
  { id: 'auto', label: '🌐 Auto Detect Language' },
  { id: 'en-US', label: '🇺🇸 English (US)' },
  { id: 'en-GB', label: '🇬🇧 English (UK)' },
  { id: 'es-ES', label: '🇪🇸 Spanish' },
  { id: 'fr-FR', label: '🇫🇷 French' },
  { id: 'de-DE', label: '🇩🇪 German' },
  { id: 'hi-IN', label: '🇮🇳 Hindi' },
  { id: 'pt-BR', label: '🇧🇷 Portuguese' },
  { id: 'ja-JP', label: '🇯🇵 Japanese' },
  { id: 'it-IT', label: '🇮🇹 Italian' }
];

const HIGHLIGHT_COLOR_PRESETS = [
  { color: '#facc15', label: 'Yellow' },
  { color: '#38bdf8', label: 'Cyan' },
  { color: '#4ade80', label: 'Green' },
  { color: '#fb923c', label: 'Orange' },
  { color: '#f43f5e', label: 'Rose' },
  { color: '#c084fc', label: 'Purple' }
];

export default function AutomaticCaptionsPanel({
  videoData,
  captionSettings = {},
  onCaptionSettingsChange,
  currentTime = 0,
  onCurrentTimeChange,
  duration = 0
}) {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeProgress, setTranscribeProgress] = useState(0);
  const [transcribeError, setTranscribeError] = useState(null);
  const [transcribeSuccess, setTranscribeSuccess] = useState(false);
  const abortControllerRef = useRef(null);
  const fileInputRef = useRef(null);

  const captions = captionSettings.captions || [];

  const updateSetting = (key, value) => {
    if (!onCaptionSettingsChange) return;
    onCaptionSettingsChange({
      ...captionSettings,
      [key]: value
    });
  };

  // 1. Generate Captions Trigger
  const handleGenerateCaptions = async () => {
    if (!videoData) {
      setTranscribeError('Please upload a video first.');
      return;
    }

    setIsTranscribing(true);
    setTranscribeProgress(5);
    setTranscribeError(null);
    setTranscribeSuccess(false);

    abortControllerRef.current = new AbortController();

    try {
      const generated = await transcribeAudioClientSide({
        videoSource: videoData.file || videoData.url || videoData,
        language: captionSettings.language || 'auto',
        onProgress: (pct) => setTranscribeProgress(pct),
        signal: abortControllerRef.current.signal
      });

      updateSetting('captions', generated);
      updateSetting('enabled', true);
      setTranscribeSuccess(true);
      setTimeout(() => setTranscribeSuccess(false), 4000);
    } catch (err) {
      if (err.name !== 'AbortError' && !err.message?.includes('cancelled')) {
        setTranscribeError(err.message || 'Failed to transcribe audio. Please try again.');
      }
    } finally {
      setIsTranscribing(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelTranscription = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsTranscribing(false);
    }
  };

  // 2. Caption Item Operations
  const handleCaptionTextChange = (id, newText) => {
    const updated = captions.map((c) => {
      if (c.id === id) {
        return {
          ...c,
          text: newText,
          words: interpolateWordTimestamps(newText, c.startTime, c.endTime)
        };
      }
      return c;
    });
    updateSetting('captions', updated);
  };

  const handleNudgeCaption = (id, field, delta) => {
    const updated = captions.map((c) => {
      if (c.id === id) {
        const nextVal = Math.max(0, Math.min(duration || 9999, Math.round((c[field] + delta) * 100) / 100));
        const updatedCap = { ...c, [field]: nextVal };
        updatedCap.words = interpolateWordTimestamps(c.text, updatedCap.startTime, updatedCap.endTime);
        return updatedCap;
      }
      return c;
    });
    updateSetting('captions', updated);
  };

  const handleDeleteCaption = (id) => {
    const updated = captions.filter((c) => c.id !== id);
    updateSetting('captions', updated);
  };

  const handleAddCaption = () => {
    const lastCap = captions[captions.length - 1];
    const newStart = lastCap ? lastCap.endTime : Math.round(currentTime * 10) / 10;
    const newEnd = Math.min(duration || 9999, newStart + 2.5);
    const newCap = {
      id: `cap-${Date.now()}`,
      startTime: newStart,
      endTime: newEnd,
      text: 'New Caption Phrase',
      words: interpolateWordTimestamps('New Caption Phrase', newStart, newEnd)
    };
    updateSetting('captions', [...captions, newCap]);
    updateSetting('enabled', true);
  };

  // 3. Export / Import Subtitles
  const handleExportSRT = () => {
    if (captions.length === 0) return;
    const srtContent = exportToSRT(captions);
    const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `captions_${Date.now()}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        const parsed = parseSRTorVTT(text);
        if (parsed.length > 0) {
          updateSetting('captions', parsed);
          updateSetting('enabled', true);
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ── 1. HEADER & MASTER TOGGLE ───────────────────────────── */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400">
            <MessageSquareQuote className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-white tracking-tight flex items-center space-x-1.5">
              <span>Automatic Captions</span>
              <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 text-[9px] rounded font-mono font-bold">
                100% Local
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Synchronized word-level subtitles burned directly into final MP4
            </p>
          </div>
        </div>

        {/* Master Enabled Switch */}
        <label className="flex items-center space-x-2.5 cursor-pointer">
          <div
            onClick={() => updateSetting('enabled', !captionSettings.enabled)}
            className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer flex-shrink-0 ${
              captionSettings.enabled ? 'bg-orange-500' : 'bg-slate-700'
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                captionSettings.enabled ? 'translate-x-4.5' : 'translate-x-0.5'
              }`}
            />
          </div>
          <span className="text-xs font-bold text-slate-200">
            {captionSettings.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </label>
      </div>

      {/* ── 2. SPEECH RECOGNITION GENERATOR ───────────────────── */}
      <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-orange-500/30 rounded-2xl p-4 space-y-3.5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-white">Generate Captions from Speech</span>
          </div>

          {/* Language Selector */}
          <select
            value={captionSettings.language || 'auto'}
            onChange={(e) => updateSetting('language', e.target.value)}
            disabled={isTranscribing}
            className="bg-slate-900 border border-slate-700 text-white text-xs rounded-xl px-2.5 py-1.5 focus:border-orange-500 focus:outline-none cursor-pointer"
          >
            {LANGUAGE_OPTIONS.map((lang) => (
              <option key={lang.id} value={lang.id}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>

        {/* Action Button & Progress */}
        <div className="space-y-2">
          {!isTranscribing ? (
            <button
              onClick={handleGenerateCaptions}
              disabled={!videoData}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 hover:from-orange-600 hover:to-amber-600 active:scale-98 disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-orange-500/20 flex items-center justify-center space-x-2 transition-all cursor-pointer touch-manipulation"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {captions.length > 0 ? 'Regenerate Captions' : 'Generate Automatic Captions'}
              </span>
            </button>
          ) : (
            <div className="space-y-2 bg-slate-950 border border-orange-500/40 rounded-xl p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-amber-300 font-semibold flex items-center space-x-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Transcribing speech locally ({transcribeProgress}%)...</span>
                </span>
                <button
                  onClick={handleCancelTranscription}
                  className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-lg text-[11px] font-semibold cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              {/* Real Progress Bar */}
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-300"
                  style={{ width: `${transcribeProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {transcribeSuccess && (
          <div className="flex items-center space-x-2 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl p-2.5 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Successfully generated {captions.length} synchronized caption phrases!</span>
          </div>
        )}

        {transcribeError && (
          <div className="flex items-start space-x-2 bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs rounded-xl p-2.5 animate-fadeIn">
            <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{transcribeError}</span>
          </div>
        )}
      </div>

      {/* ── 3. CAPTION STYLING & VIRAL SHORTS PRESETS ─────────── */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 sm:p-4 space-y-3.5 shadow-md">
        <div className="flex items-center space-x-2">
          <Palette className="w-4 h-4 text-orange-400" />
          <span className="text-xs font-bold text-white">Caption Style Presets</span>
        </div>

        {/* Style Selector Tabs */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'clean', label: 'Clean', desc: 'Crisp & Modern' },
            { id: 'bold-shorts', label: 'Bold Shorts', desc: 'ALL CAPS Heavy' },
            { id: 'highlight-word', label: 'Highlight Word', desc: 'Viral Karaoke' }
          ].map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => updateSetting('style', st.id)}
              className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer touch-manipulation ${
                (captionSettings.style || 'bold-shorts') === st.id
                  ? 'bg-orange-500/20 border-orange-500 text-white font-bold ring-1 ring-orange-500/50 shadow-sm'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="block text-xs font-bold">{st.label}</span>
              <span className="block text-[10px] text-slate-400 mt-0.5">{st.desc}</span>
            </button>
          ))}
        </div>

        {/* Customization Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-900">
          {/* Font Family */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400">Typography Font</label>
            <select
              value={captionSettings.font || 'Inter, sans-serif'}
              onChange={(e) => updateSetting('font', e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:border-orange-500 focus:outline-none cursor-pointer"
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {/* Font Size */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
              <span>Font Size</span>
              <span className="text-amber-400 font-mono">{captionSettings.fontSize || 32}px</span>
            </div>
            <input
              type="range"
              min="18"
              max="64"
              value={captionSettings.fontSize || 32}
              onChange={(e) => updateSetting('fontSize', parseInt(e.target.value, 10))}
              className="w-full accent-orange-500 cursor-pointer"
            />
          </div>

          {/* Base Text Color */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400">Base Text Color</label>
            <div className="flex items-center space-x-2">
              <input
                type="color"
                value={captionSettings.color || '#ffffff'}
                onChange={(e) => updateSetting('color', e.target.value)}
                className="w-8 h-8 rounded-lg bg-transparent border border-slate-700 cursor-pointer p-0.5"
              />
              <span className="text-xs font-mono text-slate-300">
                {captionSettings.color || '#ffffff'}
              </span>
            </div>
          </div>

          {/* Highlight Color (Active Word) */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400">Active Word Highlight</label>
            <div className="flex items-center space-x-1.5 flex-wrap gap-1">
              {HIGHLIGHT_COLOR_PRESETS.map((p) => (
                <button
                  key={p.color}
                  type="button"
                  onClick={() => updateSetting('highlightColor', p.color)}
                  className={`w-6 h-6 rounded-full border transition-all cursor-pointer ${
                    (captionSettings.highlightColor || '#facc15') === p.color
                      ? 'border-white scale-110 shadow-md ring-2 ring-orange-500/50'
                      : 'border-slate-700 hover:scale-105'
                  }`}
                  style={{ backgroundColor: p.color }}
                  title={p.label}
                />
              ))}
              <input
                type="color"
                value={captionSettings.highlightColor || '#facc15'}
                onChange={(e) => updateSetting('highlightColor', e.target.value)}
                className="w-6 h-6 rounded-full bg-transparent border border-slate-700 cursor-pointer p-0.5 ml-1"
                title="Custom Highlight Color"
              />
            </div>
          </div>
        </div>

        {/* Outline & Positioning */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-900">
          {/* Position Selector */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400">Position Placement</label>
            <select
              value={captionSettings.position || 'bottom-center'}
              onChange={(e) => updateSetting('position', e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:border-orange-500 focus:outline-none cursor-pointer"
            >
              <option value="bottom-center">Bottom (9:16 Shorts Safe Area)</option>
              <option value="center">Center</option>
              <option value="top-center">Top</option>
            </select>
          </div>

          {/* Outline Thickness */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
              <span>Text Outline</span>
              <span className="text-amber-400 font-mono">
                {captionSettings.outline !== false ? `${captionSettings.outlineThickness || 4}px` : 'Off'}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={captionSettings.outline !== false}
                onChange={(e) => updateSetting('outline', e.target.checked)}
                className="w-4 h-4 rounded accent-orange-500 cursor-pointer"
              />
              <input
                type="range"
                min="1"
                max="8"
                disabled={captionSettings.outline === false}
                value={captionSettings.outlineThickness || 4}
                onChange={(e) => updateSetting('outlineThickness', parseInt(e.target.value, 10))}
                className="w-full accent-orange-500 cursor-pointer disabled:opacity-30"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. CAPTION TIMELINE & PHRASE LIST ─────────────────── */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <Type className="w-4 h-4 text-orange-400" />
            <span className="text-xs font-bold text-white">
              Caption Phrases ({captions.length})
            </span>
          </div>

          <div className="flex items-center space-x-1.5">
            {/* Import SRT */}
            <input
              type="file"
              ref={fileInputRef}
              accept=".srt,.vtt"
              onChange={handleImportFile}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1 text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-lg flex items-center space-x-1 transition-colors cursor-pointer"
              title="Import SRT / VTT file"
            >
              <Upload className="w-3 h-3" />
              <span>Import SRT</span>
            </button>

            {/* Export SRT */}
            {captions.length > 0 && (
              <button
                onClick={handleExportSRT}
                className="px-2.5 py-1 text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-lg flex items-center space-x-1 transition-colors cursor-pointer"
                title="Export captions to SRT subtitle file"
              >
                <Download className="w-3 h-3" />
                <span>Export SRT</span>
              </button>
            )}

            {/* Add Phrase */}
            <button
              onClick={handleAddCaption}
              className="px-2.5 py-1 text-[11px] font-bold bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/40 rounded-lg flex items-center space-x-1 transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Add Phrase</span>
            </button>
          </div>
        </div>

        {/* Captions List */}
        {captions.length === 0 ? (
          <div className="text-center py-6 bg-slate-900/50 rounded-xl border border-slate-800/80">
            <MessageSquareQuote className="w-6 h-6 text-slate-600 mx-auto mb-1.5" />
            <p className="text-xs font-semibold text-slate-400">No captions generated yet</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Click &quot;Generate Automatic Captions&quot; above to transcribe your speech automatically
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1 scrollbar-thin">
            {captions.map((cap) => {
              const isCurrentlyPlaying = currentTime >= cap.startTime && currentTime <= cap.endTime;

              return (
                <div
                  key={cap.id}
                  className={`border rounded-xl p-2.5 space-y-1.5 transition-all ${
                    isCurrentlyPlaying
                      ? 'bg-amber-500/10 border-amber-500/50 ring-1 ring-amber-500/30 shadow-md'
                      : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Timestamp & Quick Nudge Row */}
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-1.5 font-mono font-bold text-amber-300">
                      <span>{formatTime(cap.startTime)}</span>
                      <span className="text-slate-500">&rarr;</span>
                      <span>{formatTime(cap.endTime)}</span>
                    </div>

                    <div className="flex items-center space-x-1">
                      {/* Play Preview */}
                      <button
                        onClick={() => onCurrentTimeChange && onCurrentTimeChange(cap.startTime)}
                        className="p-1 text-slate-400 hover:text-emerald-400 rounded transition-colors cursor-pointer"
                        title="Jump playhead to phrase"
                      >
                        <Play className="w-3 h-3 fill-current" />
                      </button>

                      {/* Start Nudge */}
                      <button
                        onClick={() => handleNudgeCaption(cap.id, 'startTime', -0.2)}
                        className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] cursor-pointer"
                        title="Start 0.2s earlier"
                      >
                        -0.2s
                      </button>
                      <button
                        onClick={() => handleNudgeCaption(cap.id, 'startTime', 0.2)}
                        className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] cursor-pointer"
                        title="Start 0.2s later"
                      >
                        +0.2s
                      </button>

                      {/* Delete Phrase */}
                      <button
                        onClick={() => handleDeleteCaption(cap.id)}
                        className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors cursor-pointer"
                        title="Delete caption phrase"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Caption Text Input */}
                  <input
                    type="text"
                    value={cap.text}
                    onChange={(e) => handleCaptionTextChange(cap.id, e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg focus:border-orange-500 focus:outline-none"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
