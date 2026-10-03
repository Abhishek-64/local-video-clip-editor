import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Scissors, Clock, Layers, Hash, Film, ListOrdered, Plus, Trash2,
  Play, RefreshCw, ChevronDown, ChevronUp, Copy, ArrowUp, ArrowDown,
  Target, Edit3, Check, Sparkles, Magnet, ShieldCheck, Zap, RotateCcw,
  Image as ImageIcon
} from 'lucide-react';
import { formatTime, parseTimeToSeconds, splitKeptParts } from '../utils/time';
import { generateTimelineThumbnails } from '../utils/thumbnailGenerator';

function TimelineInner({
  videoUrl = '',
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
  // 'duration' = set seconds per clip, 'count' = set number of parts
  const [splitMode, setSplitMode] = useState('duration');
  const [numParts, setNumParts] = useState(5);
  const [showManualEditor, setShowManualEditor] = useState(false);

  // Preserve Cuts toggle: When true, auto-split only splits KEPT content and preserves deleted/cut sections
  const [preserveCuts, setPreserveCuts] = useState(true);

  // Active playing/previewing part ID
  const [activePreviewPartId, setActivePreviewPartId] = useState(null);

  // Video Filmstrip Thumbnails state
  const [thumbnails, setThumbnails] = useState([]);
  const [isLoadingThumbnails, setIsLoadingThumbnails] = useState(false);

  // Direct Drag-and-Drop State on the Timeline Track
  const [dragState, setDragState] = useState(null);
  const trackRef = useRef(null);
  const playheadRafRef = useRef(null);

  // ── Stable refs for drag handler — avoids re-attaching listeners on every tick ──
  const durationRef = useRef(duration);
  const startTimeRef = useRef(startTime);
  const endTimeRef = useRef(endTime);
  const customPartsRef = useRef(customParts);
  const splitModeRef = useRef('duration');
  const numPartsRef = useRef(5);
  const clipDurationRef = useRef(clipDuration);
  const onStartChangeRef = useRef(onStartChange);
  const onEndChangeRef = useRef(onEndChange);
  const onCurrentTimeChangeRef = useRef(onCurrentTimeChange);
  const onCustomPartsChangeRef = useRef(onCustomPartsChange);

  // Keep refs in sync with latest props/state (no re-render cost)
  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => { startTimeRef.current = startTime; }, [startTime]);
  useEffect(() => { endTimeRef.current = endTime; }, [endTime]);
  useEffect(() => { customPartsRef.current = customParts; }, [customParts]);
  useEffect(() => { clipDurationRef.current = clipDuration; }, [clipDuration]);
  useEffect(() => { onStartChangeRef.current = onStartChange; }, [onStartChange]);
  useEffect(() => { onEndChangeRef.current = onEndChange; }, [onEndChange]);
  useEffect(() => { onCurrentTimeChangeRef.current = onCurrentTimeChange; }, [onCurrentTimeChange]);
  useEffect(() => { onCustomPartsChangeRef.current = onCustomPartsChange; }, [onCustomPartsChange]);

  // ── Extract video frame thumbnails for filmstrip in timeline ──
  useEffect(() => {
    if (!videoUrl || !duration || duration <= 0) {
      setThumbnails([]);
      return;
    }

    const abortController = new AbortController();
    setIsLoadingThumbnails(true);

    generateTimelineThumbnails(videoUrl, duration, {
      count: 12,
      signal: abortController.signal,
      onProgress: (thumbs) => {
        setThumbnails(thumbs);
      }
    })
      .then((finalThumbs) => {
        if (!abortController.signal.aborted) {
          setThumbnails(finalThumbs);
          setIsLoadingThumbnails(false);
        }
      })
      .catch(() => {
        if (!abortController.signal.aborted) {
          setIsLoadingThumbnails(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [videoUrl, duration]);

  const selectedDuration = Math.max(0, endTime - startTime);

  // Derive active kept and cut counts
  const keptParts = useMemo(() => (customParts || []).filter(p => !p.isDeleted), [customParts]);
  const deletedParts = useMemo(() => (customParts || []).filter(p => p.isDeleted), [customParts]);

  // Pointer Down handler for drag handles & playhead
  const handlePointerDown = useCallback((e, type, index = 0) => {
    e.stopPropagation();
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    setDragState({ type, index, startX: clientX, isDragging: true });
  }, []);

  // Helper for magnetic snap (within 0.35s) — uses ref to avoid stale closures
  const applyMagneticSnapRef = useRef((targetTime, excludeIndex = -1) => {
    const parts = customPartsRef.current;
    if (!parts || parts.length === 0) return targetTime;
    const SNAP_THRESHOLD = 0.35;
    for (let i = 0; i < parts.length; i++) {
      if (i === excludeIndex) continue;
      const p = parts[i];
      if (Math.abs(targetTime - p.startTime) <= SNAP_THRESHOLD) return p.startTime;
      if (Math.abs(targetTime - p.endTime) <= SNAP_THRESHOLD) return p.endTime;
    }
    return targetTime;
  });

  // Drag Event Listener for Mouse & Mobile Touch.
  // Dependency array is ONLY [dragState] — all other values are accessed via refs
  // so the listeners are ONLY attached/detached when dragging actually starts or stops,
  // NOT on every currentTime or customParts update during playback.
  useEffect(() => {
    if (!dragState?.isDragging) return;

    const handlePointerMove = (e) => {
      if (!trackRef.current) return;
      const dur = durationRef.current;
      if (!dur) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const rect = trackRef.current.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      let targetTime = Math.round(pos * dur * 10) / 10;

      if (dragState.type === 'start') {
        targetTime = applyMagneticSnapRef.current(targetTime);
        if (targetTime < endTimeRef.current - 0.5) {
          onStartChangeRef.current?.(targetTime);
        }
      } else if (dragState.type === 'end') {
        targetTime = applyMagneticSnapRef.current(targetTime);
        if (targetTime > startTimeRef.current + 0.5) {
          onEndChangeRef.current?.(targetTime);
        }
      } else if (dragState.type === 'playhead') {
        targetTime = applyMagneticSnapRef.current(targetTime);
        targetTime = Math.max(0, Math.min(dur, targetTime));
        if (playheadRafRef.current) {
          cancelAnimationFrame(playheadRafRef.current);
        }
        playheadRafRef.current = requestAnimationFrame(() => {
          onCurrentTimeChangeRef.current?.(targetTime);
        });
      } else if (dragState.type === 'split-boundary') {
        const currentList = customPartsRef.current && customPartsRef.current.length > 0
          ? [...customPartsRef.current]
          : [];

        const idx = dragState.index;
        if (idx >= 0 && idx < currentList.length - 1) {
          const leftPart = currentList[idx];
          const rightPart = currentList[idx + 1];
          const minTime = leftPart.startTime + 0.5;
          const maxTime = rightPart.endTime - 0.5;
          const clamped = Math.max(minTime, Math.min(maxTime, targetTime));

          const updated = [...currentList];
          updated[idx] = {
            ...leftPart,
            endTime: clamped,
            duration: Math.max(0, Math.round((clamped - leftPart.startTime) * 10) / 10)
          };
          updated[idx + 1] = {
            ...rightPart,
            startTime: clamped,
            duration: Math.max(0, Math.round((rightPart.endTime - clamped) * 10) / 10)
          };
          onCustomPartsChangeRef.current?.(updated);
        }
      }
    };

    const handlePointerUp = () => {
      if (playheadRafRef.current) {
        cancelAnimationFrame(playheadRafRef.current);
        playheadRafRef.current = null;
      }
      setDragState(null);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);

    return () => {
      if (playheadRafRef.current) {
        cancelAnimationFrame(playheadRafRef.current);
        playheadRafRef.current = null;
      }
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  // IMPORTANT: dep array is intentionally [dragState] only.
  // All other values (duration, startTime, endTime, customParts) are accessed via
  // stable refs to prevent 60fps listener reattachment during video playback.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState]);

  // ── Smart Auto-Split Algorithm (Preserves Deleted/Cut Content) ──────────────
  const generateSmartPartsList = (mode, partsCount, segSec, shouldPreserve = preserveCuts) => {
    if (selectedDuration <= 0) return [];
    return splitKeptParts(
      shouldPreserve ? customParts : [],
      duration,
      mode,
      mode === 'count' ? partsCount : segSec,
      { startTime, endTime }
    );
  };

  // Sync parts list when timeline range changes or on initial mount
  useEffect(() => {
    if (onCustomPartsChange && (!customParts || customParts.length === 0)) {
      const initialParts = generateSmartPartsList(splitMode, numParts, clipDuration, false);
      onCustomPartsChange(initialParts);
    }
  }, [startTime, endTime]);

  // ── Split Mode Change ───────────────────────────────────────────────────────
  const handleSplitModeChange = (mode) => {
    setSplitMode(mode);
    const newParts = generateSmartPartsList(mode, numParts, clipDuration, preserveCuts);
    if (onCustomPartsChange) onCustomPartsChange(newParts);

    if (mode === 'count') {
      const computed = selectedDuration > 0 ? selectedDuration / Math.max(1, numParts) : clipDuration;
      onClipDurationChange(Math.max(1, Math.round(computed)));
    }
  };

  const handleNumPartsChange = (val) => {
    const parts = Math.max(1, Math.min(200, parseInt(val) || 1));
    setNumParts(parts);
    if (splitMode === 'count') {
      const computed = selectedDuration > 0 ? selectedDuration / parts : clipDuration;
      onClipDurationChange(Math.max(1, Math.round(computed)));
      const newParts = generateSmartPartsList('count', parts, computed, preserveCuts);
      if (onCustomPartsChange) onCustomPartsChange(newParts);
    }
  };

  const setPresetDuration = (secs) => {
    setSplitMode('duration');
    onClipDurationChange(secs);
    const newParts = generateSmartPartsList('duration', numParts, secs, preserveCuts);
    if (onCustomPartsChange) onCustomPartsChange(newParts);
  };

  // Full Video Reset (Clean single clip)
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
          duration: duration || 100,
          isDeleted: false
        }
      ]);
    }
  };

  // 1-Click Fresh Clean Split (Resets cuts and evenly subdivides entire video)
  const handleFreshFullSplit = () => {
    const fresh = generateSmartPartsList(splitMode, numParts, clipDuration, false);
    if (onCustomPartsChange) onCustomPartsChange(fresh);
  };

  // ── Renumber Active Kept Clips (1..N) ───────────────────────────────────────
  const handleRenumberActiveClips = () => {
    if (!customParts || customParts.length === 0) return;
    let activeCounter = 1;
    const renumbered = customParts.map((p) => {
      if (p.isDeleted) return p;
      const updated = { ...p, partNumber: activeCounter };
      activeCounter++;
      return updated;
    });
    if (onCustomPartsChange) onCustomPartsChange(renumbered);
  };

  // ── Manual Part Times & Cuts Editing ────────────────────────────────────────

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

    const activeCount = currentList.filter(p => !p.isDeleted).length;

    const newPart = {
      id: `part-${Date.now()}`,
      partNumber: activeCount + 1,
      title: '',
      startTime: Math.round(newStart * 10) / 10,
      endTime: newEnd,
      duration: Math.max(0, Math.round((newEnd - newStart) * 10) / 10),
      isDeleted: false
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

    // Re-number active clips
    let activeCounter = 1;
    const renumbered = currentList.map((p) => {
      if (p.isDeleted) return p;
      const u = { ...p, partNumber: activeCounter };
      activeCounter++;
      return u;
    });
    onCustomPartsChange(renumbered);
  };

  const handleSplitAtCurrentTime = () => {
    if (!onCustomPartsChange || !customParts || customParts.length === 0) return;
    const playhead = Math.round((currentTime || 0) * 10) / 10;

    // Find which part currently encloses the playhead
    const targetIdx = customParts.findIndex(p => playhead > p.startTime + 0.1 && playhead < p.endTime - 0.1);
    if (targetIdx === -1) return;

    const originalPart = customParts[targetIdx];
    const originalEnd = originalPart.endTime;

    const updatedFirstPart = {
      ...originalPart,
      endTime: playhead,
      duration: Math.max(0, Math.round((playhead - originalPart.startTime) * 10) / 10)
    };

    const newSecondPart = {
      id: `part-split-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      partNumber: targetIdx + 2,
      title: originalPart.title ? `${originalPart.title} (Part 2)` : '',
      startTime: playhead,
      endTime: originalEnd,
      duration: Math.max(0, Math.round((originalEnd - playhead) * 10) / 10),
      isDeleted: Boolean(originalPart.isDeleted)
    };

    const nextList = [...customParts];
    nextList[targetIdx] = updatedFirstPart;
    nextList.splice(targetIdx + 1, 0, newSecondPart);

    // Sequentially renumber active parts
    let activeCounter = 1;
    const renumbered = nextList.map((p) => {
      if (p.isDeleted) return p;
      const u = { ...p, partNumber: activeCounter };
      activeCounter++;
      return u;
    });
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

    // Re-number active parts
    let activeCounter = 1;
    const renumbered = list.map((p) => {
      if (p.isDeleted) return p;
      const u = { ...p, partNumber: activeCounter };
      activeCounter++;
      return u;
    });
    onCustomPartsChange(renumbered);
  };

  const handleDeletePart = (index) => {
    if (!onCustomPartsChange || !customParts || customParts.length <= 1) return;
    const filtered = customParts.filter((_, idx) => idx !== index);

    // Re-number active parts so the sequence starts at Part 1
    let activeCounter = 1;
    const renumbered = filtered.map((p) => {
      if (p.isDeleted) return p;
      const u = { ...p, partNumber: activeCounter };
      activeCounter++;
      return u;
    });
    onCustomPartsChange(renumbered);
  };

  const handleToggleCutPart = (index) => {
    if (!onCustomPartsChange || !customParts) return;
    const updated = customParts.map((p, idx) =>
      idx === index ? { ...p, isDeleted: !p.isDeleted } : p
    );

    // Re-number active parts so the first kept part is always Part 1
    let activeCounter = 1;
    const renumbered = updated.map((p) => {
      if (p.isDeleted) return p;
      const u = { ...p, partNumber: activeCounter };
      activeCounter++;
      return u;
    });
    onCustomPartsChange(renumbered);
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
    : generateSmartPartsList(splitMode, numParts, clipDuration, false);

  // Total runtime of all active kept clips
  const totalKeptClipsRuntime = displayPartsList
    .filter(p => !p.isDeleted)
    .reduce((acc, p) => acc + (p.duration || Math.max(0, p.endTime - p.startTime)), 0);

  // Check if current playhead can be split
  const canSplitAtPlayhead = displayPartsList.some(
    p => currentTime > p.startTime + 0.2 && currentTime < p.endTime - 0.2
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-5 shadow-xl space-y-3.5 selection:bg-orange-500/30">
      {/* ── 1. Top Header Info & Quick Pro NLE Action Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
        <div className="flex items-center space-x-2 flex-wrap gap-1">
          <div className="w-6 h-6 rounded-lg bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400">
            <Scissors className="w-3.5 h-3.5" />
          </div>
          <h3 className="font-semibold text-xs sm:text-sm text-white">Timeline Editor</h3>

          {/* Active Export Runtime Pill */}
          <span className="px-2 py-0.5 bg-orange-500/10 border border-orange-500/30 text-orange-300 rounded-md font-mono text-[11px] font-bold">
            {formatTime(totalKeptClipsRuntime, true)}
          </span>

          <span className="text-[11px] text-slate-400 font-medium">
            ({keptParts.length} active clip{keptParts.length !== 1 ? 's' : ''}
            {deletedParts.length > 0 ? `, ${deletedParts.length} cut` : ''})
          </span>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="flex items-center space-x-1.5 text-xs flex-wrap gap-1">
          {/* Quick Split at Playhead */}
          <button
            onClick={handleSplitAtCurrentTime}
            disabled={!canSplitAtPlayhead}
            className="px-2.5 py-1.5 bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 disabled:opacity-40 disabled:pointer-events-none active:scale-95 border border-amber-500/40 text-amber-300 rounded-xl flex items-center space-x-1.5 font-bold transition-all cursor-pointer touch-manipulation text-xs shadow-sm"
            title={`Split video at playhead (Hotkey: S)`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Split ({formatTime(currentTime)})</span>
          </button>

          {/* Quick Cut/Keep Toggle at Playhead */}
          <button
            onClick={() => {
              if (!customParts || customParts.length === 0) return;
              const targetIdx = customParts.findIndex(p => currentTime >= p.startTime && currentTime <= p.endTime);
              if (targetIdx !== -1) {
                handleToggleCutPart(targetIdx);
              }
            }}
            className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 border border-rose-500/30 text-rose-300 rounded-xl flex items-center space-x-1 font-semibold transition-all cursor-pointer touch-manipulation text-xs"
            title="Toggle Cut/Keep under playhead (Hotkey: Delete or Backspace)"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Cut / Keep</span>
          </button>

          {/* Renumber Active Clips 1..N */}
          <button
            onClick={handleRenumberActiveClips}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-slate-300 hover:text-white rounded-xl flex items-center space-x-1 transition-all cursor-pointer touch-manipulation text-xs"
            title="Cleanly renumber all active clips starting from Part 1"
          >
            <Hash className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Renumber 1..N</span>
            <span className="sm:hidden">1..N</span>
          </button>

          {/* Full Video Reset */}
          <button
            onClick={handleFullVideoConvert}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-slate-400 hover:text-slate-200 rounded-xl flex items-center space-x-1 transition-all cursor-pointer touch-manipulation text-xs"
            title="Select entire video as 1 complete clip"
          >
            <Film className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Full</span>
          </button>
        </div>
      </div>

      {/* ── 2. The Main Interactive Multi-Segment Range Scrubber Track ── */}
      <div className="relative bg-slate-950 rounded-xl p-2.5 sm:p-3 border border-slate-800 space-y-2">
        {/* Horizontally Scrollable Track Wrapper on Mobile Screens (< sm) */}
        <div className="overflow-hidden pb-1">
          <div
            ref={trackRef}
            className="relative h-14 sm:h-16 w-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800 cursor-pointer select-none shadow-inner group/track"
            onMouseDown={(e) => {
              if (!duration || !onCurrentTimeChange || dragState?.isDragging) return;
              // If click happened on the track itself (not on a split handle or range handle)
              const rect = e.currentTarget.getBoundingClientRect();
              const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              const rawTime = pos * duration;
              const snapped = applyMagneticSnap(rawTime);
              onCurrentTimeChange(snapped);
              setDragState({ type: 'playhead', startX: e.clientX, isDragging: true });
            }}
            onTouchStart={(e) => {
              if (!duration || !onCurrentTimeChange || dragState?.isDragging) return;
              const touch = e.touches[0];
              const rect = e.currentTarget.getBoundingClientRect();
              const pos = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
              const rawTime = pos * duration;
              const snapped = applyMagneticSnap(rawTime);
              onCurrentTimeChange(snapped);
              setDragState({ type: 'playhead', startX: touch.clientX, isDragging: true });
            }}
          >
            {/* ── Filmstrip Video Frame Thumbnails Track ── */}
            {thumbnails.length > 0 ? (
              <div className="absolute inset-0 flex overflow-hidden pointer-events-none select-none z-0">
                {thumbnails.map((thumb, idx) => (
                  <div
                    key={idx}
                    className="h-full flex-1 relative border-r border-slate-900/60 overflow-hidden bg-slate-950"
                  >
                    <img
                      src={thumb.dataUrl}
                      alt=""
                      className="w-full h-full object-cover select-none pointer-events-none filter brightness-95 contrast-105"
                      loading="eager"
                    />
                  </div>
                ))}
              </div>
            ) : isLoadingThumbnails ? (
              /* Loading filmstrip placeholder */
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0 bg-slate-950/80">
                <div className="flex items-center space-x-1.5 text-slate-400 text-xs font-mono">
                  <Film className="w-3.5 h-3.5 animate-pulse text-orange-400" />
                  <span>Loading video filmstrip...</span>
                </div>
              </div>
            ) : (
              /* Default subtle filmstrip pattern */
              <div className="absolute inset-0 opacity-15 bg-[repeating-linear-gradient(90deg,transparent,transparent_20px,rgba(255,255,255,0.06)_20px,rgba(255,255,255,0.06)_40px)] pointer-events-none select-none z-0" />
            )}

            {/* Cinematic dark scrim over filmstrip for high-contrast legible labels */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/20 to-black/70 pointer-events-none z-[1]" />

            {/* Active Global Range Highlight */}
            <div
              className="absolute top-0 bottom-0 bg-amber-500/10 border-y border-amber-500/40 transition-all pointer-events-none z-[2]"
              style={{
                left: `${startPercent}%`,
                width: `${Math.max(0, endPercent - startPercent)}%`
              }}
            />

            {/* Individual Part Markers & Visual Segments */}
            {duration > 0 && displayPartsList.length > 0 && (
              <div className="absolute inset-0 pointer-events-none z-10">
                {displayPartsList.map((part, idx) => {
                  const segLeftPct = (part.startTime / duration) * 100;
                  const segWidthPct = ((part.endTime - part.startTime) / duration) * 100;
                  const isSelected = activePreviewPartId === part.id;
                  const isCut = Boolean(part.isDeleted);

                  return (
                    <div
                      key={part.id || idx}
                      className={`absolute top-0 bottom-0 border-r flex flex-col justify-between p-1 transition-all ${
                        isCut
                          ? 'bg-[repeating-linear-gradient(45deg,rgba(225,29,72,0.45),rgba(225,29,72,0.45)_8px,rgba(15,23,42,0.85)_8px,rgba(15,23,42,0.85)_16px)] border-r-2 border-r-rose-500/90 border-dashed border-rose-500/70 shadow-inner'
                          : isSelected
                          ? 'bg-amber-500/30 border-r-2 border-r-amber-400 border-dashed shadow-[inset_0_0_12px_rgba(245,158,11,0.25)]'
                          : idx % 2 === 0
                          ? 'bg-orange-500/15 border-r border-dashed border-amber-400/60 hover:bg-orange-500/25'
                          : 'bg-indigo-500/15 border-r border-dashed border-amber-400/60 hover:bg-indigo-500/25'
                      }`}
                      style={{ left: `${segLeftPct}%`, width: `${Math.max(1, segWidthPct)}%` }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`text-[8px] sm:text-[9px] font-mono font-bold px-1 rounded truncate border backdrop-blur-sm ${
                            isCut
                              ? 'bg-rose-950/95 text-rose-300 border-rose-500/60 line-through'
                              : 'bg-black/85 text-amber-200 border-amber-500/40 shadow-sm'
                          }`}
                        >
                          {isCut ? '✂️ CUT' : `Part ${part.partNumber || idx + 1}`}
                        </span>
                      </div>

                      <span
                        className={`text-[8px] font-mono px-1 rounded truncate self-start border backdrop-blur-sm ${
                          isCut
                            ? 'text-rose-400/90 bg-rose-950/95 border-rose-900/80 line-through'
                            : 'text-slate-200 bg-slate-950/90 border-slate-700/80 shadow-sm font-semibold'
                        }`}
                      >
                        {formatTime(part.duration || (part.endTime - part.startTime) || 0)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Interactive Split Boundary Handles (Drag & Drop boundary between parts) */}
            {duration > 0 &&
              displayPartsList.slice(0, -1).map((part, idx) => {
                const boundaryPct = (part.endTime / duration) * 100;
                const isDraggingThis = dragState?.type === 'split-boundary' && dragState?.index === idx;

                return (
                  <div
                    key={`split-handle-${idx}`}
                    onMouseDown={(e) => handlePointerDown(e, 'split-boundary', idx)}
                    onTouchStart={(e) => handlePointerDown(e, 'split-boundary', idx)}
                    style={{ left: `${boundaryPct}%` }}
                    className={`absolute top-0 bottom-0 w-6 -ml-3 z-30 flex items-center justify-center cursor-ew-resize group touch-manipulation ${
                      isDraggingThis ? 'scale-110' : ''
                    }`}
                    title={`Drag to adjust split point (${formatTime(part.endTime)})`}
                  >
                    <div
                      className={`w-1.5 h-full rounded-full transition-all flex flex-col items-center justify-center ${
                        isDraggingThis
                          ? 'bg-amber-400 shadow-[0_0_10px_#f59e0b]'
                          : 'bg-amber-400/60 group-hover:bg-amber-400 group-hover:shadow-[0_0_8px_#f59e0b]'
                      }`}
                    >
                      <div className="w-2.5 h-4 bg-amber-500 text-[8px] text-slate-950 font-black rounded-sm flex items-center justify-center shadow">
                        &bull;
                      </div>
                    </div>

                    {/* Tooltip on drag/hover */}
                    <div
                      className={`absolute -top-7 px-1.5 py-0.5 bg-slate-900 border border-amber-500/60 text-amber-300 font-mono text-[9px] font-bold rounded shadow-lg pointer-events-none transition-opacity whitespace-nowrap ${
                        isDraggingThis ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      ✂️ P{idx + 1}|P{idx + 2}: {formatTime(part.endTime)}
                    </div>
                  </div>
                );
              })}

            {/* Left Start Range Drag Handle (◄) */}
            <div
              onMouseDown={(e) => handlePointerDown(e, 'start')}
              onTouchStart={(e) => handlePointerDown(e, 'start')}
              style={{ left: `${startPercent}%` }}
              className={`absolute top-0 bottom-0 w-8 -ml-4 sm:w-6 sm:-ml-3 z-40 flex items-center justify-center cursor-ew-resize group touch-manipulation ${
                dragState?.type === 'start' ? 'scale-110' : ''
              }`}
              title={`Drag to adjust Video Start Point (${formatTime(startTime)})`}
            >
              <div
                className={`w-2.5 sm:w-2 h-full rounded-l-md transition-all flex items-center justify-center ${
                  dragState?.type === 'start'
                    ? 'bg-amber-400 shadow-[0_0_12px_#f59e0b]'
                    : 'bg-amber-500/90 hover:bg-amber-400 hover:shadow-[0_0_8px_#f59e0b]'
                }`}
              >
                <span className="text-[9px] font-black text-slate-950">&lsaquo;</span>
              </div>
              {/* Tooltip */}
              <div
                className={`absolute -top-7 left-0 px-1.5 py-0.5 bg-slate-900 border border-amber-500 text-amber-300 font-mono text-[9px] font-bold rounded shadow-lg pointer-events-none transition-opacity whitespace-nowrap ${
                  dragState?.type === 'start' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
              >
                Start: {formatTime(startTime)}
              </div>
            </div>

            {/* Right End Range Drag Handle (►) */}
            <div
              onMouseDown={(e) => handlePointerDown(e, 'end')}
              onTouchStart={(e) => handlePointerDown(e, 'end')}
              style={{ left: `${endPercent}%` }}
              className={`absolute top-0 bottom-0 w-8 -ml-4 sm:w-6 sm:-ml-3 z-40 flex items-center justify-center cursor-ew-resize group touch-manipulation ${
                dragState?.type === 'end' ? 'scale-110' : ''
              }`}
              title={`Drag to adjust Video End Point (${formatTime(endTime)})`}
            >
              <div
                className={`w-2.5 sm:w-2 h-full rounded-r-md transition-all flex items-center justify-center ${
                  dragState?.type === 'end'
                    ? 'bg-amber-400 shadow-[0_0_12px_#f59e0b]'
                    : 'bg-amber-500/90 hover:bg-amber-400 hover:shadow-[0_0_8px_#f59e0b]'
                }`}
              >
                <span className="text-[9px] font-black text-slate-950">&rsaquo;</span>
              </div>
              {/* Tooltip */}
              <div
                className={`absolute -top-7 right-0 px-1.5 py-0.5 bg-slate-900 border border-amber-500 text-amber-300 font-mono text-[9px] font-bold rounded shadow-lg pointer-events-none transition-opacity whitespace-nowrap ${
                  dragState?.type === 'end' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
              >
                End: {formatTime(endTime)}
              </div>
            </div>

            {/* Current Playhead Indicator with Interactive Drag Handle */}
            <div
              className="absolute top-0 bottom-0 z-50 pointer-events-auto cursor-ew-resize group/playhead -ml-2 w-4"
              style={{ left: `${currentPercent}%` }}
              onMouseDown={(e) => handlePointerDown(e, 'playhead')}
              onTouchStart={(e) => handlePointerDown(e, 'playhead')}
              title={`Playhead: ${formatTime(currentTime)} (Click & drag to scrub)`}
            >
              {/* Playhead vertical line with bright glow */}
              <div className="absolute top-0 bottom-0 left-1/2 -ml-[1px] w-[2px] bg-white shadow-[0_0_10px_rgba(255,255,255,0.95)] transition-colors group-hover/playhead:bg-amber-300 pointer-events-none" />

              {/* Tooltip when dragging playhead */}
              <div
                className={`absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-slate-900 border border-orange-500/80 text-orange-300 font-mono text-[9px] font-bold rounded shadow-xl pointer-events-none transition-opacity whitespace-nowrap ${
                  dragState?.type === 'playhead' ? 'opacity-100 scale-105' : 'opacity-0 group-hover/playhead:opacity-100'
                }`}
              >
                {formatTime(currentTime)}
              </div>
            </div>
          </div>
        </div>

        {/* Range Information & Direct Drag Instructions */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1.5 px-0.5 flex-wrap gap-2">
          <div className="flex items-center space-x-1.5">
            <span>Range:</span>
            <strong className="text-amber-400 font-mono font-bold">{formatTime(startTime)}</strong>
            <span>&rarr;</span>
            <strong className="text-amber-400 font-mono font-bold">{formatTime(endTime)}</strong>
            <span className="text-slate-500 font-mono">({formatTime(selectedDuration)})</span>
          </div>

          <span className="text-[10px] text-slate-500 hidden sm:inline">
            Drag handles &lsaquo; / &rsaquo; or split boundary lines ✂️ to adjust timing
          </span>
        </div>
      </div>

      {/* ── 3. Smart Auto Split Presets & Cut-Preservation Controls ── */}
      <div className="pt-2 border-t border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-orange-400" />
            <span className="text-xs font-semibold text-slate-200">Auto Split Engine:</span>

            {/* Smart Cut Preservation Badge / Toggle */}
            <button
              onClick={() => {
                const next = !preserveCuts;
                setPreserveCuts(next);
                const updated = generateSmartPartsList(splitMode, numParts, clipDuration, next);
                if (onCustomPartsChange) onCustomPartsChange(updated);
              }}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer flex items-center space-x-1 ${
                preserveCuts
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
              title="When enabled, auto-split preserves your deleted/cut sections and only splits kept content"
            >
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>{preserveCuts ? 'Preserve Cuts (Active)' : 'Ignore Cuts'}</span>
            </button>
          </div>

          {/* Mode Switch Pills */}
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

        {/* Dynamic Preset Bar */}
        {splitMode === 'duration' ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2 flex-wrap gap-1.5">
              <span className="text-xs font-medium text-slate-300">Presets:</span>
              <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
                {[
                  { sec: 15, label: '15s (Reels)' },
                  { sec: 30, label: '30s (TikTok)' },
                  { sec: 60, label: '60s (Shorts)' },
                  { sec: 90, label: '90s' }
                ].map((item) => (
                  <button
                    key={item.sec}
                    onClick={() => setPresetDuration(item.sec)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer touch-manipulation ${
                      clipDuration === item.sec
                        ? 'bg-orange-500 text-white font-semibold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-400">Custom (s):</span>
              <input
                type="number"
                min="5"
                max="3600"
                value={clipDuration}
                onChange={(e) => {
                  setSplitMode('duration');
                  const val = Math.max(5, parseInt(e.target.value) || 5);
                  onClipDurationChange(val);
                  const fresh = generateSmartPartsList('duration', numParts, val, preserveCuts);
                  if (onCustomPartsChange) onCustomPartsChange(fresh);
                }}
                className="w-16 bg-slate-950 border border-slate-800 text-white font-mono text-xs px-2 py-1.5 rounded-lg text-center focus:border-orange-500 focus:outline-none"
              />
              <div className="text-xs text-slate-400 pl-1">
                &rarr; <span className="text-amber-300 font-semibold">{keptParts.length} active clip{keptParts.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-3 bg-slate-950/70 border border-slate-800 rounded-xl px-3.5 py-1.5">
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
                  {n === 1 ? '1 (Full)' : `${n} Parts`}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── 4. MANUAL INDIVIDUAL CLIPS TIME TABLE & RENAMING ── */}
      <div className="pt-3 border-t border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={() => setShowManualEditor(!showManualEditor)}
            className="flex items-center space-x-1.5 text-xs font-semibold text-white hover:text-orange-400 cursor-pointer transition-colors touch-manipulation"
          >
            <ListOrdered className="w-4 h-4 text-orange-400" />
            <span>Individual Clip Timings ({displayPartsList.length} total • {keptParts.length} active)</span>
            {showManualEditor ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleFreshFullSplit}
              className="px-2.5 py-1 text-[11px] text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center space-x-1 transition-colors cursor-pointer touch-manipulation"
              title="Fresh clean split across entire range (clears custom cuts)"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Clean Re-Split</span>
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
            {displayPartsList.map((part, index) => {
              const isCut = Boolean(part.isDeleted);
              return (
                <div
                  key={part.id || index}
                  className={`border rounded-2xl p-3 sm:p-3.5 space-y-2.5 transition-all ${
                    isCut
                      ? 'bg-rose-950/20 border-rose-500/30 opacity-80'
                      : activePreviewPartId === part.id
                      ? 'border-orange-500/70 shadow-lg shadow-orange-500/5 bg-slate-950'
                      : 'border-slate-800/90 hover:border-slate-700 bg-slate-950/80'
                  }`}
                >
                  {/* Part Header Row */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                      {/* Part Badge with Export Sequencing */}
                      <span
                        className={`px-2 py-1 rounded-xl font-bold text-xs flex items-center justify-center font-mono shrink-0 border ${
                          isCut
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-300 line-through'
                            : 'bg-orange-500/10 border-orange-500/30 text-orange-300'
                        }`}
                      >
                        {isCut ? 'CUT' : `Part ${part.partNumber || index + 1}`}
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

                      <span
                        className={`px-2 py-0.5 rounded-md font-mono text-[9px] font-bold border ${
                          isCut
                            ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        }`}
                      >
                        {isCut ? 'EXCLUDED' : 'EXPORT'}
                      </span>
                    </div>

                    {/* Actions right */}
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

                      {/* Cut / Keep Toggle */}
                      <button
                        onClick={() => handleToggleCutPart(index)}
                        className={`px-2 py-1 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer touch-manipulation ${
                          isCut
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
                            : 'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20'
                        }`}
                        title={isCut ? 'Restore clip to export' : 'Cut out and exclude this clip from exports'}
                      >
                        {isCut ? 'Restore' : 'Cut'}
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
                          title="Delete this clip permanently"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Manual Timing Row */}
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(TimelineInner, (prev, next) => {
  if (prev.videoUrl !== next.videoUrl) return false;
  if (prev.duration !== next.duration) return false;
  if (prev.startTime !== next.startTime) return false;
  if (prev.endTime !== next.endTime) return false;
  if (prev.clipDuration !== next.clipDuration) return false;
  if (prev.movieName !== next.movieName) return false;
  if (prev.customParts !== next.customParts) return false;
  // Only re-render for currentTime when difference is significant (≥ 0.08s) or near boundaries
  if (Math.abs(prev.currentTime - next.currentTime) >= 0.08) return false;
  return true;
});
