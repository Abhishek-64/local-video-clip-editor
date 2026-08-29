import React, { useState, useEffect } from 'react';
import {
  Database, Trash2, RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck,
  HardDrive, Youtube, Palette, Settings, Sparkles, X, Clock, AlertCircle
} from 'lucide-react';
import { getUserStorageStats, clearUserData, triggerAdminCleanup } from '../services/apiService';

export default function StorageSettingsModal({
  isOpen,
  onClose,
  isAuthenticated,
  onDataCleared,
  showToast
}) {
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanupReport, setCleanupReport] = useState(null);

  // Confirmation dialog state: { scope, title, description }
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [isClearing, setIsClearing] = useState(false);

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      const data = await getUserStorageStats();
      if (data?.stats) {
        setStats(data.stats);
      }
    } catch (err) {
      console.warn('Could not load storage stats:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStats();
      setCleanupReport(null);
      setConfirmDialog(null);
    }
  }, [isOpen]);

  const handleRunAutoCleanup = async () => {
    setIsCleaning(true);
    try {
      const res = await triggerAdminCleanup();
      setCleanupReport(res?.report);
      if (showToast) showToast('Automated database cleanup completed!', 'success');
      fetchStats();
    } catch (err) {
      if (showToast) showToast('Failed to run maintenance: ' + err.message, 'error');
    } finally {
      setIsCleaning(false);
    }
  };

  const handleRequestClear = (scope, title, description) => {
    setConfirmDialog({ scope, title, description });
  };

  const handleConfirmClear = async () => {
    if (!confirmDialog) return;
    setIsClearing(true);
    try {
      const res = await clearUserData(confirmDialog.scope);
      if (res?.success) {
        if (showToast) showToast(`Successfully cleared ${confirmDialog.title.toLowerCase()}!`, 'success');
        if (onDataCleared) onDataCleared(confirmDialog.scope);
        setConfirmDialog(null);
        fetchStats();
      } else {
        if (showToast) showToast(res?.error || 'Failed to clear data.', 'error');
      }
    } catch (err) {
      if (showToast) showToast('Error clearing data: ' + err.message, 'error');
    } finally {
      setIsClearing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl animate-scaleUp max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400 shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-white flex items-center space-x-2">
                <span>Database &amp; Storage Management</span>
              </h3>
              <p className="text-xs text-slate-400">
                Automated background pruning &bull; User-controlled data deletion
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* 1. Automated Background Maintenance Policy Card */}
          <div className="bg-gradient-to-br from-emerald-950/40 via-slate-950 to-slate-900 border border-emerald-500/30 rounded-2xl p-4 space-y-3 shadow-inner">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
                  Automated Database Maintenance
                </span>
              </div>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">
                Active &bull; Daily 3 AM UTC
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              To keep the database lean and never reach capacity limits, temporary and expired data are automatically deleted without requiring manual approval:
            </p>

            <ul className="text-[11px] text-slate-400 space-y-1.5 list-disc list-inside">
              <li><strong>Expired Login Sessions:</strong> Purged automatically past expiration date.</li>
              <li><strong>Stale Upload Logs:</strong> Upload records older than 30 days are automatically deleted.</li>
              <li><strong>Inactive Guest Cache:</strong> Anonymous visitors without an account are cleaned after 7 days.</li>
            </ul>

            <div className="pt-1 flex items-center justify-between">
              <button
                onClick={handleRunAutoCleanup}
                disabled={isCleaning}
                className="px-3.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center space-x-1.5 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isCleaning ? 'animate-spin' : ''}`} />
                <span>{isCleaning ? 'Running Maintenance...' : 'Run Auto-Cleanup Now'}</span>
              </button>

              {cleanupReport && (
                <span className="text-[10px] text-emerald-400 font-mono">
                  Cleaned: {cleanupReport.expiredSessions || 0} sessions, {cleanupReport.oldUploads || 0} logs
                </span>
              )}
            </div>
          </div>

          {/* 2. User-Approved Data Clearance Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
                <HardDrive className="w-4 h-4 text-orange-400" />
                <span>Your Stored Data (Requires Your Approval)</span>
              </h4>
              <button
                onClick={fetchStats}
                disabled={isLoading}
                className="text-[11px] text-slate-400 hover:text-white flex items-center space-x-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Upload History */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <Youtube className="w-4 h-4 text-red-400" />
                      <span className="text-xs font-bold text-white">Upload History</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {stats ? `${stats.uploadJobsCount} record${stats.uploadJobsCount !== 1 ? 's' : ''}` : 'Loading...'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleRequestClear(
                    'history',
                    'Upload History',
                    'This will remove all your completed and recorded YouTube upload history from the database.'
                  )}
                  disabled={!stats || stats.uploadJobsCount === 0}
                  className="w-full py-1.5 text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center space-x-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear History</span>
                </button>
              </div>

              {/* YouTube Tokens & Channel */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <Youtube className="w-4 h-4 text-red-500" />
                      <span className="text-xs font-bold text-white">YouTube Channel Token</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 truncate max-w-[170px]">
                      {stats?.hasYouTube ? (stats.youtubeChannel || 'Linked') : 'Not Connected'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleRequestClear(
                    'youtube',
                    'YouTube Channel Connection',
                    'This will revoke and delete your saved YouTube OAuth access and refresh tokens from the database.'
                  )}
                  disabled={!stats || !stats.hasYouTube}
                  className="w-full py-1.5 text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center space-x-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Revoke Access</span>
                </button>
              </div>
            </div>
          </div>

          {/* 3. Danger Zone: Wipe All User Data */}
          <div className="border border-red-500/30 bg-red-950/20 rounded-2xl p-4 space-y-3">
            <div className="flex items-center space-x-2 text-rose-400">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Danger Zone &bull; Complete Wipe</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Permanently erase all your database records, upload history, YouTube tokens, and project preferences.
            </p>
            <button
              onClick={() => handleRequestClear(
                'all',
                'All Account Data',
                'WARNING: This will permanently delete all your upload history, YouTube tokens, settings, and active login sessions!'
              )}
              className="px-4 py-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:scale-98 text-white text-xs font-bold rounded-xl shadow-lg shadow-red-500/20 cursor-pointer flex items-center space-x-2 transition-all"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear All My Account Data</span>
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>

      {/* Explicit User Confirmation Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-5 space-y-4 shadow-2xl animate-scaleUp">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Approve Data Deletion</h4>
                <p className="text-xs text-rose-300 font-semibold">{confirmDialog.title}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/70 p-3 rounded-xl border border-slate-800">
              {confirmDialog.description}
            </p>

            <div className="flex items-center justify-end space-x-2.5 pt-2">
              <button
                onClick={() => setConfirmDialog(null)}
                disabled={isClearing}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClear}
                disabled={isClearing}
                className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 rounded-xl shadow-lg shadow-red-500/20 flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isClearing ? 'Clearing...' : 'Yes, Delete Data'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
