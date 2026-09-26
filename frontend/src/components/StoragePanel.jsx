import React, { useState, useEffect, useMemo } from 'react';
import {
  Database, HardDrive, Trash2, RefreshCw, AlertTriangle, ShieldCheck,
  CheckCircle2, ExternalLink, FileVideo, Youtube, Share2, Instagram,
  FileText, X, AlertCircle, Sparkles, Layers, Check, Download,
  CheckSquare, Square, MinusSquare, Sparkle, Search
} from 'lucide-react';
import {
  getStorageOverview,
  deleteB2File,
  deleteAllB2Files,
  deleteBatchB2Files,
  triggerPermanentCleanup,
  clearDataScope,
  wipeAllUserData
} from '../services/apiService';

export default function StoragePanel({
  isAuthenticated,
  onDataWiped,
  showToast
}) {
  const [overview, setOverview] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState(null);
  const [isDeletingAllB2, setIsDeletingAllB2] = useState(false);

  // Multi-select for B2 files
  const [selectedB2FileIds, setSelectedB2FileIds] = useState(new Set());
  const [isDeletingBatchB2, setIsDeletingBatchB2] = useState(false);
  const [isCleaningDb, setIsCleaningDb] = useState(false);
  const [fileSearchQuery, setFileSearchQuery] = useState('');

  // Scope clearance state: { scope, title, description }
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [isClearingScope, setIsClearingScope] = useState(false);

  // Total wipe confirmation modal
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [isWipingAll, setIsWipingAll] = useState(false);

  const db = overview?.database || {};
  const b2 = overview?.b2 || {};

  // Filter B2 files by search query
  const filteredFiles = useMemo(() => {
    const files = b2.files || [];
    if (!fileSearchQuery.trim()) return files;
    const q = fileSearchQuery.toLowerCase().trim();
    return files.filter(f => f.fileName && f.fileName.toLowerCase().includes(q));
  }, [b2.files, fileSearchQuery]);

  const fetchOverview = async () => {
    setIsLoading(true);
    try {
      const data = await getStorageOverview();
      if (data?.success) {
        setOverview(data);
      }
    } catch (err) {
      console.warn('Failed to load storage overview:', err);
      if (showToast) showToast('Could not load storage status: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  // Handle single B2 file deletion
  const handleDeleteB2File = async (file) => {
    if (!window.confirm(`Are you sure you want to delete "${file.fileName}" from B2 storage?`)) return;

    setDeletingFileId(file.fileId);
    try {
      const res = await deleteB2File({ fileId: file.fileId, fileName: file.fileName });
      if (res?.success) {
        if (showToast) showToast(`Deleted ${file.fileName} from B2`, 'success');
        fetchOverview();
      } else {
        if (showToast) showToast(res?.error || 'Failed to delete file from B2', 'error');
      }
    } catch (err) {
      if (showToast) showToast('Error deleting file: ' + err.message, 'error');
    } finally {
      setDeletingFileId(null);
    }
  };

  // Handle delete all B2 files
  const handleDeleteAllB2 = async () => {
    if (!window.confirm('Are you sure you want to delete ALL temporary files in the Backblaze B2 bucket?')) return;

    setIsDeletingAllB2(true);
    try {
      const res = await deleteAllB2Files();
      if (res?.success) {
        if (showToast) showToast(`Deleted ${res.deletedCount || 0} temporary files from B2`, 'success');
        fetchOverview();
      } else {
        if (showToast) showToast(res?.error || 'Failed to delete B2 files', 'error');
      }
    } catch (err) {
      if (showToast) showToast('Error clearing B2: ' + err.message, 'error');
    } finally {
      setIsDeletingAllB2(false);
    }
  };

  // Selection helpers for B2 files
  const isAllB2Selected = useMemo(() => {
    return filteredFiles.length > 0 && filteredFiles.every(f => selectedB2FileIds.has(f.fileId));
  }, [filteredFiles, selectedB2FileIds]);

  const isSomeB2Selected = useMemo(() => {
    return selectedB2FileIds.size > 0 && !isAllB2Selected;
  }, [selectedB2FileIds, isAllB2Selected]);

  const handleToggleSelectB2 = (fileId) => {
    setSelectedB2FileIds(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  const handleSelectAllB2 = () => {
    if (isAllB2Selected) {
      setSelectedB2FileIds(new Set());
    } else {
      setSelectedB2FileIds(new Set(filteredFiles.map(f => f.fileId)));
    }
  };

  const handleDeleteSelectedB2 = async () => {
    if (selectedB2FileIds.size === 0 || isDeletingBatchB2) return;
    if (!window.confirm(`Permanently delete ${selectedB2FileIds.size} selected file(s) from Backblaze B2 bucket?`)) return;

    setIsDeletingBatchB2(true);
    try {
      const filesToDelete = (b2.files || [])
        .filter(f => selectedB2FileIds.has(f.fileId))
        .map(f => ({ fileId: f.fileId, fileName: f.fileName }));

      const res = await deleteBatchB2Files(filesToDelete);
      if (res?.success) {
        if (showToast) showToast(`Permanently deleted ${res.deletedCount ?? filesToDelete.length} files from B2`, 'success');
        setSelectedB2FileIds(new Set());
        fetchOverview();
      } else {
        if (showToast) showToast(res?.error || 'Failed to delete selected B2 files', 'error');
      }
    } catch (err) {
      if (showToast) showToast('Error deleting B2 files: ' + err.message, 'error');
    } finally {
      setIsDeletingBatchB2(false);
    }
  };

  // Handle on-demand permanent database cleanup (expired sessions, stale guests, 30-day logs)
  const handleRunPermanentCleanup = async () => {
    if (isCleaningDb) return;
    if (!window.confirm('Run permanent database cleanup? This will permanently purge expired sessions, stale guest data, and completed logs older than 30 days.')) return;

    setIsCleaningDb(true);
    try {
      const res = await triggerPermanentCleanup();
      if (res?.success) {
        if (showToast) showToast(res.message || 'Permanent database cleanup completed successfully!', 'success');
        fetchOverview();
      } else {
        if (showToast) showToast(res?.error || 'Database cleanup failed', 'error');
      }
    } catch (err) {
      if (showToast) showToast('Cleanup error: ' + err.message, 'error');
    } finally {
      setIsCleaningDb(false);
    }
  };

  // Handle scope clearance
  const handleScopeClearConfirm = async () => {
    if (!confirmDialog) return;
    setIsClearingScope(true);
    try {
      const res = await clearDataScope(confirmDialog.scope);
      if (res?.success) {
        if (showToast) showToast(`Cleared ${confirmDialog.title}!`, 'success');
        setConfirmDialog(null);
        fetchOverview();
      } else {
        if (showToast) showToast(res?.error || 'Failed to clear data.', 'error');
      }
    } catch (err) {
      if (showToast) showToast('Error: ' + err.message, 'error');
    } finally {
      setIsClearingScope(false);
    }
  };

  // Handle complete user wipe
  const handleExecuteWipeAll = async () => {
    setIsWipingAll(true);
    try {
      const res = await wipeAllUserData();
      if (res?.success) {
        if (showToast) showToast('All account data and storage have been completely wiped.', 'success');
        setShowWipeModal(false);
        if (onDataWiped) onDataWiped();
        fetchOverview();
      } else {
        if (showToast) showToast(res?.error || 'Failed to wipe data.', 'error');
      }
    } catch (err) {
      if (showToast) showToast('Error wiping account: ' + err.message, 'error');
    } finally {
      setIsWipingAll(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5 animate-fadeIn pb-8">
      {/* ── HEADER BANNER ── */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950/40 border border-slate-800 rounded-2xl p-3.5 sm:p-5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center space-x-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 shadow-md">
            <Database className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                Database &amp; Storage
              </h2>
            </div>
          </div>
        </div>

        <button
          onClick={fetchOverview}
          disabled={isLoading}
          className="w-full sm:w-auto px-3.5 py-2 bg-slate-800 hover:bg-slate-700 active:scale-98 text-slate-200 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
          <span>{isLoading ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* ── SECTION 1: BACKBLAZE B2 TEMPORARY STORAGE ── */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 sm:p-5 shadow-md space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div className="flex items-start sm:items-center space-x-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
              <HardDrive className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="text-sm font-bold text-white">Backblaze B2 Storage</h3>
                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[10px] font-medium shrink-0">
                  {b2.configured ? '✓ Active' : 'Not Configured'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                Bucket: <code className="text-amber-300 font-mono">{b2.bucketName || 'videoclip-reels'}</code> • Temp storage
              </p>
            </div>
          </div>

          {/* Quick Metrics & Actions */}
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
            <span className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-slate-300">
              <strong className="text-amber-400">{b2.fileCount || 0}</strong> files ({b2.totalMb || '0.00'} MB)
            </span>

            {selectedB2FileIds.size > 0 && (
              <button
                onClick={handleDeleteSelectedB2}
                disabled={isDeletingBatchB2}
                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold flex items-center space-x-1 cursor-pointer transition-colors shadow-sm active:scale-98"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeletingBatchB2 ? 'Deleting...' : `Delete Selected (${selectedB2FileIds.size})`}</span>
              </button>
            )}

            {(b2.fileCount || 0) > 0 && (
              <button
                onClick={handleDeleteAllB2}
                disabled={isDeletingAllB2}
                className="px-2.5 py-1 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 rounded-xl text-xs font-semibold flex items-center space-x-1 cursor-pointer transition-colors active:scale-98"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeletingAllB2 ? 'Deleting...' : 'Delete All'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Search Bar when files exist */}
        {b2.files && b2.files.length > 2 && (
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={fileSearchQuery}
              onChange={(e) => setFileSearchQuery(e.target.value)}
              placeholder="Search files by name..."
              className="w-full pl-8 pr-7 py-1.5 bg-slate-900/80 border border-slate-800 focus:border-amber-500/50 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none transition-colors"
            />
            {fileSearchQuery && (
              <button
                type="button"
                onClick={() => setFileSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* B2 Files Table / List */}
        {b2.error ? (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center space-x-2 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="break-all">{b2.error}</span>
          </div>
        ) : (b2.files && b2.files.length > 0) ? (
          filteredFiles.length === 0 && fileSearchQuery ? (
            <div className="p-6 text-center space-y-2 bg-slate-950/40 rounded-xl border border-slate-800">
              <Search className="w-6 h-6 text-slate-600 mx-auto" />
              <p className="text-xs font-semibold text-white">No Matching Files</p>
              <p className="text-[11px] text-slate-400">No B2 files matched "{fileSearchQuery}"</p>
              <button
                type="button"
                onClick={() => setFileSearchQuery('')}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 rounded-lg transition-colors cursor-pointer"
              >
                Clear Filter
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="overflow-y-auto overflow-x-auto max-h-[380px] sm:max-h-[440px] rounded-xl border border-slate-800 custom-scrollbar">
                <table className="w-full min-w-[440px] text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3 w-8 text-center bg-slate-900">
                        <button
                          type="button"
                          onClick={handleSelectAllB2}
                          className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                          title={isAllB2Selected ? "Deselect all" : "Select all B2 files"}
                        >
                          {isAllB2Selected ? (
                            <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                          ) : isSomeB2Selected ? (
                            <MinusSquare className="w-3.5 h-3.5 text-amber-400" />
                          ) : (
                            <Square className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </th>
                      <th className="py-2.5 px-3 font-semibold bg-slate-900">File Name</th>
                      <th className="py-2.5 px-3 font-semibold bg-slate-900">Size</th>
                      <th className="py-2.5 px-3 font-semibold bg-slate-900">Uploaded</th>
                      <th className="py-2.5 px-3 font-semibold text-right bg-slate-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                    {filteredFiles.map((file) => {
                      const sizeMb = (file.contentLength / (1024 * 1024)).toFixed(2);
                      const uploadDate = file.uploadTimestamp ? new Date(file.uploadTimestamp).toLocaleDateString() : 'N/A';
                      const isDeletingThis = deletingFileId === file.fileId;
                      const isSelected = selectedB2FileIds.has(file.fileId);

                      return (
                        <tr
                          key={file.fileId}
                          className={`transition-colors ${isSelected ? 'bg-amber-950/20 hover:bg-amber-950/30' : 'hover:bg-slate-900/50'}`}
                        >
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleSelectB2(file.fileId)}
                              className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                              title={isSelected ? "Deselect" : "Select"}
                            >
                              {isSelected ? (
                                <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                              ) : (
                                <Square className="w-3.5 h-3.5 text-slate-600 hover:text-slate-400" />
                              )}
                            </button>
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex items-center space-x-2 font-sans font-medium text-white min-w-0 max-w-[170px] sm:max-w-[260px]">
                              <FileVideo className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span className="truncate" title={file.fileName}>{file.fileName}</span>
                            </div>
                          </td>
                          <td className="py-2 px-3 text-amber-300 font-semibold text-[11px] whitespace-nowrap">
                            {sizeMb} MB
                          </td>
                          <td className="py-2 px-3 text-[11px] text-slate-400 font-sans whitespace-nowrap">
                            {uploadDate}
                          </td>
                          <td className="py-2 px-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end space-x-1.5">
                              {file.downloadUrl && (
                                <a
                                  href={file.downloadUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg transition-colors cursor-pointer"
                                  title="Download video"
                                >
                                  <Download className="w-3 h-3" />
                                </a>
                              )}
                              <button
                                onClick={() => handleDeleteB2File(file)}
                                disabled={isDeletingThis}
                                className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg text-[10px] font-sans font-semibold flex items-center space-x-1 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>{isDeletingThis ? '...' : 'Delete'}</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Summary Footer */}
              <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-0.5">
                <span>
                  Showing <strong className="text-white">{filteredFiles.length}</strong> {filteredFiles.length === 1 ? 'file' : 'files'}
                  {fileSearchQuery && ` (filtered from ${b2.files.length})`}
                </span>
                <span className="font-mono text-amber-400">
                  {b2.totalMb || '0.00'} MB total
                </span>
              </div>
            </div>
          )
        ) : (
          <div className="p-4 sm:p-5 text-center bg-slate-950/40 rounded-xl border border-dashed border-slate-800/80 space-y-1">
            <CheckCircle2 className="w-6 h-6 text-emerald-400/80 mx-auto" />
            <p className="text-xs font-semibold text-white">B2 Storage Clean</p>
            <p className="text-[11px] text-slate-500">No temporary files in bucket.</p>
          </div>
        )}
      </div>

      {/* ── SECTION 2: D1 DATABASE RECORDS BREAKDOWN ── */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 sm:p-5 shadow-md space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <Database className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Cloudflare D1 Records</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Templates, social accounts, and upload logs.
              </p>
            </div>
          </div>

          <button
            onClick={handleRunPermanentCleanup}
            disabled={isCleaningDb}
            className="px-3 py-1.5 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            title="Clean expired sessions, stale guests, and 30-day logs permanently"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isCleaningDb ? 'animate-spin' : ''}`} />
            <span>{isCleaningDb ? 'Cleaning...' : 'Run Auto-Cleanup'}</span>
          </button>
        </div>

        {/* 2-Column Responsive Grid on all screens */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Templates Card */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 flex flex-col justify-between space-y-2.5">
            <div>
              <div className="flex items-center space-x-1.5">
                <FileText className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="text-xs font-bold text-white truncate">Saved Templates</span>
              </div>
              <p className="text-base font-extrabold text-white font-mono mt-1">
                {db.templatesCount || 0} <span className="text-xs font-normal text-slate-400 font-sans">records</span>
              </p>
            </div>
            <button
              onClick={() => setConfirmDialog({
                scope: 'templates',
                title: 'Saved Templates',
                description: 'Delete all custom text, logo, and social description templates.'
              })}
              disabled={!db.templatesCount}
              className="w-full py-1.5 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1 transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear Templates</span>
            </button>
          </div>

          {/* Facebook Data Card */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 flex flex-col justify-between space-y-2.5">
            <div>
              <div className="flex items-center space-x-1.5">
                <Share2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="text-xs font-bold text-white truncate">Facebook Account</span>
              </div>
              <p className="text-xs text-slate-300 mt-1 truncate" title={db.facebookPage || 'Connected Page'}>
                {db.hasFacebook ? (db.facebookPage || 'Connected') : 'Not Connected'}
              </p>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                {db.facebookJobsCount || 0} upload jobs
              </p>
            </div>
            <button
              onClick={() => setConfirmDialog({
                scope: 'facebook',
                title: 'Facebook Data',
                description: 'Delete saved Facebook Page tokens and upload history.'
              })}
              disabled={!db.hasFacebook && !db.facebookJobsCount}
              className="w-full py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1 transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear Facebook</span>
            </button>
          </div>

          {/* Instagram Data Card */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 flex flex-col justify-between space-y-2.5">
            <div>
              <div className="flex items-center space-x-1.5">
                <Instagram className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                <span className="text-xs font-bold text-white truncate">Instagram Account</span>
              </div>
              <p className="text-xs text-slate-300 mt-1 truncate" title={db.instagramAccount || 'Connected Account'}>
                {db.hasInstagram ? (db.instagramAccount || 'Connected') : 'Not Connected'}
              </p>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                {db.instagramJobsCount || 0} upload jobs
              </p>
            </div>
            <button
              onClick={() => setConfirmDialog({
                scope: 'instagram',
                title: 'Instagram Data',
                description: 'Delete saved Instagram tokens and Reels upload jobs.'
              })}
              disabled={!db.hasInstagram && !db.instagramJobsCount}
              className="w-full py-1.5 bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/30 text-pink-300 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1 transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear Instagram</span>
            </button>
          </div>

          {/* YouTube Data Card */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 flex flex-col justify-between space-y-2.5">
            <div>
              <div className="flex items-center space-x-1.5">
                <Youtube className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <span className="text-xs font-bold text-white truncate">YouTube Channel</span>
              </div>
              <p className="text-xs text-slate-300 mt-1 truncate" title={db.youtubeChannel || 'Linked Channel'}>
                {db.hasYouTube ? (db.youtubeChannel || 'Linked') : 'Not Connected'}
              </p>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                {db.youtubeJobsCount || 0} upload jobs
              </p>
            </div>
            <button
              onClick={() => setConfirmDialog({
                scope: 'youtube',
                title: 'YouTube Data',
                description: 'Revoke YouTube tokens and delete upload history.'
              })}
              disabled={!db.hasYouTube && !db.youtubeJobsCount}
              className="w-full py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1 transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear YouTube</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── SECTION 3: DANGER ZONE & TOTAL CASCADE WIPE ── */}
      <div className="bg-gradient-to-br from-red-950/40 via-slate-950 to-rose-950/40 border border-red-500/30 rounded-2xl p-4 sm:p-5 space-y-3.5">
        <div className="flex items-start space-x-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-white tracking-tight">
              Danger Zone: Wipe All Data
            </h3>
          </div>
        </div>

        <button
          onClick={() => setShowWipeModal(true)}
          className="w-full py-2.5 px-4 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:scale-98 text-white text-xs font-bold rounded-xl shadow-lg shadow-red-500/20 flex items-center justify-center space-x-2 transition-all cursor-pointer touch-manipulation"
        >
          <Trash2 className="w-4 h-4 shrink-0" />
          <span>Wipe All Data &amp; Reset</span>
        </button>
      </div>

      {/* ── SCOPE CLEARANCE CONFIRMATION MODAL ── */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-4 sm:p-5 space-y-3.5 shadow-2xl animate-scaleUp">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-white">Delete Data</h4>
                <p className="text-xs text-rose-300 font-semibold truncate">{confirmDialog.title}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-normal bg-slate-950 p-3 rounded-xl border border-slate-800">
              {confirmDialog.description}
            </p>

            <div className="flex items-center justify-end space-x-2 pt-1">
              <button
                onClick={() => setConfirmDialog(null)}
                disabled={isClearingScope}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleScopeClearConfirm}
                disabled={isClearingScope}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isClearingScope ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{isClearingScope ? 'Deleting...' : 'Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOTAL WIPE ALL CONFIRMATION MODAL ── */}
      {showWipeModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border-2 border-red-500/40 rounded-2xl max-w-md w-full p-4 sm:p-5 space-y-3.5 shadow-2xl animate-scaleUp">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0">
                <AlertTriangle className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <h4 className="text-sm sm:text-base font-bold text-white">Permanently Wipe Everything?</h4>
                <p className="text-xs text-red-300 font-semibold">This action cannot be undone.</p>
              </div>
            </div>

            <div className="space-y-1.5 bg-slate-950 p-3 rounded-xl border border-red-500/20 text-xs text-slate-300">
              <p className="font-semibold text-white">The following will be deleted:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px]">
                <li>All saved custom templates and styles</li>
                <li>Facebook &amp; Instagram tokens and connections</li>
                <li>YouTube channel credentials</li>
                <li>All social upload history logs</li>
                <li>All temporary video files in Backblaze B2</li>
                <li>Active login sessions (signed out)</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setShowWipeModal(false)}
                disabled={isWipingAll}
                className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteWipeAll}
                disabled={isWipingAll}
                className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 shadow-lg shadow-red-500/30 transition-all cursor-pointer disabled:opacity-50"
              >
                {isWipingAll ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{isWipingAll ? 'Wiping...' : 'Yes, Delete All Data'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
