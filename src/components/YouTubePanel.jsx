/**
 * YouTubePanel — YouTube tab in EditorTabs
 * Shows connection status, upload defaults, title/description templates,
 * tags, schedule options, and Shorts preset button.
 */

import React, { useState } from 'react';
import {
  Youtube, CheckCircle2, XCircle, Link, Unlink, Settings2,
  Clock, Calendar, Tag, Globe, Eye, EyeOff, Zap, Info, RefreshCw, Sparkles, Lock
} from 'lucide-react';

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

const SCHEDULE_INTERVALS = [
  { id: '1day', label: 'Every 1 day' },
  { id: '2days', label: 'Every 2 days' },
  { id: '3days', label: 'Every 3 days' },
  { id: '1week', label: 'Every 1 week' }
];

export default function YouTubePanel({
  ytAccount,
  isConnected,
  isLoadingAccount,
  accountError,
  connectYouTube,
  disconnectYouTubeAccount,
  refreshAccount,
  ytSettings,
  updateYtSettings,
  persistSettings,
  isSavingSettings,
  apiAvailable,
  isAuthenticated = false,
  onOpenAuth
}) {
  const [tagInput, setTagInput] = useState('');
  const [saveStatus, setSaveStatus] = useState(null); // 'saving' | 'saved' | 'error'
  const [scheduleMode, setScheduleMode] = useState(ytSettings.yt_default_upload === 'auto' ? 'auto' : 'manual');

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
    const trimmed = tagInput.trim().toLowerCase().replace(/^#+/, '');
    if (!trimmed) return;
    const current = ytSettings.yt_tags || [];
    if (!current.includes(trimmed)) {
      updateYtSettings({ yt_tags: [...current, trimmed] });
    }
    setTagInput('');
  };

  const removeTag = (tag) => {
    updateYtSettings({ yt_tags: (ytSettings.yt_tags || []).filter(t => t !== tag) });
  };

  const applyShortPreset = () => {
    // Just shows a toast — actual export settings are in ExportPanel
    // This focuses on YouTube metadata defaults for Shorts
    updateYtSettings({
      yt_title_template: '{movie} - Part {part} | #Shorts',
      yt_description_template: '{movie} - Part {part}\n\n#Shorts',
      yt_tags: ['shorts', 'youtube shorts', 'clips']
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
            deployed Cloudflare Worker to enable YouTube uploads, scheduling, and branding presets.
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
              <span className="text-[11px] font-semibold text-slate-200 block mb-0.5">Direct Shorts Uploads</span>
              <span className="text-[10px] text-slate-400 block leading-tight">Publish generated clips directly to your channel.</span>
            </div>
            <div className="p-2.5 bg-slate-950/40 rounded-xl border border-slate-800/60">
              <span className="text-[11px] font-semibold text-slate-200 block mb-0.5">Automated Scheduling</span>
              <span className="text-[10px] text-slate-400 block leading-tight">Space out multiple parts across days automatically.</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── CONNECTION STATUS ─────────────────────────────────── */}
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

        {!isConnected && (
          <div className="flex items-start space-x-2 bg-slate-900/60 rounded-lg p-2.5">
            <Info className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-slate-400 leading-relaxed">
              You can continue using all local editing features without connecting YouTube.
              Connect to enable direct uploads, scheduling, and upload history.
            </p>
          </div>
        )}
      </div>

      {/* Only show settings when connected */}
      {isConnected && (
        <>
          {/* ── SHORTS PRESET ───────────────────────────────────── */}
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
              <span>Apply</span>
            </button>
          </div>

          {/* ── UPLOAD DEFAULTS ─────────────────────────────────── */}
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
                  <span>Visibility</span>
                </label>
                <select
                  value={ytSettings.yt_visibility || 'private'}
                  onChange={e => updateYtSettings({ yt_visibility: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-3 py-2 focus:border-orange-500 focus:outline-none"
                >
                  <option value="private">Private</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="public">Public</option>
                </select>
              </div>

              {/* Category */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-400">Category</label>
                <select
                  value={ytSettings.yt_category || '22'}
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
                  onClick={() => updateYtSettings({ yt_made_for_kids: !ytSettings.yt_made_for_kids })}
                  className={`w-8 h-4.5 rounded-full transition-colors relative cursor-pointer flex-shrink-0 ${
                    ytSettings.yt_made_for_kids ? 'bg-orange-500' : 'bg-slate-700'
                  }`}
                  style={{ height: '18px' }}
                >
                  <span className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-transform ${
                    ytSettings.yt_made_for_kids ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </div>
                <span className="text-[11px] text-slate-300">Made for Kids</span>
              </label>

              {/* Notify subscribers */}
              <label className="flex items-center space-x-2.5 cursor-pointer">
                <div
                  onClick={() => updateYtSettings({ yt_notify_subscribers: !ytSettings.yt_notify_subscribers })}
                  className={`w-8 rounded-full transition-colors relative cursor-pointer flex-shrink-0 ${
                    ytSettings.yt_notify_subscribers ? 'bg-orange-500' : 'bg-slate-700'
                  }`}
                  style={{ height: '18px' }}
                >
                  <span className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-transform ${
                    ytSettings.yt_notify_subscribers ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </div>
                <span className="text-[11px] text-slate-300">Notify Subscribers</span>
              </label>
            </div>
          </div>

          {/* ── TITLE TEMPLATE ───────────────────────────────────── */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              YouTube Title Template
            </label>
            <input
              type="text"
              value={ytSettings.yt_title_template || ''}
              onChange={e => updateYtSettings({ yt_title_template: e.target.value })}
              placeholder="{movie} - Part {part} | #Shorts"
              className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-3 py-2 focus:border-orange-500 focus:outline-none font-mono"
            />
            <p className="text-[10px] text-slate-500">
              Tokens: <code className="text-amber-400">{'{movie}'}</code> = movie name &nbsp;
              <code className="text-amber-400">{'{part}'}</code> = zero-padded part number
            </p>
          </div>

          {/* ── DESCRIPTION TEMPLATE ────────────────────────────── */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              YouTube Description Template
            </label>
            <textarea
              rows={4}
              value={ytSettings.yt_description_template || ''}
              onChange={e => updateYtSettings({ yt_description_template: e.target.value })}
              placeholder="{movie} - Part {part}\n\n#Shorts"
              className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-3 py-2 focus:border-orange-500 focus:outline-none font-mono resize-y min-h-[80px]"
            />
          </div>

          {/* ── TAGS ─────────────────────────────────────────────── */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
              <Tag className="w-3.5 h-3.5 text-orange-400" />
              <span>Default Tags</span>
            </label>
            <div className="flex flex-wrap gap-1.5 bg-slate-950/60 border border-slate-800 rounded-xl p-2.5 min-h-[44px]">
              {(ytSettings.yt_tags || []).map(tag => (
                <span key={tag} className="inline-flex items-center space-x-1 bg-slate-800 text-slate-300 text-[11px] px-2 py-0.5 rounded-full">
                  <span>#{tag}</span>
                  <button
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
                placeholder="Add tag..."
                className="flex-1 bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-3 py-2 focus:border-orange-500 focus:outline-none"
              />
              <button
                onClick={addTag}
                className="px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer touch-manipulation"
              >Add</button>
            </div>
          </div>

          {/* ── AUTO-UPLOAD MODE ─────────────────────────────────── */}
          <div className="space-y-2 bg-slate-950/60 border border-slate-800 rounded-xl p-3.5">
            <p className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5 text-orange-400" />
              <span>Upload Mode</span>
            </p>
            <div className="space-y-2">
              {[
                { id: 'manual', label: 'Manual — Upload clips one by one when I choose' },
                { id: 'auto', label: 'Auto — Upload immediately after each clip exports' }
              ].map(opt => (
                <label key={opt.id} className="flex items-start space-x-2.5 cursor-pointer group">
                  <div
                    onClick={() => setScheduleMode(opt.id)}
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0 cursor-pointer transition-colors ${
                      scheduleMode === opt.id
                        ? 'border-orange-500 bg-orange-500'
                        : 'border-slate-600 group-hover:border-slate-400'
                    }`}
                  >
                    {scheduleMode === opt.id && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                  </div>
                  <span className="text-xs text-slate-300 leading-relaxed">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* ── BATCH SCHEDULE INTERVAL ─────────────────────────── */}
          <div className="space-y-2 bg-slate-950/60 border border-slate-800 rounded-xl p-3.5">
            <p className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
              <Calendar className="w-3.5 h-3.5 text-orange-400" />
              <span>Batch Schedule Interval</span>
            </p>
            <p className="text-[11px] text-slate-500">When scheduling multiple parts, publish them at this interval.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SCHEDULE_INTERVALS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => updateYtSettings({ schedule_interval: opt.id })}
                  className={`px-2 py-1.5 text-[11px] rounded-lg border transition-colors cursor-pointer touch-manipulation ${
                    ytSettings.schedule_interval === opt.id
                      ? 'bg-orange-500/15 border-orange-500 text-white font-semibold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400">Default Publish Time</label>
                <input
                  type="time"
                  value={ytSettings.schedule_base_time || '20:00'}
                  onChange={e => updateYtSettings({ schedule_base_time: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-3 py-2 focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400">Timezone</label>
                <input
                  type="text"
                  value={ytSettings.schedule_timezone || 'UTC'}
                  onChange={e => updateYtSettings({ schedule_timezone: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-3 py-2 focus:border-orange-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* ── SAVE BUTTON ─────────────────────────────────────── */}
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving' || isSavingSettings}
            className="w-full py-2.5 text-xs font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 active:scale-98 rounded-xl shadow-lg shadow-orange-500/20 transition-all cursor-pointer disabled:opacity-50 touch-manipulation flex items-center justify-center space-x-2"
          >
            {saveStatus === 'saving' ? (
              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span>Saving...</span></>
            ) : saveStatus === 'saved' ? (
              <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" /><span>Saved!</span></>
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
