import React, { useState, useEffect } from 'react';
import {
  PlayCircle, Download, CheckCircle2, Clock, XCircle, AlertCircle, Trash2,
  StopCircle, RefreshCw, Hash, Sliders, Youtube, ExternalLink, Upload,
  Calendar, RotateCcw, Sparkles, Send, Check, ChevronDown, ChevronUp, Edit3,
  Globe, Lock, ShieldCheck, Zap, Share2, Instagram,
  CheckSquare, Square, MinusSquare
} from 'lucide-react';
import { formatTime } from '../utils/time';
import {
  formatScheduledDateTime,
  formatRelativeOffset,
  toDateTimeLocalString,
  formatIntervalLabel
} from '../utils/scheduler';

export default function ProcessingQueue({
  queue,
  onGenerateQueue,
  onCancelJob,
  onClearQueue,
  onDeleteSelectedJobs,
  onRemoveClip,
  onPreviewClip,
  onDownloadClip,
  isProcessing,
  totalPossibleParts = 1,
  pipelineStartTime,
  // YouTube upload state
  uploadJobs = {},
  onUploadClip,
  onCancelUpload,
  onRetryUpload,
  isConnected = false,
  ytAccount = null,
  ytSettings = {},
  isAuthenticated = false,
  onOpenAuth,
  connectYouTube,
  // Facebook upload state
  isFbConnected = false,
  fbAccount = null,
  fbSettings = {},
  onPublishFbClip,
  isPublishingFb = false,
  fbPublishProgress = 0,
  fbPublishStage = '',
  fbPublishingClipId = null,
  fbPublishedMap = {},
  // Instagram upload state
  isIgConnected = false,
  igAccount = null,
  igSettings = {},
  onPublishIgClip = null,
  isPublishingIg = false,
  igPublishProgress = 0,
  igPublishStage = '',
  igPublishingClipId = null,
  igPublishedMap = {},
  onOpenPublish,
  onOpenPreRenderModal,
  onDownloadAllZip,
  isZipping = false,
  zipProgress = 0
}) {
  // Option: 'all' | 'first-n' | 'range'
  const [generateOption, setGenerateOption] = useState('all');
  const [firstNCount, setFirstNCount] = useState(Math.min(3, totalPossibleParts));
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(totalPossibleParts || 1);

  useEffect(() => {
    if (totalPossibleParts > 0) {
      setRangeEnd(prev => (prev === 1 || prev === 3 || prev > totalPossibleParts ? totalPossibleParts : prev));
      setFirstNCount(prev => Math.min(prev, totalPossibleParts));
    }
  }, [totalPossibleParts]);

  // Multi-select state for queue jobs
  const [selectedJobIds, setSelectedJobIds] = useState(new Set());

  const isAllSelected = (queue || []).length > 0 && queue.every(j => selectedJobIds.has(j.id));
  const isSomeSelected = selectedJobIds.size > 0 && !isAllSelected;

  const handleToggleSelect = (jobId) => {
    setSelectedJobIds(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (isAllSelected) {
      setSelectedJobIds(new Set());
    } else {
      setSelectedJobIds(new Set((queue || []).map(j => j.id)));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedJobIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedJobIds.size} selected clip(s) from queue?`)) return;
    const ids = Array.from(selectedJobIds);
    if (onDeleteSelectedJobs) {
      onDeleteSelectedJobs(ids);
    } else {
      ids.forEach(id => (onRemoveClip ? onRemoveClip(id) : onCancelJob(id)));
    }
    setSelectedJobIds(new Set());
  };

  const completedJobs = (queue || []).filter(j => j.status === 'completed' && (j.outputUrl || j.blob));

  const getPendingClipsToRender = () => {
    let count = totalPossibleParts;
    let start = 1;
    if (generateOption === 'all') {
      count = totalPossibleParts;
      start = 1;
    } else if (generateOption === 'first-n') {
      count = Math.min(firstNCount, totalPossibleParts);
      start = 1;
    } else if (generateOption === 'range') {
      start = rangeStart;
      count = Math.max(1, rangeEnd - rangeStart + 1);
    }
    const clips = [];
    for (let i = 0; i < count; i++) {
      const partNum = start + i;
      clips.push({
        id: `pending-${partNum}`,
        partNumber: partNum,
        name: `Part ${String(partNum).padStart(2, '0')}`,
        duration: 60
      });
    }
    return clips;
  };

  const handleTriggerGenerate = () => {
    if (onOpenPreRenderModal) {
      const pendingClips = getPendingClipsToRender();
      onOpenPreRenderModal(pendingClips, {
        mode: generateOption,
        count: firstNCount,
        start: rangeStart,
        end: rangeEnd
      });
    } else {
      onGenerateQueue({
        mode: generateOption,
        count: firstNCount,
        start: rangeStart,
        end: rangeEnd
      });
    }
  };

  const getStatusBadge = (status, progress, job) => {
    const uploadState = uploadJobs[job?.id];
    const fbPublishedUrl = fbPublishedMap[job?.id];
    const isCurrentlyPublishingFb = isPublishingFb && fbPublishingClipId === job?.id;
    const isCurrentlyPublishingIg = isPublishingIg && igPublishingClipId === job?.id;
    const igPublishedUrl = igPublishedMap?.[job?.id];

    if (isCurrentlyPublishingFb) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 animate-pulse shrink-0">
          <Share2 className="w-3 h-3 mr-1 animate-spin text-blue-400" />
          FB Uploading {fbPublishProgress || 0}%
        </span>
      );
    }

    if (isCurrentlyPublishingIg) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-pink-500/20 text-pink-300 border border-pink-500/30 animate-pulse shrink-0">
          <Instagram className="w-3 h-3 mr-1 animate-spin text-pink-400" />
          IG Uploading {igPublishProgress || 0}%
        </span>
      );
    }

    if (fbPublishedUrl) {
      return (
        <a
          href={fbPublishedUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors shrink-0"
        >
          <Share2 className="w-3 h-3 mr-1 text-blue-400" />
          <span>Facebook Reel ↗</span>
        </a>
      );
    }

    if (igPublishedUrl) {
      return (
        <a
          href={igPublishedUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-pink-500/20 text-pink-300 border border-pink-500/30 hover:bg-pink-500/30 transition-colors shrink-0"
        >
          <Instagram className="w-3 h-3 mr-1 text-pink-400" />
          <span>Instagram Reel ↗</span>
        </a>
      );
    }

    if (uploadState) {
      switch (uploadState.status) {
        case 'queued':
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/25 shrink-0">
              <Upload className="w-3 h-3 mr-1 animate-pulse" /> Auto-Upload Queued
            </span>
          );
        case 'uploading':
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-red-500/20 text-red-300 border border-red-500/30 animate-pulse shrink-0">
              <Upload className="w-3 h-3 mr-1 animate-bounce text-red-400" /> YouTube Uploading {uploadState.progress || 0}%
            </span>
          );
        case 'uploaded':
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 shrink-0">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Uploaded to YouTube
            </span>
          );
        case 'scheduled':
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
              <Calendar className="w-3 h-3 mr-1 text-purple-400" /> Scheduled on YouTube
            </span>
          );
        case 'upload_failed':
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/25 shrink-0">
              <XCircle className="w-3 h-3 mr-1" /> Upload Failed
            </span>
          );
        default:
          break;
      }
    }

    switch (status) {
      case 'processing':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse shrink-0">
            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
            Rendering {progress != null ? `${progress}%` : ''}
          </span>
        );
      case 'waiting':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
            <Clock className="w-3 h-3 mr-1" /> Waiting
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 shrink-0">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Ready
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/25 shrink-0">
            <AlertCircle className="w-3 h-3 mr-1" /> Failed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-500 shrink-0">
            <XCircle className="w-3 h-3 mr-1" /> Cancelled
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-5 shadow-lg space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center space-x-2">
            <span>Export &amp; Social Queue</span>
            {queue.length > 0 && (
              <span className="text-xs font-mono font-semibold px-2 py-0.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-full">
                {queue.length} {queue.length === 1 ? 'Job' : 'Jobs'}
              </span>
            )}
          </h3>
        </div>

        <div className="flex items-center space-x-2">
          {selectedJobIds.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 active:scale-98 rounded-lg shadow-sm flex items-center space-x-1.5 transition-all cursor-pointer touch-manipulation"
              title="Delete selected queue jobs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected ({selectedJobIds.size})</span>
            </button>
          )}

          {queue.length > 0 && (
            <button
              onClick={handleSelectAll}
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer touch-manipulation"
              title={isAllSelected ? "Deselect all" : "Select all queue jobs"}
            >
              {isAllSelected ? (
                <CheckSquare className="w-3.5 h-3.5 text-orange-400" />
              ) : isSomeSelected ? (
                <MinusSquare className="w-3.5 h-3.5 text-orange-400" />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">Select All</span>
            </button>
          )}

          {completedJobs.length > 0 && onDownloadAllZip && (
            <button
              onClick={onDownloadAllZip}
              disabled={isZipping}
              className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-98 disabled:opacity-50 rounded-lg shadow-sm flex items-center space-x-1.5 transition-all cursor-pointer touch-manipulation"
              title="Download all ready clips as ZIP"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isZipping ? `Zipping (${zipProgress}%)` : `Download All (${completedJobs.length}) ZIP`}</span>
            </button>
          )}

          {completedJobs.length > 0 && onOpenPublish && (
            <button
              onClick={() => onOpenPublish(completedJobs)}
              className="px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:opacity-95 active:scale-98 rounded-lg shadow-sm shadow-purple-500/20 flex items-center space-x-1.5 transition-all cursor-pointer touch-manipulation"
              title="Publish or schedule all ready clips"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Publish / Schedule Ready ({completedJobs.length})</span>
            </button>
          )}

          {queue.length > 0 && (
            <button
              onClick={onClearQueue}
              className="px-2.5 sm:px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer touch-manipulation"
            >
              Clear Queue
            </button>
          )}
        </div>
      </div>

      {/* Part Selection & Generation Controls */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center space-x-2">
            <Hash className="w-4 h-4 text-orange-400" />
            <span className="text-xs font-semibold text-slate-200">How many clips to generate?</span>
          </div>

          {/* Preset Mode Tabs */}
          <div className="grid grid-cols-3 sm:inline-flex w-full sm:w-auto rounded-lg bg-slate-900 p-0.5 border border-slate-800">
            <button
              onClick={() => setGenerateOption('all')}
              className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer text-center touch-manipulation ${
                generateOption === 'all'
                  ? 'bg-orange-500 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({totalPossibleParts})
            </button>

            <button
              onClick={() => setGenerateOption('first-n')}
              className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer text-center touch-manipulation ${
                generateOption === 'first-n'
                  ? 'bg-orange-500 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              First N
            </button>

            <button
              onClick={() => setGenerateOption('range')}
              className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer text-center touch-manipulation ${
                generateOption === 'range'
                  ? 'bg-orange-500 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Range
            </button>
          </div>
        </div>

        {/* Dynamic Controls based on selected option */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-slate-900">
          {generateOption === 'all' && (
            <span className="text-xs text-slate-400">
              Will generate all <strong className="text-amber-400 font-mono">{totalPossibleParts}</strong> active clips.
            </span>
          )}

          {generateOption === 'first-n' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-300">Generate first:</span>
              <div className="flex items-center space-x-1.5">
                <input
                  type="number"
                  min="1"
                  max={totalPossibleParts}
                  value={firstNCount}
                  onChange={(e) => setFirstNCount(Math.max(1, Math.min(totalPossibleParts, parseInt(e.target.value) || 1)))}
                  className="w-16 bg-slate-900 border border-slate-700 text-white font-mono text-xs px-2 py-1 rounded-lg text-center font-bold focus:border-orange-500 focus:outline-none"
                />
                <span className="text-xs text-slate-400">of {totalPossibleParts} parts</span>
              </div>
            </div>
          )}

          {generateOption === 'range' && (
            <div className="flex flex-wrap items-center justify-between w-full gap-2">
              <div className="flex items-center space-x-1.5 font-mono text-xs">
                <span className="text-xs text-slate-300 font-sans">Parts range:</span>
                <input
                  type="number"
                  min="1"
                  max={totalPossibleParts}
                  value={rangeStart}
                  onChange={(e) => setRangeStart(Math.max(1, Math.min(totalPossibleParts, parseInt(e.target.value) || 1)))}
                  className="w-14 bg-slate-900 border border-slate-700 text-white px-2 py-1 rounded-lg text-center font-bold focus:border-orange-500 focus:outline-none"
                />
                <span className="text-slate-500">&rarr;</span>
                <input
                  type="number"
                  min={rangeStart}
                  max={totalPossibleParts}
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(Math.max(rangeStart, Math.min(totalPossibleParts, parseInt(e.target.value) || totalPossibleParts)))}
                  className="w-14 bg-slate-900 border border-slate-700 text-white px-2 py-1 rounded-lg text-center font-bold focus:border-orange-500 focus:outline-none"
                />
                <span className="text-xs text-slate-400 font-sans">of {totalPossibleParts}</span>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex items-center space-x-1 text-[10px] font-mono">
                {totalPossibleParts >= 5 && (
                  <button
                    type="button"
                    onClick={() => { setRangeStart(1); setRangeEnd(5); }}
                    className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded transition-colors cursor-pointer"
                  >
                    1–5
                  </button>
                )}
                {totalPossibleParts >= 15 && (
                  <button
                    type="button"
                    onClick={() => { setRangeStart(4); setRangeEnd(15); }}
                    className="px-2 py-0.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 border border-orange-500/30 font-bold rounded transition-colors cursor-pointer"
                  >
                    4–15
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setRangeStart(1); setRangeEnd(totalPossibleParts); }}
                  className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 rounded transition-colors cursor-pointer"
                >
                  All ({totalPossibleParts})
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Generate / Render Action Button */}
        <div className="flex items-center justify-end pt-3 border-t border-slate-900">
          <button
            onClick={handleTriggerGenerate}
            disabled={isProcessing}
            className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 active:scale-98 disabled:opacity-50 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg shadow-orange-500/25 flex items-center justify-center space-x-2 transition-all cursor-pointer touch-manipulation"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Processing Queue...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 fill-current" />
                <span>
                  {generateOption === 'range'
                    ? `Render & Schedule Selected (${Math.max(1, rangeEnd - rangeStart + 1)} Clips: P${rangeStart}–P${rangeEnd})`
                    : generateOption === 'first-n'
                    ? `Render & Schedule First ${Math.min(firstNCount, totalPossibleParts)} Clips`
                    : `Render & Schedule All ${totalPossibleParts} Clips`}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Queue Jobs List */}
      {queue.length > 0 && (
        <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
          {queue.map((job) => {
            const uploadState = uploadJobs[job.id];
            const isUploading = uploadState?.status === 'uploading';
            const scheduledAt = job.scheduledAt || uploadState?.scheduledAt;
            const uploadFailed = uploadState?.status === 'upload_failed';
            const isFbPublishing = isPublishingFb && fbPublishingClipId === job.id;
            const isIgPublishing = isPublishingIg && igPublishingClipId === job.id;

            return (
              <div
                key={job.id}
                className={`border rounded-xl p-3 sm:p-3.5 flex flex-wrap items-center justify-between gap-2.5 transition-colors ${
                  selectedJobIds.has(job.id)
                    ? 'bg-blue-950/25 border-blue-500/50'
                    : 'bg-slate-950 border-slate-800/90 hover:border-slate-700'
                }`}
              >
                {/* Job Checkbox & Details */}
                <div className="flex items-start space-x-2.5 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => handleToggleSelect(job.id)}
                    className="mt-0.5 text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
                    title={selectedJobIds.has(job.id) ? "Deselect" : "Select"}
                  >
                    {selectedJobIds.has(job.id) ? (
                      <CheckSquare className="w-4 h-4 text-orange-400" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-600 hover:text-slate-400" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-2 flex-wrap gap-1">
                      <span className="font-bold text-xs text-white truncate max-w-[150px] sm:max-w-md">
                        {job.name || `Part ${String(job.partNumber).padStart(2, '0')}`}
                      </span>
                      {getStatusBadge(job.status, job.progress, job)}
                      {scheduledAt && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-purple-500/15 text-purple-300 border border-purple-500/30 shrink-0">
                          <Calendar className="w-3 h-3 mr-1 text-purple-400" />
                          Scheduled: {new Date(scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 text-[11px] text-slate-400 font-mono mt-1">
                      <span>{formatTime(job.startTime)} → {formatTime(job.endTime)}</span>
                      <span>•</span>
                      <span>{formatTime(job.duration)}</span>
                    </div>

                    {/* Local Video Rendering Progress Line */}
                    {job.status === 'processing' && (
                      <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-orange-400 transition-all duration-300"
                          style={{ width: `${job.progress || 0}%` }}
                        />
                      </div>
                    )}

                    {/* Platform Upload Progress (Shows Percentage Instead of the Line) */}
                    {(isUploading || isFbPublishing || isIgPublishing) && (
                      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-800/80 text-xs font-mono">
                        <div className="flex items-center space-x-1.5 text-slate-300">
                          {isFbPublishing ? (
                            <>
                              <Share2 className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                              <span className="font-semibold text-slate-200">Uploading to Facebook Reels:</span>
                            </>
                          ) : isIgPublishing ? (
                            <>
                              <Instagram className="w-3.5 h-3.5 text-pink-400 animate-pulse" />
                              <span className="font-semibold text-slate-200">Uploading to Instagram Reels:</span>
                            </>
                          ) : (
                            <>
                              <Youtube className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                              <span className="font-semibold text-slate-200">Uploading to YouTube:</span>
                            </>
                          )}
                        </div>
                        <span className="text-xs font-mono font-bold text-white px-2 py-0.5 rounded bg-slate-900 border border-slate-700 shadow-inner">
                          {isFbPublishing
                            ? `${fbPublishProgress || 0}%`
                            : isIgPublishing
                            ? `${igPublishProgress || 0}%`
                            : `${uploadState?.progress || 0}%`}
                        </span>
                      </div>
                    )}

                    {uploadState?.error && (
                      <p className="text-[11px] text-rose-400 mt-1">{uploadState.error}</p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-1.5 shrink-0 flex-wrap gap-1">
                  {job.status === 'waiting' && (
                    <button
                      onClick={() => onCancelJob(job.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-900 transition-colors cursor-pointer touch-manipulation"
                      title="Cancel job"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}

                  {job.status === 'processing' && (
                    <button
                      onClick={() => onCancelJob(job.id)}
                      className="p-1.5 text-rose-400 hover:text-rose-300 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer touch-manipulation"
                      title="Stop processing"
                    >
                      <StopCircle className="w-4 h-4" />
                    </button>
                  )}

                  {job.status === 'completed' && (job.outputUrl || job.blob) && (
                    <>
                      <button
                        onClick={() => onPreviewClip(job)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors cursor-pointer touch-manipulation"
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => onDownloadClip(job)}
                        className="p-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg transition-colors cursor-pointer touch-manipulation"
                        title="Download MP4"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  {/* Central Unified Publish / Schedule Action */}
                  {job.status === 'completed' && (job.outputUrl || job.blob) && onOpenPublish && (
                    <button
                      onClick={() => onOpenPublish(job)}
                      className="px-2.5 py-1 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:opacity-95 active:scale-98 border border-purple-500/40 rounded-lg flex items-center space-x-1 transition-all cursor-pointer touch-manipulation shadow-sm shadow-purple-500/20"
                      title="Publish or schedule clip to YouTube, Facebook, or Instagram"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Publish / Schedule</span>
                    </button>
                  )}

                  {(job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') && (
                    <button
                      onClick={() => (onRemoveClip ? onRemoveClip(job.id) : onCancelJob(job.id))}
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer touch-manipulation"
                      title="Remove clip from queue"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}

                  {uploadFailed && (
                    <button
                      onClick={() => onRetryUpload(job)}
                      className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer touch-manipulation"
                      title="Retry YouTube upload"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
