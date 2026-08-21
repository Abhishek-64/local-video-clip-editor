import React, { useState } from 'react';
import { PlayCircle, Download, CheckCircle2, Clock, XCircle, AlertCircle, Trash2, StopCircle, RefreshCw, Hash, Sliders, Youtube, ExternalLink, Upload, Calendar, RotateCcw } from 'lucide-react';
import { formatTime } from '../utils/time';

export default function ProcessingQueue({
  queue,
  onGenerateQueue,
  onCancelJob,
  onClearQueue,
  onPreviewClip,
  onDownloadClip,
  isProcessing,
  totalPossibleParts = 1,
  // YouTube upload state (optional — only present when YouTube is configured)
  uploadJobs = {},
  onUploadClip,
  onCancelUpload,
  onRetryUpload,
  isConnected = false
}) {
  // Option: 'all' | 'first-n' | 'range'
  const [generateOption, setGenerateOption] = useState('all');
  const [firstNCount, setFirstNCount] = useState(Math.min(3, totalPossibleParts));
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(Math.min(3, totalPossibleParts));

  const handleTriggerGenerate = () => {
    onGenerateQueue({
      mode: generateOption,
      count: firstNCount,
      start: rangeStart,
      end: rangeEnd
    });
  };

  const getStatusBadge = (status, progress, job) => {
    // Check for live upload state override
    const uploadState = uploadJobs[job?.id];

    if (uploadState) {
      switch (uploadState.status) {
        case 'queued':
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
              <Upload className="w-3 h-3 mr-1" /> Upload Queued
            </span>
          );
        case 'uploading':
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse shrink-0">
              <Upload className="w-3 h-3 mr-1 animate-bounce" /> Uploading {uploadState.progress || 0}%
            </span>
          );
        case 'uploaded':
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20 shrink-0">
              <Youtube className="w-3 h-3 mr-1" /> Uploaded
            </span>
          );
        case 'scheduled':
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
              <Calendar className="w-3 h-3 mr-1" /> Scheduled
            </span>
          );
        case 'upload_failed':
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0">
              <AlertCircle className="w-3 h-3 mr-1" /> Upload Failed
            </span>
          );
        case 'upload_cancelled':
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-500 shrink-0">
              <XCircle className="w-3 h-3 mr-1" /> Upload Cancelled
            </span>
          );
      }
    }

    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
            <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-400" /> Completed
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20 animate-pulse shrink-0">
            <RefreshCw className="w-3 h-3 mr-1 text-orange-400 animate-spin" /> {progress || 0}%
          </span>
        );
      case 'waiting':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-400 shrink-0">
            <Clock className="w-3 h-3 mr-1" /> Waiting
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0">
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
          <h3 className="font-semibold text-xs sm:text-sm text-white">Batch Processing Queue</h3>
          <p className="text-[11px] sm:text-xs text-slate-400">
            Choose how many parts you want to generate and download
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
            <span className="text-xs font-semibold text-slate-200">How many parts to generate?</span>
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
              Will generate all <strong className="text-amber-400 font-mono">{totalPossibleParts}</strong> clips for download.
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
            Click the orange button above to start generating clips
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {queue.map((job) => {
            const uploadState = uploadJobs[job.id];
            const isUploading = uploadState?.status === 'uploading' || uploadState?.status === 'queued';
            const uploadFailed = uploadState?.status === 'upload_failed';
            const uploaded = uploadState?.status === 'uploaded' || uploadState?.status === 'scheduled';

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
                  </div>

                  <div className="flex items-center space-x-1.5 sm:space-x-2 text-[11px] sm:text-xs text-slate-400 mt-1 font-mono flex-wrap">
                    <span>
                      {formatTime(job.startTime)} &rarr; {formatTime(job.endTime)}
                    </span>
                    <span>&bull;</span>
                    <span>{formatTime(job.endTime - job.startTime)}</span>
                    <span>&bull;</span>
                    <span className="uppercase text-slate-500">{job.format || 'MP4'}</span>
                  </div>

                  {/* Export Progress Bar */}
                  {job.status === 'processing' && (
                    <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-orange-500 to-amber-400 h-full rounded-full transition-all duration-300"
                        style={{ width: `${job.progress || 0}%` }}
                      />
                    </div>
                  )}

                  {/* Upload Progress Bar */}
                  {isUploading && uploadState?.progress != null && (
                    <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-red-500 to-orange-400 h-full rounded-full transition-all duration-300"
                        style={{ width: `${uploadState.progress || 0}%` }}
                      />
                    </div>
                  )}

                  {/* Upload failure message */}
                  {uploadFailed && uploadState?.error && (
                    <p className="text-[10px] text-rose-400 mt-1 truncate max-w-xs">{uploadState.error}</p>
                  )}

                  {/* YouTube video link */}
                  {uploaded && uploadState?.videoId && (
                    <a
                      href={`https://www.youtube.com/watch?v=${uploadState.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1 text-[10px] text-red-400 hover:text-red-300 mt-1 transition-colors"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                      <span>Open on YouTube</span>
                    </a>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center space-x-2 shrink-0 flex-wrap gap-1">
                  {job.status === 'completed' ? (
                    <>
                      <button
                        onClick={() => onPreviewClip(job)}
                        className="px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer touch-manipulation"
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => onDownloadClip(job)}
                        className="px-2.5 sm:px-3 py-1 text-xs font-semibold text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/40 rounded-lg flex items-center space-x-1 transition-colors cursor-pointer touch-manipulation"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </button>

                      {/* Upload to YouTube button — only when connected and not already uploaded */}
                      {isConnected && onUploadClip && !uploadState && job.blob && (
                        <button
                          onClick={() => onUploadClip(job)}
                          className="px-2.5 py-1 text-xs font-semibold text-red-300 bg-red-950/60 hover:bg-red-900/80 border border-red-500/40 rounded-lg flex items-center space-x-1 transition-colors cursor-pointer touch-manipulation"
                        >
                          <Youtube className="w-3.5 h-3.5" />
                          <span>Upload</span>
                        </button>
                      )}

                      {/* Retry upload button */}
                      {uploadFailed && onRetryUpload && (
                        <button
                          onClick={() => onRetryUpload(job)}
                          className="px-2.5 py-1 text-xs font-semibold text-amber-300 bg-amber-950/60 hover:bg-amber-900/80 border border-amber-500/40 rounded-lg flex items-center space-x-1 transition-colors cursor-pointer touch-manipulation"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Retry Upload</span>
                        </button>
                      )}

                      {/* Cancel upload button */}
                      {isUploading && onCancelUpload && (
                        <button
                          onClick={() => onCancelUpload(job.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer touch-manipulation"
                          title="Cancel Upload"
                        >
                          <StopCircle className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  ) : job.status === 'processing' || job.status === 'waiting' ? (
                    <button
                      onClick={() => onCancelJob(job.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer touch-manipulation"
                      title="Cancel Job"
                    >
                      <StopCircle className="w-4 h-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
