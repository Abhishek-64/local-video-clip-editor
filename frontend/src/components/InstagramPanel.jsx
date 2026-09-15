import React, { useState, useMemo } from 'react';
import {
  Instagram, CheckCircle2, AlertCircle, RefreshCw, LogOut, ChevronDown,
  Tag, Film, Sparkles, ExternalLink, ShieldCheck,
  Video, Hash, HelpCircle, Check, Lock, ChevronUp, Plus, Youtube,
  Share2, Copy, Type
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
  onSwitchToPlatform,
  onSocialRefresh
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



  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Active Upload / Publishing Banner with Real-Time Percentage */}
      {isPublishing && (
        <div className="bg-gradient-to-r from-pink-950/80 via-slate-900 to-purple-950/80 border border-pink-500/40 rounded-2xl p-4 shadow-xl flex items-center justify-between gap-3 animate-pulse">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-pink-500/20 border border-pink-500/40 flex items-center justify-center text-pink-400 shrink-0">
              <Instagram className="w-4 h-4 animate-spin" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">
                {publishStage === 'b2_upload' ? 'Uploading Video to Cloud Platform...' : 'Publishing to Instagram Reels...'}
              </p>
              <p className="text-[11px] text-slate-400">
                {publishStage === 'b2_upload' ? 'Live video byte transfer in progress' : 'Meta Graph API processing container'}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="text-sm font-mono font-bold text-pink-400 bg-pink-500/15 border border-pink-500/30 px-3 py-1 rounded-xl shadow-inner">
              {publishProgress || 0}%
            </span>
          </div>
        </div>
      )}

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
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
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

          {/* Session Expiry / Error Alert */}
          {(accountError || (publishError && (publishError.includes('190') || publishError.toLowerCase().includes('session') || publishError.toLowerCase().includes('re-authenticate')))) && (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start justify-between gap-3 text-xs text-amber-300 animate-fadeIn">
              <div className="flex items-start space-x-2 min-w-0">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1 min-w-0">
                  <p className="font-bold text-white">Meta Session Needs Re-authentication</p>
                  <p className="text-[11px] text-amber-200/90 leading-relaxed">
                    {accountError || publishError}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={connectInstagram}
                className="px-3 py-1.5 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold text-xs rounded-lg shadow-sm shrink-0 flex items-center space-x-1 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Re-authenticate</span>
              </button>
            </div>
          )}

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
                    <span className={diagnosticsData.token_expired ? 'text-rose-400 font-semibold' : 'text-emerald-400 font-semibold'}>
                      {diagnosticsData.token_expired ? '✕ Session Invalidated' : '✓ Long-lived (~60d)'}
                    </span>
                  </div>
                  {diagnosticsData.error && (
                    <div className="sm:col-span-3 p-2 bg-rose-500/10 border border-rose-500/30 rounded text-rose-300 text-[11px] flex items-center justify-between gap-2">
                      <span>{diagnosticsData.error}</span>
                      {diagnosticsData.token_expired && (
                        <button
                          type="button"
                          onClick={connectInstagram}
                          className="px-2.5 py-1 bg-pink-600 hover:bg-pink-500 text-white font-bold text-[10px] rounded shrink-0 cursor-pointer"
                        >
                          Reconnect
                        </button>
                      )}
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

      </div>

      
    </div>
  );
}
