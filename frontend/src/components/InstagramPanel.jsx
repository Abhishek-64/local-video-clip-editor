import React, { useState, useMemo, useEffect } from 'react';
import {
  Instagram, CheckCircle2, AlertCircle, RefreshCw, LogOut, ChevronDown,
  Tag, Clock, Calendar, Film, Sparkles, ExternalLink, ShieldCheck,
  Video, Hash, HelpCircle, Check, Lock, ChevronUp, Plus, Youtube,
  Layers, CheckSquare, Square, ListOrdered, Play, ArrowRight, Share2, Grid,
  Copy, Sliders, Type, Undo2, Zap
} from 'lucide-react';

export default function InstagramPanel({
  igAccount,
  availableAccounts = [],
  isConnected,
  isUserConnected = false,
  isAccountConnected = false,
  isLoadingAccount,
  accountError,
  connectInstagram,
  connectAccountById,
  isConnectingAccount = false,
  accountConnectError = null,
  setAccountConnectError,
  switchAccount,
  disconnectInstagram,
  refreshIgAccount,
  igSettings,
  updateIgSettings,
  renderIgTemplate,
  publishToInstagramPipeline,
  isPublishing,
  publishProgress,
  publishStage,
  publishError,
  lastPublishedPost,
  apiAvailable,
  isAuthenticated = false,
  onOpenAuth,
  videoData,
  customParts = [],
  completedClips = [],
  textSettings = {},
  onTextChange,
  ytSettings,
  fbSettings,
  isFbConnected = false,
  isFbPageConnected = false,
  fbAccount,
  renderFbTemplate,
  publishToFacebookPipeline,
  onSwitchToPlatform
}) {
  const [tagInput, setTagInput] = useState('');
  const [selectedAccountDropdownOpen, setSelectedAccountDropdownOpen] = useState(false);

  // Diagnostics & manual connect modal/panel states
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticsData, setDiagnosticsData] = useState(null);
  const [isLoadingDiagnostics, setIsLoadingDiagnostics] = useState(false);

  // Account ID / Username Connection Form State
  const [accountIdInput, setAccountIdInput] = useState('');
  const [showAccountIdGuide, setShowAccountIdGuide] = useState(false);

  // ── Multi-Clip & Generated Clips Selection State ─────────────────────────────
  // Modes: 'all' (all completed clips) | 'custom' (multi-select checkboxes)
  const [selectionMode, setSelectionMode] = useState('all');
  const [selectedClipIds, setSelectedClipIds] = useState(() =>
    completedClips.map(c => c.id)
  );

  // Batch publishing execution state
  const [isBatchPublishing, setIsBatchPublishing] = useState(false);
  const [batchCurrentIdx, setBatchCurrentIdx] = useState(0);
  const [batchTotalCount, setBatchTotalCount] = useState(0);
  const [batchPublishedPosts, setBatchPublishedPosts] = useState([]);
  const [batchError, setBatchError] = useState(null);
  const [activePublishTarget, setActivePublishTarget] = useState('instagram'); // 'instagram' | 'both'

  // Sync selectedClipIds when completedClips changes and user is in 'all' mode
  useEffect(() => {
    if (completedClips.length > 0) {
      if (selectionMode === 'all') {
        setSelectedClipIds(completedClips.map(c => c.id));
      }
    } else {
      setSelectedClipIds([]);
    }
  }, [completedClips.length, selectionMode]);

  // Current movie / video name
  const effectiveMovieName = igSettings?.ig_name || textSettings?.movieName || videoData?.file?.name?.replace(/\.[^.]+$/, '') || 'My Movie';
  const baseStartPart = Math.max(1, parseInt(igSettings?.ig_start_part) || 1);
  const isZeroPad = igSettings?.ig_zero_pad !== false;

  // Sync Movie Name with Text Overlay
  const handleSyncToTextOverlay = () => {
    if (onTextChange) {
      onTextChange({
        ...textSettings,
        movieName: effectiveMovieName
      });
    }
  };

  const handlePullFromTextOverlay = () => {
    if (textSettings?.movieName) {
      updateIgSettings({ ig_name: textSettings.movieName });
    }
  };

  // Resolved list of active target clips to publish (strictly generated clips only)
  const activeSelectedClips = useMemo(() => {
    if (completedClips.length === 0) {
      return [];
    }
    if (selectionMode === 'all') {
      return completedClips.map((clip, idx) => ({
        ...clip,
        partNumber: clip.partNumber || (baseStartPart + idx)
      }));
    }
    // 'custom' mode
    return completedClips
      .filter(clip => selectedClipIds.includes(clip.id))
      .map((clip, idx) => ({
        ...clip,
        partNumber: clip.partNumber || (baseStartPart + idx)
      }));
  }, [selectionMode, completedClips, selectedClipIds, baseStartPart]);

  // ── Helper to format caption for any specific part ───────────────────────────
  const getRenderedCaptionForPart = (partNum) => {
    const partStr = isZeroPad ? String(partNum).padStart(2, '0') : String(partNum);
    const tagsStr = (igSettings?.ig_tags || []).map(t => `#${t.replace(/^#+/, '')}`).join(' ');

    const captionTemplate = igSettings?.ig_caption_template !== undefined
      ? igSettings.ig_caption_template
      : '{movie} - Part {part}\n\n#Reels #InstagramReels #Viral\n\n{hashtags}';

    let caption = '';
    if (renderIgTemplate) {
      caption = renderIgTemplate(captionTemplate, {
        movieName: effectiveMovieName,
        partNumber: partNum,
        zeroPad: isZeroPad,
        tags: igSettings?.ig_tags || []
      });
    } else {
      caption = captionTemplate
        .replace(/\{movie\}/gi, effectiveMovieName)
        .replace(/\{title\}/gi, effectiveMovieName)
        .replace(/\{part\}/gi, partStr)
        .replace(/\{hashtags\}/gi, tagsStr);
    }

    return { caption, partStr };
  };

  // ── Tags Management ─────────────────────────────────────────────────────────
  const addTag = (tagToAdd = null) => {
    const rawVal = tagToAdd || tagInput;
    if (!rawVal.trim()) return;
    const rawTokens = rawVal.split(/[\s,]+/);
    const newTags = [];

    for (const raw of rawTokens) {
      const clean = raw.trim().replace(/^#+/, '').trim();
      if (clean && !(igSettings?.ig_tags || []).includes(clean)) {
        newTags.push(clean);
      }
    }

    if (newTags.length > 0) {
      updateIgSettings({ ig_tags: [...(igSettings?.ig_tags || []), ...newTags] });
    }
    if (!tagToAdd) setTagInput('');
  };

  const removeTag = (tagToRemove) => {
    updateIgSettings({
      ig_tags: (igSettings?.ig_tags || []).filter(t => t !== tagToRemove)
    });
  };

  // ── Cross-Platform Template Cloners ─────────────────────────────────────────
  const copyFromYouTube = () => {
    if (!ytSettings) return;
    const ytTags = ytSettings.tags || [];
    const ytDesc = ytSettings.description_template || '';
    updateIgSettings({
      ig_name: ytSettings.title_template ? ytSettings.title_template.replace(/\s*-\s*Part\s*\{part\}.*$/i, '').trim() : (igSettings?.ig_name || effectiveMovieName),
      ig_caption_template: ytDesc || '{movie} - Part {part}\n\n#Reels #Shorts\n\n{hashtags}',
      ig_tags: ytTags.length > 0 ? ytTags : (igSettings?.ig_tags || [])
    });
  };

  const copyFromFacebook = () => {
    if (!fbSettings) return;
    const fbTags = fbSettings.fb_tags || [];
    const fbCaption = fbSettings.fb_caption_template || '';
    updateIgSettings({
      ig_name: fbSettings.fb_name || (igSettings?.ig_name || effectiveMovieName),
      ig_caption_template: fbCaption || '{movie} - Part {part}\n\n#Reels #Viral\n\n{hashtags}',
      ig_tags: fbTags.length > 0 ? fbTags : (igSettings?.ig_tags || [])
    });
  };

  // ── Diagnostics Inspector ───────────────────────────────────────────────────
  const handleRunDiagnostics = async () => {
    setIsLoadingDiagnostics(true);
    setShowDiagnostics(true);
    try {
      const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const res = await fetch(`${apiUrl}/api/instagram/diagnostics`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include'
      });
      const data = await res.json();
      setDiagnosticsData(data);
    } catch (e) {
      setDiagnosticsData({ connected: false, error: e.message });
    } finally {
      setIsLoadingDiagnostics(false);
    }
  };

  // ── Toggle clip selection in custom mode ────────────────────────────────────
  const toggleClipSelection = (clipId) => {
    if (selectedClipIds.includes(clipId)) {
      setSelectedClipIds(prev => prev.filter(id => id !== clipId));
    } else {
      setSelectedClipIds(prev => [...prev, clipId]);
    }
  };

  const selectAllClips = () => {
    setSelectedClipIds(completedClips.map(c => c.id));
  };

  const deselectAllClips = () => {
    setSelectedClipIds([]);
  };

  // ── Handle Account ID Submit ────────────────────────────────────────────────
  const handleConnectAccountSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const cleanId = String(accountIdInput || '').trim();
    if (!cleanId) {
      if (setAccountConnectError) setAccountConnectError('Please enter your Instagram Account ID or Username.');
      return;
    }

    if (connectAccountById) {
      const ok = await connectAccountById(cleanId);
      if (ok) {
        setAccountIdInput('');
      }
    }
  };

  // ── Single & Dual Platform Publishing Pipeline Execution ────────────────────
  const handlePublishExecution = async (target = 'instagram') => {
    if (activeSelectedClips.length === 0) {
      alert('Please select at least one clip or video to publish.');
      return;
    }

    const clipsToPublish = [...activeSelectedClips];
    setActivePublishTarget(target);
    setIsBatchPublishing(true);
    setBatchTotalCount(clipsToPublish.length);
    setBatchCurrentIdx(0);
    setBatchPublishedPosts([]);
    setBatchError(null);

    const publishedResults = [];
    const isScheduled = igSettings?.ig_schedule_mode === 'schedule' && igSettings?.ig_schedule_time;
    const intervalMinutes = parseInt(igSettings?.ig_schedule_interval) || 30;

    for (let i = 0; i < clipsToPublish.length; i++) {
      const clip = clipsToPublish[i];
      setBatchCurrentIdx(i + 1);

      try {
        const partNum = clip.partNumber || (baseStartPart + i);
        const { caption } = getRenderedCaptionForPart(partNum);

        const videoBlob = clip.blob;
        if (!videoBlob) {
          throw new Error(`Video stream for Part ${partNum} is not ready or missing.`);
        }

        let scheduledAt = null;
        if (isScheduled) {
          const baseDate = new Date(igSettings.ig_schedule_time);
          const clipDate = new Date(baseDate.getTime() + i * intervalMinutes * 60 * 1000);
          scheduledAt = clipDate.toISOString();
        }

        // 1. Publish to Instagram (Uploads to B2 once & caches the B2 URL)
        const igResult = await publishToInstagramPipeline({
          clipId: clip.id,
          videoBlob,
          contentType: igSettings?.ig_content_type || 'reel',
          caption,
          shareToFeed: igSettings?.ig_share_to_feed !== false,
          fileName: clip.name || `clip_part_${partNum}.mp4`,
          igUserId: igAccount?.ig_user_id,
          scheduledAt
        });

        let fbResult = null;
        // 2. If dual publishing requested: Publish to Facebook using the existing cached B2 download URL
        if (target === 'both' && publishToFacebookPipeline && isFbPageConnected) {
          const fbTitle = effectiveMovieName ? `${effectiveMovieName} - Part ${isZeroPad ? String(partNum).padStart(2, '0') : partNum}` : `Part ${partNum}`;
          const fbCaption = (renderFbTemplate && fbSettings)
            ? renderFbTemplate(fbSettings?.fb_caption_template || caption, { movieName: effectiveMovieName, partNumber: partNum, zeroPad: isZeroPad, tags: fbSettings?.fb_tags || igSettings?.ig_tags })
            : caption;

          fbResult = await publishToFacebookPipeline({
            clipId: clip.id,
            videoBlob,
            contentType: 'reel',
            title: fbTitle,
            caption: fbCaption,
            hashtags: fbSettings?.fb_tags || igSettings?.ig_tags || [],
            fileName: clip.name || `clip_part_${partNum}.mp4`,
            pageId: fbAccount?.page_id,
            scheduledAt
          });
        }

        publishedResults.push({
          partNumber: partNum,
          mediaId: igResult?.mediaId || igResult?.media_id,
          postUrl: igResult?.postUrl || `https://www.instagram.com/reel/`,
          fbPostUrl: fbResult?.postUrl || (fbResult?.videoId ? `https://www.facebook.com/watch/?v=${fbResult.videoId}` : null),
          status: 'success'
        });

        setBatchPublishedPosts([...publishedResults]);
      } catch (err) {
        console.error(`Publishing error on clip ${i + 1}:`, err);
        setBatchError(`Error on Part ${clip.partNumber || (baseStartPart + i)}: ${err.message}`);
        break;
      }
    }

    setIsBatchPublishing(false);
  };

  const isBothConnected = isAccountConnected && isFbPageConnected;
  const isScheduledMode = igSettings?.ig_schedule_mode === 'schedule';

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── SECTION 1: HEADER & OAUTH AUTHENTICATION STATE ── */}

      {/* STATE A: NOT AUTHENTICATED WITH META / INSTAGRAM */}
      {!isUserConnected && !isAccountConnected ? (
        <div className="bg-gradient-to-r from-pink-950/30 via-slate-900 to-purple-950/30 border border-pink-500/30 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center space-x-3.5 min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center text-white shadow-lg shadow-pink-500/25 shrink-0">
                <Instagram className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                    Step 1: Connect Instagram
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-pink-500/20 text-pink-300 border border-pink-500/30 rounded-full">
                    Meta Graph API
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Sign in with Meta to authorize your Creator or Business account for Reels.
                </p>
              </div>
            </div>

            <button
              onClick={connectInstagram}
              disabled={isLoadingAccount}
              className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-[#f09433] via-[#dc2743] to-[#bc1888] hover:opacity-95 active:scale-98 text-white font-bold text-xs rounded-xl shadow-lg shadow-pink-500/25 flex items-center justify-center space-x-2 transition-all cursor-pointer touch-manipulation shrink-0"
            >
              {isLoadingAccount ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Instagram className="w-4 h-4" />
              )}
              <span>Connect Instagram</span>
            </button>
          </div>

          {accountError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center space-x-2 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{accountError}</span>
            </div>
          )}
        </div>
      ) : isUserConnected && !isAccountConnected ? (
        /* STATE B: USER AUTHENTICATED, BUT NO INSTAGRAM ACCOUNT LINKED YET */
        <div className="bg-gradient-to-r from-purple-950/40 via-slate-900 to-pink-950/40 border-2 border-pink-500/40 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">
                  Meta Account Authenticated
                </p>
                <p className="text-[11px] text-slate-400">
                  Select or link your Instagram Professional account below.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-1.5 self-end sm:self-auto shrink-0">
              <button
                onClick={connectInstagram}
                title="Re-authenticate Meta"
                className="px-2 py-1 text-slate-400 hover:text-pink-300 hover:bg-pink-500/10 rounded-lg text-xs flex items-center space-x-1 cursor-pointer transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="text-[11px]">Re-auth</span>
              </button>
              <button
                onClick={disconnectInstagram}
                title="Disconnect Meta"
                className="px-2 py-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg text-xs flex items-center space-x-1 cursor-pointer transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="text-[11px]">Disconnect</span>
              </button>
            </div>
          </div>

          {/* Form: Connect by Username or ID */}
          <div className="space-y-3">
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-white flex items-center space-x-2">
                <span className="px-2 py-0.5 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-md text-xs font-black">Step 2</span>
                <span>Connect Instagram Account</span>
              </h4>
              <p className="text-xs text-slate-300 mt-1">
                Enter your Instagram Username or Account ID linked to your Facebook Page.
              </p>
            </div>

            <form onSubmit={handleConnectAccountSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
                  <Instagram className="w-3.5 h-3.5 text-pink-400" />
                  <span>Instagram Username or Account ID:</span>
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={accountIdInput}
                    onChange={(e) => setAccountIdInput(e.target.value)}
                    placeholder="e.g. @your_creator_account or 178414..."
                    className="flex-1 bg-slate-950 border border-slate-700 focus:border-pink-500 text-white text-xs sm:text-sm px-3.5 py-2.5 rounded-xl outline-none font-mono shadow-inner transition-colors"
                    disabled={isConnectingAccount}
                  />
                  <button
                    type="submit"
                    disabled={isConnectingAccount || !accountIdInput.trim()}
                    className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-[#f09433] via-[#dc2743] to-[#bc1888] hover:opacity-95 active:scale-98 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-pink-500/25 flex items-center justify-center space-x-1.5 transition-all cursor-pointer touch-manipulation shrink-0"
                  >
                    {isConnectingAccount ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Connecting...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Connect Account</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {accountConnectError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start space-x-2 text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">Unable to connect Instagram Account</p>
                    <p className="text-[11px] text-rose-200/90 leading-relaxed">{accountConnectError}</p>
                  </div>
                </div>
              )}

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowAccountIdGuide(!showAccountIdGuide)}
                  className="text-xs text-slate-400 hover:text-slate-200 flex items-center space-x-1.5 cursor-pointer transition-colors"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-pink-400" />
                  <span>How to prepare my Instagram account for Meta API publishing?</span>
                  {showAccountIdGuide ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>

                {showAccountIdGuide && (
                  <div className="mt-2 p-3.5 bg-slate-950/80 border border-pink-500/20 rounded-xl space-y-2 text-xs text-slate-300 animate-fadeIn">
                    <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-300">
                      <li>In Instagram Mobile App: Go to <strong>Settings → Account type and tools → Switch to professional account</strong> (Creator or Business).</li>
                      <li>Link your Instagram Account to a Facebook Page managed by your profile.</li>
                      <li>Type your username above and click <strong>Connect Account</strong>.</li>
                    </ol>
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>
      ) : (
        /* STATE C: INSTAGRAM ACCOUNT CONNECTED & READY */
        <div className="bg-slate-950/80 border border-pink-500/30 rounded-2xl p-4 sm:p-5 shadow-lg space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3 min-w-0">
              {igAccount?.ig_profile_picture_url ? (
                <img
                  src={igAccount.ig_profile_picture_url}
                  alt=""
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl border border-pink-500/40 object-cover shrink-0 shadow-md"
                />
              ) : (
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center text-white font-bold text-base shrink-0 shadow-md">
                  {igAccount?.ig_username?.charAt(0)?.toUpperCase() || 'I'}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h4 className="text-xs sm:text-sm font-bold text-white truncate">
                    @{igAccount?.ig_username || 'instagram_creator'}
                  </h4>
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[10px] font-semibold shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>Ready for Reels</span>
                  </span>
                  {igAccount?.ig_user_id && (
                    <span className="px-1.5 py-0.5 bg-slate-800 text-slate-400 border border-slate-700 rounded text-[9px] font-mono shrink-0">
                      ID: {igAccount.ig_user_id}
                    </span>
                  )}
                </div>
                <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">
                  {igAccount?.ig_name || 'Instagram Professional Account'} {igAccount?.page_name && `• Linked to: ${igAccount.page_name}`}
                </p>
              </div>
            </div>

            {/* Account Action Tools */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 self-start sm:self-auto shrink-0">
              {availableAccounts.length > 1 && (
                <div className="relative">
                  <button
                    onClick={() => setSelectedAccountDropdownOpen(!selectedAccountDropdownOpen)}
                    className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
                  >
                    <span>Switch</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>

                  {selectedAccountDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5 z-50 space-y-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
                        Available Accounts ({availableAccounts.length})
                      </p>
                      {availableAccounts.map((acc) => (
                        <button
                          key={acc.ig_user_id}
                          onClick={() => {
                            if (switchAccount) switchAccount(acc.ig_user_id);
                            setSelectedAccountDropdownOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center space-x-2 transition-colors cursor-pointer ${
                            acc.ig_user_id === igAccount?.ig_user_id
                              ? 'bg-pink-500/20 text-pink-300 font-bold'
                              : 'text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] shrink-0">
                            {acc.ig_username ? acc.ig_username.charAt(0).toUpperCase() : 'I'}
                          </div>
                          <div className="min-w-0 flex-1 truncate">
                            <p className="truncate">@{acc.ig_username}</p>
                            {acc.page_name && <p className="text-[10px] text-slate-500 truncate">{acc.page_name}</p>}
                          </div>
                          {acc.ig_user_id === igAccount?.ig_user_id && (
                            <Check className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={handleRunDiagnostics}
                title="Verify connection & publishing quota"
                className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs flex items-center space-x-1.5 cursor-pointer transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-pink-400" />
                <span>Diagnostics</span>
              </button>

              <button
                onClick={connectInstagram}
                title="Re-authenticate Instagram"
                className="p-1.5 sm:p-2 text-slate-400 hover:text-pink-300 hover:bg-pink-500/10 border border-slate-800 rounded-xl cursor-pointer transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={disconnectInstagram}
                title="Disconnect Instagram"
                className="p-1.5 sm:p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-800 rounded-xl cursor-pointer transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Diagnostics Inspector Modal / Drawer */}
          {showDiagnostics && (
            <div className="p-3.5 bg-slate-900 border border-pink-500/30 rounded-xl space-y-2.5 text-xs animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h5 className="font-bold text-white flex items-center space-x-1.5">
                  <ShieldCheck className="w-4 h-4 text-pink-400" />
                  <span>Meta Graph API Diagnostics</span>
                </h5>
                <button
                  onClick={() => setShowDiagnostics(false)}
                  className="text-slate-400 hover:text-white text-xs cursor-pointer"
                >
                  Close
                </button>
              </div>

              {isLoadingDiagnostics ? (
                <div className="flex items-center space-x-2 text-slate-400 py-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-pink-400" />
                  <span>Probing Meta Content Publishing capability & quota...</span>
                </div>
              ) : diagnosticsData ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                  <div className="p-2 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block">Publish Capability</span>
                    <span className={`font-bold ${diagnosticsData.canPublish ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {diagnosticsData.canPublish ? '✓ Active (Ready)' : '✕ Restricted'}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block">Publishing Quota</span>
                    <span className="font-mono text-white">
                      {diagnosticsData.publishingQuota?.quotaTotal
                        ? `${diagnosticsData.publishingQuota.quotaUsage || 0} / ${diagnosticsData.publishingQuota.quotaTotal} Reels`
                        : '50 Reels / 24h'}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block">Token Status</span>
                    <span className="text-emerald-400 font-semibold">
                      ✓ Long-lived (~60d)
                    </span>
                  </div>
                  {diagnosticsData.error && (
                    <div className="sm:col-span-3 p-2 bg-rose-500/10 border border-rose-500/30 rounded text-rose-300 text-[11px]">
                      {diagnosticsData.error}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* ── SECTION 2: TEMPLATE, MOVIE NAME & OVERLAY SYNC ── */}
      <div className="space-y-4">
        {/* Movie / Project Title & Cross-Platform Sync */}
        <div className="p-4 sm:p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
              <Film className="w-3.5 h-3.5 text-pink-400" />
              <span>Project / Movie Name</span>
            </label>

            {/* Cross-Platform Sync Buttons */}
            <div className="flex flex-wrap items-center gap-1.5">
              {textSettings?.movieName && textSettings.movieName !== effectiveMovieName && (
                <button
                  type="button"
                  onClick={handlePullFromTextOverlay}
                  title="Pull name from Video Text Overlay"
                  className="px-2 py-0.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 border border-orange-500/30 rounded-lg text-xs flex items-center space-x-1 cursor-pointer transition-colors"
                >
                  <Copy className="w-2.5 h-2.5 text-orange-400" />
                  <span>Sync Overlay</span>
                </button>
              )}
              {ytSettings?.yt_name && ytSettings.yt_name !== igSettings?.ig_name && (
                <button
                  type="button"
                  onClick={() => updateIgSettings({ ig_name: ytSettings.yt_name })}
                  title="Copy series name from YouTube"
                  className="px-2 py-0.5 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 rounded-lg text-xs flex items-center space-x-1 cursor-pointer transition-colors"
                >
                  <Youtube className="w-2.5 h-2.5 text-red-400" />
                  <span>Sync YT</span>
                </button>
              )}
              {fbSettings?.fb_name && fbSettings.fb_name !== igSettings?.ig_name && (
                <button
                  type="button"
                  onClick={() => updateIgSettings({ ig_name: fbSettings.fb_name })}
                  title="Copy series name from Facebook"
                  className="px-2 py-0.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-xs flex items-center space-x-1 cursor-pointer transition-colors"
                >
                  <Share2 className="w-2.5 h-2.5 text-blue-400" />
                  <span>Sync FB</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleSyncToTextOverlay}
                title="Push this movie name to Video Text Overlay"
                className="px-2.5 py-1 bg-pink-500/10 hover:bg-pink-500/20 text-pink-300 border border-pink-500/30 rounded-lg text-xs font-semibold flex items-center space-x-1 cursor-pointer transition-colors"
              >
                <Type className="w-3 h-3" />
                <span>Apply to Overlay</span>
              </button>
            </div>
          </div>

          <input
            type="text"
            value={igSettings?.ig_name ?? ''}
            onChange={(e) => updateIgSettings({ ig_name: e.target.value })}
            placeholder={textSettings?.movieName || videoData?.file?.name?.replace(/\.[^.]+$/, '') || 'e.g. Inception (2010)'}
            className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-pink-500 font-medium shadow-inner"
          />

          {/* Quick Part Numbering & Sequence Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800/60 items-center">
            <div>
              <label className="text-[11px] font-medium text-slate-400 block mb-1">
                Start Part Number:
              </label>
              <input
                type="number"
                min="1"
                value={igSettings?.ig_start_part ?? 1}
                onChange={(e) => updateIgSettings({ ig_start_part: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-pink-500 font-mono"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-400 block mb-1">
                Content Type:
              </label>
              <select
                value={igSettings?.ig_content_type || 'reel'}
                onChange={(e) => updateIgSettings({ ig_content_type: e.target.value })}
                className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-pink-500 cursor-pointer"
              >
                <option value="reel">Reel (9:16 Vertical)</option>
                <option value="video">Standard Video</option>
              </select>
            </div>

            <div className="flex flex-col justify-end space-y-1.5 pt-1 sm:pt-0">
              <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isZeroPad}
                  onChange={(e) => updateIgSettings({ ig_zero_pad: e.target.checked })}
                  className="rounded border-slate-700 text-pink-500 focus:ring-pink-500 bg-slate-950"
                />
                <span>Zero-pad (Part 01, 02...)</span>
              </label>

              <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={igSettings?.ig_share_to_feed !== false}
                  onChange={(e) => updateIgSettings({ ig_share_to_feed: e.target.checked })}
                  className="rounded border-slate-700 text-pink-500 focus:ring-pink-500 bg-slate-950"
                />
                <span>Share Reel to Profile Grid</span>
              </label>
            </div>
          </div>
        </div>

        {/* ── SECTION 3: CAPTION & TITLE TEMPLATES + DYNAMIC TOKENS + CLONER ── */}
        <div className="p-4 sm:p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-pink-400" />
              <span>Instagram Caption Template</span>
            </h4>

            {/* Cross-Platform Template Cloner */}
            <div className="flex flex-wrap items-center gap-1.5">
              {ytSettings?.yt_description_template && (
                <button
                  type="button"
                  onClick={() => updateIgSettings({ ig_caption_template: ytSettings.yt_description_template })}
                  title="Copy description from YouTube"
                  className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 rounded-lg text-xs flex items-center space-x-1 cursor-pointer transition-colors"
                >
                  <Youtube className="w-3.5 h-3.5 text-red-400" />
                  <span>Sync from YT</span>
                </button>
              )}
              {fbSettings?.fb_caption_template && (
                <button
                  type="button"
                  onClick={() => updateIgSettings({ ig_caption_template: fbSettings.fb_caption_template })}
                  title="Copy caption from Facebook"
                  className="px-2.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-xs flex items-center space-x-1 cursor-pointer transition-colors"
                >
                  <Share2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>Sync from FB</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick-insert token tags */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { token: '{movie}', label: 'Movie Title' },
              { token: '{part}', label: 'Part #' },
              { token: '{hashtags}', label: 'All #Hashtags' },
              { token: '{tags}', label: 'Comma Tags' },
              { token: '{title}', label: 'Project Name' }
            ].map(t => (
              <button
                key={t.token}
                type="button"
                onClick={() => {
                  const cur = igSettings?.ig_caption_template || '';
                  updateIgSettings({ ig_caption_template: `${cur} ${t.token}`.trim() });
                }}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-mono transition-colors cursor-pointer"
              >
                +{t.token}
              </button>
            ))}
          </div>

          <textarea
            rows={4}
            value={igSettings?.ig_caption_template ?? ''}
            onChange={(e) => updateIgSettings({ ig_caption_template: e.target.value })}
            placeholder="{movie} - Part {part}\n\n#Reels #InstagramReels #Viral\n\n{hashtags}"
            className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-pink-500 font-sans leading-relaxed shadow-inner"
          />
        </div>

        {/* ── SECTION 4: HASHTAGS & VIRAL TAGS MANAGER ── */}
        <div className="p-4 sm:p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
              <Hash className="w-3.5 h-3.5 text-pink-400" />
              <span>Hashtags &amp; Viral Tags ({(igSettings?.ig_tags || []).length})</span>
            </h4>
            <div className="flex flex-wrap items-center gap-1.5">
              {ytSettings?.yt_tags && ytSettings.yt_tags.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const combined = Array.from(new Set([...(igSettings?.ig_tags || []), ...ytSettings.yt_tags]));
                    updateIgSettings({ ig_tags: combined });
                  }}
                  className="px-2 py-0.5 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 rounded-lg text-xs flex items-center space-x-1 cursor-pointer transition-colors"
                  title="Merge tags from YouTube"
                >
                  <Youtube className="w-3 h-3 text-red-400" />
                  <span>Sync YT Tags ({ytSettings.yt_tags.length})</span>
                </button>
              )}
              {fbSettings?.fb_tags && fbSettings.fb_tags.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const combined = Array.from(new Set([...(igSettings?.ig_tags || []), ...fbSettings.fb_tags]));
                    updateIgSettings({ ig_tags: combined });
                  }}
                  className="px-2 py-0.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-xs flex items-center space-x-1 cursor-pointer transition-colors"
                  title="Merge tags from Facebook"
                >
                  <Share2 className="w-3 h-3 text-blue-400" />
                  <span>Sync FB Tags ({fbSettings.fb_tags.length})</span>
                </button>
              )}
              <button
                onClick={() => updateIgSettings({ ig_tags: ['reels', 'instagramreels', 'viral', 'explore', 'trending', 'clips', 'movie'] })}
                className="text-xs text-pink-400 hover:text-pink-300 cursor-pointer"
              >
                Reset Defaults
              </button>
              <span className="text-slate-600">•</span>
              <button
                onClick={() => updateIgSettings({ ig_tags: [] })}
                className="text-xs text-slate-500 hover:text-slate-300 cursor-pointer"
              >
                Clear All
              </button>
            </div>
          </div>

          {/* Quick Suggestions Chips */}
          <div className="flex flex-wrap gap-1.5 items-center pb-1">
            <span className="text-xs text-slate-500 mr-1">Quick Add:</span>
            {['reels', 'viral', 'movietok', 'explore', 'trending', 'cinema', 'hollywood', 'clips'].map(suggested => (
              <button
                key={suggested}
                type="button"
                onClick={() => addTag(suggested)}
                disabled={(igSettings?.ig_tags || []).includes(suggested)}
                className="px-2.5 py-1 bg-slate-950 hover:bg-pink-500/20 text-slate-400 hover:text-pink-300 border border-slate-800 disabled:opacity-40 rounded-lg text-xs font-mono cursor-pointer transition-colors"
              >
                +#{(igSettings?.ig_tags || []).includes(suggested) ? `${suggested} ✓` : suggested}
              </button>
            ))}
          </div>

          {/* Tag Input - Responsive Stack on Mobile */}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
              placeholder="Type tag (e.g. reels, movietok) and press Enter"
              className="flex-1 px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-pink-500 shadow-inner"
            />
            <button
              type="button"
              onClick={() => addTag()}
              className="w-full sm:w-auto px-5 py-2 bg-gradient-to-r from-pink-600 to-purple-600 hover:opacity-90 text-white rounded-xl text-xs font-semibold cursor-pointer shrink-0 shadow-md"
            >
              Add Tag
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pt-1">
            {(igSettings?.ig_tags || []).map((t) => (
              <span
                key={t}
                className="px-3 py-1 bg-pink-500/10 border border-pink-500/20 text-pink-300 text-xs rounded-xl flex items-center space-x-1.5 font-mono"
              >
                <span>#{t}</span>
                <button
                  onClick={() => removeTag(t)}
                  className="ml-1 text-slate-500 hover:text-rose-400 cursor-pointer"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* ── SECTION 5: PUBLISH TIMING & SCHEDULING CONTROLS ── */}
        <div className="p-4 sm:p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 shadow-md">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
            <Clock className="w-3.5 h-3.5 text-pink-400" />
            <span>Publish Timing &amp; Scheduling</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => updateIgSettings({ ig_schedule_mode: 'now' })}
              className={`py-2.5 px-4 text-xs font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                igSettings?.ig_schedule_mode !== 'schedule'
                  ? 'bg-pink-500/20 border-pink-500 text-pink-300 font-bold shadow-md shadow-pink-500/10'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Publish Immediately
            </button>

            <button
              type="button"
              onClick={() => updateIgSettings({ ig_schedule_mode: 'schedule' })}
              className={`py-2.5 px-4 text-xs font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                igSettings?.ig_schedule_mode === 'schedule'
                  ? 'bg-pink-500/20 border-pink-500 text-pink-300 font-bold shadow-md shadow-pink-500/10'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Schedule for Later (Meta Automated)
            </button>
          </div>

          {igSettings?.ig_schedule_mode === 'schedule' && (
            <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fadeIn">
              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1">
                  Start Date &amp; Time:
                </label>
                <input
                  type="datetime-local"
                  value={igSettings?.ig_schedule_time || ''}
                  onChange={(e) => updateIgSettings({ ig_schedule_time: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 text-white text-xs px-3 py-2 rounded-xl outline-none focus:border-pink-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1">
                  Interval Between Parts (Batch Mode):
                </label>
                <select
                  value={igSettings?.ig_schedule_interval || 30}
                  onChange={(e) => updateIgSettings({ ig_schedule_interval: parseInt(e.target.value) || 30 })}
                  className="w-full bg-slate-950 border border-slate-800 text-white text-xs px-3 py-2 rounded-xl outline-none focus:border-pink-500 cursor-pointer"
                >
                  <option value={15}>15 Minutes</option>
                  <option value={30}>30 Minutes</option>
                  <option value={60}>1 Hour</option>
                  <option value={120}>2 Hours</option>
                  <option value={360}>6 Hours</option>
                  <option value={720}>12 Hours</option>
                  <option value={1440}>1 Day (24 Hours)</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── SECTION 6: TARGET CLIPS SELECTION & 1-CLICK BATCH PUBLISHING ── */}
      <div className="p-4 sm:p-5 bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-950 border border-slate-800 rounded-2xl space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center space-x-2">
              <Layers className="w-4 h-4 text-pink-400" />
              <span>Target Clips Selection ({activeSelectedClips.length} Selected)</span>
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Choose whether to publish all completed split clips or specific parts to Instagram Reels.
            </p>
          </div>

          {/* Mode Switcher */}
          {completedClips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 self-stretch sm:self-auto justify-between sm:justify-start">
              <button
                onClick={() => setSelectionMode('all')}
                className={`flex-1 sm:flex-initial px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  selectionMode === 'all' ? 'bg-pink-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                All Clips ({completedClips.length})
              </button>
              <button
                onClick={() => setSelectionMode('custom')}
                className={`flex-1 sm:flex-initial px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  selectionMode === 'custom' ? 'bg-pink-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Custom
              </button>
            </div>
          )}
        </div>

        {/* Custom Checkboxes list when selectionMode === 'custom' */}
        {completedClips.length > 0 ? (
          selectionMode === 'custom' && (
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800/80 pb-2">
                <span>Select clips to include in batch publish:</span>
                <div className="flex space-x-2">
                  <button onClick={selectAllClips} className="text-pink-400 hover:text-pink-300 cursor-pointer">Select All</button>
                  <span>•</span>
                  <button onClick={deselectAllClips} className="text-slate-400 hover:text-slate-200 cursor-pointer">Clear</button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-40 overflow-y-auto pt-1">
                {completedClips.map((clip, idx) => {
                  const isChecked = selectedClipIds.includes(clip.id);
                  const partNum = clip.partNumber || (baseStartPart + idx);
                  return (
                    <button
                      key={clip.id}
                      onClick={() => toggleClipSelection(clip.id)}
                      className={`flex items-center space-x-2 p-2 rounded-lg border text-left text-xs transition-colors cursor-pointer ${
                        isChecked
                          ? 'bg-pink-500/10 border-pink-500/30 text-pink-300 font-semibold'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      {isChecked ? <CheckSquare className="w-3.5 h-3.5 text-pink-400 shrink-0" /> : <Square className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
                      <span className="truncate">Part {isZeroPad ? String(partNum).padStart(2, '0') : partNum}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )
        ) : (
          <div className="p-6 bg-slate-950/60 border border-slate-800 rounded-2xl text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-pink-500/10 border border-pink-500/20 text-pink-400 flex items-center justify-center mx-auto">
              <Layers className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h5 className="text-sm font-bold text-white">No Exported Clips Found</h5>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Reels publishing requires exported clips. Go to <strong>Split &amp; Cut</strong> and export your parts first.
              </p>
            </div>
            {onSwitchToPlatform && (
              <button
                type="button"
                onClick={() => onSwitchToPlatform('split-cut')}
                className="px-4 py-2 bg-gradient-to-r from-pink-600 to-purple-600 hover:opacity-90 active:scale-98 text-white font-semibold text-xs rounded-xl shadow-md transition-all cursor-pointer inline-flex items-center space-x-1.5 touch-manipulation"
              >
                <span>Go to Split &amp; Cut ✂️</span>
              </button>
            )}
          </div>
        )}

        {/* Single & Dual Platform Publish Action Bar */}
        <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-4">
          <div className="space-y-1">
            <p className="text-xs text-slate-300 font-semibold flex flex-wrap items-center gap-1.5">
              <span>Ready to {isScheduledMode ? 'Schedule' : 'Publish'}:</span>
              <span className="text-pink-400">{activeSelectedClips.length} Clip(s)</span>
              {isBothConnected && (
                <span className="text-slate-400 text-[11px] font-normal">• Facebook &amp; Instagram Connected</span>
              )}
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Uploads video once → Meta Ingestion → {isScheduledMode ? 'Automated scheduling' : 'Immediate release'}.
            </p>
          </div>

          {/* Action Buttons: Dual Publish & Single Publish - Stack on Mobile */}
          {completedClips.length === 0 ? (
            <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl text-center space-y-2">
              <p className="text-xs text-slate-300 font-medium">
                ⚠️ Please export video clips in <strong>Split &amp; Cut</strong> first. Instagram Reels publishing is only enabled for generated clips.
              </p>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full">
              {/* Dedicated 1-Click Dual Publish Button (When both FB and IG are connected) */}
              {isBothConnected && (
                <button
                  type="button"
                  onClick={() => handlePublishExecution('both')}
                  disabled={isPublishing || isBatchPublishing || activeSelectedClips.length === 0}
                  className="w-full sm:flex-1 py-3 px-4 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:opacity-95 active:scale-98 disabled:opacity-50 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg shadow-purple-500/25 flex items-center justify-center space-x-2 transition-all cursor-pointer touch-manipulation"
                >
                  {isPublishing || isBatchPublishing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{activePublishTarget === 'both' ? 'Publishing Both FB & IG...' : 'Processing...'}</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 text-amber-300 fill-current" />
                      <span>
                        {isScheduledMode
                          ? `Schedule Both FB + IG (${activeSelectedClips.length})`
                          : `Publish Both FB + IG (${activeSelectedClips.length})`}
                      </span>
                    </>
                  )}
                </button>
              )}

              {/* Standard Single Instagram Publish Button */}
              <button
                type="button"
                onClick={() => handlePublishExecution('instagram')}
                disabled={isPublishing || isBatchPublishing || !isAccountConnected || activeSelectedClips.length === 0}
                className={`w-full ${
                  isBothConnected ? 'sm:flex-1' : ''
                } py-3 px-4 bg-gradient-to-r from-[#f09433] via-[#dc2743] to-[#bc1888] hover:opacity-95 active:scale-98 disabled:opacity-50 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg shadow-pink-500/25 flex items-center justify-center space-x-2 transition-all cursor-pointer touch-manipulation`}
              >
                {isPublishing || isBatchPublishing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>
                      {isBatchPublishing
                        ? `Publishing Part ${batchCurrentIdx} / ${batchTotalCount}...`
                        : publishStage === 'b2_upload'
                        ? `Uploading Video (${publishProgress}%)...`
                        : publishStage === 'ig_processing'
                        ? 'Processing Reel Container...'
                        : 'Publishing to Instagram...'}
                    </span>
                  </>
                ) : (
                  <>
                    <Instagram className="w-4 h-4" />
                    <span>
                      {isScheduledMode
                        ? (activeSelectedClips.length > 1 ? `Schedule IG (${activeSelectedClips.length} Reels)` : 'Schedule Instagram Reel')
                        : (activeSelectedClips.length > 1 ? `Publish IG (${activeSelectedClips.length} Reels)` : 'Publish to Instagram Reels')}
                    </span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Progress Bar when active */}
          {(isPublishing || isBatchPublishing) && (
            <div className="space-y-1.5 pt-2 border-t border-slate-800">
              <div className="flex justify-between text-xs text-slate-400">
                <span className="truncate mr-2">
                  {publishStage === 'b2_upload'
                    ? 'Step 1/3: Uploading Video stream (Single Upload)...'
                    : publishStage === 'ig_processing'
                    ? 'Step 2/3: Meta Graph API Encoding...'
                    : 'Step 3/3: Finalizing Publishing...'}
                </span>
                <span className="font-mono text-pink-400 shrink-0">{publishProgress}%</span>
              </div>
              <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#f09433] via-[#dc2743] to-[#bc1888] transition-all duration-300"
                  style={{ width: `${publishProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Banner */}
          {(publishError || batchError) && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start space-x-2 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-0.5 min-w-0">
                <p className="font-semibold">Publishing encountered an error</p>
                <p className="text-[11px] text-rose-200/90 leading-relaxed break-words">{publishError || batchError}</p>
              </div>
            </div>
          )}

          {/* Published Result Banner with Dual Links */}
          {(lastPublishedPost || batchPublishedPosts.length > 0) && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-2 text-xs text-emerald-300">
              <div className="flex items-center space-x-2 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  {isScheduledMode ? 'Scheduled' : 'Published'} Successfully ({batchPublishedPosts.length || 1} Clip{batchPublishedPosts.length > 1 ? 's' : ''})!
                </span>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {batchPublishedPosts.length > 0 ? (
                  batchPublishedPosts.map((post, pIdx) => (
                    <div key={pIdx} className="flex flex-wrap items-center gap-1.5">
                      {post.postUrl && (
                        <a
                          href={post.postUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors"
                        >
                          <Instagram className="w-3.5 h-3.5 text-pink-400" />
                          <span>Part {post.partNumber} IG</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {post.fbPostUrl && (
                        <a
                          href={post.fbPostUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors"
                        >
                          <Share2 className="w-3.5 h-3.5 text-blue-400" />
                          <span>Part {post.partNumber} FB</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {lastPublishedPost?.postUrl && (
                      <a
                        href={lastPublishedPost.postUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors"
                      >
                        <Instagram className="w-3.5 h-3.5 text-pink-400" />
                        <span>View Reel on Instagram</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {lastPublishedPost?.fbPostUrl && (
                      <a
                        href={lastPublishedPost.fbPostUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors"
                      >
                        <Share2 className="w-3.5 h-3.5 text-blue-400" />
                        <span>View Reel on Facebook</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
