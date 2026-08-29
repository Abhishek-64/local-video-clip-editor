import React, { useState, useRef, useEffect } from 'react';
import { ShieldCheck, Film, Sparkles, User, LogOut, Youtube, ChevronDown, CheckCircle2, Database, LayoutTemplate, Bookmark } from 'lucide-react';

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
  ytAccount
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
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

  const userInitial = user?.name ? user.name.charAt(0).toUpperCase() : user?.email ? user.email.charAt(0).toUpperCase() : 'U';

  return (
    <header className="bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-white sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">
        {/* Brand */}
        <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-rose-500 flex items-center justify-center shadow-lg shadow-orange-500/20 shrink-0">
            <Film className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-1.5 sm:space-x-2">
              <span className="font-bold text-sm sm:text-base tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-300 truncate">
                AUTOMATIC VIDEO CLIPPER
              </span>
            </div>
            <p className="text-[10px] sm:text-xs text-slate-400 truncate">Local Browser Processing &bull; Private</p>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center space-x-1.5 sm:space-x-3 shrink-0">
          {/* Templates / Presets Button */}
          <button
            onClick={onOpenTemplates}
            className="px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-orange-300 hover:text-white bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 rounded-xl transition-all cursor-pointer flex items-center space-x-1.5 touch-manipulation shadow-sm"
            title="Manage saved video section templates"
          >
            <LayoutTemplate className="w-3.5 h-3.5 text-orange-400" />
            <span className="hidden sm:inline">Templates</span>
            {templatesCount > 0 && (
              <span className="px-1.5 py-0.2 bg-orange-500/30 text-orange-200 rounded-full text-[10px] font-mono">
                {templatesCount}
              </span>
            )}
          </button>

          {hasVideo && (
            <button
              onClick={onReset}
              className="px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-colors cursor-pointer touch-manipulation"
            >
              Change Video
            </button>
          )}

          {/* User Account / Profile Badge */}
          {isAuthenticated && user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center space-x-2 pl-2 pr-2.5 py-1 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-slate-600 rounded-xl transition-all cursor-pointer"
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
                  ) : (
                    <div className="text-[10px] text-slate-400">Account</div>
                  )}
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
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

                  {/* Templates & Storage Management */}
                  <div className="p-1 border-b border-slate-800/80 space-y-0.5">
                    <button
                      onClick={() => {
                        setIsDropdownOpen(false);
                        onOpenTemplates && onOpenTemplates();
                      }}
                      className="w-full flex items-center space-x-2 px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                    >
                      <LayoutTemplate className="w-3.5 h-3.5 text-orange-400" />
                      <span>Saved Templates ({templatesCount})</span>
                    </button>

                    <button
                      onClick={() => {
                        setIsDropdownOpen(false);
                        onOpenStorage && onOpenStorage();
                      }}
                      className="w-full flex items-center space-x-2 px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
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
                      className="w-full flex items-center space-x-2 px-3 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer"
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
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-400 hover:to-rose-400 text-white text-xs font-semibold rounded-xl shadow-md shadow-orange-500/20 transition-all cursor-pointer touch-manipulation"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
