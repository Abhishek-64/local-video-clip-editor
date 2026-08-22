import React, { useState, useEffect } from 'react';
import {
  Scissors, Clock, Layers, Hash, Film, ListOrdered, Plus, Trash2,
  Play, RefreshCw, ChevronDown, ChevronUp, Copy, ArrowUp, ArrowDown,
  Target, Edit3, Check, Sparkles
} from 'lucide-react';
import { formatTime, parseTimeToSeconds } from '../utils/time';

export default function Timeline({
  duration = 0,
  startTime = 0,
  endTime = 0,
  currentTime = 0,
  onStartChange,
  onEndChange,
  onCurrentTimeChange,
  clipDuration = 60,
  onClipDurationChange,
  movieName = 'My Movie',
  customParts = [],
  onCustomPartsChange
}) {
  // 'duration' = set seconds per clip, 'count' = set number of parts, 'manual' = manual seconds for each part
  const [splitMode, setSplitMode] = useState('duration');
  const [numParts, setNumParts] = useState(5);
  const [showManualEditor, setShowManualEditor] = useState(true);

  // Active playing/previewing part ID
  const [activePreviewPartId, setActivePreviewPartId] = useState(null);

  const selectedDuration = Math.max(0, endTime - startTime);

  // Derive default calculated parts
  const generateDefaultPartsList = (mode, partsCount, segSec) => {
    if (selectedDuration <= 0) return [];

    let total = 1;
    let stepSec = segSec;

    if (mode === 'count') {
      total = Math.max(1, partsCount);
      stepSec = selectedDuration / total;
    } else {
      total = Math.max(1, Math.ceil(selectedDuration / Math.max(5, segSec)));
      stepSec = Math.max(5, segSec);
    }

    const list = [];
    for (let i = 0; i < total; i++) {
      const segStart = Math.round((startTime + i * stepSec) * 10) / 10;
      const segEnd = Math.min(endTime, Math.round((segStart + stepSec) * 10) / 10);
      list.push({
        id: `part-${i + 1}-${Date.now() + i}`,
        partNumber: i + 1,
        title: '',
        startTime: segStart,
        endTime: segEnd,
        duration: Math.max(0, Math.round((segEnd - segStart) * 10) / 10)
      });
    }
    return list;
  };

  // Sync parts list when timeline range or split mode changes
  useEffect(() => {
    if (onCustomPartsChange && (!customParts || customParts.length === 0)) {
      const initialParts = generateDefaultPartsList(splitMode, numParts, clipDuration);
      onCustomPartsChange(initialParts);
    }
  }, [startTime, endTime]);

  const handleSplitModeChange = (mode) => {
    setSplitMode(mode);
    const newParts = generateDefaultPartsList(mode, numParts, clipDuration);
    if (onCustomPartsChange) onCustomPartsChange(newParts);

    if (mode === 'count') {
      const computed = selectedDuration > 0 ? selectedDuration / Math.max(1, numParts) : clipDuration;
      onClipDurationChange(Math.max(1, computed));
    }
  };

  const handleNumPartsChange = (val) => {
    const parts = Math.max(1, Math.min(200, parseInt(val) || 1));
    setNumParts(parts);
    if (splitMode === 'count') {
      const computed = selectedDuration > 0 ? selectedDuration / parts : clipDuration;
      onClipDurationChange(Math.max(1, computed));
      const newParts = generateDefaultPartsList('count', parts, computed);
      if (onCustomPartsChange) onCustomPartsChange(newParts);
    }
  };

  const setPresetDuration = (secs) => {
    setSplitMode('duration');
    onClipDurationChange(secs);
    const newParts = generateDefaultPartsList('duration', numParts, secs);
    if (onCustomPartsChange) onCustomPartsChange(newParts);
  };

  const handleFullVideoConvert = () => {
    onStartChange(0);
    onEndChange(duration || 100);
    setSplitMode('count');
    setNumParts(1);
    onClipDurationChange(duration || 100);
    if (onCustomPartsChange) {
      onCustomPartsChange([
        {
          id: `part-1-${Date.now()}`,
          partNumber: 1,
          title: 'Full Video',
          startTime: 0,
          endTime: duration || 100,
          duration: duration || 100
        }
      ]);
    }
  };

  // ── Manual Part Times Editing ───────────────────────────────────────────────

  const handlePartTimeChange = (index, field, value) => {
    if (!onCustomPartsChange || !customParts) return;

    let numVal = 0;
    if (typeof value === 'string' && value.includes(':')) {
      numVal = parseTimeToSeconds(value);
    } else {
      numVal = parseFloat(value) || 0;
    }

    numVal = Math.max(0, Math.min(duration || 9999, Math.round(numVal * 10) / 10));

    const updated = customParts.map((p, idx) => {
      if (idx === index) {
        const updatedPart = { ...p, [field]: numVal };
        updatedPart.duration = Math.max(0, Math.round((updatedPart.endTime - updatedPart.startTime) * 10) / 10);
        return updatedPart;
      }
      return p;
    });

    onCustomPartsChange(updated);
  };

  const handleNudgeTime = (index, field, delta) => {
    if (!onCustomPartsChange || !customParts) return;
    const part = customParts[index];
    if (!part) return;

    const current = part[field] || 0;
    const nextVal = Math.max(0, Math.min(duration || 9999, Math.round((current + delta) * 10) / 10));
    handlePartTimeChange(index, field, nextVal);
  };

  const handleSetToCurrentPlayhead = (index, field) => {
    const currentSec = Math.round((currentTime || 0) * 10) / 10;
    handlePartTimeChange(index, field, currentSec);
  };

  const handlePartTitleChange = (index, title) => {
    if (!onCustomPartsChange || !customParts) return;
    const updated = customParts.map((p, idx) => {
      if (idx === index) return { ...p, title };
      return p;
    });
    onCustomPartsChange(updated);
  };

  const handleAddPart = () => {
    if (!onCustomPartsChange) return;
    const currentList = customParts || [];
    const lastPart = currentList[currentList.length - 1];

    const newStart = lastPart ? lastPart.endTime : startTime;
    const newEnd = Math.min(duration || 9999, Math.round((newStart + (clipDuration || 60)) * 10) / 10);

    const newPart = {
      id: `part-${Date.now()}`,
      partNumber: currentList.length + 1,
      title: '',
      startTime: Math.round(newStart * 10) / 10,
      endTime: newEnd,
      duration: Math.max(0, Math.round((newEnd - newStart) * 10) / 10)
    };

    onCustomPartsChange([...currentList, newPart]);
  };

  const handleDuplicatePart = (index) => {
    if (!onCustomPartsChange || !customParts) return;
    const partToDup = customParts[index];
    if (!partToDup) return;

    const currentList = [...customParts];
    const newStart = partToDup.endTime;
    const clipLen = Math.max(5, partToDup.duration || 60);
    const newEnd = Math.min(duration || 9999, Math.round((newStart + clipLen) * 10) / 10);

    const duplicated = {
      ...partToDup,
      id: `part-dup-${Date.now()}`,
      startTime: newStart,
      endTime: newEnd,
      duration: Math.max(0, Math.round((newEnd - newStart) * 10) / 10),
      title: partToDup.title ? `${partToDup.title} (Copy)` : ''
    };

    currentList.splice(index + 1, 0, duplicated);

    // Re-number parts
    const renumbered = currentList.map((p, idx) => ({ ...p, partNumber: idx + 1 }));
    onCustomPartsChange(renumbered);
  };

  const handleSplitAtCurrentTime = () => {
    if (!onCustomPartsChange || !customParts || customParts.length === 0) return;
    const playhead = Math.round((currentTime || 0) * 10) / 10;

    // Find which part currently encloses the playhead
    const targetIdx = customParts.findIndex(p => playhead > p.startTime && playhead < p.endTime);
    if (targetIdx === -1) return;

    const originalPart = customParts[targetIdx];
    const originalEnd = originalPart.endTime;

    const updatedFirstPart = {
      ...originalPart,
      endTime: playhead,
      duration: Math.max(0, Math.round((playhead - originalPart.startTime) * 10) / 10)
    };

    const newSecondPart = {
      id: `part-split-${Date.now()}`,
      partNumber: targetIdx + 2,
      title: originalPart.title ? `${originalPart.title} (Part 2)` : '',
      startTime: playhead,
      endTime: originalEnd,
      duration: Math.max(0, Math.round((originalEnd - playhead) * 10) / 10)
    };

    const nextList = [...customParts];
    nextList[targetIdx] = updatedFirstPart;
    nextList.splice(targetIdx + 1, 0, newSecondPart);

    const renumbered = nextList.map((p, idx) => ({ ...p, partNumber: idx + 1 }));
    onCustomPartsChange(renumbered);
  };

  const handleMovePart = (index, direction) => {
    if (!onCustomPartsChange || !customParts) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= customParts.length) return;

    const list = [...customParts];
    const temp = list[index];
    list[index] = list[targetIdx];
    list[targetIdx] = temp;

    const renumbered = list.map((p, idx) => ({ ...p, partNumber: idx + 1 }));
    onCustomPartsChange(renumbered);
  };

  const handleDeletePart = (index) => {
    if (!onCustomPartsChange || !customParts || customParts.length <= 1) return;
    const filtered = customParts.filter((_, idx) => idx !== index).map((p, idx) => ({
      ...p,
      partNumber: idx + 1
    }));
    onCustomPartsChange(filtered);
  };

  const handleResetPartsToEqual = () => {
    const fresh = generateDefaultPartsList(splitMode, numParts, clipDuration);
    if (onCustomPartsChange) onCustomPartsChange(fresh);
  };

  const handleSeekToPart = (part) => {
    setActivePreviewPartId(part.id);
    if (onCurrentTimeChange) {
      onCurrentTimeChange(part.startTime);
    }
  };

  const startPercent = duration > 0 ? (startTime / duration) * 100 : 0;
  const endPercent = duration > 0 ? (endTime / duration) * 100 : 100;
  const currentPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const displayPartsList = customParts && customParts.length > 0
    ? customParts
    : generateDefaultPartsList(splitMode, numParts, clipDuration);

  // Total runtime of all active clips
  const totalClipsRuntime = displayPartsList.reduce((acc, p) => acc + (p.duration || 0), 0);

  // Check if current playhead can be split
  const canSplitAtPlayhead = displayPartsList.some(p => currentTime > p.startTime + 0.5 && currentTime < p.endTime - 0.5);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-5 shadow-lg space-y-4">
      {/* Top Header Info & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <Scissors className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400" />
          <h3 className="font-semibold text-xs sm:text-sm text-white">Timeline &amp; Individual Clip Timing</h3>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Quick Split at Playhead */}
          <button
            onClick={handleSplitAtCurrentTime}
            disabled={!canSplitAtPlayhead}
            className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-40 disabled:pointer-events-none active:scale-95 border border-amber-500/30 text-amber-300 rounded-lg flex items-center space-x-1.5 transition-all cursor-pointer touch-manipulation text-[11px] sm:text-xs"
            title={`Split clip under playhead at ${formatTime(currentTime)}`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Split @ {formatTime(currentTime)}</span>
          </button>

          {/* Full Video Button */}
          <button
            onClick={handleFullVideoConvert}
            className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-95 border border-emerald-500/30 text-emerald-300 rounded-lg flex items-center space-x-1.5 transition-all cursor-pointer touch-manipulation text-[11px] sm:text-xs"
            title="Select entire video as 1 complete clip"
          >
            <Film className="w-3.5 h-3.5" />
            <span>Full Video</span>
          </button>

          <span className="text-slate-400 hidden md:inline text-xs">
            Range: <strong className="text-white font-mono">{formatTime(startTime)}</strong> &rarr;{' '}
            <strong className="text-white font-mono">{formatTime(endTime)}</strong>
          </span>
          <span className="px-2 py-0.5 bg-orange-500/10 border border-orange-500/30 text-orange-300 rounded font-mono font-medium text-[11px] sm:text-xs">
            Total: {formatTime(totalClipsRuntime, true)}
          </span>
        </div>
      </div>

      {/* Visual Scrubber Timeline Track */}
      <div className="relative pt-2 sm:pt-4 pb-2">
        {/* Main Track Background */}
        <div
          className="relative h-12 sm:h-14 bg-slate-950 rounded-xl overflow-hidden border border-slate-800 cursor-pointer select-none"
          onClick={(e) => {
            if (!duration || !onCurrentTimeChange) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            onCurrentTimeChange(pos * duration);
          }}
        >
          {/* Active Global Range Highlight */}
          <div
            className="absolute top-0 bottom-0 bg-slate-900/80 border-y border-slate-700/50 transition-all pointer-events-none"
            style={{
              left: `${startPercent}%`,
              width: `${Math.max(0, endPercent - startPercent)}%`
            }}
          />

          {/* Individual Part Markers & Visual Segments */}
          {duration > 0 && displayPartsList.length > 0 && (
            <div className="absolute inset-0 pointer-events-none">
              {displayPartsList.map((part, idx) => {
                const segLeftPct = (part.startTime / duration) * 100;
                const segWidthPct = ((part.endTime - part.startTime) / duration) * 100;
                const isSelected = activePreviewPartId === part.id;

                return (
                  <div
                    key={part.id || idx}
                    className={`absolute top-0 bottom-0 border-r border-dashed border-amber-400/50 flex flex-col justify-between p-1 transition-all ${
                      isSelected
                        ? 'bg-amber-500/25 border-r-2 border-r-amber-400'
                        : idx % 2 === 0
                        ? 'bg-orange-500/15'
                        : 'bg-indigo-500/15'
                    }`}
                    style={{ left: `${segLeftPct}%`, width: `${Math.max(1, segWidthPct)}%` }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] sm:text-[9px] font-mono text-amber-200 font-bold bg-black/80 px-1 rounded truncate border border-amber-500/30">
                        P{part.partNumber || idx + 1}
                      </span>
                    </div>
                    <span className="text-[8px] font-mono text-slate-300 bg-slate-950/80 px-1 rounded truncate self-start border border-slate-800">
                      {formatTime(part.duration || 0)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Current Playhead Indicator */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_white] z-20 pointer-events-none transition-all"
            style={{ left: `${currentPercent}%` }}
          >
            <div className="w-3 h-3 bg-white -ml-1.5 -mt-0.5 rounded-full shadow border-2 border-orange-500" />
          </div>
        </div>

        {/* Global Start / End Range Sliders */}
        <div className="relative mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div className="space-y-1 bg-slate-950/40 p-2.5 sm:p-0 rounded-xl border sm:border-0 border-slate-800/80">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400 font-medium">Video Start Point</span>
              <span className="font-mono text-amber-400 font-bold">{formatTime(startTime)}</span>
            </div>
            <input
              type="range"
              min="0"
              max={duration || 100}
              step="0.5"
              value={startTime}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (val < endTime) onStartChange(val);
              }}
              className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
            />
          </div>

          <div className="space-y-1 bg-slate-950/40 p-2.5 sm:p-0 rounded-xl border sm:border-0 border-slate-800/80">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400 font-medium">Video End Point</span>
              <span className="font-mono text-amber-400 font-bold">{formatTime(endTime)}</span>
            </div>
            <input
              type="range"
              min="0"
              max={duration || 100}
              step="0.5"
              value={endTime}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (val > startTime) onEndChange(val);
              }}
              className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 touch-manipulation"
            />
          </div>
        </div>
      </div>

      {/* Auto Split Presets Row */}
      <div className="pt-2 border-t border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-300">Auto Split Mode:</span>
          </div>

          <div className="grid grid-cols-2 sm:inline-flex w-full sm:w-auto rounded-lg bg-slate-950 p-0.5 border border-slate-800">
            <button
              onClick={() => handleSplitModeChange('duration')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center justify-center space-x-1.5 touch-manipulation ${
                splitMode === 'duration'
                  ? 'bg-orange-500 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clock className="w-3 h-3 shrink-0" />
              <span>By Duration (sec)</span>
            </button>
            <button
              onClick={() => handleSplitModeChange('count')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center justify-center space-x-1.5 touch-manipulation ${
                splitMode === 'count'
                  ? 'bg-orange-500 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Hash className="w-3 h-3 shrink-0" />
              <span>By Part Count</span>
            </button>
          </div>
        </div>

        {splitMode === 'duration' ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2 flex-wrap gap-1.5">
              <span className="text-xs font-medium text-slate-300">Presets:</span>
              <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
                {[15, 30, 60, 90].map((sec) => (
                  <button
                    key={sec}
                    onClick={() => setPresetDuration(sec)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer touch-manipulation ${
                      clipDuration === sec
                        ? 'bg-orange-500 text-white font-semibold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-400">Custom Length (s):</span>
              <input
                type="number"
                min="5"
                max="3600"
                value={clipDuration}
                onChange={(e) => {
                  setSplitMode('duration');
                  const val = Math.max(5, parseInt(e.target.value) || 5);
                  onClipDurationChange(val);
                  const fresh = generateDefaultPartsList('duration', numParts, val);
                  if (onCustomPartsChange) onCustomPartsChange(fresh);
                }}
                className="w-16 bg-slate-950 border border-slate-800 text-white font-mono text-xs px-2 py-1.5 rounded-lg text-center focus:border-orange-500 focus:outline-none"
              />
              <div className="text-xs text-slate-400 pl-1">
                &rarr; <span className="text-amber-300 font-semibold">{displayPartsList.length} part{displayPartsList.length > 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center space-x-3 bg-slate-950/70 border border-slate-800 rounded-xl px-3.5 py-2">
              <Hash className="w-4 h-4 text-orange-400 shrink-0" />
              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-300">Parts count:</span>
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={numParts}
                  onChange={(e) => handleNumPartsChange(e.target.value)}
                  className="w-14 bg-slate-900 border border-slate-700 text-white font-mono text-xs px-2 py-1 rounded-lg text-center font-bold focus:border-orange-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center space-x-1.5 flex-wrap gap-1">
              {[1, 2, 3, 5, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => handleNumPartsChange(n)}
                  className={`px-2.5 py-1 text-xs rounded-lg border transition-colors cursor-pointer touch-manipulation ${
                    numParts === n
                      ? 'bg-orange-500/10 border-orange-500 text-orange-300 font-semibold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {n === 1 ? '1 (Full)' : n}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── MANUAL INDIVIDUAL CLIPS TIME TABLE ── */}
      <div className="pt-3 border-t border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={() => setShowManualEditor(!showManualEditor)}
            className="flex items-center space-x-1.5 text-xs font-semibold text-white hover:text-orange-400 cursor-pointer transition-colors touch-manipulation"
          >
            <ListOrdered className="w-4 h-4 text-orange-400" />
            <span>Individual Clip Timings ({displayPartsList.length} Clips)</span>
            {showManualEditor ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleResetPartsToEqual}
              className="px-2.5 py-1 text-[11px] text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center space-x-1 transition-colors cursor-pointer touch-manipulation"
              title="Reset all parts back to equal intervals"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reset Equal</span>
            </button>

            <button
              onClick={handleAddPart}
              className="px-2.5 py-1 text-[11px] font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg flex items-center space-x-1 transition-colors cursor-pointer touch-manipulation"
            >
              <Plus className="w-3 h-3" />
              <span>Add Clip</span>
            </button>
          </div>
        </div>

        {showManualEditor && (
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {displayPartsList.map((part, index) => (
              <div
                key={part.id || index}
                className={`bg-slate-950/80 border rounded-2xl p-3 sm:p-3.5 space-y-2.5 transition-all ${
                  activePreviewPartId === part.id
                    ? 'border-orange-500/70 shadow-lg shadow-orange-500/5 bg-slate-950'
                    : 'border-slate-800/90 hover:border-slate-700'
                }`}
              >
                {/* Part Header Row: Part #, Optional Title, Playhead Preview & Action buttons */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center space-x-2 min-w-0 flex-1">
                    <span className="w-7 h-7 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-300 font-bold text-xs flex items-center justify-center font-mono shrink-0">
                      P{part.partNumber || index + 1}
                    </span>

                    {/* Optional Clip Label / Title */}
                    <div className="relative flex-1 max-w-[200px] sm:max-w-xs">
                      <input
                        type="text"
                        value={part.title || ''}
                        onChange={(e) => handlePartTitleChange(index, e.target.value)}
                        placeholder={`Clip ${part.partNumber || index + 1} Label (e.g. Intro)`}
                        className="w-full bg-slate-900/80 border border-slate-800 focus:border-orange-500 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-600 outline-none transition-colors"
                      />
                    </div>
                  </div>

                  {/* Actions right: Preview, Duplicate, Reorder, Delete */}
                  <div className="flex items-center space-x-1 shrink-0">
                    <span className="px-2.5 py-1 bg-slate-900 border border-slate-800 text-amber-300 rounded-lg font-mono text-xs font-semibold mr-1">
                      {formatTime(Math.max(0, part.endTime - part.startTime), true)}
                    </span>

                    <button
                      onClick={() => handleSeekToPart(part)}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer touch-manipulation ${
                        activePreviewPartId === part.id
                          ? 'bg-emerald-500 text-slate-950'
                          : 'text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10'
                      }`}
                      title={`Preview from ${formatTime(part.startTime)}`}
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                    </button>

                    <button
                      onClick={() => handleDuplicatePart(index)}
                      className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors cursor-pointer touch-manipulation"
                      title="Duplicate this clip"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleMovePart(index, 'up')}
                      disabled={index === 0}
                      className="p-1.5 text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-800 rounded-lg transition-colors cursor-pointer touch-manipulation"
                      title="Move up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleMovePart(index, 'down')}
                      disabled={index === displayPartsList.length - 1}
                      className="p-1.5 text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-800 rounded-lg transition-colors cursor-pointer touch-manipulation"
                      title="Move down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>

                    {displayPartsList.length > 1 && (
                      <button
                        onClick={() => handleDeletePart(index)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer touch-manipulation"
                        title="Delete this clip"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Manual Timing Row: Start & End controls */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {/* Start Point Controls */}
                  <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-2 flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-[11px] text-slate-400 font-medium">Start:</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max={part.endTime || duration}
                        value={part.startTime}
                        onChange={(e) => handlePartTimeChange(index, 'startTime', e.target.value)}
                        className="w-16 bg-slate-950 border border-slate-700 text-white font-mono text-xs px-2 py-1 rounded-md text-center font-bold focus:border-orange-500 focus:outline-none"
                      />
                      <span className="text-[11px] font-mono text-amber-400/90 font-medium">
                        ({formatTime(part.startTime)})
                      </span>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleNudgeTime(index, 'startTime', -1)}
                        className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                        title="-1 second"
                      >
                        -1s
                      </button>
                      <button
                        onClick={() => handleNudgeTime(index, 'startTime', 1)}
                        className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                        title="+1 second"
                      >
                        +1s
                      </button>
                      <button
                        onClick={() => handleSetToCurrentPlayhead(index, 'startTime')}
                        className="px-2 py-1 text-[10px] bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 text-orange-300 rounded font-semibold flex items-center space-x-1 cursor-pointer touch-manipulation"
                        title={`Set Start to current playhead (${formatTime(currentTime)})`}
                      >
                        <Target className="w-3 h-3" />
                        <span>Now</span>
                      </button>
                    </div>
                  </div>

                  {/* End Point Controls */}
                  <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-2 flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-[11px] text-slate-400 font-medium">End:</span>
                      <input
                        type="number"
                        step="0.1"
                        min={part.startTime || 0}
                        max={duration || 9999}
                        value={part.endTime}
                        onChange={(e) => handlePartTimeChange(index, 'endTime', e.target.value)}
                        className="w-16 bg-slate-950 border border-slate-700 text-white font-mono text-xs px-2 py-1 rounded-md text-center font-bold focus:border-orange-500 focus:outline-none"
                      />
                      <span className="text-[11px] font-mono text-amber-400/90 font-medium">
                        ({formatTime(part.endTime)})
                      </span>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleNudgeTime(index, 'endTime', -1)}
                        className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                        title="-1 second"
                      >
                        -1s
                      </button>
                      <button
                        onClick={() => handleNudgeTime(index, 'endTime', 1)}
                        className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                        title="+1 second"
                      >
                        +1s
                      </button>
                      <button
                        onClick={() => handleSetToCurrentPlayhead(index, 'endTime')}
                        className="px-2 py-1 text-[10px] bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 text-orange-300 rounded font-semibold flex items-center space-x-1 cursor-pointer touch-manipulation"
                        title={`Set End to current playhead (${formatTime(currentTime)})`}
                      >
                        <Target className="w-3 h-3" />
                        <span>Now</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
