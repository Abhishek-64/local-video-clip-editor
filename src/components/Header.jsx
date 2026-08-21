import React from 'react';
import { ShieldCheck, Film, Sparkles } from 'lucide-react';

export default function Header({ onReset, hasVideo }) {
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
              <span className="hidden sm:inline text-[9px] uppercase font-semibold px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full shrink-0">
                100% Local
              </span>
            </div>
            <p className="text-[10px] sm:text-xs text-slate-400 truncate">Local Browser Processing &bull; Private</p>
          </div>
        </div>

        {/* Local Security & Status Badge / Actions */}
        <div className="flex items-center space-x-2 sm:space-x-4 shrink-0">
          <div className="hidden md:flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-950/40 border border-emerald-500/30 rounded-lg text-xs text-emerald-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>100% Local &bull; No Uploads &bull; Private</span>
          </div>

          {hasVideo && (
            <button
              onClick={onReset}
              className="px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer touch-manipulation"
            >
              Change Video
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
