/**
 * BestMomentDetector
 * Multi-factor audio & speech energy analyzer that detects the most engaging,
 * dynamic, and high-energy segments of a video and pushes them directly into the
 * existing processing queue.
 */

import React, { useState, useRef } from 'react';
import {
  Flame, Sparkles, RefreshCw, Play, Plus, Film,
  Clock, CheckCircle2, XCircle, ArrowRight, Zap, Target,
  Layers, ChevronRight, BarChart2, ShieldCheck, Tag
} from 'lucide-react';
import { formatTime } from '../utils/time';
import { detectBestMoments } from '../services/momentDetectionService';

const DURATION_PRESETS = [
  { sec: 15, label: '15s (Reels)' },
  { sec: 30, label: '30s (TikTok / Shorts)' },
  { sec: 45, label: '45s' },
  { sec: 60, label: '60s (Standard)' }
];

export default function BestMomentDetector({
  videoData,
  duration = 0,
  currentTime = 0,
  onCurrentTimeChange,
  onSetTimelineRange,
  onCreateMomentClip,
  captionSettings = {},
  textSettings = {}
}) {
  const [targetDuration, setTargetDuration] = useState(30);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisError, setAnalysisError] = useState(null);
  const [detectedMoments, setDetectedMoments] = useState([]);
  const abortControllerRef = useRef(null);

  const handleAnalyzeMoments = async () => {
    if (!videoData) {
      setAnalysisError('Please upload a video first.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(5);
    setAnalysisError(null);

    abortControllerRef.current = new AbortController();

    try {
      const moments = await detectBestMoments({
        videoSource: videoData.file || videoData.url || videoData,
        targetDuration,
        maxMoments: 5,
        onProgress: (pct) => setAnalysisProgress(pct),
        signal: abortControllerRef.current.signal
      });

      setDetectedMoments(moments);
      if (moments.length === 0) {
        setAnalysisError('No distinct high-energy moments detected. Try a different duration preset.');
      }
    } catch (err) {
      if (err.name !== 'AbortError' && !err.message?.includes('cancelled')) {
        setAnalysisError(err.message || 'Analysis failed. Please try again.');
      }
    } finally {
      setIsAnalyzing(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsAnalyzing(false);
    }
  };

  const handlePreviewMoment = (moment) => {
    if (onCurrentTimeChange) {
      onCurrentTimeChange(moment.startTime);
    }
  };

  const handleApplyTimelineRange = (moment) => {
    if (onSetTimelineRange) {
      onSetTimelineRange(moment.startTime, moment.endTime);
    }
    if (onCurrentTimeChange) {
      onCurrentTimeChange(moment.startTime);
    }
  };

  const handleCreateClipFromMoment = (moment) => {
    if (onCreateMomentClip) {
      onCreateMomentClip(moment);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ── 1. HEADER ───────────────────────────────────────────── */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400">
            <Flame className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-white tracking-tight flex items-center space-x-1.5">
              <span>Best Moment Detector</span>
              <span className="px-1.5 py-0.2 bg-orange-500/20 text-orange-300 text-[9px] rounded font-mono font-bold">
                Audio Energy AI
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Identifies high-energy speech, punchlines, and dynamic segments locally
            </p>
          </div>
        </div>
      </div>

      {/* ── 2. DETECTION CONTROLS ───────────────────────────────── */}
      <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-orange-500/30 rounded-2xl p-4 space-y-3.5 shadow-lg">
        {/* Target Duration Selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-white flex items-center space-x-1.5">
            <Clock className="w-3.5 h-3.5 text-orange-400" />
            <span>Target Moment Duration:</span>
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DURATION_PRESETS.map((p) => (
              <button
                key={p.sec}
                type="button"
                onClick={() => setTargetDuration(p.sec)}
                disabled={isAnalyzing}
                className={`py-2 px-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer touch-manipulation ${
                  targetDuration === p.sec
                    ? 'bg-orange-500/20 border-orange-500 text-white font-bold ring-1 ring-orange-500/50 shadow-sm'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action Button & Real Progress Bar */}
        <div className="space-y-2 pt-1">
          {!isAnalyzing ? (
            <button
              onClick={handleAnalyzeMoments}
              disabled={!videoData}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 hover:from-orange-600 hover:to-amber-600 active:scale-98 disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-orange-500/20 flex items-center justify-center space-x-2 transition-all cursor-pointer touch-manipulation"
            >
              <Flame className="w-4 h-4 text-slate-950" />
              <span>
                {detectedMoments.length > 0 ? 'Re-Analyze Best Moments' : 'Detect Best Moments'}
              </span>
            </button>
          ) : (
            <div className="space-y-2 bg-slate-950 border border-orange-500/40 rounded-xl p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-amber-300 font-semibold flex items-center space-x-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Analyzing audio energy &amp; speech dynamics ({analysisProgress}%)...</span>
                </span>
                <button
                  onClick={handleCancelAnalysis}
                  className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-lg text-[11px] font-semibold cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 via-amber-400 to-yellow-300 transition-all duration-300"
                  style={{ width: `${analysisProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {analysisError && (
          <div className="flex items-start space-x-2 bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs rounded-xl p-2.5 animate-fadeIn">
            <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{analysisError}</span>
          </div>
        )}
      </div>

      {/* ── 3. DETECTED BEST MOMENTS RESULTS ─────────────────── */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <BarChart2 className="w-4 h-4 text-orange-400" />
            <span className="text-xs font-bold text-white">
              Ranked Moments ({detectedMoments.length})
            </span>
          </div>
          {detectedMoments.length > 0 && (
            <span className="text-[10px] text-slate-500 font-mono">
              Target: {targetDuration}s
            </span>
          )}
        </div>

        {detectedMoments.length === 0 ? (
          <div className="text-center py-6 bg-slate-900/50 rounded-xl border border-slate-800/80">
            <Flame className="w-6 h-6 text-slate-600 mx-auto mb-1.5" />
            <p className="text-xs font-semibold text-slate-400">No moments analyzed yet</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Click &quot;Detect Best Moments&quot; above to scan for high-energy video segments
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {detectedMoments.map((moment) => (
              <div
                key={moment.id}
                className="bg-slate-900/90 border border-slate-800 hover:border-orange-500/40 rounded-xl p-3 space-y-2.5 transition-all shadow-sm"
              >
                {/* Moment Header Row: Rank, Score & Time */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-6 h-6 rounded-lg bg-orange-500/20 text-orange-300 border border-orange-500/40 font-mono font-bold text-xs flex items-center justify-center">
                      #{moment.rank}
                    </span>
                    <span className="font-mono font-bold text-xs text-white">
                      {formatTime(moment.startTime)} &rarr; {formatTime(moment.endTime)}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400 font-semibold">
                      ({moment.duration}s)
                    </span>
                  </div>

                  {/* Highlight Score Badge */}
                  <div className="flex items-center space-x-1.5">
                    <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 text-amber-300 font-mono font-bold text-[11px] flex items-center space-x-1 shadow-sm">
                      <Sparkles className="w-3 h-3 text-yellow-400" />
                      <span>Highlight Score: {moment.highlightScore}</span>
                    </span>
                  </div>
                </div>

                {/* Energy & Topic Tags */}
                <div className="flex items-center space-x-1.5 flex-wrap gap-1">
                  {moment.tags.map((tag, tIdx) => (
                    <span
                      key={tIdx}
                      className="px-2 py-0.5 rounded-md bg-slate-950 text-slate-300 text-[10px] font-medium border border-slate-800"
                    >
                      {tag}
                    </span>
                  ))}
                  {captionSettings.enabled && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 text-[10px] font-medium border border-emerald-500/30 flex items-center space-x-1">
                      <span>💬 Captions Active</span>
                    </span>
                  )}
                </div>

                {/* Action Buttons: Preview, Set Range, Create Clip */}
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-950">
                  {/* Preview */}
                  <button
                    onClick={() => handlePreviewMoment(moment)}
                    className="py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1 transition-colors cursor-pointer touch-manipulation"
                    title="Play this moment in preview player"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Preview</span>
                  </button>

                  {/* Set Timeline Range */}
                  <button
                    onClick={() => handleApplyTimelineRange(moment)}
                    className="py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1 transition-colors cursor-pointer touch-manipulation"
                    title="Set timeline start and end range to this moment"
                  >
                    <Target className="w-3 h-3 text-amber-400" />
                    <span>Set Range</span>
                  </button>

                  {/* Create Clip (Pushes directly to existing processing queue) */}
                  <button
                    onClick={() => handleCreateClipFromMoment(moment)}
                    className="py-1.5 px-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center space-x-1 transition-colors cursor-pointer shadow-md touch-manipulation"
                    title="Create and queue this moment into the batch export queue"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Create Clip</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
