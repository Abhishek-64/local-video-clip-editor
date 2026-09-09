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

import React, { useState } from 'react';
import {
  Youtube, CheckCircle2, XCircle, Link, Unlink, Settings2,
  Tag, Eye, Zap, Info, RefreshCw,
  Sparkles, Lock, Film, Copy, Share2, Video, Instagram
} from 'lucide-react';

import {
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
  apiAvailable,
  isAuthenticated = false,
  onOpenAuth,
  pipelineStartTime,
  setPipelineStartTime,
  customParts = [],
  textSettings = {},
  fbSettings = {},
  igSettings = {},
  onSwitchToPlatform
}) {
  const [tagInput, setTagInput] = useState('');



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
          <p className="text-xs font-semibold text-slate-400">YouTube Not Configured</p>
          <p className="text-[11px] text-slate-500">
            Set <code className="bg-slate-800 px-1 py-0.5 rounded text-amber-300">VITE_API_URL</code> in your{' '}
            <code className="bg-slate-800 px-1 py-0.5 rounded text-amber-300">.env</code> to enable direct YouTube uploads and scheduled releases.
          </p>
        </div>
      </div>
    );
  }

  // ── Unauthenticated State: Must sign in first ────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="space-y-4">
        <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border border-slate-800 rounded-2xl p-5 text-center space-y-3.5 shadow-xl">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-orange-500/20 via-red-500/20 to-rose-500/20 border border-red-500/30 flex items-center justify-center mx-auto shadow-inner">
            <Lock className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white tracking-tight">Sign In to Connect YouTube</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
              Sign in to link your YouTube channel and securely store upload presets.
            </p>
          </div>

          <div className="pt-1">
            <button
              onClick={() => onOpenAuth && onOpenAuth('login')}
              className="px-4 py-2 bg-gradient-to-r from-orange-500 via-rose-500 to-amber-500 hover:from-orange-400 hover:to-rose-400 active:scale-98 text-white text-xs font-bold rounded-xl shadow-lg shadow-orange-500/20 transition-all cursor-pointer inline-flex items-center space-x-2 touch-manipulation"
            >
              <Sparkles className="w-4 h-4" />
              <span>Sign In / Create Account</span>
            </button>
          </div>

          <div className="pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-left max-w-xs mx-auto">
            <div className="p-2 bg-slate-950/40 rounded-xl border border-slate-800/60">
              <span className="text-[11px] font-semibold text-slate-200 block mb-0.5">Automated Schedule</span>
              <span className="text-[10px] text-slate-400 block">Spaced part releases.</span>
            </div>
            <div className="p-2 bg-slate-950/40 rounded-xl border border-slate-800/60">
              <span className="text-[11px] font-semibold text-slate-200 block mb-0.5">Shorts Uploads</span>
              <span className="text-[10px] text-slate-400 block">Direct 1-click uploads.</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5 animate-fadeIn">
      {/* ── 1. CONNECTION STATUS ─────────────────────────────────── */}
      <div className={`border rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-lg ${
        isConnected
          ? 'bg-emerald-500/5 border-emerald-500/30'
          : 'bg-slate-950/60 border-slate-800'
      }`}>
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5 min-w-0 flex-1">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              isConnected ? 'bg-red-500/20 border border-red-500/40 text-red-400' : 'bg-slate-800 border border-slate-700 text-slate-500'
            }`}>
              <Youtube className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-bold text-white truncate">
                {isConnected ? 'YouTube Connected' : 'YouTube Not Connected'}
              </p>
              {isConnected && ytAccount ? (
                <p className="text-[11px] text-emerald-400 truncate max-w-full">
                  {ytAccount.channel_title}
                  {ytAccount.channel_handle && (
                    <span className="text-slate-500 ml-1">· {ytAccount.channel_handle}</span>
                  )}
                </p>
              ) : (
                <p className="text-[11px] text-slate-500 truncate">Connect to enable direct uploads</p>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0 self-end sm:self-center">
            {isConnected ? (
              <>
                <button
                  type="button"
                  onClick={refreshAccount}
                  disabled={isLoadingAccount}
                  className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors cursor-pointer touch-manipulation"
                  title="Refresh connection"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAccount ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={disconnectYouTubeAccount}
                  className="px-3 py-1.5 text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl transition-colors cursor-pointer touch-manipulation flex items-center space-x-1.5 whitespace-nowrap shadow-sm"
                  title="Disconnect YouTube account"
                >
                  <Unlink className="w-3.5 h-3.5 shrink-0" />
                  <span>Disconnect</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={connectYouTube}
                disabled={isLoadingAccount}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-xl transition-colors cursor-pointer touch-manipulation flex items-center space-x-1.5 disabled:opacity-50 shadow-md shadow-red-600/20 whitespace-nowrap"
              >
                <Link className="w-3.5 h-3.5 shrink-0" />
                <span>{isLoadingAccount ? 'Connecting...' : 'Connect YouTube'}</span>
              </button>
            )}
          </div>
        </div>

        {accountError && (
          <div className="flex items-start space-x-2 bg-rose-500/10 border border-rose-500/30 rounded-xl p-2.5">
            <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-rose-300 break-words">{accountError}</p>
          </div>
        )}
      </div>

      {/* Only show full pipeline and settings when connected */}
      {isConnected && (
        <>
          {/* ── CONTENT TYPE SELECTOR ── */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Choose YouTube Content Type
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => updateYtSettings({ yt_content_type: 'shorts' })}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center space-x-3 ${
                  (ytSettings?.yt_content_type || 'shorts') === 'shorts'
                    ? 'bg-red-500/15 border-red-500 text-white shadow-md shadow-red-500/10'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  (ytSettings?.yt_content_type || 'shorts') === 'shorts' ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400'
                }`}>
                  <Film className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold block truncate">YouTube Shorts</span>
                  <span className="text-[10px] text-slate-400 block truncate">9:16 Vertical Short-Form</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => updateYtSettings({ yt_content_type: 'video' })}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center space-x-3 ${
                  ytSettings?.yt_content_type === 'video'
                    ? 'bg-red-500/15 border-red-500 text-white shadow-md shadow-red-500/10'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  ytSettings?.yt_content_type === 'video' ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400'
                }`}>
                  <Video className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold block truncate">Standard Video</span>
                  <span className="text-[10px] text-slate-400 block truncate">Standard Landscape Feed</span>
                </div>
              </button>
            </div>
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

          {/* ── 2. YOUTUBE SERIES / VIDEO NAME & PART CONFIGURATION ── */}
          <div className="space-y-4 bg-slate-950/80 border border-red-500/30 rounded-2xl p-4 sm:p-5 shadow-lg">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 gap-2">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0">
                  <Film className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs sm:text-sm font-bold text-white tracking-wide block truncate">
                    YouTube Series Title &amp; Numbering
                  </span>
                  <span className="text-[10px] sm:text-[11px] text-slate-400 block truncate">
                    Independent YouTube upload metadata &amp; part tokens
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-300 shrink-0">
                YouTube Only
              </span>
            </div>

            {/* Field 1: YouTube Series Name */}
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <label className="text-xs font-semibold text-slate-200">
                  YouTube Video / Series Name:
                </label>
                <div className="flex flex-wrap items-center gap-1">
                  {textSettings?.movieName && textSettings.movieName !== ytSettings?.yt_name && (
                    <button
                      type="button"
                      onClick={() => updateYtSettings({ yt_name: textSettings.movieName })}
                      className="text-[10px] text-orange-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-orange-500/30 rounded-lg px-2 py-0.5 transition-colors cursor-pointer flex items-center space-x-1 shrink-0 touch-manipulation"
                      title="Copy from on-screen text overlay title"
                    >
                      <Copy className="w-2.5 h-2.5 text-orange-400" />
                      <span>Sync Overlay</span>
                    </button>
                  )}
                  {fbSettings?.fb_name && fbSettings.fb_name !== ytSettings?.yt_name && (
                    <button
                      type="button"
                      onClick={() => updateYtSettings({ yt_name: fbSettings.fb_name })}
                      className="text-[10px] text-blue-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-blue-500/30 rounded-lg px-2 py-0.5 transition-colors cursor-pointer flex items-center space-x-1 shrink-0 touch-manipulation"
                      title="Copy series name from Facebook"
                    >
                      <Share2 className="w-2.5 h-2.5 text-blue-400" />
                      <span>Sync FB</span>
                    </button>
                  )}
                  {igSettings?.ig_name && igSettings.ig_name !== ytSettings?.yt_name && (
                    <button
                      type="button"
                      onClick={() => updateYtSettings({ yt_name: igSettings.ig_name })}
                      className="text-[10px] text-pink-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-pink-500/30 rounded-lg px-2 py-0.5 transition-colors cursor-pointer flex items-center space-x-1 shrink-0 touch-manipulation"
                      title="Copy series name from Instagram"
                    >
                      <Instagram className="w-2.5 h-2.5 text-pink-400" />
                      <span>Sync IG</span>
                    </button>
                  )}
                </div>
              </div>
              <input
                type="text"
                value={ytSettings?.yt_name ?? ''}
                onChange={(e) => updateYtSettings({ yt_name: e.target.value })}
                placeholder="e.g. Inception (2010), Sci-Fi Short"
                className="w-full bg-slate-900 border border-slate-700 text-xs sm:text-sm text-white rounded-xl px-3 py-2.5 focus:border-red-500 focus:outline-none shadow-inner"
              />
              <p className="text-[10px] text-slate-400">
                Replaces <code className="text-red-400 font-mono">{'{movie}'}</code> and <code className="text-red-400 font-mono">{'{title}'}</code> tokens in YouTube titles &amp; descriptions.
              </p>
            </div>

            {/* Field 2: Part Numbering & Zero-Padding Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-slate-300">
                  Start Part Number:
                </label>
                <input
                  type="number"
                  min="1"
                  max="999"
                  value={ytSettings?.yt_start_part || 1}
                  onChange={(e) => updateYtSettings({ yt_start_part: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="w-24 bg-slate-950 border border-slate-700 text-white font-mono font-bold text-xs text-center px-2 py-1.5 rounded-lg focus:border-red-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-slate-300">
                  Zero-Padding:
                </label>
                <button
                  type="button"
                  onClick={() => updateYtSettings({ yt_zero_pad: ytSettings?.yt_zero_pad === false ? true : false })}
                  className={`px-3 py-1.5 text-xs font-mono font-medium rounded-lg border transition-colors cursor-pointer touch-manipulation ${
                    ytSettings?.yt_zero_pad !== false
                      ? 'bg-red-500/20 border-red-500/40 text-red-300 font-bold'
                      : 'bg-slate-950 border-slate-700 text-slate-400'
                  }`}
                >
                  {ytSettings?.yt_zero_pad !== false ? 'Part 01, 02...' : 'Part 1, 2...'}
                </button>
              </div>
            </div>

            {/* Field 3: YouTube Title Template */}
            <div className="space-y-2 pt-1 border-t border-slate-800/80">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <label className="text-xs font-semibold text-slate-200">
                  YouTube Title Template:
                </label>
                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={() => {
                      const current = ytSettings?.yt_title_template || '';
                      updateYtSettings({ yt_title_template: `${current}${current ? ' ' : ''}{movie}` });
                    }}
                    className="px-1.5 py-0.5 text-[9px] bg-slate-900 hover:bg-slate-800 text-red-300 border border-red-500/30 rounded font-mono cursor-pointer"
                  >
                    +{'{movie}'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const current = ytSettings?.yt_title_template || '';
                      updateYtSettings({ yt_title_template: `${current}${current ? ' ' : ''}{part}` });
                    }}
                    className="px-1.5 py-0.5 text-[9px] bg-slate-900 hover:bg-slate-800 text-red-300 border border-red-500/30 rounded font-mono cursor-pointer"
                  >
                    +{'{part}'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const current = ytSettings?.yt_title_template || '';
                      updateYtSettings({ yt_title_template: `${current}${current ? ' ' : ''}#Shorts` });
                    }}
                    className="px-1.5 py-0.5 text-[9px] bg-slate-900 hover:bg-slate-800 text-red-300 border border-red-500/30 rounded font-mono cursor-pointer"
                  >
                    +#Shorts
                  </button>
                </div>
              </div>

              <input
                type="text"
                value={ytSettings?.yt_title_template || ''}
                onChange={e => updateYtSettings({ yt_title_template: e.target.value })}
                placeholder="{movie} - Part {part} | #Shorts"
                className="w-full bg-slate-900 border border-slate-700 text-xs sm:text-sm text-white rounded-xl px-3 py-2 focus:border-red-500 focus:outline-none font-mono shadow-inner"
              />

              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] text-slate-500 mr-1">Presets:</span>
                {[
                  { label: 'Shorts Standard', value: '{movie} - Part {part} | #Shorts' },
                  { label: 'Pt. Short', value: '{movie} - Pt. {part} | #Shorts' },
                  { label: 'Bracket', value: '{movie} [Part {part}] #Shorts' },
                  { label: 'Hashtag First', value: '#{part} | {movie} #Shorts' }
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => updateYtSettings({ yt_title_template: p.value })}
                    className={`px-2 py-0.5 text-[10px] rounded border transition-colors cursor-pointer touch-manipulation ${
                      ytSettings?.yt_title_template === p.value
                        ? 'bg-red-500/20 border-red-500/50 text-red-300 font-bold'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-800'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Field 4: Description Template */}
            <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <label className="text-xs font-semibold text-slate-200">
                  YouTube Description Template
                </label>
                <div className="flex flex-wrap items-center gap-1">
                  {fbSettings?.fb_caption_template && (
                    <button
                      type="button"
                      onClick={() => updateYtSettings({ yt_description_template: fbSettings.fb_caption_template })}
                      className="text-[10px] text-blue-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-blue-500/30 rounded-lg px-2 py-0.5 transition-colors cursor-pointer flex items-center space-x-1 shrink-0 touch-manipulation"
                      title="Copy description template from Facebook"
                    >
                      <Share2 className="w-2.5 h-2.5 text-blue-400" />
                      <span>Sync from FB</span>
                    </button>
                  )}
                  {igSettings?.ig_caption_template && (
                    <button
                      type="button"
                      onClick={() => updateYtSettings({ yt_description_template: igSettings.ig_caption_template })}
                      className="text-[10px] text-pink-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-pink-500/30 rounded-lg px-2 py-0.5 transition-colors cursor-pointer flex items-center space-x-1 shrink-0 touch-manipulation"
                      title="Copy description template from Instagram"
                    >
                      <Instagram className="w-2.5 h-2.5 text-pink-400" />
                      <span>Sync from IG</span>
                    </button>
                  )}
                </div>
              </div>
              <textarea
                rows={3}
                value={ytSettings?.yt_description_template || ''}
                onChange={e => updateYtSettings({ yt_description_template: e.target.value })}
                placeholder="{movie} - Part {part}\n\n#Shorts\n{hashtags}"
                className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-xl px-3 py-2 focus:border-red-500 focus:outline-none font-mono resize-y min-h-[70px] shadow-inner"
              />
            </div>
          </div>

          {/* ── 7. TAGS & HASHTAGS ───────────────────────────────── */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                <Tag className="w-3.5 h-3.5 text-orange-400" />
                <span>Default Tags &amp; Hashtags</span>
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                {fbSettings?.fb_tags && fbSettings.fb_tags.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const combined = Array.from(new Set([...(ytSettings?.yt_tags || []), ...fbSettings.fb_tags]));
                      updateYtSettings({ yt_tags: combined });
                    }}
                    className="text-[10px] text-blue-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-blue-500/30 rounded-lg px-2 py-0.5 transition-colors cursor-pointer flex items-center space-x-1 shrink-0 touch-manipulation"
                    title="Merge tags from Facebook"
                  >
                    <Share2 className="w-2.5 h-2.5 text-blue-400" />
                    <span>Sync FB Tags ({fbSettings.fb_tags.length})</span>
                  </button>
                )}
                {igSettings?.ig_tags && igSettings.ig_tags.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const combined = Array.from(new Set([...(ytSettings?.yt_tags || []), ...igSettings.ig_tags]));
                      updateYtSettings({ yt_tags: combined });
                    }}
                    className="text-[10px] text-pink-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-pink-500/30 rounded-lg px-2 py-0.5 transition-colors cursor-pointer flex items-center space-x-1 shrink-0 touch-manipulation"
                    title="Merge tags from Instagram"
                  >
                    <Instagram className="w-2.5 h-2.5 text-pink-400" />
                    <span>Sync IG Tags ({igSettings.ig_tags.length})</span>
                  </button>
                )}
                <span className="text-[10px] text-slate-500">{(ytSettings?.yt_tags || []).length} active</span>
                {(ytSettings?.yt_tags || []).length > 0 && (
                  <button
                    type="button"
                    onClick={() => updateYtSettings({ yt_tags: [] })}
                    className="text-[10px] text-rose-400 hover:text-rose-300 font-medium cursor-pointer touch-manipulation flex items-center space-x-1 px-1.5 py-0.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded transition-colors"
                    title="Clear all active tags and hashtags"
                  >
                    <span>Clear All</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 bg-slate-950/60 border border-slate-800 rounded-xl p-2.5 min-h-[44px]">
              {(ytSettings?.yt_tags || []).length === 0 && (
                <span className="text-[11px] text-slate-600 italic">No tags added yet. Type tags or hashtags below.</span>
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
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="Add tags or paste #shorts #viral..."
                className="flex-1 bg-slate-900 border border-slate-700 text-xs text-white rounded-xl px-3 py-2 focus:border-orange-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={addTag}
                className="w-full sm:w-auto px-5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors cursor-pointer touch-manipulation"
              >Add Tag</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
