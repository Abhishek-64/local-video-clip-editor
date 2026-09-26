import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar, Clock, Video, Eye, XCircle, RefreshCw, AlertCircle,
  Instagram, Share2, CheckCircle2, Play, ExternalLink, ShieldCheck,
  Film, X, CalendarClock, ArrowRight, Sparkles, Zap,
  CheckSquare, Square, MinusSquare, Trash2, Search
} from 'lucide-react';
import {
  getSocialScheduledJobs,
  reconcileSocialJobs,
  getSocialPreviewUrl,
  cancelSocialScheduledJob,
  rescheduleSocialScheduledJob,
  publishSocialJobNow,
  deleteSelectedScheduledJobs
} from '../services/apiService';

/**
 * Helper to format a Date into an HTML5 datetime-local string (YYYY-MM-DDTHH:mm)
 */
function toDateTimeLocalString(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

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
 * Format ISO datetime string with weekday for modal preview
 */
function formatFullScheduledTime(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
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
    if (diffHours < 24) {
      return remMins > 0 ? `in ${diffHours}h ${remMins}m` : `in ${diffHours}h`;
    }
    const diffDays = Math.floor(diffHours / 24);
    const remHours = diffHours % 24;
    return remHours > 0 ? `in ${diffDays}d ${remHours}h` : `in ${diffDays}d`;
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

  // Reschedule Modal State
  const [rescheduleModalJob, setRescheduleModalJob] = useState(null);
  const [rescheduleDateTime, setRescheduleDateTime] = useState('');
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleError, setRescheduleError] = useState(null);

  // Publish Now Execution State
  const [publishingNowJobIds, setPublishingNowJobIds] = useState({});

  // Video Preview Modal State (Streams temporary signed B2 URL or local asset)
  const [previewModal, setPreviewModal] = useState(null); // { url, title, fileName, job }
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewVideoError, setPreviewVideoError] = useState(null);
  const [activePreviewJob, setActivePreviewJob] = useState(null);

  // Search query state for filtering scheduled videos
  const [searchQuery, setSearchQuery] = useState('');

  // Multi-select state for scheduled jobs
  const [selectedJobKeys, setSelectedJobKeys] = useState(new Set()); // `${job.platform}:${job.id}`
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);

  // Filter jobs by search query
  const filteredJobs = useMemo(() => {
    if (!searchQuery.trim()) return jobs;
    const q = searchQuery.toLowerCase().trim();
    return jobs.filter(j => 
      (j.title && j.title.toLowerCase().includes(q)) ||
      (j.caption && j.caption.toLowerCase().includes(q)) ||
      (j.b2_file_name && j.b2_file_name.toLowerCase().includes(q)) ||
      (j.platform && j.platform.toLowerCase().includes(q))
    );
  }, [jobs, searchQuery]);

  const isAllSelected = useMemo(() => {
    return filteredJobs.length > 0 && filteredJobs.every(j => selectedJobKeys.has(`${j.platform}:${j.id}`));
  }, [filteredJobs, selectedJobKeys]);

  const isSomeSelected = useMemo(() => {
    return selectedJobKeys.size > 0 && !isAllSelected;
  }, [selectedJobKeys, isAllSelected]);

  const handleToggleSelectJob = (job) => {
    const key = `${job.platform}:${job.id}`;
    setSelectedJobKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSelectAllJobs = () => {
    if (isAllSelected) {
      setSelectedJobKeys(new Set());
    } else {
      setSelectedJobKeys(new Set(filteredJobs.map(j => `${j.platform}:${j.id}`)));
    }
  };

  const handleDeleteSelectedJobs = async () => {
    if (selectedJobKeys.size === 0 || isDeletingSelected) return;
    const confirmMsg = `Cancel & permanently delete ${selectedJobKeys.size} selected scheduled post(s)?`;
    if (!window.confirm(confirmMsg)) return;

    setIsDeletingSelected(true);
    try {
      const items = [];
      selectedJobKeys.forEach(k => {
        const [platform, id] = k.split(':');
        items.push({ platform, id });
      });
      const res = await deleteSelectedScheduledJobs(items);
      if (res && res.success) {
        showToast(`Permanently deleted ${res.deletedCount ?? items.length} scheduled job(s).`, 'success');
      }
      setSelectedJobKeys(new Set());
      await fetchScheduledJobs();
    } catch (err) {
      console.error('Delete selected scheduled error:', err);
      showToast(`Failed to delete scheduled jobs: ${err.message}`, 'error');
    } finally {
      setIsDeletingSelected(false);
    }
  };

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

  const [isSyncing, setIsSyncing] = useState(false);
  const handleSyncStatus = useCallback(async () => {
    setIsSyncing(true);
    try {
      const res = await reconcileSocialJobs();
      if (res && res.success) {
        const total = (res.facebook?.reconciled || 0) + (res.instagram?.reconciled || 0);
        if (total > 0) {
          showToast(`Synced! ${total} post(s) updated to published.`, 'success');
        } else {
          showToast('Status check complete. All social posts are in sync.', 'info');
        }
      }
      await fetchScheduledJobs();
    } catch (err) {
      console.warn('[ScheduledVideos] Error syncing social status:', err);
      showToast(`Status check failed: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  }, [fetchScheduledJobs, showToast]);

  useEffect(() => {
    fetchScheduledJobs();
    // Auto-refresh scheduled list every 30 seconds
    const timer = setInterval(fetchScheduledJobs, 30000);
    return () => clearInterval(timer);
  }, [fetchScheduledJobs, refreshTrigger]);

  // Group jobs by shared video asset (b2_file_name or title)
  const groupedVideos = useMemo(() => {
    const groups = new Map();

    for (const job of filteredJobs) {
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
  }, [filteredJobs]);

  // Open Reschedule Modal with default/current datetime
  const handleOpenReschedule = (job) => {
    setRescheduleModalJob(job);
    setRescheduleError(null);
    const existing = job?.scheduled_at ? new Date(job.scheduled_at) : new Date(Date.now() + 3600000);
    const initialTime = existing.getTime() > Date.now() ? existing : new Date(Date.now() + 3600000);
    setRescheduleDateTime(toDateTimeLocalString(initialTime));
  };

  // Apply Quick Preset
  const applyPreset = (presetType) => {
    const now = new Date();
    const currentSelected = rescheduleDateTime ? new Date(rescheduleDateTime) : new Date();
    const base = isNaN(currentSelected.getTime()) || currentSelected.getTime() < now.getTime() ? now : currentSelected;
    
    let nextDate = new Date(base);
    if (presetType === 'plus1h') {
      nextDate = new Date(Date.now() + 60 * 60 * 1000);
    } else if (presetType === 'plus3h') {
      nextDate = new Date(Date.now() + 3 * 60 * 60 * 1000);
    } else if (presetType === 'plus6h') {
      nextDate = new Date(Date.now() + 6 * 60 * 60 * 1000);
    } else if (presetType === 'tomorrow') {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      if (rescheduleModalJob?.scheduled_at) {
        const orig = new Date(rescheduleModalJob.scheduled_at);
        if (!isNaN(orig.getTime())) {
          d.setHours(orig.getHours(), orig.getMinutes(), 0, 0);
        }
      }
      nextDate = d.getTime() > Date.now() ? d : new Date(Date.now() + 24 * 60 * 60 * 1000);
    } else if (presetType === 'plus2d') {
      nextDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    } else if (presetType === 'plus1w') {
      nextDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }
    setRescheduleDateTime(toDateTimeLocalString(nextDate));
    setRescheduleError(null);
  };

  // Handle Confirm Reschedule
  const handleConfirmReschedule = async () => {
    if (!rescheduleModalJob || !rescheduleDateTime) return;
    const selected = new Date(rescheduleDateTime);
    if (isNaN(selected.getTime())) {
      setRescheduleError('Please enter a valid date and time.');
      return;
    }
    if (selected.getTime() <= Date.now()) {
      setRescheduleError('Please choose a future date and time for scheduled publishing.');
      return;
    }

    setIsRescheduling(true);
    setRescheduleError(null);
    try {
      const res = await rescheduleSocialScheduledJob(
        rescheduleModalJob.platform,
        rescheduleModalJob.id,
        selected.toISOString()
      );
      if (res && res.success) {
        const platformName = rescheduleModalJob.platform === 'instagram' ? 'Instagram' : 'Facebook';
        const formattedTime = formatScheduledTime(selected.toISOString());
        showToast(`Rescheduled ${platformName} post to ${formattedTime}!`, 'success');
        setRescheduleModalJob(null);
        await fetchScheduledJobs();
      } else {
        throw new Error(res?.error || 'Failed to reschedule');
      }
    } catch (err) {
      console.error('Reschedule error:', err);
      setRescheduleError(err.message || 'Failed to reschedule publishing time');
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setIsRescheduling(false);
    }
  };

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

  // Handle Confirm Cancel / Permanent Delete
  const handleConfirmCancel = async () => {
    if (!cancelModalJob) return;
    setIsCancelling(true);
    try {
      const res = await cancelSocialScheduledJob(cancelModalJob.platform, cancelModalJob.id);
      if (res && res.success) {
        showToast(`Permanently deleted scheduled post for ${cancelModalJob.platform === 'instagram' ? 'Instagram' : 'Facebook'}!`, 'success');
        setCancelModalJob(null);
        await fetchScheduledJobs();
      } else {
        throw new Error(res?.error || 'Failed to delete');
      }
    } catch (err) {
      console.error('Cancel schedule error:', err);
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setIsCancelling(false);
    }
  };

  // Handle Publish Now (Immediately execute a scheduled job on-demand)
  const handlePublishNow = async (job) => {
    if (!job || publishingNowJobIds[job.id]) return;
    const platformName = job.platform === 'instagram' ? 'Instagram' : 'Facebook';
    setPublishingNowJobIds(prev => ({ ...prev, [job.id]: true }));

    try {
      showToast(`Publishing ${platformName} Reel immediately...`, 'info');
      const res = await publishSocialJobNow(job.platform, job.id);
      if (res && res.success) {
        showToast(`✓ Published to ${platformName} successfully!`, 'success');
        await fetchScheduledJobs();
      } else {
        throw new Error(res?.error || `Failed to publish to ${platformName}`);
      }
    } catch (err) {
      console.error(`Publish now error for ${platformName}:`, err);
      showToast(`Publish error: ${err.message}`, 'error');
    } finally {
      setPublishingNowJobIds(prev => {
        const next = { ...prev };
        delete next[job.id];
        return next;
      });
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl mt-2 flex flex-col">
      {/* Header — Sticky so it stays visible while scrolling through many scheduled items */}
      <div className="p-3.5 sm:p-4.5 border-b border-slate-800/80 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 sticky top-0 z-10 backdrop-blur-md space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400 shadow-inner shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h3 className="text-xs sm:text-sm font-bold text-white tracking-tight truncate">Scheduled Videos</h3>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-orange-500/20 border border-orange-500/40 text-orange-300 rounded-full shrink-0">
                  {jobs.length} waiting
                </span>
              </div>
            </div>
          </div>

          {/* Actions & Bulk Delete */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
            {selectedJobKeys.size > 0 && (
              <button
                type="button"
                onClick={handleDeleteSelectedJobs}
                disabled={isDeletingSelected}
                className="px-2.5 sm:px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl transition-all flex items-center space-x-1.5 shadow-lg shadow-rose-600/20 active:scale-98 cursor-pointer disabled:opacity-50"
                title="Cancel and permanently delete selected scheduled posts"
              >
                {isDeletingSelected ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Delete Selected ({selectedJobKeys.size})</span>
              </button>
            )}

            {filteredJobs.length > 0 && (
              <button
                type="button"
                onClick={handleSelectAllJobs}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer transition-colors"
                title={isAllSelected ? "Deselect all" : "Select all scheduled videos"}
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

            <button
              type="button"
              onClick={handleSyncStatus}
              disabled={isSyncing || isLoading}
              className="px-2 sm:px-2.5 py-1.5 bg-slate-800/90 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-slate-700/70 hover:border-amber-500/40 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all disabled:opacity-50 cursor-pointer"
              title="Sync & verify live status directly with Facebook & Instagram"
            >
              <Sparkles className={`w-3.5 h-3.5 text-amber-400 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync Status'}</span>
            </button>

            <button
              onClick={fetchScheduledJobs}
              disabled={isLoading}
              className="p-1.5 sm:p-2 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
              title="Refresh scheduled videos"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-orange-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Search Bar when multiple jobs exist */}
        {jobs.length > 2 && (
          <div className="relative pt-0.5">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search scheduled videos..."
              className="w-full pl-8 pr-7 py-1.5 bg-slate-950/70 border border-slate-800 focus:border-orange-500/50 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content — Scrollable container with max-height and custom slim scrollbar */}
      <div className="p-3 sm:p-4.5 space-y-3.5 max-h-[560px] sm:max-h-[640px] overflow-y-auto custom-scrollbar">
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
            <p className="text-xs text-slate-500">Scheduled videos for Facebook and Instagram will appear here.</p>
          </div>
        ) : filteredJobs.length === 0 && searchQuery ? (
          <div className="p-8 text-center space-y-2.5 bg-slate-950/40 rounded-2xl border border-slate-800/80">
            <Search className="w-8 h-8 text-slate-600 mx-auto" />
            <h4 className="text-sm font-bold text-white">No Matching Videos</h4>
            <p className="text-xs text-slate-400">No scheduled posts matched "{searchQuery}"</p>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 rounded-lg transition-colors cursor-pointer"
            >
              Clear Search
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            {groupedVideos.map((group) => {
              return (
                <div
                  key={group.key}
                  className="bg-slate-950/80 border border-slate-800/90 hover:border-slate-700/80 rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between space-y-3 transition-all shadow-md group"
                >
                  {/* Video Header & Source */}
                  <div className="space-y-1.5">
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
                          <p className="text-[11px] text-slate-400 line-clamp-1 mt-1 pl-9 font-sans" title={group.caption}>
                            {group.caption}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Platforms List (Independent Lifecycles with Responsive 3-Row Structure) */}
                  <div className="space-y-2.5 border-t border-slate-800/70 pt-2.5">
                    {group.platforms.map((job) => {
                      const isIg = job.platform === 'instagram';
                      const relative = getRelativeTime(job.scheduled_at);
                      const isPublishingThis = Boolean(publishingNowJobIds[job.id]);
                      const jobKey = `${job.platform}:${job.id}`;
                      const isSelected = selectedJobKeys.has(jobKey);

                      // Check if job is stuck in uploading/processing (> 4 mins since update or schedule)
                      const isStuck = (job.status === 'uploading' || job.status === 'processing') && (() => {
                        const refTime = job.updated_at ? new Date(job.updated_at).getTime() : (job.scheduled_at ? new Date(job.scheduled_at).getTime() : 0);
                        return refTime > 0 && (Date.now() - refTime > 4 * 60 * 1000);
                      })();

                      // Action is blocked during live publishing or active initial upload, but NEVER when stuck
                      const isActionBlocked = isPublishingThis || ((job.status === 'uploading' || job.status === 'processing') && !isStuck);

                      return (
                        <div
                          key={job.id}
                          className={`border rounded-xl p-3 space-y-2.5 transition-all ${
                            isSelected
                              ? 'bg-orange-950/20 border-orange-500/50 shadow-sm'
                              : 'bg-slate-900/80 border-slate-800/90 hover:border-slate-700/80'
                          }`}
                        >
                          {/* Row 1: Checkbox + Platform Icon + Name & Content Type (Left) | Status Badge + Delete Button (Right) */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center space-x-2 min-w-0">
                              <button
                                type="button"
                                onClick={() => handleToggleSelectJob(job)}
                                className="text-slate-400 hover:text-white transition-colors cursor-pointer p-0.5 shrink-0"
                                title={isSelected ? "Deselect" : "Select"}
                              >
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-orange-400" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-600 hover:text-slate-400" />
                                )}
                              </button>

                              <div
                                className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm ${
                                  isIg
                                    ? 'bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-500'
                                    : 'bg-gradient-to-tr from-blue-600 to-indigo-600'
                                }`}
                              >
                                {isIg ? <Instagram className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                              </div>

                              <div className="flex items-center space-x-1.5 min-w-0">
                                <span className="text-xs font-bold text-white truncate">
                                  {isIg ? 'Instagram' : 'Facebook'}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono bg-slate-800/90 px-1.5 py-0.5 rounded border border-slate-700/60 shrink-0">
                                  {job.content_type === 'video' ? 'Video' : 'Reel'}
                                </span>
                              </div>
                            </div>

                            {/* Right: Status Badge + Delete Button */}
                            <div className="flex items-center space-x-1.5 shrink-0">
                              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border shadow-sm ${
                                isStuck
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                  : (isPublishingThis || job.status === 'uploading' || job.status === 'processing'
                                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 animate-pulse'
                                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30')
                              }`}>
                                {isPublishingThis ? 'Publishing...' : (job.status === 'uploading' ? (isStuck ? 'Stuck / Syncing...' : (job.progress != null ? `Uploading ${job.progress}%` : 'Uploading...')) : (job.status === 'processing' ? (isStuck ? 'Processing (Delayed)' : 'Processing...') : 'Scheduled'))}
                              </span>

                              {isStuck && (
                                <button
                                  type="button"
                                  onClick={handleSyncStatus}
                                  disabled={isSyncing}
                                  className="p-1 text-amber-400 hover:text-amber-300 hover:bg-amber-500/15 border border-amber-500/30 rounded-lg transition-colors cursor-pointer"
                                  title="Check if video is already published on Meta account"
                                >
                                  <Sparkles className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setCancelModalJob(job)}
                                disabled={isPublishingThis}
                                className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 border border-transparent hover:border-rose-500/30 rounded-lg transition-colors cursor-pointer"
                                title={`Permanently delete ${isIg ? 'Instagram' : 'Facebook'} Schedule`}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                              </button>
                            </div>
                          </div>

                          {/* Row 2: Dedicated Time & Countdown Strip (Click to Reschedule) */}
                          <div
                            onClick={() => !isActionBlocked && handleOpenReschedule(job)}
                            className={`bg-slate-950/80 border border-slate-800/80 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2 transition-all ${
                              isActionBlocked ? 'opacity-60 cursor-not-allowed' : 'hover:border-orange-500/40 cursor-pointer group/time'
                            }`}
                            title={isActionBlocked ? undefined : "Click to reschedule publishing time"}
                          >
                            <div className="flex items-center space-x-1.5 text-slate-300 min-w-0">
                              <Clock className="w-3.5 h-3.5 text-orange-400 shrink-0 group-hover/time:text-orange-300 transition-colors" />
                              <span className="font-semibold text-[11px] truncate group-hover/time:text-white transition-colors">
                                {formatScheduledTime(job.scheduled_at)}
                              </span>
                              <span className="text-[9px] text-slate-500 group-hover/time:text-orange-400/80 hidden sm:inline ml-1 font-sans">
                                (click to reschedule)
                              </span>
                            </div>

                            {relative && (
                              <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md shrink-0">
                                {relative}
                              </span>
                            )}
                          </div>

                          {/* Row 3: Action Buttons — 2-Column Responsive Grid, Never Overlaps */}
                          <div className="grid grid-cols-2 gap-2 pt-0.5">
                            <button
                              type="button"
                              onClick={() => handlePublishNow(job)}
                              disabled={isActionBlocked}
                              className="w-full py-1.5 px-2 text-[11px] font-semibold text-emerald-300 hover:text-white bg-emerald-500/15 hover:bg-emerald-500/30 border border-emerald-500/40 rounded-lg transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-sm active:scale-95"
                              title={`Publish ${isIg ? 'Instagram' : 'Facebook'} post immediately`}
                            >
                              <Zap className={`w-3.5 h-3.5 text-emerald-400 ${isPublishingThis ? 'animate-spin' : ''}`} />
                              <span className="truncate">{isPublishingThis ? 'Publishing...' : 'Publish Now'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenReschedule(job)}
                              disabled={isActionBlocked}
                              className="w-full py-1.5 px-2 text-[11px] font-semibold text-slate-300 hover:text-white bg-slate-800/90 hover:bg-orange-500/20 hover:border-orange-500/40 border border-slate-700/70 rounded-lg transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-sm active:scale-95"
                              title={`Reschedule ${isIg ? 'Instagram' : 'Facebook'} post date and time`}
                            >
                              <CalendarClock className="w-3.5 h-3.5 text-orange-400" />
                              <span className="truncate">Reschedule</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Card Footer: Preview Video */}
                  <div className="pt-2 flex items-center justify-between border-t border-slate-800/60">
                    <span className="text-[11px] text-slate-500 font-mono truncate max-w-[200px]" title={group.b2_file_name}>
                      {group.b2_file_name || 'Cloud Bridge Asset'}
                    </span>
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

      {/* Reschedule Modal */}
      {rescheduleModalJob && (() => {
        const isIg = rescheduleModalJob.platform === 'instagram';
        const selectedDate = rescheduleDateTime ? new Date(rescheduleDateTime) : null;
        const isValidDate = selectedDate && !isNaN(selectedDate.getTime());
        const isFuture = isValidDate && selectedDate.getTime() > Date.now();
        const newRelative = isFuture ? getRelativeTime(selectedDate.toISOString()) : null;
        const minDateTime = toDateTimeLocalString(new Date());

        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-4 sm:p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in duration-150">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-400 flex items-center justify-center shrink-0 shadow-inner">
                    <CalendarClock className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <h4 className="text-sm font-bold text-white truncate">
                        Reschedule {isIg ? 'Instagram' : 'Facebook'} Post
                      </h4>
                      <span className={`px-2 py-0.5 text-[9px] font-bold rounded-md ${
                        isIg ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      }`}>
                        {rescheduleModalJob.content_type === 'video' ? 'Video Post' : 'Reel'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {rescheduleModalJob.title || 'Scheduled Video'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => { setRescheduleModalJob(null); setRescheduleError(null); }}
                  className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Current Schedule Banner */}
              <div className="bg-slate-950/90 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between gap-2">
                <div className="space-y-0.5 min-w-0">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                    Current Scheduled Time
                  </span>
                  <div className="flex items-center space-x-1.5 text-slate-200">
                    <Clock className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                    <span className="text-xs font-semibold truncate">
                      {formatFullScheduledTime(rescheduleModalJob.scheduled_at)}
                    </span>
                  </div>
                </div>
                {getRelativeTime(rescheduleModalJob.scheduled_at) && (
                  <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md shrink-0">
                    {getRelativeTime(rescheduleModalJob.scheduled_at)}
                  </span>
                )}
              </div>

              {/* Quick Presets */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-300 flex items-center space-x-1">
                  <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                  <span>Quick Presets</span>
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyPreset('plus1h')}
                    className="px-2.5 py-1.5 text-[11px] font-medium text-slate-300 hover:text-white bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-lg transition-all text-center cursor-pointer active:scale-95"
                  >
                    +1 Hour
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('plus3h')}
                    className="px-2.5 py-1.5 text-[11px] font-medium text-slate-300 hover:text-white bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-lg transition-all text-center cursor-pointer active:scale-95"
                  >
                    +3 Hours
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('plus6h')}
                    className="px-2.5 py-1.5 text-[11px] font-medium text-slate-300 hover:text-white bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-lg transition-all text-center cursor-pointer active:scale-95"
                  >
                    +6 Hours
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('tomorrow')}
                    className="px-2.5 py-1.5 text-[11px] font-medium text-slate-300 hover:text-white bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-lg transition-all text-center cursor-pointer active:scale-95"
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('plus2d')}
                    className="px-2.5 py-1.5 text-[11px] font-medium text-slate-300 hover:text-white bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-lg transition-all text-center cursor-pointer active:scale-95"
                  >
                    +2 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('plus1w')}
                    className="px-2.5 py-1.5 text-[11px] font-medium text-slate-300 hover:text-white bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-lg transition-all text-center cursor-pointer active:scale-95"
                  >
                    +1 Week
                  </button>
                </div>
              </div>

              {/* Date & Time Picker */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                  <span>Select New Publication Time</span>
                  <span className="text-[10px] text-slate-400 font-normal">Local Time</span>
                </label>
                <div className="relative">
                  <input
                    type="datetime-local"
                    value={rescheduleDateTime}
                    min={minDateTime}
                    onChange={(e) => {
                      setRescheduleDateTime(e.target.value);
                      setRescheduleError(null);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition-all font-mono [color-scheme:dark]"
                  />
                </div>
              </div>

              {/* Live Preview / Validation Box */}
              {isValidDate ? (
                isFuture ? (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        New Schedule
                      </span>
                      {newRelative && (
                        <span className="text-[10px] font-mono font-bold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-md">
                          {newRelative}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-emerald-200">
                      {formatFullScheduledTime(selectedDate.toISOString())}
                    </p>
                  </div>
                ) : (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-xl flex items-center space-x-2 text-xs text-rose-300">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>Selected time is in the past. Please choose a future date & time.</span>
                  </div>
                )
              ) : null}

              {rescheduleError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-xl flex items-center space-x-2 text-xs text-rose-300">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{rescheduleError}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => { setRescheduleModalJob(null); setRescheduleError(null); }}
                  disabled={isRescheduling}
                  className="flex-1 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReschedule}
                  disabled={isRescheduling || !isFuture}
                  className="flex-1 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-500 active:scale-98 rounded-xl shadow-lg shadow-orange-600/20 transition-all cursor-pointer flex items-center justify-center space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRescheduling ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <CalendarClock className="w-3.5 h-3.5" />
                      <span>Save New Schedule</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
      {/* Cancel / Delete Confirmation Modal */}
      {cancelModalJob && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>

            <div className="text-center space-y-1.5">
              <h4 className="text-sm font-bold text-white">
                Permanently Delete {cancelModalJob.platform === 'instagram' ? 'Instagram' : 'Facebook'} Post?
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                This will permanently delete the scheduled publishing job for{' '}
                <strong className="text-white">
                  {cancelModalJob.platform === 'instagram' ? 'Instagram Reels' : 'Facebook Reels'}
                </strong>{' '}
                from the database.
              </p>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setCancelModalJob(null)}
                disabled={isCancelling}
                className="flex-1 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
              >
                Keep Post
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={isCancelling}
                className="flex-1 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 active:scale-98 rounded-xl shadow-lg shadow-rose-600/20 transition-all cursor-pointer flex items-center justify-center space-x-1.5"
              >
                {isCancelling ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Permanently</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
