import React, { useState, useRef, useEffect } from 'react';
import {
  ShieldCheck, Film, Sparkles, User, LogOut, Youtube, ChevronDown,
  CheckCircle2, Database, LayoutTemplate, Bookmark, Share2, Instagram,
  Menu, X
} from 'lucide-react';

export default function Header({
  onReset,
  hasVideo,
  user,
  isAuthenticated,
  onOpenAuth,
  onLogout,
  onOpenStorage,
  onOpenTemplates,
  templatesCount = 0,
  ytAccount,
  fbAccount,
  igAccount,
  isYtConnected = false,
  isFbConnected = false,
  isIgConnected = false,
  activeTab = 'split-cut',
  onNavigateTab
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close mobile drawer on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsMobileDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const userInitial = user?.name ? user.name.charAt(0).toUpperCase() : user?.email ? user.email.charAt(0).toUpperCase() : 'U';

  return (
    <>
      <header className="bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">
          {/* Left: Mobile Hamburger (< md) & Brand */}
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
            {/* Hamburger Button for Mobile (< md) */}
            <button
              onClick={() => setIsMobileDrawerOpen(true)}
              aria-label="Open navigation menu"
              className="md:hidden w-11 h-11 -ml-1.5 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-xl flex items-center justify-center transition-colors cursor-pointer touch-manipulation shrink-0 active:scale-95"
            >
              <Menu className="w-5 h-5 text-slate-200" />
            </button>

            {/* Brand Icon & Name */}
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-rose-500 flex items-center justify-center shadow-lg shadow-orange-500/20 shrink-0">
              <Film className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <span className="font-bold text-xs sm:text-base tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-300 truncate">
                  AUTOMATIC VIDEO CLIPPER
                </span>
              </div>
              <p className="hidden xs:block text-[10px] sm:text-xs text-slate-400 truncate">Local Browser Processing • Private</p>
            </div>
          </div>

          {/* Desktop Right Actions (Hidden on mobile where drawer holds secondary items) */}
          <div className="flex items-center space-x-1.5 sm:space-x-2.5 shrink-0">
            {/* Templates / Presets Button (Desktop) */}
            <button
              onClick={onOpenTemplates}
              className="hidden md:flex px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-orange-300 hover:text-white bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 rounded-xl transition-all cursor-pointer items-center space-x-1.5 touch-manipulation shadow-sm"
              title="Manage saved video section templates"
            >
              <LayoutTemplate className="w-3.5 h-3.5 text-orange-400" />
              <span>Templates</span>
              {templatesCount > 0 && (
                <span className="px-1.5 py-0.2 bg-orange-500/30 text-orange-200 rounded-full text-[10px] font-mono">
                  {templatesCount}
                </span>
              )}
            </button>

            {hasVideo && (
              <button
                onClick={onReset}
                className="hidden md:block px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-colors cursor-pointer touch-manipulation"
              >
                Change Video
              </button>
            )}

            {/* User Account / Profile Badge (Both Mobile & Desktop) */}
            {isAuthenticated && user ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  aria-label="User profile menu"
                  className="min-h-[44px] min-w-[44px] flex items-center space-x-2 pl-2 pr-2.5 py-1 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-slate-600 rounded-xl transition-all cursor-pointer touch-manipulation"
                >
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-xs font-bold text-white shadow-sm shrink-0">
                    {userInitial}
                  </div>
                  <div className="hidden sm:block text-left">
                    <div className="text-xs font-semibold text-white leading-tight truncate max-w-[110px]">
                      {user.name || user.email.split('@')[0]}
                    </div>
                    {ytAccount ? (
                      <div className="flex items-center space-x-1 text-[10px] text-red-400">
                        <Youtube className="w-2.5 h-2.5" />
                        <span className="truncate max-w-[90px]">{ytAccount.channel_title || 'Linked'}</span>
                      </div>
                    ) : igAccount ? (
                      <div className="flex items-center space-x-1 text-[10px] text-pink-400">
                        <Instagram className="w-2.5 h-2.5" />
                        <span className="truncate max-w-[90px]">@{igAccount.ig_username || 'Linked'}</span>
                      </div>
                    ) : fbAccount ? (
                      <div className="flex items-center space-x-1 text-[10px] text-blue-400">
                        <Share2 className="w-2.5 h-2.5" />
                        <span className="truncate max-w-[90px]">{fbAccount.page_name || 'Linked'}</span>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400">Account</div>
                    )}
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
                </button>

                {/* Profile Dropdown */}
                {isDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden py-1.5 z-50 animate-scaleUp">
                    <div className="px-3.5 py-2.5 border-b border-slate-800/80">
                      <p className="text-xs font-bold text-white truncate">{user.name || 'Creator'}</p>
                      <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                    </div>

                    {ytAccount && (
                      <div className="px-3.5 py-2.5 bg-slate-950/40 border-b border-slate-800/60">
                        <div className="flex items-center space-x-2">
                          {ytAccount.channel_thumbnail ? (
                            <img
                              src={ytAccount.channel_thumbnail}
                              alt=""
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              className="w-6 h-6 rounded-full border border-slate-700 shrink-0"
                            />
                          ) : (
                            <Youtube className="w-5 h-5 text-red-400 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-slate-200 truncate">
                              {ytAccount.channel_title}
                            </p>
                            <p className="text-[10px] text-emerald-400 flex items-center space-x-1">
                              <CheckCircle2 className="w-2.5 h-2.5 inline" />
                              <span>YouTube Connected</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {igAccount && (
                      <div className="px-3.5 py-2.5 bg-slate-950/40 border-b border-slate-800/60">
                        <div className="flex items-center space-x-2">
                          {igAccount.ig_profile_picture_url ? (
                            <img
                              src={igAccount.ig_profile_picture_url}
                              alt=""
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              className="w-6 h-6 rounded-full border border-pink-500/40 shrink-0"
                            />
                          ) : (
                            <Instagram className="w-5 h-5 text-pink-400 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-slate-200 truncate">
                              @{igAccount.ig_username}
                            </p>
                            <p className="text-[10px] text-pink-400 flex items-center space-x-1">
                              <CheckCircle2 className="w-2.5 h-2.5 inline" />
                              <span>Instagram Connected</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {fbAccount && (
                      <div className="px-3.5 py-2.5 bg-slate-950/40 border-b border-slate-800/60">
                        <div className="flex items-center space-x-2">
                          {fbAccount.page_thumbnail ? (
                            <img
                              src={fbAccount.page_thumbnail}
                              alt=""
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              className="w-6 h-6 rounded-lg border border-slate-700 shrink-0"
                            />
                          ) : (
                            <Share2 className="w-5 h-5 text-blue-400 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-slate-200 truncate">
                              {fbAccount.page_name}
                            </p>
                            <p className="text-[10px] text-blue-400 flex items-center space-x-1">
                              <CheckCircle2 className="w-2.5 h-2.5 inline" />
                              <span>Facebook Connected</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Templates & Storage Management */}
                    <div className="p-1 border-b border-slate-800/80 space-y-0.5">
                      <button
                        onClick={() => {
                          setIsDropdownOpen(false);
                          onOpenTemplates && onOpenTemplates();
                        }}
                        className="w-full flex items-center space-x-2 px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer touch-manipulation"
                      >
                        <LayoutTemplate className="w-3.5 h-3.5 text-orange-400" />
                        <span>Saved Templates ({templatesCount})</span>
                      </button>

                      <button
                        onClick={() => {
                          setIsDropdownOpen(false);
                          onOpenStorage && onOpenStorage();
                        }}
                        className="w-full flex items-center space-x-2 px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer touch-manipulation"
                      >
                        <Database className="w-3.5 h-3.5 text-amber-400" />
                        <span>Database &amp; Storage</span>
                      </button>
                    </div>

                    <div className="p-1">
                      <button
                        onClick={() => {
                          setIsDropdownOpen(false);
                          onLogout();
                        }}
                        className="w-full flex items-center space-x-2 px-3 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer touch-manipulation"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Log Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => onOpenAuth('login')}
                className="min-h-[44px] px-3.5 py-2 bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-400 hover:to-rose-400 text-white text-xs font-semibold rounded-xl shadow-md shadow-orange-500/20 transition-all cursor-pointer flex items-center space-x-1.5 touch-manipulation active:scale-95"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Drawer (Left Slide-Over on < md) */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMobileDrawerOpen(false)}
          />

          {/* Drawer Menu Panel */}
          <div className="fixed top-0 left-0 bottom-0 w-4/5 max-w-xs bg-slate-900 border-r border-slate-800 p-4 shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-left duration-200">
            <div className="space-y-4">
              {/* Drawer Top Header with Brand & Close Button */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center shadow shrink-0">
                    <Film className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-xs text-white block truncate">AUTOMATIC VIDEO CLIPPER</span>
                    <span className="text-[10px] text-slate-400 block">Menu</span>
                  </div>
                </div>

                <button
                  onClick={() => setIsMobileDrawerOpen(false)}
                  aria-label="Close menu"
                  className="w-11 h-11 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl flex items-center justify-center transition-colors cursor-pointer touch-manipulation shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Navigation List */}
              <div className="space-y-1.5">
                {hasVideo && (
                  <button
                    onClick={() => {
                      setIsMobileDrawerOpen(false);
                      onReset();
                    }}
                    className="w-full flex items-center space-x-3 px-3.5 py-3 text-xs font-semibold text-slate-200 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 rounded-xl border border-slate-700/80 transition-colors cursor-pointer touch-manipulation text-left"
                  >
                    <Film className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Change Video Source</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setIsMobileDrawerOpen(false);
                    onOpenTemplates && onOpenTemplates();
                  }}
                  className="w-full flex items-center justify-between px-3.5 py-3 text-xs font-semibold text-orange-300 hover:text-white bg-orange-500/10 hover:bg-orange-500/20 rounded-xl border border-orange-500/30 transition-colors cursor-pointer touch-manipulation text-left"
                >
                  <div className="flex items-center space-x-3">
                    <LayoutTemplate className="w-4 h-4 text-orange-400 shrink-0" />
                    <span>Saved Templates</span>
                  </div>
                  {templatesCount > 0 && (
                    <span className="px-2 py-0.5 bg-orange-500/30 text-orange-200 rounded-full text-[10px] font-mono">
                      {templatesCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => {
                    setIsMobileDrawerOpen(false);
                    onOpenStorage && onOpenStorage();
                  }}
                  className="w-full flex items-center space-x-3 px-3.5 py-3 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-xl border border-slate-800 transition-colors cursor-pointer touch-manipulation text-left"
                >
                  <Database className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Database &amp; Storage Settings</span>
                </button>
              </div>

              {/* Connected Platforms Overview */}
              <div className="pt-2 border-t border-slate-800/80 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 block">
                  Connected Accounts
                </span>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 text-xs">
                    <div className="flex items-center space-x-2">
                      <Youtube className="w-4 h-4 text-red-400 shrink-0" />
                      <span className="text-slate-300 font-medium">YouTube</span>
                    </div>
                    {isYtConnected ? (
                      <span className="text-[10px] text-emerald-400 flex items-center space-x-1 font-semibold">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Connected</span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500">Not Linked</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 text-xs">
                    <div className="flex items-center space-x-2">
                      <Instagram className="w-4 h-4 text-pink-400 shrink-0" />
                      <span className="text-slate-300 font-medium">Instagram</span>
                    </div>
                    {isIgConnected ? (
                      <span className="text-[10px] text-pink-400 flex items-center space-x-1 font-semibold">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Connected</span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500">Not Linked</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 text-xs">
                    <div className="flex items-center space-x-2">
                      <Share2 className="w-4 h-4 text-blue-400 shrink-0" />
                      <span className="text-slate-300 font-medium">Facebook</span>
                    </div>
                    {isFbConnected ? (
                      <span className="text-[10px] text-blue-400 flex items-center space-x-1 font-semibold">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Connected</span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500">Not Linked</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Drawer Bottom Account Section */}
            <div className="pt-4 border-t border-slate-800 mt-4">
              {isAuthenticated && user ? (
                <div className="space-y-3">
                  <div className="flex items-center space-x-2.5 p-2 bg-slate-950/70 rounded-xl border border-slate-800">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-xs font-bold text-white shadow shrink-0">
                      {userInitial}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{user.name || 'Creator'}</p>
                      <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setIsMobileDrawerOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center justify-center space-x-2 py-3 px-4 bg-red-500/10 hover:bg-red-500/20 text-red-300 rounded-xl border border-red-500/30 text-xs font-semibold transition-colors cursor-pointer touch-manipulation"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Log Out</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setIsMobileDrawerOpen(false);
                    onOpenAuth('login');
                  }}
                  className="w-full flex items-center justify-center space-x-2 py-3 px-4 bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-xl text-xs font-bold shadow-md shadow-orange-500/20 transition-all cursor-pointer touch-manipulation"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Sign In / Create Account</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
