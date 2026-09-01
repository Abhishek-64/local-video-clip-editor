import React, { useState, useMemo, useEffect } from 'react';
import {
  Share2, CheckCircle2, AlertCircle, RefreshCw, LogOut, ChevronDown,
  Tag, Clock, Calendar, Film, Sparkles, ExternalLink, ShieldCheck,
  Video, Hash, HelpCircle, Check, Lock, ChevronUp, Plus, Youtube,
  Layers, CheckSquare, Square, ListOrdered, Play, ArrowRight, Instagram, Zap,
  Type, Undo2, Copy
} from 'lucide-react';

export default function FacebookPanel({
  fbAccount,
  availablePages = [],
  isConnected,
  isUserConnected = false,
  isPageConnected = false,
  isLoadingAccount,
  accountError,
  connectFacebook,
  connectPageById,
  isConnectingPage = false,
  pageConnectError = null,
  setPageConnectError,
  switchPage,
  disconnectFacebook,
  refreshFbAccount,
  fbSettings,
  updateFbSettings,
  renderFbTemplate,
  publishToFacebookPipeline,
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
  igSettings,
  isIgConnected = false,
  isIgAccountConnected = false,
  igAccount,
  renderIgTemplate,
  publishToInstagramPipeline,
  onSwitchToPlatform
}) {
  const [tagInput, setTagInput] = useState('');
  const [selectedPageDropdownOpen, setSelectedPageDropdownOpen] = useState(false);

  // Page ID Connection Form State
  const [pageIdInput, setPageIdInput] = useState('');
  const [showPageIdGuide, setShowPageIdGuide] = useState(false);
  const [showAddAnotherPage, setShowAddAnotherPage] = useState(false);

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
  const effectiveMovieName = fbSettings?.fb_name || textSettings?.movieName || videoData?.file?.name?.replace(/\.[^.]+$/, '') || 'My Movie';
  const baseStartPart = Math.max(1, parseInt(fbSettings?.fb_start_part) || 1);
  const isZeroPad = fbSettings?.fb_zero_pad !== false;

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

  // ── Tags Management ─────────────────────────────────────────────────────────
  const addTag = () => {
    if (!tagInput.trim()) return;
    const rawTokens = tagInput.split(/[\s,]+/);
    const newTags = [];

    for (const raw of rawTokens) {
      const clean = raw.trim().replace(/^#+/, '').trim();
      if (clean && !(fbSettings?.fb_tags || []).includes(clean)) {
        newTags.push(clean);
      }
    }

    if (newTags.length > 0) {
      updateFbSettings({ fb_tags: [...(fbSettings?.fb_tags || []), ...newTags] });
    }
    setTagInput('');
  };

  const removeTag = (tagToRemove) => {
    updateFbSettings({
      fb_tags: (fbSettings?.fb_tags || []).filter(t => t !== tagToRemove)
    });
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

  // ── Handle Page ID Submit ───────────────────────────────────────────────────
  const handleConnectPageSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const cleanId = String(pageIdInput || '').trim();
    if (!cleanId) {
      if (setPageConnectError) setPageConnectError('Please enter your Facebook Page ID.');
      return;
    }

    if (connectPageById) {
      const ok = await connectPageById(cleanId);
      if (ok) {
        setPageIdInput('');
        setShowAddAnotherPage(false);
      }
    }
  };

  const [activePublishTarget, setActivePublishTarget] = useState('facebook'); // 'facebook' | 'both'

  // ── Batch / Multi-Clip Publishing Pipeline Execution ────────────────────────
  const handlePublishExecution = async (target = 'facebook') => {
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
    const isScheduled = fbSettings?.fb_schedule_mode === 'schedule' && fbSettings?.fb_schedule_time;
    const intervalMinutes = parseInt(fbSettings?.fb_schedule_interval) || 30;

    for (let i = 0; i < clipsToPublish.length; i++) {
      const clip = clipsToPublish[i];
      setBatchCurrentIdx(i + 1);

      let targetBlob = clip.blob;
      if (!targetBlob && clip.isFull && videoData?.file) {
        targetBlob = videoData.file;
      }

      if (!targetBlob) {
        console.warn(`Skipping clip #${i + 1} (${clip.name}): Blob not found.`);
        continue;
      }

      let scheduledAt = null;
      if (isScheduled) {
        const baseDate = new Date(fbSettings.fb_schedule_time);
        const clipDate = new Date(baseDate.getTime() + i * intervalMinutes * 60 * 1000);
        scheduledAt = clipDate.toISOString();
      }

      // Automatically compute part-specific metadata
      const partNum = clip.partNumber || (baseStartPart + i);
      const { title: partTitle, caption: partCaption } = getRenderedMetadataForPart(partNum);
      const fileName = clip.name || `${effectiveMovieName}_part${partNum}.mp4`;

      try {
        // 1. Publish to Facebook (uploads to B2 once & caches the B2 URL)
        const result = await publishToFacebookPipeline(targetBlob, {
          clipId: clip.id,
          contentType: fbSettings?.fb_content_type || 'reel',
          caption: partCaption,
          title: partTitle,
          hashtags: fbSettings?.fb_tags || [],
          scheduledAt,
          fileName,
          partNumber: partNum
        });

        let igResult = null;
        // 2. If dual publishing requested: Publish to Instagram using cached B2 URL (0s upload!)
        if (target === 'both' && publishToInstagramPipeline && isIgAccountConnected) {
          const igCaption = (renderIgTemplate && igSettings)
            ? renderIgTemplate(igSettings?.ig_caption_template || partCaption, { movieName: effectiveMovieName, partNumber: partNum, zeroPad: isZeroPad, tags: igSettings?.ig_tags || fbSettings?.fb_tags })
            : partCaption;

          igResult = await publishToInstagramPipeline({
            clipId: clip.id,
            videoBlob: targetBlob,
            contentType: 'reel',
            caption: igCaption,
            shareToFeed: igSettings?.ig_share_to_feed !== false,
            fileName,
            igUserId: igAccount?.ig_user_id,
            scheduledAt
          });
        }

        publishedResults.push({
          partNumber: partNum,
          clipName: clip.name || fileName,
          postUrl: result?.postUrl,
          igPostUrl: igResult?.postUrl || `https://www.instagram.com/reel/`,
          status: result?.status || 'published',
          videoId: result?.video_id || result?.videoId
        });
        setBatchPublishedPosts([...publishedResults]);
      } catch (err) {
        console.error(`Error publishing part ${partNum}:`, err);
        setBatchError(`Failed on part #${partNum}: ${err.message}`);
        break;
      }
    }

    setIsBatchPublishing(false);
  };

  if (!apiAvailable) {
    return (
      <div className="space-y-4">
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-center space-y-2">
          <Share2 className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-xs font-semibold text-slate-400">Facebook Not Configured</p>
          <p className="text-[11px] text-slate-500">
            Set <code className="bg-slate-800 px-1 py-0.5 rounded text-amber-300">VITE_API_URL</code> in your{' '}
            <code className="bg-slate-800 px-1 py-0.5 rounded text-amber-300">.env</code> to enable Facebook Reels uploads and scheduling.
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
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-blue-500/20 via-indigo-500/20 to-sky-500/20 border border-blue-500/30 flex items-center justify-center mx-auto shadow-inner">
            <Lock className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white tracking-tight">Sign In to Connect Facebook</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
              Sign in to connect Facebook Pages and sync presets across devices.
            </p>
          </div>

          <div className="pt-1">
            <button
              onClick={() => onOpenAuth && onOpenAuth('login')}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-500 hover:from-blue-500 hover:to-indigo-500 active:scale-98 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all cursor-pointer inline-flex items-center space-x-2 touch-manipulation"
            >
              <Sparkles className="w-4 h-4" />
              <span>Sign In / Create Account</span>
            </button>
          </div>

          <div className="pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-left max-w-xs mx-auto">
            <div className="p-2 bg-slate-950/40 rounded-xl border border-slate-800/60">
              <span className="text-[11px] font-semibold text-slate-200 block mb-0.5">Reels Ingest</span>
              <span className="text-[10px] text-slate-400 block">Vertical 9:16 reels.</span>
            </div>
            <div className="p-2 bg-slate-950/40 rounded-xl border border-slate-800/60">
              <span className="text-[11px] font-semibold text-slate-200 block mb-0.5">B2 Fast Pipeline</span>
              <span className="text-[10px] text-slate-400 block">Direct Meta ingestion.</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6 animate-fadeIn">
      {/* ── 1. ACCOUNT & PAGE CONNECTION CARD ──────────────────────────── */}
      
      {/* STATE A: NOT AUTHENTICATED WITH FACEBOOK YET */}
      {!isUserConnected && !isPageConnected ? (
        <div className="bg-gradient-to-r from-blue-900/30 via-slate-900 to-indigo-950/30 border border-blue-500/30 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[#1877F2] flex items-center justify-center text-white shadow-lg shadow-blue-500/25 shrink-0">
                <svg className="w-7 h-7 fill-current" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-base font-bold text-white tracking-tight">
                    Step 1: Connect Facebook
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full">
                    Meta Graph API
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Sign in with your Facebook account to authenticate and load your managed Facebook Pages.
                </p>
              </div>
            </div>

            <button
              onClick={connectFacebook}
              disabled={isLoadingAccount}
              className="px-5 py-2.5 bg-[#1877F2] hover:bg-[#166fe5] active:scale-98 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-500/25 flex items-center justify-center space-x-2 transition-all cursor-pointer touch-manipulation shrink-0"
            >
              {isLoadingAccount ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Share2 className="w-4 h-4" />
              )}
              <span>Connect Facebook</span>
            </button>
          </div>

          {accountError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center space-x-2 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{accountError}</span>
            </div>
          )}
        </div>
      ) : isUserConnected && !isPageConnected ? (
        /* STATE B: FACEBOOK USER AUTHENTICATED, BUT NO PAGE LINKED YET */
        <div className="bg-gradient-to-r from-blue-950/50 via-slate-900 to-indigo-950/40 border-2 border-blue-500/40 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">
                  Facebook account connected {fbAccount?.fb_user_name ? `as ${fbAccount.fb_user_name}` : ''}
                </p>
                <p className="text-[11px] text-slate-400">
                  Enter your Page ID below to link your Facebook Page.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-1.5 shrink-0">
              <button
                onClick={connectFacebook}
                title="Re-authenticate Facebook"
                className="p-1.5 text-slate-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg text-xs flex items-center space-x-1 cursor-pointer transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px]">Re-auth</span>
              </button>
              <button
                onClick={disconnectFacebook}
                title="Disconnect Facebook user"
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg text-xs flex items-center space-x-1 cursor-pointer transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px]">Disconnect</span>
              </button>
            </div>
          </div>

          {/* Step 2 Form: Connect Page ID */}
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                <span className="px-2 py-0.5 bg-blue-500 text-white rounded-md text-xs font-black">Step 2</span>
                <span>Connect Facebook Page</span>
              </h4>
              <p className="text-xs text-slate-300 mt-1">
                Enter your Facebook Page ID below to verify access and enable 1-click publishing.
              </p>
            </div>

            <form onSubmit={handleConnectPageSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
                  <Hash className="w-3.5 h-3.5 text-blue-400" />
                  <span>Facebook Page ID:</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pageIdInput}
                    onChange={(e) => setPageIdInput(e.target.value)}
                    placeholder="e.g. 1344468935405778"
                    className="flex-1 bg-slate-950 border border-slate-700 focus:border-blue-500 text-white text-xs sm:text-sm px-3.5 py-2.5 rounded-xl outline-none font-mono shadow-inner transition-colors"
                    disabled={isConnectingPage}
                  />
                  <button
                    type="submit"
                    disabled={isConnectingPage || !pageIdInput.trim()}
                    className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-98 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-500/25 flex items-center space-x-1.5 transition-all cursor-pointer touch-manipulation shrink-0"
                  >
                    {isConnectingPage ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Connecting...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Connect Page</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {pageConnectError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start space-x-2 text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">Unable to connect Page ID</p>
                    <p className="text-[11px] text-rose-200/90 leading-relaxed">{pageConnectError}</p>
                  </div>
                </div>
              )}

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowPageIdGuide(!showPageIdGuide)}
                  className="text-xs text-slate-400 hover:text-slate-200 flex items-center space-x-1.5 cursor-pointer transition-colors"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-blue-400" />
                  <span>How do I find my Facebook Page ID?</span>
                  {showPageIdGuide ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>

                {showPageIdGuide && (
                  <div className="mt-2 p-3.5 bg-slate-950/80 border border-blue-500/20 rounded-xl space-y-2 text-xs text-slate-300 animate-fadeIn">
                    <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-300">
                      <li>Open your Facebook Page in your web browser.</li>
                      <li>Click on the <strong>About</strong> tab on your Page.</li>
                      <li>Scroll to <strong>Page Transparency</strong> or <strong>Basic Info</strong> and copy your <strong>Page ID</strong>.</li>
                      <li>Paste the numbers into the <strong>Facebook Page ID</strong> box above and click <strong>Connect Page</strong>.</li>
                    </ol>
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>
      ) : (
        /* STATE C: FACEBOOK PAGE CONNECTED */
        <div className="bg-slate-950/80 border border-blue-500/30 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3 min-w-0">
              {fbAccount?.page_thumbnail ? (
                <img
                  src={fbAccount.page_thumbnail}
                  alt=""
                  className="w-11 h-11 rounded-xl border border-blue-500/40 object-cover shrink-0 shadow-md"
                />
              ) : (
                <div className="w-11 h-11 rounded-xl bg-[#1877F2] flex items-center justify-center text-white font-bold text-base shrink-0 shadow-md">
                  {fbAccount?.page_name?.charAt(0) || 'F'}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h4 className="text-sm font-bold text-white truncate">
                    {fbAccount?.page_name}
                  </h4>
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[10px] font-semibold shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>Ready to publish</span>
                  </span>
                  {fbAccount?.page_id && (
                    <span className="px-1.5 py-0.5 bg-slate-800 text-slate-400 border border-slate-700 rounded text-[9px] font-mono shrink-0">
                      ID: {fbAccount.page_id}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                  {fbAccount?.page_category || 'Facebook Creator Page'} {fbAccount?.fb_user_name && `• Linked by ${fbAccount.fb_user_name}`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 self-start sm:self-auto shrink-0">
              {availablePages.length > 1 && (
                <div className="relative">
                  <button
                    onClick={() => setSelectedPageDropdownOpen(!selectedPageDropdownOpen)}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer"
                  >
                    <span>Switch</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  {selectedPageDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden py-1.5 z-50 animate-scaleUp">
                      {availablePages.map(page => (
                        <button
                          key={page.page_id}
                          onClick={() => {
                            switchPage(page.page_id);
                            setSelectedPageDropdownOpen(false);
                          }}
                          className={`w-full px-3.5 py-2 text-left text-xs flex items-center space-x-2 hover:bg-slate-800 transition-colors ${
                            page.page_id === fbAccount?.page_id ? 'text-blue-400 font-bold bg-blue-500/10' : 'text-slate-300'
                          }`}
                        >
                          <span className="truncate flex-1">{page.page_name}</span>
                          {page.page_id === fbAccount?.page_id && <Check className="w-3.5 h-3.5 text-blue-400" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowAddAnotherPage(!showAddAnotherPage)}
                className="px-2.5 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-xl text-xs font-semibold flex items-center space-x-1 cursor-pointer transition-colors"
                title="Connect another Facebook Page ID"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="text-[11px]">Add Page</span>
              </button>

              <button
                onClick={disconnectFacebook}
                className="p-1.5 sm:p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-800 rounded-xl transition-colors cursor-pointer"
                title="Disconnect Facebook account"
              >
                <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          </div>

          {showAddAnotherPage && (
            <div className="pt-3 border-t border-slate-800/80 space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <Hash className="w-3.5 h-3.5 text-blue-400" />
                  <span>Connect / Switch to Another Page ID</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddAnotherPage(false)}
                  className="text-slate-400 hover:text-white text-xs cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              <form onSubmit={handleConnectPageSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={pageIdInput}
                  onChange={(e) => setPageIdInput(e.target.value)}
                  placeholder="Enter Page ID (e.g. 1344468935405778)"
                  className="flex-1 bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl outline-none font-mono focus:border-blue-500"
                  disabled={isConnectingPage}
                />
                <button
                  type="submit"
                  disabled={isConnectingPage || !pageIdInput.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-98 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center space-x-1 cursor-pointer transition-all shrink-0"
                >
                  {isConnectingPage ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <span>Connect</span>
                  )}
                </button>
              </form>

              {pageConnectError && (
                <p className="text-[11px] text-rose-400 font-medium">
                  {pageConnectError}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 2. CONTENT TYPE SELECTOR ────────────────────────────────────── */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
          Choose Content Type
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => updateFbSettings({ fb_content_type: 'reel' })}
            className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center space-x-3 ${
              fbSettings?.fb_content_type === 'reel'
                ? 'bg-blue-500/15 border-blue-500 text-white shadow-md shadow-blue-500/10'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              fbSettings?.fb_content_type === 'reel' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400'
            }`}>
              <Film className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold block truncate">Facebook Reel</span>
              <span className="text-[10px] text-slate-400 block truncate">9:16 Vertical Short-Form</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => updateFbSettings({ fb_content_type: 'video' })}
            className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center space-x-3 ${
              fbSettings?.fb_content_type === 'video'
                ? 'bg-blue-500/15 border-blue-500 text-white shadow-md shadow-blue-500/10'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              fbSettings?.fb_content_type === 'video' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400'
            }`}>
              <Video className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold block truncate">Page Video</span>
              <span className="text-[10px] text-slate-400 block truncate">Standard Feed Post</span>
            </div>
          </button>
        </div>
      </div>

      {/* ── 3. MULTIPLE CLIP SELECTION & GENERATED CLIPS (AUTO-PART) ───── */}
      <div className="space-y-3 bg-slate-950/70 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
              <Layers className="w-4 h-4 text-blue-400" />
              <span>Select Video / Exported Clips to Publish</span>
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Select single, multiple, or all generated parts. Sequential parts automatically apply part numbers.
            </p>
          </div>

          {/* Mode Switcher Buttons */}
          {completedClips.length > 0 && (
            <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-xl border border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setSelectionMode('all')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                  selectionMode === 'all'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All ({completedClips.length})
              </button>

              <button
                type="button"
                onClick={() => setSelectionMode('custom')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                  selectionMode === 'custom'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Select Parts
              </button>
            </div>
          )}
        </div>

        {/* CLIPS DISPLAY & INTERACTIVE CHECKBOXES */}
        {completedClips.length > 0 ? (
          <div className="space-y-2.5">
            {selectionMode === 'custom' && (
              <div className="flex items-center justify-between text-xs px-1">
                <span className="text-slate-400 font-medium">
                  {selectedClipIds.length} of {completedClips.length} parts selected
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={selectAllClips}
                    className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-slate-600">•</span>
                  <button
                    type="button"
                    onClick={deselectAllClips}
                    className="text-[11px] text-slate-400 hover:text-slate-300 font-semibold cursor-pointer"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
            )}

            {/* List of Clips */}
            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
              {completedClips.map((clip, idx) => {
                const partNum = clip.partNumber || (baseStartPart + idx);
                const isSelected = selectionMode === 'all' || (selectionMode === 'custom' && selectedClipIds.includes(clip.id));
                const sizeMb = clip.blob?.size ? (clip.blob.size / (1024 * 1024)).toFixed(1) : null;

                return (
                  <div
                    key={clip.id}
                    onClick={() => {
                      if (selectionMode === 'custom') {
                        toggleClipSelection(clip.id);
                      }
                    }}
                    className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                      selectionMode === 'custom' ? 'cursor-pointer' : 'cursor-default'
                    } ${
                      isSelected
                        ? 'bg-blue-950/30 border-blue-500/50 text-white shadow-sm'
                        : 'bg-slate-900/50 border-slate-800/80 text-slate-400 opacity-60 hover:opacity-90'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      {selectionMode === 'custom' && (
                        <div className="shrink-0 text-blue-400">
                          {isSelected ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4 text-slate-500" />}
                        </div>
                      )}

                      <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center justify-center font-mono font-bold text-xs shrink-0">
                        {isZeroPad ? String(partNum).padStart(2, '0') : partNum}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-white truncate">
                            {clip.name}
                          </span>
                          <span className="px-1.5 py-0.2 bg-blue-500/20 text-blue-300 rounded text-[9px] font-mono shrink-0">
                            Part {isZeroPad ? String(partNum).padStart(2, '0') : partNum}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {sizeMb ? `${sizeMb} MB • ` : ''}
                          {clip.duration ? `${Math.round(clip.duration)}s • ` : ''}
                          Ready for automated Facebook Reel ingest
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
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
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-98 text-white font-semibold text-xs rounded-xl shadow-md transition-all cursor-pointer inline-flex items-center space-x-1.5 touch-manipulation"
              >
                <span>Go to Split &amp; Cut ✂️</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── 4. FACEBOOK METADATA, TITLE & PART FIELDS ──────────────────── */}
      <div className="space-y-4 bg-slate-950/60 border border-slate-800 rounded-2xl p-4 sm:p-5">
        {/* Field 1: Facebook Video / Series Title */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <label className="text-xs font-semibold text-slate-200">
              Facebook Video / Series Title:
            </label>
            <div className="flex flex-wrap items-center gap-1">
              {textSettings?.movieName && textSettings.movieName !== fbSettings?.fb_name && (
                <button
                  type="button"
                  onClick={() => updateFbSettings({ fb_name: textSettings.movieName })}
                  className="text-[10px] text-orange-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-orange-500/30 rounded-lg px-2 py-0.5 transition-colors cursor-pointer flex items-center space-x-1 shrink-0 touch-manipulation"
                  title="Copy from on-screen text overlay title"
                >
                  <Copy className="w-2.5 h-2.5 text-orange-400" />
                  <span>Sync Overlay</span>
                </button>
              )}
              {ytSettings?.yt_name && ytSettings.yt_name !== fbSettings?.fb_name && (
                <button
                  type="button"
                  onClick={() => updateFbSettings({ fb_name: ytSettings.yt_name })}
                  className="text-[10px] text-red-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-red-500/30 rounded-lg px-2 py-0.5 transition-colors cursor-pointer flex items-center space-x-1 shrink-0 touch-manipulation"
                  title="Copy series name from YouTube"
                >
                  <Youtube className="w-2.5 h-2.5 text-red-400" />
                  <span>Sync YT</span>
                </button>
              )}
              {igSettings?.ig_name && igSettings.ig_name !== fbSettings?.fb_name && (
                <button
                  type="button"
                  onClick={() => updateFbSettings({ fb_name: igSettings.ig_name })}
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
            value={fbSettings?.fb_name ?? ''}
            onChange={(e) => updateFbSettings({ fb_name: e.target.value })}
            placeholder={textSettings?.movieName || 'e.g. Anime Highlights, Cyberpunk 2077'}
            className="w-full bg-slate-900 border border-slate-700 text-xs sm:text-sm text-white rounded-xl px-3 py-2.5 focus:border-blue-500 focus:outline-none shadow-inner"
          />
          <p className="text-[10px] text-slate-400">
            Replaces <code className="text-blue-400 font-mono">{'{movie}'}</code> and <code className="text-blue-400 font-mono">{'{title}'}</code> tokens in Facebook titles &amp; captions.
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
              value={fbSettings?.fb_start_part || 1}
              onChange={(e) => updateFbSettings({ fb_start_part: Math.max(1, parseInt(e.target.value) || 1) })}
              className="w-24 bg-slate-950 border border-slate-700 text-white font-mono font-bold text-xs text-center px-2 py-1.5 rounded-lg focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-slate-300">
              Zero-Padding:
            </label>
            <button
              type="button"
              onClick={() => updateFbSettings({ fb_zero_pad: fbSettings?.fb_zero_pad === false ? true : false })}
              className={`px-3 py-1.5 text-xs font-mono font-medium rounded-lg border transition-colors cursor-pointer touch-manipulation ${
                fbSettings?.fb_zero_pad !== false
                  ? 'bg-blue-500/20 border-blue-500/40 text-blue-300 font-bold'
                  : 'bg-slate-950 border-slate-700 text-slate-400'
              }`}
            >
              {fbSettings?.fb_zero_pad !== false ? 'Part 01, 02...' : 'Part 1, 2...'}
            </button>
          </div>
        </div>

        {/* Field 3: Facebook Title Template */}
        <div className="space-y-2 pt-1 border-t border-slate-800/80">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <label className="text-xs font-semibold text-slate-200">
              Facebook Title Template:
            </label>
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => {
                  const current = fbSettings?.fb_title_template || '';
                  updateFbSettings({ fb_title_template: `${current}${current ? ' ' : ''}{movie}` });
                }}
                className="px-1.5 py-0.5 text-[9px] bg-slate-900 hover:bg-slate-800 text-blue-300 border border-blue-500/30 rounded font-mono cursor-pointer"
              >
                +{'{movie}'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const current = fbSettings?.fb_title_template || '';
                  updateFbSettings({ fb_title_template: `${current}${current ? ' ' : ''}{part}` });
                }}
                className="px-1.5 py-0.5 text-[9px] bg-slate-900 hover:bg-slate-800 text-blue-300 border border-blue-500/30 rounded font-mono cursor-pointer"
              >
                +{'{part}'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const current = fbSettings?.fb_title_template || '';
                  updateFbSettings({ fb_title_template: `${current}${current ? ' ' : ''}#Reels` });
                }}
                className="px-1.5 py-0.5 text-[9px] bg-slate-900 hover:bg-slate-800 text-blue-300 border border-blue-500/30 rounded font-mono cursor-pointer"
              >
                +#Reels
              </button>
            </div>
          </div>

          <input
            type="text"
            value={fbSettings?.fb_title_template || ''}
            onChange={e => updateFbSettings({ fb_title_template: e.target.value })}
            placeholder="{movie} - Part {part} | #Reels"
            className="w-full bg-slate-900 border border-slate-700 text-xs sm:text-sm text-white rounded-xl px-3 py-2 focus:border-blue-500 focus:outline-none font-mono shadow-inner"
          />
        </div>

        {/* Field 4: Description / Caption Template */}
        <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <label className="text-xs font-semibold text-slate-200">
              Facebook Caption &amp; Description Template
            </label>
            <div className="flex flex-wrap items-center gap-1">
              {ytSettings?.yt_description_template && (
                <button
                  type="button"
                  onClick={() => updateFbSettings({ fb_caption_template: ytSettings.yt_description_template })}
                  className="text-[10px] text-red-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-red-500/30 rounded-lg px-2 py-0.5 transition-colors cursor-pointer flex items-center space-x-1 shrink-0 touch-manipulation"
                  title="Copy description from YouTube"
                >
                  <Youtube className="w-2.5 h-2.5 text-red-400" />
                  <span>Sync from YT</span>
                </button>
              )}
              {igSettings?.ig_caption_template && (
                <button
                  type="button"
                  onClick={() => updateFbSettings({ fb_caption_template: igSettings.ig_caption_template })}
                  className="text-[10px] text-pink-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-pink-500/30 rounded-lg px-2 py-0.5 transition-colors cursor-pointer flex items-center space-x-1 shrink-0 touch-manipulation"
                  title="Copy caption from Instagram"
                >
                  <Instagram className="w-2.5 h-2.5 text-pink-400" />
                  <span>Sync from IG</span>
                </button>
              )}
            </div>
          </div>
          <textarea
            rows={3}
            value={fbSettings?.fb_caption_template || ''}
            onChange={e => updateFbSettings({ fb_caption_template: e.target.value })}
            placeholder="{movie} - Part {part}\n\n#Reels #Shorts\n{hashtags}"
            className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-xl px-3 py-2 focus:border-blue-500 focus:outline-none font-mono resize-y min-h-[70px] shadow-inner"
          />
        </div>

        {/* Field 5: Default Tags & Hashtags */}
        <div className="space-y-2 pt-1 border-t border-slate-800/80">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
              <Tag className="w-3.5 h-3.5 text-blue-400" />
              <span>Default Tags &amp; Hashtags</span>
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {ytSettings?.yt_tags && ytSettings.yt_tags.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const combined = Array.from(new Set([...(fbSettings?.fb_tags || []), ...ytSettings.yt_tags]));
                    updateFbSettings({ fb_tags: combined });
                  }}
                  className="text-[10px] text-red-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-red-500/30 rounded-lg px-2 py-0.5 transition-colors cursor-pointer flex items-center space-x-1 shrink-0 touch-manipulation"
                  title="Merge tags from YouTube"
                >
                  <Youtube className="w-2.5 h-2.5 text-red-400" />
                  <span>Sync YT Tags ({ytSettings.yt_tags.length})</span>
                </button>
              )}
              {igSettings?.ig_tags && igSettings.ig_tags.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const combined = Array.from(new Set([...(fbSettings?.fb_tags || []), ...igSettings.ig_tags]));
                    updateFbSettings({ fb_tags: combined });
                  }}
                  className="text-[10px] text-pink-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-pink-500/30 rounded-lg px-2 py-0.5 transition-colors cursor-pointer flex items-center space-x-1 shrink-0 touch-manipulation"
                  title="Merge tags from Instagram"
                >
                  <Instagram className="w-2.5 h-2.5 text-pink-400" />
                  <span>Sync IG Tags ({igSettings.ig_tags.length})</span>
                </button>
              )}
              <span className="text-[10px] text-slate-500">{(fbSettings?.fb_tags || []).length} active</span>
              {(fbSettings?.fb_tags || []).length > 0 && (
                <button
                  type="button"
                  onClick={() => updateFbSettings({ fb_tags: [] })}
                  className="text-[10px] text-rose-400 hover:text-rose-300 font-medium cursor-pointer touch-manipulation px-1.5 py-0.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded transition-colors"
                  title="Clear all active tags and hashtags"
                >
                  <span>Clear All</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 bg-slate-900/60 border border-slate-800 rounded-xl p-2.5 min-h-[44px]">
            {(fbSettings?.fb_tags || []).length === 0 && (
              <span className="text-[11px] text-slate-500 italic">No tags added yet. Type tags or hashtags below.</span>
            )}
            {(fbSettings?.fb_tags || []).map(tag => (
              <span key={tag} className="inline-flex items-center space-x-1 bg-slate-800 text-blue-300 text-[11px] px-2 py-0.5 rounded-full border border-blue-500/20">
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
              placeholder="Add tags or paste #reels #viral #shorts..."
              className="flex-1 bg-slate-900 border border-slate-700 text-xs text-white rounded-xl px-3 py-2 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={addTag}
              className="w-full sm:w-auto px-5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors cursor-pointer touch-manipulation"
            >
              Add Tag
            </button>
          </div>
        </div>

        {/* Field 7: Publish Timing (Now vs Schedule) */}
        <div className="space-y-2 pt-1 border-t border-slate-800/80">
          <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span>Publish Timing</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => updateFbSettings({ fb_schedule_mode: 'now' })}
              className={`py-2 px-3 text-xs font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                fbSettings?.fb_schedule_mode === 'now'
                  ? 'bg-blue-500/20 border-blue-500 text-blue-300 font-bold'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Publish Now
            </button>

            <button
              type="button"
              onClick={() => updateFbSettings({ fb_schedule_mode: 'schedule' })}
              className={`py-2 px-3 text-xs font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                fbSettings?.fb_schedule_mode === 'schedule'
                  ? 'bg-blue-500/20 border-blue-500 text-blue-300 font-bold'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Schedule for Later
            </button>
          </div>

          {fbSettings?.fb_schedule_mode === 'schedule' && (
            <div className="pt-2">
              <input
                type="datetime-local"
                value={fbSettings?.fb_schedule_time || ''}
                onChange={(e) => updateFbSettings({ fb_schedule_time: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3.5 py-2.5 rounded-xl outline-none focus:border-blue-500"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                * Meta requires scheduled Reels/videos to be set at least 20 minutes in the future.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── 5. PUBLISH ACTION & BATCH PIPELINE STATUS ─────────────────── */}
      <div className="space-y-3 pt-2">
        {/* Progress Pipeline Display */}
        {(isPublishing || isBatchPublishing) && (
          <div className="p-4 bg-blue-950/40 border border-blue-500/40 rounded-2xl space-y-2.5 animate-pulse">
            <div className="flex items-center justify-between text-xs font-semibold text-blue-300">
              <span className="flex items-center space-x-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>
                  {batchTotalCount > 1
                    ? `Publishing Part ${batchCurrentIdx} of ${batchTotalCount} (${publishStage || 'Ingesting'})...`
                    : publishStage === 'b2_upload'
                    ? `Uploading video to Backblaze B2 temporary storage (${publishProgress}%)...`
                    : 'Ingesting & Finalizing with Meta Graph API...'}
                </span>
              </span>
              <span>{publishProgress}%</span>
            </div>
            <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${publishProgress}%` }}
              />
            </div>
          </div>
        )}

        {(publishError || batchError) && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start space-x-2.5 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <p className="font-semibold">{publishError || batchError}</p>
              {(publishError?.includes('#200') || batchError?.includes('#200')) && (
                <p className="text-[11px] text-rose-200/80">
                  Please click <strong>Re-auth</strong> in Step 1 to reconnect Facebook and ensure your Page is selected in permissions.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Batch Published Posts List */}
        {batchPublishedPosts.length > 0 && (
          <div className="p-4 bg-emerald-950/40 border border-emerald-500/40 rounded-2xl space-y-3 shadow-lg">
            <div className="flex items-center space-x-2 text-emerald-300 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{batchPublishedPosts.length} Reel(s) Published Successfully!</span>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {batchPublishedPosts.map((post, pIdx) => (
                <div
                  key={post.videoId || pIdx}
                  className="p-2.5 bg-slate-900/80 border border-emerald-500/20 rounded-xl flex items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-center space-x-2 min-w-0">
                    <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded font-mono font-bold text-[10px]">
                      Part {post.partNumber}
                    </span>
                    <span className="text-white truncate font-medium">{post.clipName}</span>
                  </div>

                  <div className="flex items-center space-x-1.5 shrink-0">
                    {post.postUrl && (
                      <a
                        href={post.postUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] rounded-lg flex items-center space-x-1 transition-colors"
                      >
                        <Share2 className="w-3 h-3" />
                        <span>FB Reel</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {post.igPostUrl && (
                      <a
                        href={post.igPostUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 bg-gradient-to-r from-pink-600 to-purple-600 hover:opacity-90 text-white font-bold text-[11px] rounded-lg flex items-center space-x-1 transition-colors"
                      >
                        <Instagram className="w-3 h-3" />
                        <span>IG Reel</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Single Last Published Post Display (if not in batch list) */}
        {lastPublishedPost && batchPublishedPosts.length === 0 && (
          <div className="p-4 bg-emerald-950/40 border border-emerald-500/40 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-300">
                  {lastPublishedPost.status === 'scheduled' ? 'Reel Scheduled Successfully!' : 'Reel Published Successfully!'}
                </p>
                <p className="text-[10px] text-slate-400">
                  Temporary B2 storage uploaded once &amp; verified by Meta.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              {lastPublishedPost.postUrl && (
                <a
                  href={lastPublishedPost.postUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center space-x-1.5 transition-all"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Open on Facebook</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              {lastPublishedPost.igPostUrl && (
                <a
                  href={lastPublishedPost.igPostUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-2 bg-gradient-to-r from-pink-600 to-purple-600 hover:opacity-90 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center space-x-1.5 transition-all"
                >
                  <Instagram className="w-3.5 h-3.5" />
                  <span>Open on Instagram</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Dual / Single Action Buttons Bar */}
        {completedClips.length === 0 ? (
          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl text-center space-y-2">
            <p className="text-xs text-slate-300 font-medium">
              ⚠️ Please export video clips in <strong>Split &amp; Cut</strong> first. Facebook Reels publishing is only enabled for generated clips.
            </p>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Dedicated 1-Click Dual Publish Button (When both FB and IG are connected) */}
            {isPageConnected && isIgAccountConnected && (
              <button
                type="button"
                onClick={() => handlePublishExecution('both')}
                disabled={isPublishing || isBatchPublishing || activeSelectedClips.length === 0}
                className="flex-1 py-3.5 px-4 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:opacity-95 active:scale-98 disabled:opacity-50 text-white font-bold text-xs sm:text-sm rounded-2xl shadow-xl shadow-purple-500/20 flex items-center justify-center space-x-2 transition-all cursor-pointer touch-manipulation"
              >
                {isPublishing || isBatchPublishing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{activePublishTarget === 'both' ? 'Publishing to Both FB & IG...' : 'Processing...'}</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 text-amber-300 fill-current" />
                    <span>
                      {fbSettings?.fb_schedule_mode === 'schedule'
                        ? `Schedule Both FB + IG (${activeSelectedClips.length})`
                        : `Publish to Both FB + IG (${activeSelectedClips.length})`}
                    </span>
                  </>
                )}
              </button>
            )}

            {/* Standard Facebook Publish Button */}
            <button
              type="button"
              onClick={() => handlePublishExecution('facebook')}
              disabled={!isConnected || isPublishing || isBatchPublishing || activeSelectedClips.length === 0}
              className={`${
                isPageConnected && isIgAccountConnected ? 'flex-1' : 'w-full'
              } py-3.5 px-4 bg-gradient-to-r from-[#1877F2] to-indigo-600 hover:from-[#166fe5] hover:to-indigo-500 active:scale-98 disabled:opacity-50 text-white font-bold text-xs sm:text-sm rounded-2xl shadow-xl shadow-blue-500/20 flex items-center justify-center space-x-2 transition-all cursor-pointer touch-manipulation`}
            >
              {isPublishing || isBatchPublishing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>
                    {activeSelectedClips.length > 1
                      ? `Publishing Part ${batchCurrentIdx || 1} of ${batchTotalCount || activeSelectedClips.length}...`
                      : 'Publishing to Facebook...'}
                  </span>
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4" />
                  <span>
                    {activeSelectedClips.length > 1
                      ? `Publish ${activeSelectedClips.length} Clips to Facebook`
                      : fbSettings?.fb_schedule_mode === 'schedule'
                      ? `Schedule ${fbSettings?.fb_content_type === 'reel' ? 'Reel' : 'Video'}`
                      : `Publish ${fbSettings?.fb_content_type === 'reel' ? 'Reel' : 'Video'} to Facebook`}
                  </span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
