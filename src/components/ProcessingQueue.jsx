import React, { useState } from 'react';
import {
  PlayCircle, Download, CheckCircle2, Clock, XCircle, AlertCircle, Trash2,
  StopCircle, RefreshCw, Hash, Sliders, Youtube, ExternalLink, Upload,
  Calendar, RotateCcw, Sparkles, Send, Check, ChevronDown, ChevronUp, Edit3,
  Globe, Lock, ShieldCheck, Zap
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
  connectYouTube
}) {
  // Option: 'all' | 'first-n' | 'range'
  const [generateOption, setGenerateOption] = useState('all');
  const [firstNCount, setFirstNCount] = useState(Math.min(3, totalPossibleParts));
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(Math.min(3, totalPossibleParts));

  // Modal for editing an individual clip's scheduled publish time
  const [editingJob, setEditingJob] = useState(null);
  const [editScheduledTime, setEditScheduledTime] = useState('');

  const isAutoUploadActive = isConnected && ytSettings?.yt_default_upload === 'auto';
  const scheduleInterval = ytSettings?.schedule_interval || '1hour';

  const handleTriggerGenerate = () => {
    onGenerateQueue({
      mode: generateOption,
      count: firstNCount,
      start: rangeStart,
      end: rangeEnd,
      autoSchedule: isAutoUploadActive,
      scheduleStartTime: pipelineStartTime,
      scheduleInterval: scheduleInterval
    });
  };

  const openEditModal = (job, currentScheduledAt) => {
    setEditingJob(job);
    setEditScheduledTime(
      currentScheduledAt
        ? toDateTimeLocalString(new Date(currentScheduledAt))
        : toDateTimeLocalString(new Date(Date.now() + 3600000))
    );
  };

  const handleSaveIndividualSchedule = () => {
    if (!editingJob) return;
    const isoString = new Date(editScheduledTime).toISOString();
    editingJob.scheduledAt = isoString;
    if (uploadJobs[editingJob.id]) {
      uploadJobs[editingJob.id].scheduledAt = isoString;
    }
    setEditingJob(null);
  };

  const getStatusBadge = (status, progress, job) => {
    const uploadState = uploadJobs[job?.id];

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
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 animate-pulse shrink-0">
              <Upload className="w-3 h-3 mr-1 animate-bounce" /> Uploading {uploadState.progress || 0}%
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
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-800">
        <div>
          <h3 className="font-semibold text-xs sm:text-sm text-white flex items-center space-x-2">
            <span>Batch Processing Queue</span>
            {queue.length > 0 && (
              <span className="px-2 py-0.5 text-[10px] bg-orange-500/20 text-orange-300 font-mono rounded-full font-bold border border-orange-500/30">
                {queue.length} Active Job{queue.length > 1 ? 's' : ''}
              </span>
            )}
            {isAutoUploadActive && (
              <span className="px-2 py-0.5 text-[10px] bg-purple-500/20 text-purple-300 font-mono rounded-full font-bold border border-purple-500/30 flex items-center space-x-1">
                <Zap className="w-3 h-3 text-purple-400" />
                <span>YouTube {scheduleInterval} Pipeline</span>
              </span>
            )}
          </h3>
          <p className="text-[11px] sm:text-xs text-slate-400">
            Automate video export and manage rendering queue
          </p>
        </div>

        {queue.length > 0 && (
          <button
            onClick={onClearQueue}
            className="px-2.5 sm:px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer touch-manipulation"
          >
            Clear Queue
          </button>
        )}
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
              Will generate all <strong className="text-amber-400 font-mono">{totalPossibleParts}</strong> active clips
              {isAutoUploadActive ? ` with automated YouTube ${formatIntervalLabel(scheduleInterval)} schedule pipeline` : ''}.
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

              {/* Quick count chips */}
              <div className="flex items-center space-x-1">
                {[1, 2, 3, 5].filter((n) => n <= totalPossibleParts).map((n) => (
                  <button
                    key={n}
                    onClick={() => setFirstNCount(n)}
                    className={`px-2 py-0.5 text-[11px] rounded border cursor-pointer touch-manipulation ${
                      firstNCount === n
                        ? 'bg-orange-500/20 border-orange-500 text-orange-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {generateOption === 'range' && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span>From:</span>
              <input
                type="number"
                min="1"
                max={totalPossibleParts}
                value={rangeStart}
                onChange={(e) => setRangeStart(Math.max(1, Math.min(totalPossibleParts, parseInt(e.target.value) || 1)))}
                className="w-12 bg-slate-900 border border-slate-700 text-white font-mono text-xs px-2 py-1 rounded-lg text-center font-bold focus:border-orange-500 focus:outline-none"
              />
              <span>to:</span>
              <input
                type="number"
                min={rangeStart}
                max={totalPossibleParts}
                value={rangeEnd}
                onChange={(e) => setRangeEnd(Math.max(rangeStart, Math.min(totalPossibleParts, parseInt(e.target.value) || rangeStart)))}
                className="w-12 bg-slate-900 border border-slate-700 text-white font-mono text-xs px-2 py-1 rounded-lg text-center font-bold focus:border-orange-500 focus:outline-none"
              />
              <span className="text-slate-400">({Math.max(0, rangeEnd - rangeStart + 1)} parts)</span>
            </div>
          )}

          {/* Big Action Button */}
          <button
            onClick={handleTriggerGenerate}
            disabled={isProcessing}
            className="w-full sm:w-auto sm:ml-auto px-5 py-3 sm:py-2.5 text-xs font-bold uppercase tracking-wider text-white bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 hover:from-orange-600 hover:to-amber-600 active:scale-98 rounded-xl shadow-lg shadow-orange-500/20 transition-all cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-50 touch-manipulation"
          >
            <PlayCircle className="w-4 h-4 shrink-0" />
            <span>
              {generateOption === 'all'
                ? `Generate All (${totalPossibleParts} Clips)`
                : generateOption === 'first-n'
                ? `Generate First ${firstNCount} Clip(s)`
                : `Generate Parts ${rangeStart}–${rangeEnd}`}
            </span>
          </button>
        </div>
      </div>

      {/* Queue List Table */}
      {queue.length === 0 ? (
        <div className="text-center py-6 bg-slate-950/40 rounded-xl border border-slate-800/80">
          <Clock className="w-6 h-6 sm:w-7 sm:h-7 text-slate-600 mx-auto mb-1.5" />
          <p className="text-xs font-medium text-slate-400">No clips currently running</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Click the orange button above to queue and export clips
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {queue.map((job) => {
            const uploadState = uploadJobs[job.id];
            const isUploading = uploadState?.status === 'uploading' || uploadState?.status === 'queued';
            const uploadFailed = uploadState?.status === 'upload_failed';
            const uploaded = uploadState?.status === 'uploaded' || uploadState?.status === 'scheduled';
            const scheduledAt = uploadState?.scheduledAt || job.scheduledAt;

            return (
              <div
                key={job.id}
                className="bg-slate-950 border border-slate-800/90 rounded-xl p-3 sm:p-3.5 flex flex-wrap items-center justify-between gap-2.5 hover:border-slate-700 transition-colors"
              >
                {/* Job Details */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-2 flex-wrap gap-1">
                    <span className="font-bold text-xs text-white truncate max-w-[150px] sm:max-w-md">
                      {job.name || `Part ${String(job.partNumber).padStart(2, '0')}`}
                    </span>
                    {getStatusBadge(job.status, job.progress, job)}

                    {/* Scheduled Publish Time Badge */}
                    {scheduledAt && (
                      <span
                        onClick={() => openEditModal(job, scheduledAt)}
                        className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 transition-all cursor-pointer"
                        title="Click to adjust scheduled release time"
                      >
                        <Calendar className="w-3 h-3 text-purple-400" />
                        <span>Scheduled: {formatScheduledDateTime(scheduledAt)}</span>
                        <Edit3 className="w-2.5 h-2.5 opacity-60 ml-0.5" />
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 text-[11px] text-slate-400 font-mono mt-1">
                    <span>{formatTime(job.startTime)} &rarr; {formatTime(job.endTime)}</span>
                    <span>&bull;</span>
                    <span>{formatTime(job.duration)}</span>
                  </div>

                  {/* Progress Bar for Rendering or Uploading */}
                  {(job.status === 'processing' || isUploading) && (
                    <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isUploading
                            ? 'bg-gradient-to-r from-blue-500 to-indigo-400'
                            : 'bg-gradient-to-r from-amber-500 to-orange-400'
                        }`}
                        style={{
                          width: `${isUploading ? (uploadState.progress || 0) : (job.progress || 0)}%`
                        }}
                      />
                    </div>
                  )}

                  {uploadState?.error && (
                    <p className="text-[11px] text-rose-400 mt-1">{uploadState.error}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-1.5 shrink-0">
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

                  {job.status === 'completed' && job.outputUrl && (
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

                  {/* YouTube Upload Action */}
                  {job.status === 'completed' && isConnected && !uploadState && (
                    <button
                      onClick={() => onUploadClip(job)}
                      className="px-2.5 py-1 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-300 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-colors cursor-pointer touch-manipulation"
                    >
                      <Youtube className="w-3.5 h-3.5" />
                      <span>Upload</span>
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

      {/* Edit Individual Clip Schedule Modal */}
      {editingJob && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-4 space-y-3.5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white flex items-center space-x-1.5">
                <Calendar className="w-4 h-4 text-purple-400" />
                <span>Edit Scheduled Publish Time</span>
              </h4>
              <button
                onClick={() => setEditingJob(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-[11px] text-slate-400">
              Set the exact date and time this clip should automatically publish on YouTube:
            </p>

            <input
              type="datetime-local"
              value={editScheduledTime}
              onChange={(e) => setEditScheduledTime(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-white text-xs font-mono px-3 py-2 rounded-xl focus:border-purple-500 focus:outline-none"
            />

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setEditingJob(null)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveIndividualSchedule}
                className="px-3.5 py-1.5 text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white rounded-lg shadow-md cursor-pointer"
              >
                Save Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
