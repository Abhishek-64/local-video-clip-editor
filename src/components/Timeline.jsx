import React, { useState, useEffect } from 'react';
import { Scissors, Clock, Layers, Hash, Film, ListOrdered, Plus, Trash2, Play, RefreshCw, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';
import { formatTime } from '../utils/time';

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
        id: `part-${i + 1}`,
        partNumber: i + 1,
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

  // Derive clip count and effective clip duration
  let effectiveClipDuration = clipDuration;
  let totalClips = 1;

  if (customParts && customParts.length > 0) {
    totalClips = customParts.length;
  } else if (splitMode === 'count') {
    totalClips = Math.max(1, numParts);
    effectiveClipDuration = selectedDuration > 0 ? selectedDuration / totalClips : clipDuration;
  } else {
    totalClips = clipDuration > 0 && selectedDuration > 0 ? Math.ceil(selectedDuration / clipDuration) : 1;
    effectiveClipDuration = clipDuration;
  }

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
          id: 'part-1',
          partNumber: 1,
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
    const numVal = Math.max(0, Math.min(duration || 9999, parseFloat(value) || 0));

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

  const handleAddPart = () => {
    if (!onCustomPartsChange) return;
    const currentList = customParts || [];
    const lastPart = currentList[currentList.length - 1];

    const newStart = lastPart ? lastPart.endTime : startTime;
    const newEnd = Math.min(duration, newStart + (clipDuration || 60));

    const newPart = {
      id: `part-${Date.now()}`,
      partNumber: currentList.length + 1,
      startTime: Math.round(newStart * 10) / 10,
      endTime: Math.round(newEnd * 10) / 10,
      duration: Math.max(0, Math.round((newEnd - newStart) * 10) / 10)
    };

    onCustomPartsChange([...currentList, newPart]);
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

  const handleSeekToPart = (partStartTime) => {
    if (onCurrentTimeChange) {
      onCurrentTimeChange(partStartTime);
    }
  };

  const startPercent = duration > 0 ? (startTime / duration) * 100 : 0;
  const endPercent = duration > 0 ? (endTime / duration) * 100 : 100;
  const currentPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const displayPartsList = customParts && customParts.length > 0
    ? customParts
    : generateDefaultPartsList(splitMode, numParts, clipDuration);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
      {/* Top Header info */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <Scissors className="w-5 h-5 text-orange-400" />
          <h3 className="font-semibold text-sm text-white">Timeline &amp; Range Selection</h3>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <button
            onClick={handleFullVideoConvert}
            className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer"
            title="Select entire video as 1 complete clip"
          >
            <Film className="w-3.5 h-3.5" />
            <span>Convert Full Video (1 Part)</span>
          </button>

          <span className="text-slate-400 hidden sm:inline">
            Range: <strong className="text-white font-mono">{formatTime(startTime)}</strong> &rarr;{' '}
            <strong className="text-white font-mono">{formatTime(endTime)}</strong>
          </span>
          <span className="px-2 py-0.5 bg-orange-500/10 border border-orange-500/30 text-orange-300 rounded font-mono font-medium">
            {formatTime(selectedDuration, true)}
          </span>
        </div>
      </div>

      {/* Visual Scrubber Timeline Track */}
      <div className="relative pt-4 pb-2">
        {/* Main Track Background */}
        <div className="relative h-12 bg-slate-950 rounded-xl overflow-hidden border border-slate-800 cursor-pointer">
          {/* Active Range Highlight */}
          <div
            className="absolute top-0 bottom-0 bg-gradient-to-r from-orange-500/30 via-amber-500/20 to-orange-500/30 border-y border-orange-500/60 transition-all pointer-events-none"
            style={{
              left: `${startPercent}%`,
              width: `${Math.max(0, endPercent - startPercent)}%`
            }}
          />

          {/* Segment Markers for Custom / Auto Parts */}
          {duration > 0 && displayPartsList.length > 0 && (
            <div className="absolute inset-0 pointer-events-none flex">
              {displayPartsList.map((part, idx) => {
                const segLeftPct = (part.startTime / duration) * 100;
                const segWidthPct = ((part.endTime - part.startTime) / duration) * 100;

                return (
                  <div
                    key={part.id || idx}
                    className="absolute top-0 bottom-0 border-r border-dashed border-amber-400/40 flex items-end justify-start pl-1.5 pb-1"
                    style={{ left: `${segLeftPct}%`, width: `${Math.max(1, segWidthPct)}%` }}
                  >
                    <span className="text-[9px] font-mono text-amber-300/90 bg-black/70 px-1 rounded truncate border border-amber-500/20">
                      P{part.partNumber || idx + 1}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Current Playhead Indicator */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_white] z-20 pointer-events-none"
            style={{ left: `${currentPercent}%` }}
          >
            <div className="w-2.5 h-2.5 bg-white -ml-1 rounded-full shadow" />
          </div>
        </div>

        {/* Global Start / End Range Sliders */}
        <div className="relative mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400 font-medium">Video Start Point</span>
              <span className="font-mono text-amber-400">{formatTime(startTime)}</span>
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
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400 font-medium">Video End Point</span>
              <span className="font-mono text-amber-400">{formatTime(endTime)}</span>
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
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
            />
          </div>
        </div>
      </div>

      {/* Auto Split Presets Row */}
      <div className="pt-2 border-t border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-medium text-slate-300">Quick Auto-Split:</span>
          </div>

          <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
            <button
              onClick={() => handleSplitModeChange('duration')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center space-x-1.5 ${
                splitMode === 'duration'
                  ? 'bg-orange-500 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clock className="w-3 h-3" />
              <span>By Length (sec)</span>
            </button>
            <button
              onClick={() => handleSplitModeChange('count')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center space-x-1.5 ${
                splitMode === 'count'
                  ? 'bg-orange-500 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Hash className="w-3 h-3" />
              <span>By Number of Parts</span>
            </button>
          </div>
        </div>

        {splitMode === 'duration' ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-medium text-slate-300">Preset Length:</span>
              <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
                {[15, 30, 60, 90].map((sec) => (
                  <button
                    key={sec}
                    onClick={() => setPresetDuration(sec)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
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
              <span className="text-xs text-slate-400">Custom (sec):</span>
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
                className="w-16 bg-slate-950 border border-slate-800 text-white font-mono text-xs px-2 py-1 rounded-md text-center focus:border-orange-500 focus:outline-none"
              />
              <div className="text-xs text-slate-400 pl-1">
                &rarr; <span className="text-amber-300 font-semibold">{displayPartsList.length} part{displayPartsList.length > 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-3 bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-2.5">
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

            <div className="flex items-center space-x-1.5">
              {[1, 2, 3, 5, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => handleNumPartsChange(n)}
                  className={`px-2 py-1 text-xs rounded-lg border transition-colors cursor-pointer ${
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

      {/* ── MANUAL SECONDS EDITOR FOR EACH PART ── */}
      <div className="pt-2 border-t border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowManualEditor(!showManualEditor)}
            className="flex items-center space-x-2 text-xs font-semibold text-white hover:text-orange-400 cursor-pointer transition-colors"
          >
            <ListOrdered className="w-4 h-4 text-orange-400" />
            <span>Detailed Parts Time Table ({displayPartsList.length} Parts)</span>
            {showManualEditor ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleResetPartsToEqual}
              className="px-2.5 py-1 text-[11px] text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center space-x-1 transition-colors cursor-pointer"
              title="Reset all parts back to equal intervals"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reset to Equal</span>
            </button>

            <button
              onClick={handleAddPart}
              className="px-2.5 py-1 text-[11px] font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg flex items-center space-x-1 transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Add Part</span>
            </button>
          </div>
        </div>

        {showManualEditor && (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {displayPartsList.map((part, index) => (
              <div
                key={part.id || index}
                className="bg-slate-950/80 border border-slate-800/90 hover:border-slate-700 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 transition-colors"
              >
                {/* Part Badge & Seek Preview */}
                <div className="flex items-center space-x-2 min-w-[90px]">
                  <span className="w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-300 font-bold text-xs flex items-center justify-center font-mono">
                    P{part.partNumber || index + 1}
                  </span>
                  <button
                    onClick={() => handleSeekToPart(part.startTime)}
                    className="p-1 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-md transition-colors cursor-pointer"
                    title={`Jump preview to ${formatTime(part.startTime)}`}
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </button>
                </div>

                {/* Editable Start Second */}
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-400">Start (sec):</span>
                  <div className="flex items-center space-x-1">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max={part.endTime || duration}
                      value={part.startTime}
                      onChange={(e) => handlePartTimeChange(index, 'startTime', e.target.value)}
                      className="w-20 bg-slate-900 border border-slate-700 text-white font-mono text-xs px-2 py-1 rounded-lg text-center font-semibold focus:border-orange-500 focus:outline-none"
                    />
                    <span className="text-[10px] font-mono text-slate-500">
                      ({formatTime(part.startTime)})
                    </span>
                  </div>
                </div>

                {/* Editable End Second */}
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-400">End (sec):</span>
                  <div className="flex items-center space-x-1">
                    <input
                      type="number"
                      step="0.5"
                      min={part.startTime || 0}
                      max={duration || 9999}
                      value={part.endTime}
                      onChange={(e) => handlePartTimeChange(index, 'endTime', e.target.value)}
                      className="w-20 bg-slate-900 border border-slate-700 text-white font-mono text-xs px-2 py-1 rounded-lg text-center font-semibold focus:border-orange-500 focus:outline-none"
                    />
                    <span className="text-[10px] font-mono text-slate-500">
                      ({formatTime(part.endTime)})
                    </span>
                  </div>
                </div>

                {/* Duration Badge */}
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-0.5 bg-slate-900 border border-slate-800 text-amber-300 rounded font-mono text-xs">
                    {formatTime(Math.max(0, part.endTime - part.startTime), true)}
                  </span>

                  {displayPartsList.length > 1 && (
                    <button
                      onClick={() => handleDeletePart(index)}
                      className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors cursor-pointer"
                      title="Delete this part"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
