import React, { useState, useMemo, useEffect } from 'react';
import {
  X, Send, Calendar, Clock, Youtube, Share2, Instagram, CheckCircle2,
  AlertCircle, Film, Sparkles, CheckSquare, Square, Image as ImageIcon, Camera
} from 'lucide-react';
import {
  toDateTimeLocalString,
  SCHEDULE_INTERVALS,
  getIntervalSeconds,
  formatIntervalLabel
} from '../utils/scheduler';
import { formatTime } from '../utils/time';

export default function UnifiedPublishModal({
  isOpen,
  onClose,
  clips = [], // Array of clip objects or single clip object
  movieName = 'Movie',
  youtubeName,
  textSettings = {},
  // Photo Mode Props
  isPhotoMode = false,
  photoItem = null,
  // YouTube Props
  isYtConnected = false,
  ytAccount = null,
  ytSettings = {},
  // Facebook Props
  isFbConnected = false,
  fbAccount = null,
  fbSettings = {},
  // Instagram Props
  isIgConnected = false,
  igAccount = null,
  igSettings = {},
  // Confirmation action
  onConfirmPublish,
  isPublishing = false,
  publishProgress = 0,
  isPreRender = false
}) {
  // Photo mode custom caption state
  const [photoCaption, setPhotoCaption] = useState(photoItem?.caption || '');
  const [photoTitle, setPhotoTitle] = useState(photoItem?.title || '');
  const [isAiGenerated, setIsAiGenerated] = useState(
    Boolean(fbSettings?.fb_is_ai_generated || igSettings?.ig_is_ai_generated || false)
  );

  useEffect(() => {
    if (photoItem) {
      setPhotoCaption(photoItem.caption || '');
      setPhotoTitle(photoItem.title || '');
    }
  }, [photoItem]);
  // Normalize clips to array
  const clipList = useMemo(() => {
    if (!clips) return [];
    if (Array.isArray(clips)) return clips;
    return [clips];
  }, [clips]);

  const isBatch = clipList.length > 1;
  const primaryClip = clipList[0] || null;

  // ── Platform Availability ──────────────────────────────────────────────────
  const canYt = Boolean(isYtConnected);
  const canFb = Boolean(isFbConnected && (fbAccount?.page_id || fbAccount?.id));
  const canIg = Boolean(isIgConnected && (igAccount?.ig_user_id || igAccount?.id));
  const hasAnyPlatform = canYt || canFb || canIg;

  // ── Platform Checkbox Selection State ──────────────────────────────────────
  const [selectedPlatforms, setSelectedPlatforms] = useState(() => ({
    youtube: isPhotoMode ? false : canYt,
    facebook: canFb,
    instagram: canIg
  }));

  // Sync default selection if connections load after mount
  useEffect(() => {
    setSelectedPlatforms({
      youtube: isPhotoMode ? false : canYt,
      facebook: canFb,
      instagram: canIg
    });
  }, [canYt, canFb, canIg, isPhotoMode]);

  const togglePlatform = (platform) => {
    setSelectedPlatforms(prev => ({
      ...prev,
      [platform]: !prev[platform]
    }));
  };

  // ── Mode: 'now' | 'schedule' | 'local_only' ─────────────────────────────────
  const [publishMode, setPublishMode] = useState('schedule');

  // ── Scheduling State (Independent Times per Platform) ──────────────────────
  const minFbTime = useMemo(() => {
    return toDateTimeLocalString(new Date(Date.now() + 2 * 60 * 1000));
  }, []);

  const minIgTime = useMemo(() => {
    return toDateTimeLocalString(new Date(Date.now() + 2 * 60 * 1000));
  }, []);

  const minYtTime = useMemo(() => {
    return toDateTimeLocalString(new Date(Date.now() + 2 * 60 * 1000));
  }, []);

  const defaultScheduleBase = useMemo(() => {
    const d = new Date(Date.now() + 5 * 60 * 1000);
    const remainder = d.getMinutes() % 5;
    if (remainder !== 0) {
      d.setMinutes(d.getMinutes() + (5 - remainder));
    }
    d.setSeconds(0, 0);
    return d;
  }, []);

  const [ytScheduleTime, setYtScheduleTime] = useState(() => {
    const d = new Date(defaultScheduleBase.getTime() + (isPhotoMode ? 0 : 30 * 60 * 1000));
    return toDateTimeLocalString(d);
  });

  const [fbScheduleTime, setFbScheduleTime] = useState(() => {
    return toDateTimeLocalString(defaultScheduleBase);
  });

  const [igScheduleTime, setIgScheduleTime] = useState(() => {
    const d = new Date(defaultScheduleBase.getTime() + (isPhotoMode ? 0 : 15 * 60 * 1000));
    return toDateTimeLocalString(d);
  });

  const [batchInterval, setBatchInterval] = useState('1hour');

  // ── Submitting State (Lock on double click) ─────────────────────────────────
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);
  const isBusy = isPublishing || isSubmittingLocal;

  // ── Validation ─────────────────────────────────────────────────────────────
  const hasSelectedPlatform = (isPhotoMode ? false : selectedPlatforms.youtube) || selectedPlatforms.facebook || selectedPlatforms.instagram;

  const isScheduleValid = useMemo(() => {
    if (publishMode !== 'schedule') return true;
    const now = Date.now();
    const minFutureMs = now + 60 * 1000; // Cloudflare Worker scheduler triggers every minute
    if (selectedPlatforms.youtube && !isPhotoMode) {
      if (!ytScheduleTime || new Date(ytScheduleTime).getTime() <= minFutureMs) return false;
    }
    if (selectedPlatforms.facebook) {
      if (!fbScheduleTime || new Date(fbScheduleTime).getTime() <= minFutureMs) return false;
    }
    if (selectedPlatforms.instagram) {
      if (!igScheduleTime || new Date(igScheduleTime).getTime() <= minFutureMs) return false;
    }
    return true;
  }, [publishMode, selectedPlatforms, ytScheduleTime, fbScheduleTime, igScheduleTime, isPhotoMode]);

  const canSubmit = !isBusy && (isPhotoMode ? !!photoItem : clipList.length > 0) && (
    publishMode === 'local_only' ||
    (hasSelectedPlatform && isScheduleValid)
  );

  // ── Handle Submit ──────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmittingLocal(true);

    try {
      let config;
      if (isPhotoMode) {
        config = {
          isPhoto: true,
          isAiGenerated,
          photoItem: {
            ...photoItem,
            title: photoTitle,
            caption: photoCaption
          },
          mode: publishMode,
          platforms: {
            youtube: {
              enabled: selectedPlatforms.youtube && canYt,
              mode: publishMode,
              scheduledAt: publishMode === 'schedule' ? new Date(ytScheduleTime).toISOString() : null,
              scheduleTime: publishMode === 'schedule' ? new Date(ytScheduleTime).toISOString() : null
            },
            facebook: {
              enabled: selectedPlatforms.facebook && canFb,
              mode: publishMode,
              scheduledAt: publishMode === 'schedule' ? new Date(fbScheduleTime).toISOString() : null,
              scheduleTime: publishMode === 'schedule' ? new Date(fbScheduleTime).toISOString() : null
            },
            instagram: {
              enabled: selectedPlatforms.instagram && canIg,
              mode: publishMode,
              scheduledAt: publishMode === 'schedule' ? new Date(igScheduleTime).toISOString() : null,
              scheduleTime: publishMode === 'schedule' ? new Date(igScheduleTime).toISOString() : null
            }
          }
        };
      } else {
        config = {
          clips: clipList,
          isAiGenerated,
          mode: publishMode,
          batchInterval,
          batchIntervalMinutes: getIntervalSeconds(batchInterval) / 60,
          platforms: {
            youtube: {
              enabled: publishMode !== 'local_only' && selectedPlatforms.youtube && canYt,
              mode: publishMode,
              scheduledAt: publishMode === 'schedule' ? new Date(ytScheduleTime).toISOString() : null,
              scheduleTime: publishMode === 'schedule' ? new Date(ytScheduleTime).toISOString() : null
            },
            facebook: {
              enabled: publishMode !== 'local_only' && selectedPlatforms.facebook && canFb,
              mode: publishMode,
              scheduledAt: publishMode === 'schedule' ? new Date(fbScheduleTime).toISOString() : null,
              scheduleTime: publishMode === 'schedule' ? new Date(fbScheduleTime).toISOString() : null
            },
            instagram: {
              enabled: publishMode !== 'local_only' && selectedPlatforms.instagram && canIg,
              mode: publishMode,
              scheduledAt: publishMode === 'schedule' ? new Date(igScheduleTime).toISOString() : null,
              scheduleTime: publishMode === 'schedule' ? new Date(igScheduleTime).toISOString() : null
            }
          }
        };
      }

      if (onConfirmPublish) {
        await onConfirmPublish(config);
      }
      onClose();
    } catch (err) {
      console.error('[UnifiedPublishModal] submission error:', err);
    } finally {
      setIsSubmittingLocal(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn">
      <div
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-orange-500 via-amber-500 to-rose-500 flex items-center justify-center text-white shadow-md shadow-orange-500/20">
              {isPhotoMode ? <ImageIcon className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                {isPhotoMode
                  ? publishMode === 'schedule' ? 'Schedule Photo Post' : 'Publish Photo Post'
                  : isPreRender
                  ? `Render & Publishing Setup (${clipList.length} Clips)`
                  : publishMode === 'schedule'
                  ? 'Schedule Video Clips'
                  : 'Publish Video Clips'}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isBusy}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-4 sm:space-y-5 overflow-y-auto flex-1">
          {/* 1. Target Media Overview */}
          {isPhotoMode && photoItem ? (
            <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl flex items-center justify-between gap-3">
              <div className="flex items-center space-x-3 min-w-0">
                {photoItem.dataUrl ? (
                  <img
                    src={photoItem.dataUrl}
                    alt="Photo Post"
                    className="w-12 h-12 object-cover rounded-lg border border-slate-700 shadow-sm shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-orange-400 shrink-0">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">
                    {photoTitle || 'Photo Post'}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    Ratio: {photoItem.aspectRatio || '1:1'} • High-Resolution Image
                  </p>
                </div>
              </div>

              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20 shrink-0">
                Photo Ready
              </span>
            </div>
          ) : (
            <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl flex items-center justify-between gap-3">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-orange-400 shrink-0">
                  <Film className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">
                    {isBatch ? `${clipList.length} Clips Selected` : (primaryClip?.name || 'Generated Clip')}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {isBatch
                      ? clipList.map(c => `Part ${c.partNumber || 1}`).join(', ')
                      : `Part ${primaryClip?.partNumber || 1}`}
                  </p>
                </div>
              </div>

              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                {isPreRender ? 'Ready to Render' : 'HD Ready'}
              </span>
            </div>
          )}

          {/* Photo Caption & Hashtags Editor (in Photo Mode) */}
          {isPhotoMode && (
            <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2.5">
              <label className="text-xs font-bold text-slate-300 block">Post Caption & Description</label>
              <textarea
                value={photoCaption}
                onChange={(e) => setPhotoCaption(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:border-orange-500 outline-none resize-none"
                placeholder="Write your Facebook / Instagram caption and hashtags here..."
              />
            </div>
          )}

          {/* 2. Action Mode Tabs: Schedule vs Publish Now vs Local Render Only */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
              {isPreRender ? 'Generation & Publishing Action' : 'Publishing Action'}
            </label>
            <div className={`grid ${isPreRender ? 'grid-cols-3' : 'grid-cols-2'} gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800`}>
              <button
                type="button"
                onClick={() => setPublishMode('schedule')}
                className={`py-2 px-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                  publishMode === 'schedule'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Schedule</span>
              </button>

              <button
                type="button"
                onClick={() => setPublishMode('now')}
                className={`py-2 px-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                  publishMode === 'now'
                    ? 'bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isPreRender ? 'Render & Publish' : 'Publish Now'}</span>
              </button>

              {isPreRender && (
                <button
                  type="button"
                  onClick={() => setPublishMode('local_only')}
                  className={`py-2 px-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                    publishMode === 'local_only'
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>Render Only</span>
                </button>
              )}
            </div>
          </div>

          {/* If Local Only Selected */}
          {publishMode === 'local_only' && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center space-x-2.5 animate-fadeIn">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
              <div>
                <p className="font-bold">Local Rendering Mode</p>
                <p className="text-[11px] text-emerald-400/90 mt-0.5">
                  Selected clips will be generated and exported locally without posting to YouTube, Facebook, or Instagram.
                </p>
              </div>
            </div>
          )}

          {/* 3. Platform Selection Checkboxes (Shown unless local_only) */}
          {publishMode !== 'local_only' && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                <span>Select Target Platforms</span>
              </label>

              {!hasAnyPlatform ? (
                <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl text-amber-300 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>No social accounts connected yet. Please connect YouTube, Facebook, or Instagram.</span>
                </div>
              ) : (
                <div className={`grid grid-cols-1 ${isPhotoMode ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-2`}>
                  {/* YouTube (Only available for video clips) */}
                  {!isPhotoMode && (
                    <div
                      onClick={() => canYt && togglePlatform('youtube')}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-2 transition-all select-none ${
                        !canYt
                          ? 'bg-slate-950/40 border-slate-800/40 opacity-40 cursor-not-allowed'
                          : selectedPlatforms.youtube
                          ? 'bg-red-950/30 border-red-500/50 text-white cursor-pointer shadow-sm'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-red-600 flex items-center justify-center text-white shrink-0 shadow-sm shadow-red-600/30">
                          <Youtube className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-bold block truncate">YouTube</span>
                          <span className="text-[10px] text-slate-400 block truncate">
                            {canYt ? (ytAccount?.channel_title || 'Connected') : 'Not Connected'}
                          </span>
                        </div>
                      </div>

                      <input
                        type="checkbox"
                        checked={selectedPlatforms.youtube && canYt}
                        disabled={!canYt}
                        onChange={() => {}}
                        className="rounded bg-slate-900 border-slate-700 text-red-600 pointer-events-none shrink-0"
                      />
                    </div>
                  )}

                  {/* Facebook */}
                  <div
                    onClick={() => canFb && togglePlatform('facebook')}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-2 transition-all select-none ${
                      !canFb
                        ? 'bg-slate-950/40 border-slate-800/40 opacity-40 cursor-not-allowed'
                        : selectedPlatforms.facebook
                        ? 'bg-blue-950/30 border-blue-500/50 text-white cursor-pointer shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-[#1877F2] flex items-center justify-center text-white shrink-0 shadow-sm shadow-blue-600/30">
                        <Share2 className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold block truncate">Facebook</span>
                        <span className="text-[10px] text-slate-400 block truncate">
                          {canFb ? (fbAccount?.page_name || 'Page Connected') : 'Not Connected'}
                        </span>
                      </div>
                    </div>

                    <input
                      type="checkbox"
                      checked={selectedPlatforms.facebook && canFb}
                      disabled={!canFb}
                      onChange={() => {}}
                      className="rounded bg-slate-900 border-slate-700 text-blue-600 pointer-events-none shrink-0"
                    />
                  </div>

                  {/* Instagram */}
                  <div
                    onClick={() => canIg && togglePlatform('instagram')}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-2 transition-all select-none ${
                      !canIg
                        ? 'bg-slate-950/40 border-slate-800/40 opacity-40 cursor-not-allowed'
                        : selectedPlatforms.instagram
                        ? 'bg-pink-950/30 border-pink-500/50 text-white cursor-pointer shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-sm shadow-pink-600/30">
                        <Instagram className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold block truncate">Instagram</span>
                        <span className="text-[10px] text-slate-400 block truncate">
                          {canIg ? `@${igAccount?.ig_username || 'connected'}` : 'Not Connected'}
                        </span>
                      </div>
                    </div>

                    <input
                      type="checkbox"
                      checked={selectedPlatforms.instagram && canIg}
                      disabled={!canIg}
                      onChange={() => {}}
                      className="rounded bg-slate-900 border-slate-700 text-pink-600 pointer-events-none shrink-0"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Meta AI Label Disclosure Toggle (Facebook & Instagram) */}
          {publishMode !== 'local_only' && (selectedPlatforms.facebook || selectedPlatforms.instagram) && (
            <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between gap-3 animate-fadeIn">
              <div className="flex items-start space-x-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0 mt-0.5">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-white block">Add AI label</span>
                  <span className="text-[11px] text-slate-400 block leading-tight mt-0.5">
                    We require you to label certain realistic content that's made with AI.{' '}
                    <a
                      href="https://www.facebook.com/help/586071470355444"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline inline"
                    >
                      Learn more
                    </a>
                  </span>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={isAiGenerated}
                onClick={() => setIsAiGenerated(prev => !prev)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isAiGenerated ? 'bg-blue-600' : 'bg-slate-700'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    isAiGenerated ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          )}

          {/* 4. Scheduling & Interval Controls (If Schedule Selected) */}
          {publishMode === 'schedule' && (
            <div className="p-3.5 sm:p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3.5 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-400 flex items-center space-x-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Schedule Start Times</span>
                </span>
                <span className="text-[10px] text-slate-500">First clip release time</span>
              </div>

              {/* YouTube Start Time (Only for video clips) */}
              {!isPhotoMode && selectedPlatforms.youtube && canYt && (
                <div className="p-2.5 bg-slate-900/80 border border-red-500/20 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-red-400 flex items-center space-x-1">
                      <Youtube className="w-3.5 h-3.5" />
                      <span>YouTube Release Date &amp; Time</span>
                    </span>
                    <span className="text-[10px] text-slate-500">Min 2m in future</span>
                  </div>
                  <input
                    type="datetime-local"
                    value={ytScheduleTime}
                    min={minYtTime}
                    onChange={(e) => setYtScheduleTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-1.5 rounded-lg outline-none focus:border-red-500"
                  />
                </div>
              )}

              {/* Facebook Start Time */}
              {selectedPlatforms.facebook && canFb && (
                <div className="p-2.5 bg-slate-900/80 border border-blue-500/20 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-blue-400 flex items-center space-x-1">
                      <Share2 className="w-3.5 h-3.5" />
                      <span>{isPhotoMode ? 'Facebook Photo Release Date & Time' : 'Facebook Reels Release Date & Time'}</span>
                    </span>
                    <span className="text-[10px] text-slate-500">Min 2m in future</span>
                  </div>
                  <input
                    type="datetime-local"
                    value={fbScheduleTime}
                    min={minFbTime}
                    onChange={(e) => setFbScheduleTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-1.5 rounded-lg outline-none focus:border-blue-500"
                  />
                </div>
              )}

              {/* Instagram Start Time */}
              {selectedPlatforms.instagram && canIg && (
                <div className="p-2.5 bg-slate-900/80 border border-pink-500/20 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-pink-400 flex items-center space-x-1">
                      <Instagram className="w-3.5 h-3.5" />
                      <span>{isPhotoMode ? 'Instagram Photo Release Date & Time' : 'Instagram Reels Release Date & Time'}</span>
                    </span>
                    <span className="text-[10px] text-slate-500">Min 2m in future</span>
                  </div>
                  <input
                    type="datetime-local"
                    value={igScheduleTime}
                    min={minIgTime}
                    onChange={(e) => setIgScheduleTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-1.5 rounded-lg outline-none focus:border-pink-500"
                  />
                </div>
              )}

              {/* Validation Warning Note */}
              {!isScheduleValid && (
                <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center space-x-2 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>Please pick a future release time at least 2 minutes from now.</span>
                </div>
              )}

              {/* Aspect Ratio Guide for Photos */}
              {isPhotoMode && photoItem?.aspectRatio && (
                <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-indigo-300 text-xs flex items-center space-x-2 animate-fadeIn">
                  <Sparkles className="w-4 h-4 shrink-0 text-indigo-400" />
                  <span>
                    Photo format: <strong>{photoItem.aspectRatio}</strong> ({photoItem.aspectRatio === '9:16' ? 'Vertical Story/Reel' : photoItem.aspectRatio === '1:1' ? 'Square Feed' : 'Standard'}). Scheduled for background publication.
                  </span>
                </div>
              )}

              {/* Interval Between Clips Selector (Only for batch video clips, not photo) */}
              {!isPhotoMode && clipList.length > 1 && (
                <div className="p-3 bg-slate-900 border border-purple-500/30 rounded-xl space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center space-x-1.5 text-xs font-semibold text-purple-300">
                      <Clock className="w-4 h-4 text-purple-400 shrink-0" />
                      <span>Interval Between Clips:</span>
                    </div>
                    <select
                      value={batchInterval}
                      onChange={(e) => setBatchInterval(e.target.value)}
                      className="bg-slate-950 border border-purple-500/50 text-white font-semibold text-xs px-3 py-1.5 rounded-lg outline-none cursor-pointer focus:border-purple-400"
                    >
                      {SCHEDULE_INTERVALS.map(i => (
                        <option key={i.id} value={i.id}>{i.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Staggered Release Timeline Breakdown */}
                  <div className="pt-2 border-t border-slate-800/80 space-y-1 max-h-32 overflow-y-auto pr-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Staggered Schedule Breakdown:
                    </div>
                    {clipList.map((c, idx) => {
                      const offsetMs = idx * getIntervalSeconds(batchInterval) * 1000;
                      const partNum = c.partNumber || (idx + 1);
                      const baseDate = selectedPlatforms.youtube && canYt
                        ? new Date(ytScheduleTime)
                        : selectedPlatforms.facebook && canFb
                        ? new Date(fbScheduleTime)
                        : new Date(igScheduleTime);
                      const clipTime = new Date(baseDate.getTime() + offsetMs);
                      return (
                        <div key={c.id || idx} className="flex items-center justify-between py-0.5 text-[11px] text-slate-300">
                          <span className="font-semibold text-white">Part {partNum}</span>
                          <span className="font-mono text-purple-300">
                            {clipTime.toLocaleDateString([], { month: 'short', day: 'numeric' })} at {clipTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 sm:flex-none px-6 py-2.5 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:opacity-95 active:scale-98 disabled:opacity-40 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-500/20 flex items-center justify-center space-x-2 transition-all cursor-pointer touch-manipulation"
          >
            {isBusy ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>
                  {publishProgress > 0
                    ? `Uploading ${publishProgress}%...`
                    : publishMode === 'schedule'
                    ? 'Scheduling...'
                    : 'Processing...'}
                </span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>
                  {publishMode === 'local_only'
                    ? `Start Render (${clipList.length} Clips)`
                    : publishMode === 'schedule'
                    ? `${isPreRender ? 'Start Render & Schedule' : 'Schedule'} (${Object.values(selectedPlatforms).filter(Boolean).length} Platforms)`
                    : `${isPreRender ? 'Start Render & Publish' : 'Publish Now'} (${Object.values(selectedPlatforms).filter(Boolean).length} Platforms)`}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
