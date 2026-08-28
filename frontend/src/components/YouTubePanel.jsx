/**
 * YouTubePanel — YouTube tab in EditorTabs
 * Features:
 * - Clean OAuth Connection Status
 * - Automated Schedule Pipeline with Publish Start Date & Time ("From the starting")
 * - Comprehensive Interval Menu (All presets + Custom interval duration & unit)
 * - Live Schedule Timeline Preview
 * - Shorts Preset & Upload Defaults (Visibility, Category, Made for Kids)
 * - Metadata Templates & Tags
 */

import React, { useState, useEffect } from 'react';
import {
  Youtube, CheckCircle2, XCircle, Link, Unlink, Settings2,
  Clock, Calendar, Tag, Eye, Zap, Info, RefreshCw,
  Sparkles, Lock, Sliders, ChevronDown
} from 'lucide-react';

import {
  SCHEDULE_INTERVALS,
  toDateTimeLocalString,
  getDefaultScheduleStartTime,
  calculateBatchScheduleTimes,
  formatScheduledDateTime,
  formatRelativeOffset,
  formatIntervalLabel
} from '../utils/scheduler';
import {
  GLOBAL_HASHTAG_PACKS,
  parseTagsInput,
  formatTagsAsHashtagString
} from '../utils/titleCleaner';

const YT_CATEGORIES = [
  { id: '1', label: 'Film & Animation' },
  { id: '2', label: 'Autos & Vehicles' },
  { id: '10', label: 'Music' },
  { id: '15', label: 'Pets & Animals' },
  { id: '17', label: 'Sports' },
  { id: '19', label: 'Travel & Events' },
  { id: '20', label: 'Gaming' },
  { id: '22', label: 'People & Blogs' },
  { id: '23', label: 'Comedy' },
  { id: '24', label: 'Entertainment' },
  { id: '25', label: 'News & Politics' },
  { id: '26', label: 'Howto & Style' },
  { id: '27', label: 'Education' },
  { id: '28', label: 'Science & Technology' }
];

export default function YouTubePanel({
  ytAccount,
  isConnected,
  isLoadingAccount,
  accountError,
  connectYouTube,
  disconnectYouTubeAccount,
  refreshAccount,
  ytSettings = {},
  updateYtSettings,
  persistSettings,
  isSavingSettings,
  apiAvailable,
  isAuthenticated = false,
  onOpenAuth,
  pipelineStartTime,
  setPipelineStartTime,
  customParts = []
}) {
  const [tagInput, setTagInput] = useState('');
  const [saveStatus, setSaveStatus] = useState(null); // 'saving' | 'saved' | 'error'
  const [scheduleMode, setScheduleMode] = useState(
    ytSettings?.yt_default_upload === 'auto' ? 'auto' : 'manual'
  );

  // Start Time state
  const [localStartTime, setLocalStartTime] = useState(() =>
    pipelineStartTime || toDateTimeLocalString(getDefaultScheduleStartTime())
  );

  // Custom Interval State
  const currentInterval = ytSettings?.schedule_interval || '1hour';
  const isCustomInterval = currentInterval.startsWith('custom_') || !SCHEDULE_INTERVALS.some(i => i.id === currentInterval);

  const [selectedIntervalOption, setSelectedIntervalOption] = useState(() =>
    isCustomInterval ? 'custom' : currentInterval
  );

  const [customValue, setCustomValue] = useState(() => {
    if (currentInterval.startsWith('custom_')) {
      const match = currentInterval.match(/^custom_(\d+)/);
      return match ? parseInt(match[1], 10) : 90;
    }
    return 90;
  });

  const [customUnit, setCustomUnit] = useState(() => {
    if (currentInterval.startsWith('custom_')) {
      const match = currentInterval.match(/^custom_\d+([mhd])/);
      return match ? match[1] : 'm';
    }
    return 'm';
  });

  // Sync Start Time changes
  const handleStartTimeChange = (val) => {
    setLocalStartTime(val);
    if (setPipelineStartTime) {
      setPipelineStartTime(val);
    }
  };

  const applyQuickPreset = (preset) => {
    const d = new Date();
    switch (preset) {
      case 'plus1hour':
        d.setHours(d.getHours() + 1);
        break;
      case 'tonight':
        d.setHours(20, 0, 0, 0);
        if (d <= new Date()) d.setDate(d.getDate() + 1);
        break;
      case 'tomorrow':
        d.setDate(d.getDate() + 1);
        d.setHours(18, 0, 0, 0);
        break;
      case 'in2days':
        d.setDate(d.getDate() + 2);
        d.setHours(18, 0, 0, 0);
        break;
      default:
        break;
    }
    const formatted = toDateTimeLocalString(d);
    handleStartTimeChange(formatted);
  };

  // Interval Menu Selection
  const handleIntervalSelect = (opt) => {
    setSelectedIntervalOption(opt);
    if (opt === 'custom') {
      const customId = `custom_${customValue}${customUnit}`;
      updateYtSettings({ schedule_interval: customId });
    } else {
      updateYtSettings({ schedule_interval: opt });
    }
  };

  const handleCustomValueChange = (val) => {
    const num = Math.max(1, parseInt(val) || 1);
    setCustomValue(num);
    const customId = `custom_${num}${customUnit}`;
    updateYtSettings({ schedule_interval: customId });
  };

  const handleCustomUnitChange = (unit) => {
    setCustomUnit(unit);
    const customId = `custom_${customValue}${unit}`;
    updateYtSettings({ schedule_interval: customId });
  };

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      await persistSettings({ ...ytSettings, yt_default_upload: scheduleMode });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2500);
    } catch {
      setSaveStatus('error');
    }
  };

  const addTag = () => {
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    const parsed = parseTagsInput(trimmed);
    const current = parseTagsInput(ytSettings?.yt_tags || []);
    const newTags = [...current];
    for (const tag of parsed) {
      if (!newTags.includes(tag)) {
        newTags.push(tag);
      }
    }
    updateYtSettings({ yt_tags: newTags });
    setTagInput('');
  };

  const applyHashtagPack = (pack) => {
    const parsed = parseTagsInput(pack.tags);
    const current = parseTagsInput(ytSettings?.yt_tags || []);
    const merged = [...current];
    for (const tag of parsed) {
      if (!merged.includes(tag)) {
        merged.push(tag);
      }
    }
    updateYtSettings({ yt_tags: merged });
  };

  const removeTag = (tag) => {
    updateYtSettings({ yt_tags: (ytSettings?.yt_tags || []).filter(t => t !== tag) });
  };

  const applyShortPreset = () => {
    updateYtSettings({
      yt_title_template: '{movie} - Part {part} | #Shorts',
      yt_description_template: '{movie} - Part {part}\n\n#Shorts\n\n{hashtags}',
      yt_tags: ['shorts', 'youtube shorts', 'clips', 'viral', 'fyp']
    });
  };

  if (!apiAvailable) {
    return (
      <div className="space-y-4">
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-center space-y-2">
          <Youtube className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-xs font-semibold text-slate-400">YouTube Integration Not Configured</p>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Set <code className="bg-slate-800 px-1 py-0.5 rounded text-amber-300">VITE_API_URL</code> in your{' '}
            <code className="bg-slate-800 px-1 py-0.5 rounded text-amber-300">.env</code> file to point to your
            deployed Cloudflare Worker to enable YouTube direct uploads, automation, and scheduled publishing.
          </p>
          <p className="text-[11px] text-slate-500">All existing local editing features work without this.</p>
        </div>
      </div>
    );
  }

  // ── Unauthenticated State: Must sign in first ────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="space-y-5">
        <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4 shadow-xl">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-orange-500/20 via-red-500/20 to-rose-500/20 border border-red-500/30 flex items-center justify-center mx-auto shadow-inner">
            <Lock className="w-6 h-6 text-orange-400" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white tracking-tight">Sign In Required to Connect YouTube</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
              Please sign in or create an account first. Connecting your YouTube account to your verified login ensures your OAuth tokens and scheduling presets remain secure and synced across devices.
            </p>
          </div>

          <div className="pt-1">
            <button
              onClick={() => onOpenAuth && onOpenAuth('login')}
              className="px-5 py-2.5 bg-gradient-to-r from-orange-500 via-rose-500 to-amber-500 hover:from-orange-400 hover:to-rose-400 active:scale-98 text-white text-xs font-bold rounded-xl shadow-lg shadow-orange-500/20 transition-all cursor-pointer inline-flex items-center space-x-2 touch-manipulation"
            >
              <Sparkles className="w-4 h-4" />
              <span>Sign In / Create Account</span>
            </button>
          </div>

          <div className="pt-4 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-left max-w-sm mx-auto">
            <div className="p-2.5 bg-slate-950/40 rounded-xl border border-slate-800/60">
              <span className="text-[11px] font-semibold text-slate-200 block mb-0.5">Automated Scheduling</span>
              <span className="text-[10px] text-slate-400 block leading-tight">Publish consecutive parts spaced by your chosen interval.</span>
            </div>
            <div className="p-2.5 bg-slate-950/40 rounded-xl border border-slate-800/60">
              <span className="text-[11px] font-semibold text-slate-200 block mb-0.5">Direct Shorts Uploads</span>
              <span className="text-[10px] text-slate-400 block leading-tight">Publish generated clips directly to your channel.</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ── 1. CONNECTION STATUS ─────────────────────────────────── */}
      <div className={`border rounded-xl p-3.5 space-y-3 ${
        isConnected
          ? 'bg-emerald-500/5 border-emerald-500/30'
          : 'bg-slate-950/60 border-slate-800'
      }`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              isConnected ? 'bg-red-500/20 border border-red-500/40' : 'bg-slate-800 border border-slate-700'
            }`}>
              <Youtube className={`w-4 h-4 ${isConnected ? 'text-red-400' : 'text-slate-500'}`} />
            </div>
            <div>
              <p className="text-xs font-bold text-white">
                {isConnected ? 'YouTube Connected' : 'YouTube Not Connected'}
              </p>
              {isConnected && ytAccount ? (
                <p className="text-[11px] text-emerald-400 truncate max-w-[160px]">
                  {ytAccount.channel_title}
                  {ytAccount.channel_handle && (
                    <span className="text-slate-500 ml-1">· {ytAccount.channel_handle}</span>
                  )}
                </p>
              ) : (
                <p className="text-[11px] text-slate-500">Connect to enable direct uploads</p>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {isConnected ? (
              <>
                <button
                  onClick={refreshAccount}
                  disabled={isLoadingAccount}
                  className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer touch-manipulation"
                  title="Refresh connection"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAccount ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={disconnectYouTubeAccount}
                  className="px-2.5 py-1.5 text-xs text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg transition-colors cursor-pointer touch-manipulation flex items-center space-x-1"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  <span>Disconnect</span>
                </button>
              </>
            ) : (
              <button
                onClick={connectYouTube}
                disabled={isLoadingAccount}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors cursor-pointer touch-manipulation flex items-center space-x-1.5 disabled:opacity-50"
              >
                <Link className="w-3.5 h-3.5" />
                <span>{isLoadingAccount ? 'Connecting...' : 'Connect YouTube'}</span>
              </button>
            )}
          </div>
        </div>

        {accountError && (
          <div className="flex items-start space-x-2 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2.5">
            <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-rose-300">{accountError}</p>
          </div>
        )}
      </div>

      {/* Only show full pipeline and settings when connected */}
      {isConnected && (
        <>
          {/* ── 2. AUTOMATED SCHEDULE PIPELINE ───────────────────── */}
          <div className="space-y-3.5 bg-slate-950/80 border border-purple-500/30 rounded-2xl p-4 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-bold text-white tracking-wide">
                  Automated Schedule Pipeline
                </span>
              </div>

              {/* Upload Mode Selector */}
              <div className="flex items-center space-x-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setScheduleMode('auto')}
                  className={`px-2.5 py-1 text-[11px] rounded-lg font-bold transition-all cursor-pointer touch-manipulation ${
                    scheduleMode === 'auto'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  ⚡ Auto-Schedule
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleMode('manual')}
                  className={`px-2.5 py-1 text-[11px] rounded-lg font-medium transition-all cursor-pointer touch-manipulation ${
                    scheduleMode === 'manual'
                      ? 'bg-slate-800 text-slate-200 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Manual Upload
                </button>
              </div>
            </div>

            {scheduleMode === 'auto' && (
              <div className="space-y-3.5 animate-fadeIn">
                {/* Field 1: Starting Schedule Date & Time ("From the starting") */}
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-[11px] font-bold text-slate-300 flex items-center space-x-1.5">
                      <Clock className="w-3.5 h-3.5 text-purple-400" />
                      <span>Starting Schedule Date &amp; Time (First Part Publish Time):</span>
                    </label>

                    {/* Quick Starting Presets */}
                    <div className="flex items-center space-x-1 flex-wrap gap-1">
                      {[
                        { id: 'plus1hour', label: '+1 Hour' },
                        { id: 'tonight', label: 'Tonight 8 PM' },
                        { id: 'tomorrow', label: 'Tomorrow 6 PM' },
                        { id: 'in2days', label: 'In 2 Days' }
                      ].map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => applyQuickPreset(p.id)}
                          className="px-2 py-0.5 text-[10px] bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-lg transition-colors cursor-pointer touch-manipulation"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <input
                    type="datetime-local"
                    value={localStartTime}
                    onChange={(e) => handleStartTimeChange(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-white text-xs font-mono px-3 py-2 rounded-xl focus:border-purple-500 focus:outline-none shadow-inner"
                  />
                </div>

                {/* Field 2: Interval Menu (All options + Custom interval) */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
                    <span className="flex items-center space-x-1.5">
                      <Sliders className="w-3.5 h-3.5 text-purple-400" />
                      <span>Interval Between Consecutive Clips:</span>
                    </span>
                    <span className="text-[10px] text-purple-300 font-mono font-bold bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 rounded-full">
                      {formatIntervalLabel(ytSettings?.schedule_interval)}
                    </span>
                  </label>

                  {/* Interval Menu Dropdown */}
                  <select
                    value={selectedIntervalOption}
                    onChange={(e) => handleIntervalSelect(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-xl px-3 py-2.5 focus:border-purple-500 focus:outline-none font-medium cursor-pointer"
                  >
                    {SCHEDULE_INTERVALS.map((int) => (
                      <option key={int.id} value={int.id}>
                        {int.label}
                      </option>
                    ))}
                    <option value="custom">⚙️ Custom Interval (Specify duration &amp; unit)...</option>
                  </select>

                  {/* Custom Interval Configurator */}
                  {selectedIntervalOption === 'custom' && (
                    <div className="bg-slate-900/90 border border-purple-500/40 rounded-xl p-3 flex items-center space-x-2 animate-fadeIn">
                      <span className="text-xs text-slate-300 shrink-0 font-medium">Every:</span>
                      <input
                        type="number"
                        min="1"
                        max="999"
                        value={customValue}
                        onChange={(e) => handleCustomValueChange(e.target.value)}
                        className="w-20 bg-slate-950 border border-purple-500/50 text-white font-mono font-bold text-xs text-center px-2 py-1.5 rounded-lg focus:outline-none focus:border-purple-400"
                      />
                      <select
                        value={customUnit}
                        onChange={(e) => handleCustomUnitChange(e.target.value)}
                        className="bg-slate-950 border border-slate-700 text-white text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-purple-500 cursor-pointer"
                      >
                        <option value="m">Minutes</option>
                        <option value="h">Hours</option>
                        <option value="d">Days</option>
                      </select>
                      <span className="text-[11px] text-purple-300 font-mono pl-1">
                        (= {customValue} {customUnit === 'm' ? 'minutes' : customUnit === 'h' ? 'hours' : 'days'} spacing)
                      </span>
                    </div>
                  )}
                </div>

                {/* Live Preview Timeline */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Calculated Publish Schedule Preview:
                  </span>
                  <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs font-mono scrollbar-thin">
                    {calculateBatchScheduleTimes(localStartTime, ytSettings?.schedule_interval || '1hour', 4).map((time, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-900 border border-purple-500/30 rounded-xl px-3 py-1.5 shrink-0 flex items-center space-x-2 shadow-sm"
                      >
                        <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-bold">
                          Part {idx + 1}
                        </span>
                        <span className="text-white text-[11px] font-bold">
                          {formatScheduledDateTime(time)}
                        </span>
                        {idx > 0 && (
                          <span className="text-[10px] text-purple-400 bg-purple-950/80 px-1.5 py-0.5 rounded font-mono">
                            {formatRelativeOffset(idx, ytSettings?.schedule_interval || '1hour')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── 3. SHORTS PRESET ─────────────────────────────────── */}
          <div className="bg-gradient-to-r from-red-500/10 via-orange-500/5 to-slate-900 border border-red-500/25 rounded-xl p-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-bold text-white">YouTube Shorts Preset</p>
              <p className="text-[11px] text-slate-400">Apply Shorts-optimized title, description &amp; tags</p>
            </div>
            <button
              onClick={applyShortPreset}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600/80 hover:bg-red-600 border border-red-500/40 rounded-lg transition-colors cursor-pointer shrink-0 touch-manipulation flex items-center space-x-1.5"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Apply Preset</span>
            </button>
          </div>

          {/* ── 4. UPLOAD DEFAULTS & VISIBILITY ─────────────────── */}
          <div className="space-y-3 bg-slate-950/60 border border-slate-800 rounded-xl p-3.5">
            <p className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
              <Settings2 className="w-3.5 h-3.5 text-orange-400" />
              <span>Upload Defaults</span>
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Visibility */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-400 flex items-center space-x-1">
                  <Eye className="w-3 h-3" />
                  <span>Initial Upload Visibility</span>
                </label>
                <select
                  value={ytSettings?.yt_visibility || 'private'}
                  onChange={e => updateYtSettings({ yt_visibility: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-3 py-2 focus:border-orange-500 focus:outline-none"
                >
                  <option value="private">Private (Required for Scheduled Publishing)</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="public">Public</option>
                </select>
              </div>

              {/* Category */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-400">Category</label>
                <select
                  value={ytSettings?.yt_category || '22'}
                  onChange={e => updateYtSettings({ yt_category: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-3 py-2 focus:border-orange-500 focus:outline-none"
                >
                  {YT_CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Made for Kids */}
              <label className="flex items-center space-x-2.5 cursor-pointer">
                <div
                  onClick={() => updateYtSettings({ yt_made_for_kids: !ytSettings?.yt_made_for_kids })}
                  className={`w-8 h-4.5 rounded-full transition-colors relative cursor-pointer flex-shrink-0 ${
                    ytSettings?.yt_made_for_kids ? 'bg-orange-500' : 'bg-slate-700'
                  }`}
                  style={{ height: '18px' }}
                >
                  <span className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-transform ${
                    ytSettings?.yt_made_for_kids ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </div>
                <span className="text-[11px] text-slate-300">Made for Kids</span>
              </label>

              {/* Notify subscribers */}
              <label className="flex items-center space-x-2.5 cursor-pointer">
                <div
                  onClick={() => updateYtSettings({ yt_notify_subscribers: !ytSettings?.yt_notify_subscribers })}
                  className={`w-8 rounded-full transition-colors relative cursor-pointer flex-shrink-0 ${
                    ytSettings?.yt_notify_subscribers ? 'bg-orange-500' : 'bg-slate-700'
                  }`}
                  style={{ height: '18px' }}
                >
                  <span className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-transform ${
                    ytSettings?.yt_notify_subscribers ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </div>
                <span className="text-[11px] text-slate-300">Notify Subscribers</span>
              </label>
            </div>
          </div>

          {/* ── 5. TITLE TEMPLATE ───────────────────────────────── */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              YouTube Title Template
            </label>
            <input
              type="text"
              value={ytSettings?.yt_title_template || ''}
              onChange={e => updateYtSettings({ yt_title_template: e.target.value })}
              placeholder="{movie} - Part {part} | #Shorts"
              className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-3 py-2 focus:border-orange-500 focus:outline-none font-mono"
            />
            <p className="text-[10px] text-slate-500">
              Tokens: <code className="text-amber-400">{'{movie}'}</code> = title &nbsp;
              <code className="text-amber-400">{'{part}'}</code> = part number &nbsp;
              <code className="text-amber-400">{'{hashtags}'}</code> = #tags &nbsp;
              <code className="text-amber-400">{'{tags}'}</code> = keyword list
            </p>
          </div>

          {/* ── 6. DESCRIPTION TEMPLATE ────────────────────────── */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                YouTube Description Template
              </label>
              <span className="text-[10px] text-slate-500">Auto-appends hashtags if not present</span>
            </div>
            <textarea
              rows={3}
              value={ytSettings?.yt_description_template || ''}
              onChange={e => updateYtSettings({ yt_description_template: e.target.value })}
              placeholder="{movie} - Part {part}\n\n#Shorts {hashtags}"
              className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-3 py-2 focus:border-orange-500 focus:outline-none font-mono resize-y min-h-[70px]"
            />
          </div>

          {/* ── 7. TAGS & HASHTAGS ───────────────────────────────── */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                <Tag className="w-3.5 h-3.5 text-orange-400" />
                <span>Default Tags &amp; Hashtags</span>
              </label>
              <span className="text-[10px] text-slate-500">{(ytSettings?.yt_tags || []).length} active</span>
            </div>

            {/* Quick Viral Packs */}
            <div className="space-y-1">
              <span className="text-[10px] text-slate-500 font-medium">Quick 1-Click Viral Packs:</span>
              <div className="flex flex-wrap gap-1">
                {GLOBAL_HASHTAG_PACKS.map(pack => (
                  <button
                    key={pack.label}
                    type="button"
                    onClick={() => applyHashtagPack(pack)}
                    className="px-2 py-0.5 text-[10px] bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 rounded-md transition-colors cursor-pointer touch-manipulation flex items-center space-x-1"
                    title={pack.tags}
                  >
                    <span>{pack.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 bg-slate-950/60 border border-slate-800 rounded-xl p-2.5 min-h-[44px]">
              {(ytSettings?.yt_tags || []).length === 0 && (
                <span className="text-[11px] text-slate-600 italic">No tags added yet. Add tags or click a pack above.</span>
              )}
              {(ytSettings?.yt_tags || []).map(tag => (
                <span key={tag} className="inline-flex items-center space-x-1 bg-slate-800 text-slate-300 text-[11px] px-2 py-0.5 rounded-full border border-slate-700/60">
                  <span>#{tag}</span>
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="text-slate-500 hover:text-rose-400 cursor-pointer ml-0.5 touch-manipulation"
                  >×</button>
                </span>
              ))}
            </div>
            <div className="flex space-x-2">
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="Add tags or paste #shorts #viral..."
                className="flex-1 bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-3 py-2 focus:border-orange-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={addTag}
                className="px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer touch-manipulation"
              >Add</button>
            </div>
          </div>

          {/* ── 8. SAVE SETTINGS BUTTON ─────────────────────────── */}
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving' || isSavingSettings}
            className="w-full py-2.5 text-xs font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 active:scale-98 rounded-xl shadow-lg shadow-orange-500/20 transition-all cursor-pointer disabled:opacity-50 touch-manipulation flex items-center justify-center space-x-2"
          >
            {saveStatus === 'saving' ? (
              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span>Saving Settings...</span></>
            ) : saveStatus === 'saved' ? (
              <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" /><span>Saved Successfully!</span></>
            ) : saveStatus === 'error' ? (
              <><XCircle className="w-3.5 h-3.5 text-rose-300" /><span>Save Failed</span></>
            ) : (
              <span>Save YouTube Settings</span>
            )}
          </button>
        </>
      )}
    </div>
  );
}
