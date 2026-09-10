import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar, Clock, Video, Eye, XCircle, RefreshCw, AlertCircle,
  Instagram, Share2, CheckCircle2, Play, ExternalLink, ShieldCheck,
  Film, X
} from 'lucide-react';
import { getSocialScheduledJobs, getSocialPreviewUrl, cancelSocialScheduledJob } from '../services/apiService';

/**
 * Format ISO datetime string to user-friendly local date & time
 */
function formatScheduledTime(isoString) {
  if (!isoString) return 'Pending Schedule';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return isoString;
  }
}

/**
 * Get human-readable relative time (e.g. "in 15m", "Due now")
 */
function getRelativeTime(isoString) {
  if (!isoString) return '';
  try {
    const diffMs = new Date(isoString).getTime() - Date.now();
    const diffMins = Math.round(diffMs / (60 * 1000));
    if (diffMins <= 0) return 'Due now';
    if (diffMins < 60) return `in ${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    const remMins = diffMins % 60;
    return `in ${diffHours}h ${remMins}m`;
  } catch {
    return '';
  }
}

/**
 * SECTION 1 — SCHEDULED VIDEOS
 * 
 * Displays active videos currently scheduled and waiting to be published.
 * Groups by video / B2 object so a single clip scheduled to both Instagram (7:00 PM) 
 * and Facebook (7:15 PM) displays with its independent platform lifecycles.
 */
export default function ScheduledVideosSection({
  refreshTrigger = 0,
  onOpenPreview = null,
  showToast = (msg, type) => console.log(type, msg),
  completedClips = []
}) {
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Cancellation Modal State
  const [cancelModalJob, setCancelModalJob] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Video Preview Modal State (Streams temporary signed B2 URL or local asset)
  const [previewModal, setPreviewModal] = useState(null); // { url, title, fileName, job }
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewVideoError, setPreviewVideoError] = useState(null);
  const [activePreviewJob, setActivePreviewJob] = useState(null);

  // Fetch active scheduled jobs
  const fetchScheduledJobs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getSocialScheduledJobs();
      if (res && res.success) {
        setJobs(res.scheduled || []);
      }
    } catch (err) {
      console.warn('[ScheduledVideos] Error fetching scheduled jobs:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScheduledJobs();
    // Auto-refresh scheduled list every 30 seconds
    const timer = setInterval(fetchScheduledJobs, 30000);
    return () => clearInterval(timer);
  }, [fetchScheduledJobs, refreshTrigger]);

  // Group jobs by shared video asset (b2_file_name or title)
  const groupedVideos = useMemo(() => {
    const groups = new Map();

    for (const job of jobs) {
      const groupKey = job.b2_file_name || job.title || job.id;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          title: job.title || job.b2_file_name || 'Scheduled Video',
          b2_file_name: job.b2_file_name,
          b2_file_id: job.b2_file_id,
          caption: job.caption || '',
          platforms: []
        });
      }
      groups.get(groupKey).platforms.push(job);
    }

    return Array.from(groups.values());
  }, [jobs]);

  // Handle Video Preview: Local In-Memory first, then Cloudflare Stream Proxy fallback
  const handlePreview = async (job) => {
    setActivePreviewJob(job);
    setPreviewVideoError(null);

    // 1. Local Cache Check: If video was exported in current session, use local blob URL immediately
    if (completedClips && completedClips.length > 0) {
      const localMatch = completedClips.find(
        (c) =>
          c.id === job.id ||
          (job.title && c.name && (c.name === job.title || c.name.includes(job.title) || job.title.includes(c.name))) ||
          (job.b2_file_name && c.name && job.b2_file_name.includes(c.name.replace(/[^a-zA-Z0-9]/g, '')))
      );

      if (localMatch && (localMatch.outputUrl || localMatch.blob)) {
        if (onOpenPreview) {
          onOpenPreview(localMatch);
          return;
        }
        const localUrl = localMatch.outputUrl || (localMatch.blob instanceof Blob ? URL.createObjectURL(localMatch.blob) : null);
        if (localUrl) {
          setPreviewModal({
            url: localUrl,
            title: job.title || localMatch.name || 'Scheduled Video Preview',
            fileName: 'Local In-Memory Video Asset',
            job
          });
          return;
        }
      }
    }

    // 2. Remote Fetch: Obtain streaming proxy URL from Cloudflare Worker
    setIsLoadingPreview(true);
    try {
      const res = await getSocialPreviewUrl({
        platform: job.platform,
        jobId: job.id,
        fileName: job.b2_file_name
      });

      if (res && (res.previewUrl || res.b2DirectUrl)) {
        setPreviewModal({
          url: res.previewUrl || res.b2DirectUrl,
          b2DirectUrl: res.b2DirectUrl,
          title: job.title || 'Scheduled Video Preview',
          fileName: res.b2_file_name || job.b2_file_name,
          job
        });
      } else {
        showToast('Could not generate preview link. Video file may be expired or inaccessible.', 'error');
      }
    } catch (err) {
      console.error('Failed to get preview URL:', err);
      showToast(`Preview failed: ${err.message}`, 'error');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Handle Confirm Cancel
  const handleConfirmCancel = async () => {
    if (!cancelModalJob) return;
    setIsCancelling(true);
    try {
      const res = await cancelSocialScheduledJob(cancelModalJob.platform, cancelModalJob.id);
      if (res && res.success) {
        showToast(`Cancelled schedule for ${cancelModalJob.platform === 'instagram' ? 'Instagram' : 'Facebook'}!`, 'success');
        setCancelModalJob(null);
        await fetchScheduledJobs();
      } else {
        throw new Error(res?.error || 'Failed to cancel');
      }
    } catch (err) {
      console.error('Cancel schedule error:', err);
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl mt-2">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-slate-800/80 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400 shadow-inner">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-bold text-white tracking-tight">Scheduled Videos</h3>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-orange-500/20 border border-orange-500/40 text-orange-300 rounded-full">
                {jobs.length} waiting
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={fetchScheduledJobs}
          disabled={isLoading}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
          title="Refresh scheduled videos"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-orange-400' : ''}`} />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 sm:p-5 space-y-4">
        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-xl flex items-center space-x-2 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {jobs.length === 0 && !isLoading && !error ? (
          <div className="p-8 text-center space-y-2.5 bg-slate-950/40 rounded-2xl border border-slate-800/80">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center mx-auto">
              <Calendar className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-white">No Active Scheduled Videos</h4>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            {groupedVideos.map((group) => {
              return (
                <div
                  key={group.key}
                  className="bg-slate-950/80 border border-slate-800/90 hover:border-slate-700/80 rounded-2xl p-4 sm:p-4.5 flex flex-col justify-between space-y-3.5 transition-all shadow-md group"
                >
                  {/* Video Header & Source */}
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <div className="w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0">
                            <Film className="w-3.5 h-3.5" />
                          </div>
                          <h4 className="text-xs sm:text-sm font-bold text-white truncate" title={group.title}>
                            {group.title}
                          </h4>
                        </div>
                        {group.caption && (
                          <p className="text-[11px] text-slate-400 line-clamp-1 mt-1 pl-9 font-sans">
                            {group.caption}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Platforms List (Independent Lifecycles with Dedicated Time Row) */}
                  <div className="space-y-2.5 border-t border-slate-800/70 pt-3">
                    {group.platforms.map((job) => {
                      const isIg = job.platform === 'instagram';
                      const relative = getRelativeTime(job.scheduled_at);

                      return (
                        <div
                          key={job.id}
                          className="bg-slate-900/80 border border-slate-800/90 rounded-xl p-3 space-y-2.5 hover:border-slate-700/80 transition-all"
                        >
                          {/* Top: Platform Icon + Name + Content Type + Status Badge + Cancel */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center space-x-2.5 min-w-0">
                              <div
                                className={`w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm ${
                                  isIg
                                    ? 'bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-500'
                                    : 'bg-gradient-to-tr from-blue-600 to-indigo-600'
                                }`}
                              >
                                {isIg ? <Instagram className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                              </div>

                              <div className="min-w-0">
                                <span className="text-xs font-bold text-white block truncate">
                                  {isIg ? 'Instagram' : 'Facebook'}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono block -mt-0.5">
                                  {job.content_type === 'video' ? 'Video Post' : 'Reel'}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center space-x-2 shrink-0">
                              <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border shadow-sm ${
                                job.status === 'uploading' || job.status === 'processing'
                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 animate-pulse'
                                : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              }`}>
                                {job.status === 'uploading' ? (job.progress != null ? `Uploading ${job.progress}%` : 'Uploading...') : (job.status === 'processing' ? 'Processing...' : 'Scheduled')}
                              </span>

                              <button
                                type="button"
                                onClick={() => setCancelModalJob(job)}
                                className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                                title={`Cancel ${isIg ? 'Instagram' : 'Facebook'} Schedule`}
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Bottom: Dedicated Time & Countdown Strip (Never Collides) */}
                          <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
                            <div className="flex items-center space-x-1.5 text-slate-300 min-w-0">
                              <Clock className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                              <span className="font-semibold text-[11px] truncate">
                                {formatScheduledTime(job.scheduled_at)}
                              </span>
                            </div>

                            {relative && (
                              <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md shrink-0">
                                {relative}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Card Actions: Preview */}
                  <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-800/60">
                    <button
                      type="button"
                      onClick={() => handlePreview(group.platforms[0])}
                      disabled={isLoadingPreview}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-98 text-white font-medium text-xs rounded-xl shadow-sm border border-slate-700 flex items-center space-x-1.5 transition-all cursor-pointer"
                    >
                      <Play className="w-3 h-3 fill-current text-orange-400" />
                      <span>{isLoadingPreview ? 'Loading URL...' : 'Preview Video'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Secure Video Preview Modal */}
      {previewModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150 max-h-[92vh] flex flex-col">
            <div className="p-3.5 sm:p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="min-w-0 pr-2">
                <span className="font-semibold text-xs sm:text-sm text-white truncate block">
                  {previewModal.title}
                </span>
                <span className="text-[10px] text-slate-400 font-mono truncate block">
                  B2 Object: {previewModal.fileName}
                </span>
              </div>
              <button
                onClick={() => { setPreviewModal(null); setPreviewVideoError(null); }}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer touch-manipulation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 sm:p-4 bg-black flex justify-center flex-1 min-h-0 relative">
              {previewVideoError ? (
                <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                  <AlertCircle className="w-10 h-10 text-rose-400 opacity-80" />
                  <p className="text-xs text-rose-300 font-semibold max-w-xs">{previewVideoError}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => (activePreviewJob ? handlePreview(activePreviewJob) : setPreviewVideoError(null))}
                      className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-white rounded-lg flex items-center space-x-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3 mr-1" /> Retry Stream
                    </button>
                    {previewModal.b2DirectUrl && previewModal.b2DirectUrl !== previewModal.url && (
                      <button
                        onClick={() => {
                          setPreviewVideoError(null);
                          setPreviewModal(prev => ({ ...prev, url: prev.b2DirectUrl }));
                        }}
                        className="px-3 py-1.5 text-xs bg-orange-600 hover:bg-orange-500 text-white rounded-lg flex items-center space-x-1 cursor-pointer"
                      >
                        Try Direct Link
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <video
                  key={previewModal.url}
                  src={previewModal.url}
                  controls
                  playsInline
                  preload="auto"
                  className="max-h-[55vh] rounded-lg shadow-lg w-auto object-contain"
                  onError={(e) => {
                    console.error('Scheduled preview video error:', e);
                    setPreviewVideoError('Could not load or stream video. Please retry or verify the file is available.');
                  }}
                />
              )}
            </div>

            <div className="p-3.5 sm:p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="text-[10px] text-emerald-400 flex items-center space-x-1">
                <ShieldCheck className="w-3.5 h-3.5 mr-1 inline" />
                Authorized signed preview (1h expiry)
              </span>
              <button
                onClick={() => { setPreviewModal(null); setPreviewVideoError(null); }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {cancelModalJob && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
              <XCircle className="w-5 h-5" />
            </div>

            <div className="text-center space-y-1.5">
              <h4 className="text-sm font-bold text-white">
                Cancel {cancelModalJob.platform === 'instagram' ? 'Instagram' : 'Facebook'} Schedule?
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                This will cancel the scheduled publishing job for{' '}
                <strong className="text-white">
                  {cancelModalJob.platform === 'instagram' ? 'Instagram Reels' : 'Facebook Reels'}
                </strong>.
                {` Other platform schedules will remain active.`}
              </p>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setCancelModalJob(null)}
                disabled={isCancelling}
                className="flex-1 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
              >
                Keep Schedule
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={isCancelling}
                className="flex-1 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 active:scale-98 rounded-xl shadow-lg shadow-rose-600/20 transition-all cursor-pointer flex items-center justify-center space-x-1"
              >
                {isCancelling ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <span>Cancel Schedule</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
