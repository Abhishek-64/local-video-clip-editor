import React, { useState, useEffect } from 'react';
import {
  Scissors,
  Trash2,
  RotateCcw,
  Play,
  Layers,
  Eye,
  EyeOff,
  Film,
  Download,
  Merge,
  Split,
  Check,
  X,
  Target,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Undo2,
  Hash,
  Sparkles,
  Clock,
  AlertCircle
} from 'lucide-react';
import {
  formatTime,
  splitKeptParts,
  parseFlexibleTime,
  parseMultipleTimestamps,
  splitPartsAtTimestamps
} from '../utils/time';

export default function SplitCutEditor({
  duration = 0,
  currentTime = 0,
  onCurrentTimeChange,
  customParts = [],
  onCustomPartsChange,
  skipDeletedCuts = true,
  onToggleSkipDeletedCuts,
  onExportMergedCleaned,
  onExportSelectedMerge,
  onGenerateBatchKept,
  onExportSinglePart,
  movieName = 'My Movie'
}) {
  const [expandedPartId, setExpandedPartId] = useState(null);
  const [customTimeInput, setCustomTimeInput] = useState('');
  const [timeInputError, setTimeInputError] = useState(null);
  const [timeSplitSuccess, setTimeSplitSuccess] = useState(null);

  // Helper to ensure segments exist
  const getEnsureParts = () => {
    if (customParts && customParts.length > 0) return [...customParts];
    return [
      {
        id: `part-1-${Date.now()}`,
        partNumber: 1,
        title: 'Full Video',
        startTime: 0,
        endTime: duration || 100,
        duration: duration || 100,
        isDeleted: false
      }
    ];
  };

  const partsList = getEnsureParts();
  const keptParts = partsList.filter((p) => !p.isDeleted);
  const deletedParts = partsList.filter((p) => p.isDeleted);

  // Multi-Selection State for Selective Merging (e.g. merge P2 + P4 only)
  const [selectedMergeIds, setSelectedMergeIds] = useState(() => {
    return new Set(keptParts.map((p) => p.id));
  });

  // Keep selection in sync when parts change
  useEffect(() => {
    setSelectedMergeIds((prev) => {
      const next = new Set();
      keptParts.forEach((p) => {
        if (prev.has(p.id) || prev.size === 0) {
          next.add(p.id);
        }
      });
      return next.size > 0 ? next : new Set(keptParts.map((p) => p.id));
    });
  }, [customParts]);

  const toggleSelectForMerge = (partId) => {
    setSelectedMergeIds((prev) => {
      const next = new Set(prev);
      if (next.has(partId)) {
        next.delete(partId);
      } else {
        next.add(partId);
      }
      return next;
    });
  };

  const selectAllActive = () => {
    setSelectedMergeIds(new Set(keptParts.map((p) => p.id)));
  };

  const clearSelection = () => {
    setSelectedMergeIds(new Set());
  };

  // Compute Selected Merge Segments
  const selectedMergeParts = partsList.filter((p) => selectedMergeIds.has(p.id) && !p.isDeleted);
  const selectedMergeDuration = selectedMergeParts.reduce(
    (sum, p) => sum + Math.max(0, (p.endTime || 0) - (p.startTime || 0)),
    0
  );

  // Smart label generator that never overflows on mobile
  const getSelectedMergeSummary = () => {
    const count = selectedMergeParts.length;
    if (count === 0) return 'None Selected';
    if (count === keptParts.length) return `All ${count} Kept Parts`;
    if (count <= 3) {
      return selectedMergeParts.map((p) => `Part ${p.partNumber || 1}`).join(' + ');
    }
    const nums = selectedMergeParts.map((p) => p.partNumber || 1);
    const isConsecutive = nums.every((val, i) => i === 0 || val === nums[i - 1] + 1);
    if (isConsecutive) {
      return `Parts ${nums[0]}–${nums[nums.length - 1]} (${count} clips)`;
    }
    return `Part ${nums[0]}, Part ${nums[1]}, Part ${nums[2]} (+${count - 3} more)`;
  };

  const getMergeButtonTitle = () => {
    const count = selectedMergeParts.length;
    if (count === 0) return 'Select Parts to Merge';
    if (count === keptParts.length) return `Merge All ${count} Parts`;
    if (count === 1) return `Export Part ${selectedMergeParts[0].partNumber || 1}`;
    return `Merge ${count} Selected Parts`;
  };

  // ── Action: Split at Current Playhead ───────────────────────────────────────
  const handleSplitAtPlayhead = () => {
    const playhead = Math.round((currentTime || 0) * 10) / 10;
    const parts = getEnsureParts();

    const targetIdx = parts.findIndex(
      (p) => playhead > p.startTime + 0.1 && playhead < p.endTime - 0.1
    );

    if (targetIdx === -1) return;

    const originalPart = parts[targetIdx];
    const originalEnd = originalPart.endTime;

    const firstSegment = {
      ...originalPart,
      endTime: playhead,
      duration: Math.max(0, Math.round((playhead - originalPart.startTime) * 10) / 10)
    };

    const secondSegment = {
      id: `part-split-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      partNumber: targetIdx + 2,
      title: originalPart.title ? `${originalPart.title} (Pt 2)` : '',
      startTime: playhead,
      endTime: originalEnd,
      duration: Math.max(0, Math.round((originalEnd - playhead) * 10) / 10),
      isDeleted: Boolean(originalPart.isDeleted)
    };

    const nextList = [...parts];
    nextList[targetIdx] = firstSegment;
    nextList.splice(targetIdx + 1, 0, secondSegment);

    // Renumber active parts sequentially
    let activeCounter = 1;
    const renumbered = nextList.map((p) => {
      if (p.isDeleted) return p;
      const u = { ...p, partNumber: activeCounter };
      activeCounter++;
      return u;
    });

    if (onCustomPartsChange) onCustomPartsChange(renumbered);
  };

  // ── Action: Reset All Splits to 1 Single Full Video ────────────────────────
  const handleResetAll = () => {
    if (onCustomPartsChange) {
      onCustomPartsChange([
        {
          id: `part-1-${Date.now()}`,
          partNumber: 1,
          title: 'Full Video',
          startTime: 0,
          endTime: duration || 100,
          duration: duration || 100,
          isDeleted: false
        }
      ]);
    }
  };

  // ── Action: Adjust Segment Timestamp ───────────────────────────────────────
  const handleNudgeTime = (index, field, delta) => {
    const parts = getEnsureParts();
    const part = parts[index];
    if (!part) return;

    const current = part[field] || 0;
    const nextVal = Math.max(0, Math.min(duration || 9999, Math.round((current + delta) * 10) / 10));

    const updated = parts.map((p, idx) => {
      if (idx === index) {
        const u = { ...p, [field]: nextVal };
        u.duration = Math.max(0, Math.round((u.endTime - u.startTime) * 10) / 10);
        return u;
      }
      return p;
    });

    if (onCustomPartsChange) onCustomPartsChange(updated);
  };

  const handleSetToPlayhead = (index, field) => {
    const playhead = Math.round((currentTime || 0) * 10) / 10;
    const parts = getEnsureParts();
    const updated = parts.map((p, idx) => {
      if (idx === index) {
        const u = { ...p, [field]: playhead };
        u.duration = Math.max(0, Math.round((u.endTime - u.startTime) * 10) / 10);
        return u;
      }
      return p;
    });
    if (onCustomPartsChange) onCustomPartsChange(updated);
  };

  // ── Action: Quick Split in 2 Halves (Part 1 & Part 2) ───────────────────────
  const handleSplitInTwo = () => {
    if (!duration || duration <= 0) return;
    const twoParts = splitKeptParts(customParts, duration, 'count', 2);
    if (onCustomPartsChange) onCustomPartsChange(twoParts);
  };

  // ── Action: Quick Split in 4 Equal Parts ───────────────────────────────────
  const handleSplitInFour = () => {
    if (!duration || duration <= 0) return;
    const fourParts = splitKeptParts(customParts, duration, 'count', 4);
    if (onCustomPartsChange) onCustomPartsChange(fourParts);
  };

  // ── Action: Toggle Keep / Cut on a Segment & Auto-Renumber Active ───────────
  const handleToggleKeepCut = (index) => {
    const parts = getEnsureParts();
    const updated = parts.map((p, idx) => {
      if (idx === index) {
        return { ...p, isDeleted: !p.isDeleted };
      }
      return p;
    });

    // Re-number active parts so the sequence starts at Part 1
    let activeCounter = 1;
    const renumbered = updated.map((p) => {
      if (p.isDeleted) return p;
      const u = { ...p, partNumber: activeCounter };
      activeCounter++;
      return u;
    });

    if (onCustomPartsChange) onCustomPartsChange(renumbered);
  };

  // ── Action: Apply Exact / Flexible Time Split (Single or Multiple Timestamps) ──
  const handleApplyCustomTimeSplit = (e) => {
    if (e) e.preventDefault();
    setTimeInputError(null);
    setTimeSplitSuccess(null);

    const raw = customTimeInput.trim();
    if (!raw) {
      setTimeInputError('Please enter timestamp(s) e.g. "01:30", "1m 20s" or "00:30, 01:15"');
      return;
    }

    // Check for "every <time>" syntax e.g. "every 30s", "every 1m", "every 90s"
    if (raw.toLowerCase().startsWith('every ')) {
      const intervalStr = raw.slice(6).trim();
      const intervalSec = parseFlexibleTime(intervalStr);
      if (!intervalSec || intervalSec <= 0) {
        setTimeInputError(`Invalid interval "${intervalStr}". Try e.g. "every 30s" or "every 1m"`);
        return;
      }
      const newParts = splitKeptParts(partsList, duration, 'duration', intervalSec);
      if (onCustomPartsChange) onCustomPartsChange(newParts);
      setTimeSplitSuccess(`✓ Split into ${newParts.length} parts (every ${intervalSec}s)`);
      setCustomTimeInput('');
      setTimeout(() => setTimeSplitSuccess(null), 4000);
      return;
    }

    // Parse one or multiple timestamps
    const timestamps = parseMultipleTimestamps(raw, duration);
    if (!timestamps || timestamps.length === 0) {
      setTimeInputError(`No valid timestamps found within video (0s - ${formatTime(duration)}). Examples: "01:30", "1m 20s", "00:45, 02:15"`);
      return;
    }

    const updated = splitPartsAtTimestamps(partsList, duration, timestamps);
    if (onCustomPartsChange) onCustomPartsChange(updated);

    const formattedPoints = timestamps.map((t) => formatTime(t)).join(', ');
    setTimeSplitSuccess(`✓ Split video at [${formattedPoints}] into ${updated.length} parts!`);
    setCustomTimeInput('');
    setTimeout(() => setTimeSplitSuccess(null), 4000);
  };

  const handleQuickIntervalSplit = (sec) => {
    if (!duration || duration <= 0) return;
    const newParts = splitKeptParts(partsList, duration, 'duration', sec);
    if (onCustomPartsChange) onCustomPartsChange(newParts);
    setTimeSplitSuccess(`✓ Split into ${newParts.length} parts (every ${formatTime(sec)})`);
    setTimeout(() => setTimeSplitSuccess(null), 3000);
  };

  const handleAppendCurrentTimeToInput = () => {
    const formatted = formatTime(currentTime);
    setCustomTimeInput((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return formatted;
      return `${trimmed}, ${formatted}`;
    });
    setTimeInputError(null);
  };

  const canSplitAtPlayhead = partsList.some(
    (p) => currentTime > p.startTime + 0.2 && currentTime < p.endTime - 0.2
  );

  const handleTriggerMergeSelected = () => {
    if (selectedMergeParts.length === 0) return;
    if (onExportSelectedMerge) {
      onExportSelectedMerge(selectedMergeParts);
    } else if (onExportMergedCleaned) {
      onExportMergedCleaned();
    }
  };

  return (
    <div className="space-y-3 touch-manipulation">
      {/* 1. Header Bar with Split & Quick Presets */}
      <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-2.5 sm:p-3 flex flex-wrap items-center justify-between gap-2 shadow-sm">
        {/* Left: Quick Split at Playhead */}
        <button
          onClick={handleSplitAtPlayhead}
          disabled={!canSplitAtPlayhead}
          className="min-h-[38px] px-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 active:scale-95 disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-bold text-xs rounded-xl shadow-sm transition-all flex items-center space-x-1.5 cursor-pointer touch-manipulation shrink-0"
        >
          <Scissors className="w-3.5 h-3.5 shrink-0" />
          <span>Split @ {formatTime(currentTime)}</span>
        </button>

        {/* Quick Split Preset Pills */}
        <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 p-0.5 rounded-xl">
          <button
            onClick={handleSplitInTwo}
            className="px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer touch-manipulation"
            title="Split video into 2 equal parts"
          >
            2 Parts
          </button>
          <button
            onClick={handleSplitInFour}
            className="px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer touch-manipulation"
            title="Split video into 4 equal parts"
          >
            4 Parts
          </button>
          <button
            onClick={handleResetAll}
            className="px-2 py-1 text-[11px] font-semibold text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer touch-manipulation"
            title="Reset to 1 full video clip"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>

        {/* Player Auto-Skip Toggle */}
        <button
          onClick={onToggleSkipDeletedCuts}
          className={`min-h-[34px] px-2.5 py-1 text-[11px] font-semibold rounded-xl border flex items-center space-x-1.5 transition-all cursor-pointer touch-manipulation ${
            skipDeletedCuts
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
          title="Auto skip deleted cuts during preview playback"
        >
          {skipDeletedCuts ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
          <span>{skipDeletedCuts ? 'Skip Cuts' : 'Play All'}</span>
        </button>
      </div>

      {/* 2. Exact Custom Time Split Input Bar (Supports Min, Hour, Sec, Multiple Timestamps) */}
      <div className="bg-slate-950/90 border border-slate-800/90 rounded-2xl p-2.5 sm:p-3 space-y-2 shadow-sm">
        <form onSubmit={handleApplyCustomTimeSplit} className="space-y-2">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {/* Input with Clock icon & Current Playhead inserter */}
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Clock className="w-4 h-4 text-amber-400/90" />
              </div>
              <input
                type="text"
                id="custom-split-time-input"
                value={customTimeInput}
                onChange={(e) => {
                  setCustomTimeInput(e.target.value);
                  if (timeInputError) setTimeInputError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleApplyCustomTimeSplit(e);
                  }
                }}
                placeholder="Split at time: e.g. 01:30 or 1h 20m 30s or 00:30, 01:15, 02:45"
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-9 pr-24 py-2 text-xs sm:text-sm font-mono text-white placeholder:text-slate-500 placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all"
              />
              {/* Insert Current Time Badge inside input right side */}
              <button
                type="button"
                onClick={handleAppendCurrentTimeToInput}
                className="absolute inset-y-1.5 right-1.5 px-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-amber-300 hover:text-amber-200 text-[11px] font-mono font-semibold rounded-lg border border-slate-700 flex items-center space-x-1 cursor-pointer transition-all"
                title={`Insert current playhead time (${formatTime(currentTime)})`}
              >
                <Target className="w-3 h-3" />
                <span>{formatTime(currentTime)}</span>
              </button>
            </div>

            {/* Split Button */}
            <button
              type="submit"
              id="apply-split-time-btn"
              className="min-h-[38px] px-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 active:scale-95 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center space-x-1.5 cursor-pointer touch-manipulation shrink-0"
            >
              <Split className="w-3.5 h-3.5 shrink-0" />
              <span>Split Video (Enter)</span>
            </button>
          </div>

          {/* Quick Helper Chips: Intervals & Format Examples */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] pt-0.5">
            <div className="flex items-center space-x-1 text-slate-400 font-medium">
              <span className="text-slate-500 text-[10px] sm:text-[11px]">Interval:</span>
              <button
                type="button"
                onClick={() => handleQuickIntervalSplit(30)}
                className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 hover:text-amber-300 text-slate-300 border border-slate-800 rounded-md font-mono text-[10px] transition-colors cursor-pointer"
              >
                Every 30s
              </button>
              <button
                type="button"
                onClick={() => handleQuickIntervalSplit(60)}
                className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 hover:text-amber-300 text-slate-300 border border-slate-800 rounded-md font-mono text-[10px] transition-colors cursor-pointer"
              >
                Every 1m
              </button>
              <button
                type="button"
                onClick={() => handleQuickIntervalSplit(120)}
                className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 hover:text-amber-300 text-slate-300 border border-slate-800 rounded-md font-mono text-[10px] transition-colors cursor-pointer"
              >
                Every 2m
              </button>
              <button
                type="button"
                onClick={() => handleQuickIntervalSplit(300)}
                className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 hover:text-amber-300 text-slate-300 border border-slate-800 rounded-md font-mono text-[10px] transition-colors cursor-pointer"
              >
                Every 5m
              </button>
            </div>

            <span className="text-[10px] text-slate-500 hidden md:inline">
              Supports: <code className="text-slate-400">01:30</code>, <code className="text-slate-400">1h 20m 30s</code>, <code className="text-slate-400">00:30, 01:15, 02:45</code>
            </span>
          </div>

          {/* Feedback banners */}
          {timeInputError && (
            <div className="flex items-center space-x-1.5 text-rose-400 bg-rose-950/40 border border-rose-800/50 rounded-lg px-2.5 py-1.5 text-xs animate-fadeIn">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{timeInputError}</span>
            </div>
          )}
          {timeSplitSuccess && (
            <div className="flex items-center space-x-1.5 text-emerald-300 bg-emerald-950/40 border border-emerald-800/50 rounded-lg px-2.5 py-1.5 text-xs animate-fadeIn">
              <Check className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
              <span>{timeSplitSuccess}</span>
            </div>
          )}
        </form>
      </div>

      {/* 2. Compact Visual Mini-Strip */}
      <div className="h-6 bg-slate-950 rounded-lg border border-slate-800/80 overflow-hidden flex select-none shadow-inner">
        {partsList.map((part, idx) => {
          const segDuration = Math.max(0, (part.endTime || 0) - (part.startTime || 0));
          const widthPct = duration > 0 ? (segDuration / duration) * 100 : 100 / partsList.length;
          const isSelectedForMerge = selectedMergeIds.has(part.id) && !part.isDeleted;

          return (
            <div
              key={part.id || idx}
              onClick={() => onCurrentTimeChange && onCurrentTimeChange(part.startTime)}
              className={`h-full flex items-center justify-between px-1.5 border-r border-slate-900 transition-all cursor-pointer text-[9px] font-mono font-bold ${
                part.isDeleted
                  ? 'bg-rose-950/70 text-rose-300 line-through'
                  : isSelectedForMerge
                  ? 'bg-emerald-600/40 text-emerald-200 border-r-2 border-r-emerald-400'
                  : 'bg-slate-800/50 text-slate-400'
              }`}
              style={{ width: `${Math.max(5, widthPct)}%` }}
              title={`Part ${part.partNumber || idx + 1}: ${formatTime(part.startTime)} - ${formatTime(part.endTime)}`}
            >
              <span className="truncate">{part.isDeleted ? 'CUT' : `P${part.partNumber || idx + 1}`}</span>
              <span className="truncate opacity-75 hidden xs:inline">{formatTime(segDuration)}</span>
            </div>
          );
        })}
      </div>

      {/* 3. Streamlined, Compact Part Rows */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between px-1 text-[11px] text-slate-400 gap-1">
          <span>{partsList.length} Segments ({keptParts.length} active to export, {deletedParts.length} cut)</span>
          <div className="flex items-center space-x-2 shrink-0">
            <button onClick={selectAllActive} className="text-slate-400 hover:text-white cursor-pointer touch-manipulation">
              Select All
            </button>
            <span>•</span>
            <button onClick={clearSelection} className="text-slate-400 hover:text-white cursor-pointer touch-manipulation">
              Clear
            </button>
          </div>
        </div>

        <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1 scrollbar-thin">
          {partsList.map((part, index) => {
            const segDuration = Math.max(0, (part.endTime || 0) - (part.startTime || 0));
            const isCut = Boolean(part.isDeleted);
            const isSelectedForMerge = selectedMergeIds.has(part.id) && !isCut;
            const isExpanded = expandedPartId === part.id;

            return (
              <div
                key={part.id || index}
                className={`border rounded-xl transition-all ${
                  isCut
                    ? 'bg-rose-950/20 border-rose-500/30 opacity-75'
                    : isSelectedForMerge
                    ? 'bg-slate-950/90 border-emerald-500/40 shadow-sm'
                    : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                {/* Main Compact Row */}
                <div className="p-2 sm:p-2.5 flex items-center justify-between gap-1.5 sm:gap-2">
                  {/* Left: Checkbox + Badge + Time Range */}
                  <div className="flex items-center space-x-1.5 sm:space-x-2 min-w-0 flex-1">
                    {/* Checkbox for Merge */}
                    {!isCut ? (
                      <button
                        onClick={() => toggleSelectForMerge(part.id)}
                        className={`p-0.5 rounded cursor-pointer touch-manipulation shrink-0 ${
                          isSelectedForMerge ? 'text-emerald-400' : 'text-slate-600 hover:text-slate-400'
                        }`}
                        title={isSelectedForMerge ? 'Included in merge' : 'Click to include in merge'}
                      >
                        {isSelectedForMerge ? (
                          <CheckSquare className="w-4 h-4" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    ) : (
                      <span className="w-4 h-4 text-rose-500 flex items-center justify-center text-xs font-bold shrink-0">
                        ✕
                      </span>
                    )}

                    {/* Part Badge */}
                    <span
                      className={`px-1.5 py-0.5 rounded-md font-mono text-[10px] font-bold shrink-0 border ${
                        isCut
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-300 line-through'
                          : isSelectedForMerge
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      {isCut ? 'CUT' : `Part ${part.partNumber || index + 1}`}
                    </span>

                    {/* Time Range & Duration */}
                    <div className="min-w-0 flex items-center space-x-1 text-xs">
                      <span className="font-mono text-slate-300 truncate text-[11px] sm:text-xs">
                        {formatTime(part.startTime)} &rarr; {formatTime(part.endTime)}
                      </span>
                      <span className="text-[10px] font-mono text-amber-400/90 font-semibold shrink-0">
                        ({formatTime(segDuration)})
                      </span>
                    </div>
                  </div>

                  {/* Right Actions: Play, Cut/Keep, Export Single, Expand */}
                  <div className="flex items-center space-x-1 shrink-0">
                    {/* Play Preview */}
                    <button
                      onClick={() => onCurrentTimeChange && onCurrentTimeChange(part.startTime)}
                      className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors cursor-pointer touch-manipulation"
                      title="Play from this part"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                    </button>

                    {/* Cut / Keep Toggle */}
                    <button
                      onClick={() => handleToggleKeepCut(index)}
                      className={`px-2 py-1 text-[11px] font-semibold rounded-lg border transition-all cursor-pointer touch-manipulation ${
                        isCut
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20'
                      }`}
                      title={isCut ? 'Restore this part' : 'Cut / exclude this part from exports'}
                    >
                      {isCut ? 'Restore' : 'Cut'}
                    </button>

                    {/* Direct Single Part Export */}
                    {!isCut && onExportSinglePart && (
                      <button
                        onClick={() => onExportSinglePart(part)}
                        className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-lg text-[11px] font-semibold flex items-center space-x-1 transition-colors cursor-pointer touch-manipulation hidden xs:inline-flex"
                        title="Export only this individual part"
                      >
                        <Download className="w-3 h-3" />
                        <span className="hidden sm:inline">Export</span>
                      </button>
                    )}

                    {/* Expand Timestamp Adjustment */}
                    <button
                      onClick={() => setExpandedPartId(isExpanded ? null : part.id)}
                      className="p-1.5 text-slate-500 hover:text-slate-300 rounded-lg transition-colors cursor-pointer touch-manipulation"
                      title="Fine-tune start/end timestamps"
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <SlidersHorizontal className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Fine-Tuning Drawer */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-slate-900 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs animate-fadeIn">
                    {/* Start Time Adjust */}
                    <div className="flex items-center justify-between gap-1 bg-slate-950 border border-slate-800 rounded-lg p-1.5">
                      <span className="text-slate-400 text-[11px]">Start:</span>
                      <span className="font-mono text-amber-400 font-bold text-xs">{formatTime(part.startTime)}</span>
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleNudgeTime(index, 'startTime', -1)}
                          className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px] cursor-pointer touch-manipulation"
                        >
                          -1s
                        </button>
                        <button
                          onClick={() => handleNudgeTime(index, 'startTime', 1)}
                          className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px] cursor-pointer touch-manipulation"
                        >
                          +1s
                        </button>
                        <button
                          onClick={() => handleSetToPlayhead(index, 'startTime')}
                          className="px-1.5 py-0.5 bg-orange-500/20 text-orange-300 rounded text-[10px] font-semibold cursor-pointer touch-manipulation"
                        >
                          Now
                        </button>
                      </div>
                    </div>

                    {/* End Time Adjust */}
                    <div className="flex items-center justify-between gap-1 bg-slate-950 border border-slate-800 rounded-lg p-1.5">
                      <span className="text-slate-400 text-[11px]">End:</span>
                      <span className="font-mono text-amber-400 font-bold text-xs">{formatTime(part.endTime)}</span>
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleNudgeTime(index, 'endTime', -1)}
                          className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px] cursor-pointer touch-manipulation"
                        >
                          -1s
                        </button>
                        <button
                          onClick={() => handleNudgeTime(index, 'endTime', 1)}
                          className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px] cursor-pointer touch-manipulation"
                        >
                          +1s
                        </button>
                        <button
                          onClick={() => handleSetToPlayhead(index, 'endTime')}
                          className="px-1.5 py-0.5 bg-orange-500/20 text-orange-300 rounded text-[10px] font-semibold cursor-pointer touch-manipulation"
                        >
                          Now
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Compact Merge & Output Actions Footer */}
      <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-2.5 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
          <span className="text-slate-400 font-medium">Selected for Merge:</span>
          <span className="font-mono text-emerald-400 font-bold truncate max-w-full sm:max-w-md">
            {getSelectedMergeSummary()} ({formatTime(selectedMergeDuration, true)})
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Merge Selected Parts into 1 Video */}
          <button
            onClick={handleTriggerMergeSelected}
            disabled={selectedMergeParts.length === 0}
            className="w-full min-h-[44px] py-2.5 px-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 active:scale-98 disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-bold text-xs rounded-xl shadow-md flex items-center justify-center space-x-2 cursor-pointer touch-manipulation"
          >
            <Film className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {getMergeButtonTitle()} ({formatTime(selectedMergeDuration, true)})
            </span>
          </button>

          {/* Queue as Separate Clips */}
          <button
            onClick={() => onGenerateBatchKept && onGenerateBatchKept(selectedMergeParts)}
            disabled={selectedMergeParts.length === 0}
            className="w-full min-h-[44px] py-2.5 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 active:scale-98 disabled:opacity-40 disabled:pointer-events-none text-white font-semibold text-xs rounded-xl flex items-center justify-center space-x-2 cursor-pointer touch-manipulation"
          >
            <Layers className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            <span className="truncate">
              Export {selectedMergeParts.length} as Separate Clips
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
