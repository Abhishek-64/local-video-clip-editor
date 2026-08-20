import React from 'react';
import { ShieldCheck, Film, MonitorPlay, Sparkles } from 'lucide-react';

export default function Header({ onReset, hasVideo }) {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-rose-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Film className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-300">
                AUTOMATIC VIDEO CLIPPER
              </span>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full">
                Phase 1: Base UI
              </span>
            </div>
            <p className="text-xs text-slate-400">Local Browser Processing Engine</p>
          </div>
        </div>

        {/* Local Security & Status Badge */}
        <div className="flex items-center space-x-4">
          <div className="hidden md:flex items-center space-x-2 px-3 py-1.5 bg-emerald-950/40 border border-emerald-500/30 rounded-lg text-xs text-emerald-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>100% Local &bull; No Uploads &bull; Private</span>
          </div>

          {hasVideo && (
            <button
              onClick={onReset}
              className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              Change Video
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
