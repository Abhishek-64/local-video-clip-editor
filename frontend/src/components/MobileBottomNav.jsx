import React from 'react';
import { Scissors, Film, SlidersHorizontal, Layers } from 'lucide-react';

export default function MobileBottomNav({
  activeNavTab,
  onSelectNavTab,
  completedClipsCount = 0,
  queueCount = 0,
  cutSectionsCount = 0
}) {
  const navItems = [
    {
      id: 'edit',
      label: 'Edit',
      icon: Scissors,
      badge: cutSectionsCount > 0 ? cutSectionsCount : null,
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40'
    },
    {
      id: 'clips',
      label: 'Clips',
      icon: Film,
      badge: completedClipsCount > 0 ? completedClipsCount : null,
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
    },
    {
      id: 'export',
      label: 'Export',
      icon: SlidersHorizontal
    },
    {
      id: 'queue',
      label: 'Queue & Social',
      icon: Layers,
      badge: queueCount > 0 ? queueCount : null,
      badgeColor: 'bg-orange-500/20 text-orange-300 border-orange-500/40'
    }
  ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 border-t border-slate-800 backdrop-blur-md px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] shadow-2xl"
    >
      <div className="flex items-center justify-around max-w-md mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeNavTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelectNavTab(item.id)}
              className={`flex-1 flex flex-col items-center justify-center min-h-[44px] py-1 px-1 rounded-xl transition-all cursor-pointer touch-manipulation relative ${
                isActive
                  ? 'text-orange-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 active:scale-95'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110 text-orange-400' : 'text-slate-400'}`} />
                {item.badge && (
                  <span className={`absolute -top-1.5 -right-2.5 px-1 min-w-[15px] h-[15px] flex items-center justify-center rounded-full text-[9px] font-mono font-bold border ${item.badgeColor}`}>
                    {item.badge}
                  </span>
                )}
              </div>
              <span className={`text-[10px] mt-0.5 tracking-tight truncate max-w-[70px] ${isActive ? 'text-orange-400 font-bold' : 'text-slate-400'}`}>
                {item.label}
              </span>
              {isActive && (
                <span className="w-1 h-1 rounded-full bg-orange-400 mt-0.5" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
