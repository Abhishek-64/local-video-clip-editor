import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { X, Download, AlertCircle, Play, Pause, Activity, RefreshCw, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatTime } from '../utils/time';
import { clipResourceManager } from '../services/export/exportResourceManager';

/**
 * Dedicated, High-Performance Native Video Player for Generated Clips
 *
 * Designed for immediate first-frame rendering and fluid HTML5 playback:
 * 1. Native declarative <video key={activeUrl} src={activeUrl} controls playsInline preload="auto" />
 *    - Eliminates all imperative src/load timing races.
 *    - Allows browser C++ media engine to buffer and render seamlessly.
 * 2. Zero artificial "stall recovery" loops that force video.load() on transient waiting events.
 * 3. Zero full-screen artificial buffering overlays blocking user interaction.
 * 4. Automatic fallback to fresh URL from in-memory blob if existing object URL is invalid.
 * 5. Single-shot background editor video suspension on mount; restoration on unmount.
 */
export default function GeneratedVideoPlayer({
  clip,
  allClips = [],
  onSelectClip,
  onClose,
  onDownload,
  onPauseBackgroundVideo,
  onResumeBackgroundVideo
}) {
  const videoRef = useRef(null);
  const [duration, setDuration] = useState(clip?.duration || 0);
  const [error, setError] = useState(null);
  const [showTelemetry, setShowTelemetry] = useState(false);
  const fallbackBlobUrlRef = useRef(null);

  // Determine initial video URL
  const initialUrl = useMemo(() => {
    if (!clip) return null;
    if (clip.outputUrl) return clip.outputUrl;
    if (clip.blob instanceof Blob) {
      return clipResourceManager.getVideoUrl(clip.id || 'preview-temp', clip.blob);
    }
    return null;
  }, [clip?.id, clip?.outputUrl, clip?.blob]);

  const [activeUrl, setActiveUrl] = useState(initialUrl);

  // Sync activeUrl when clip changes
  useEffect(() => {
    setActiveUrl(initialUrl);
    setError(null);
    setDuration(clip?.duration || 0);
    // Cleanup any temporary fallback URL on clip change
    if (fallbackBlobUrlRef.current && fallbackBlobUrlRef.current !== initialUrl) {
      try { URL.revokeObjectURL(fallbackBlobUrlRef.current); } catch (e) {}
      fallbackBlobUrlRef.current = null;
    }
  }, [initialUrl, clip?.duration]);

  // Current index for sequential clip switching
  const currentIndex = useMemo(() => {
    if (!allClips || allClips.length === 0 || !clip) return -1;
    return allClips.findIndex((c) => c.id === clip.id);
  }, [allClips, clip?.id]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < allClips.length - 1;

  // ── Single-shot mount effect: Pause background videos to free hardware decoders ──
  const onPauseBgRef = useRef(onPauseBackgroundVideo);
  onPauseBgRef.current = onPauseBackgroundVideo;

  useEffect(() => {
    if (onPauseBgRef.current) {
      try { onPauseBgRef.current(); } catch (e) {}
    }
    const timer = setTimeout(() => {
      try {
        document.querySelectorAll('video:not(#generated-preview-video)').forEach((v) => {
          if (!v.paused) {
            try { v.pause(); } catch (e) {}
          }
        });
      } catch (e) {}
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  // Protect active URL from revocation while modal is open
  useEffect(() => {
    if (activeUrl) {
      clipResourceManager.setActivePreviewUrl(activeUrl);
    }
    return () => {
      clipResourceManager.setActivePreviewUrl(null);
      if (fallbackBlobUrlRef.current) {
        try { URL.revokeObjectURL(fallbackBlobUrlRef.current); } catch (e) {}
      }
    };
  }, [activeUrl]);

  // Handle Video Error & Automatic In-Memory Fallback
  const handleVideoError = useCallback((e) => {
    const video = videoRef.current;
    console.warn('Generated clip playback error:', video?.error || e);
    // If the URL failed (e.g. revoked URL) and clip.blob is available, create a fresh object URL
    if (clip?.blob instanceof Blob && activeUrl !== fallbackBlobUrlRef.current) {
      try {
        const freshUrl = URL.createObjectURL(clip.blob);
        fallbackBlobUrlRef.current = freshUrl;
        setError(null);
        setActiveUrl(freshUrl);
        return;
      } catch (err) {}
    }
    setError(video?.error?.message || 'Failed to decode video stream');
  }, [clip?.blob, activeUrl]);

  // Clean close handler that restores background video preview
  const handleClose = useCallback(() => {
    if (onResumeBackgroundVideo) {
      try { onResumeBackgroundVideo(); } catch (e) {}
    }
    onClose?.();
  }, [onResumeBackgroundVideo, onClose]);

  // Manual reload (error state retry)
  const handleReload = useCallback(() => {
    setError(null);
    if (clip?.blob instanceof Blob) {
      try {
        const freshUrl = URL.createObjectURL(clip.blob);
        fallbackBlobUrlRef.current = freshUrl;
        setActiveUrl(freshUrl);
        return;
      } catch (err) {}
    }
    if (videoRef.current) {
      videoRef.current.load();
    }
  }, [clip?.blob]);

  // ── Development Diagnostics Telemetry ──────────────────────────────
  const [telemetry, setTelemetry] = useState({
    droppedFrames: 0,
    totalFrames: 0,
    dropRate: '0.0%',
    fps: 0,
    readyState: 0,
    networkState: 0
  });

  const rVfcIdRef = useRef(null);
  const lastVfcTimeRef = useRef(0);
  const vfcFrameCountRef = useRef(0);

  useEffect(() => {
    if (!showTelemetry) return;

    let isCancelled = false;

    const updateMetrics = () => {
      if (isCancelled || !videoRef.current) return;
      const video = videoRef.current;

      let dropped = 0;
      let total = 0;
      if (typeof video.getVideoPlaybackQuality === 'function') {
        const quality = video.getVideoPlaybackQuality();
        dropped = quality.droppedVideoFrames || 0;
        total = quality.totalVideoFrames || 0;
      }

      const dropRate = total > 0 ? ((dropped / total) * 100).toFixed(1) + '%' : '0.0%';

      setTelemetry((prev) => ({
        ...prev,
        droppedFrames: dropped,
        totalFrames: total,
        dropRate,
        readyState: video.readyState,
        networkState: video.networkState
      }));
    };

    const interval = setInterval(updateMetrics, 500);

    const onFrame = (now) => {
      if (isCancelled) return;
      vfcFrameCountRef.current++;
      if (!lastVfcTimeRef.current) lastVfcTimeRef.current = now;

      const elapsed = now - lastVfcTimeRef.current;
      if (elapsed >= 1000) {
        const calculatedFps = Math.round((vfcFrameCountRef.current * 1000) / elapsed);
        setTelemetry((prev) => ({ ...prev, fps: calculatedFps }));
        vfcFrameCountRef.current = 0;
        lastVfcTimeRef.current = now;
      }

      if (videoRef.current && typeof videoRef.current.requestVideoFrameCallback === 'function') {
        rVfcIdRef.current = videoRef.current.requestVideoFrameCallback(onFrame);
      }
    };

    if (videoRef.current && typeof videoRef.current.requestVideoFrameCallback === 'function') {
      rVfcIdRef.current = videoRef.current.requestVideoFrameCallback(onFrame);
    }

    return () => {
      isCancelled = true;
      clearInterval(interval);
      if (rVfcIdRef.current && videoRef.current && typeof videoRef.current.cancelVideoFrameCallback === 'function') {
        try { videoRef.current.cancelVideoFrameCallback(rVfcIdRef.current); } catch (e) {}
      }
    };
  }, [showTelemetry]);

  const isHealthyPlayback = parseFloat(telemetry.dropRate) < 1.0;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-4 space-y-3 shadow-2xl max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 gap-2">
          <div className="flex items-center space-x-2 min-w-0">
            <span className="font-bold text-sm text-white truncate max-w-[180px] sm:max-w-md">
              {clip?.name || 'Generated Clip'}
            </span>
            {currentIndex >= 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-800 text-slate-300 border border-slate-700 rounded-full shrink-0">
                {currentIndex + 1} / {allClips.length}
              </span>
            )}
            <span className="text-[10px] font-mono px-2 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded-full shrink-0 hidden xs:inline">
              Hardware H.264
            </span>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            {/* Sequential Clip Nav */}
            {allClips.length > 1 && onSelectClip && (
              <div className="flex items-center space-x-1 bg-slate-950/80 p-0.5 rounded-lg border border-slate-800 mr-1">
                <button
                  onClick={() => hasPrev && onSelectClip(allClips[currentIndex - 1])}
                  disabled={!hasPrev}
                  className="p-1 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 rounded cursor-pointer touch-manipulation"
                  title="Previous Clip"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => hasNext && onSelectClip(allClips[currentIndex + 1])}
                  disabled={!hasNext}
                  className="p-1 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 rounded cursor-pointer touch-manipulation"
                  title="Next Clip"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Telemetry Toggle */}
            <button
              onClick={() => setShowTelemetry(!showTelemetry)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                showTelemetry
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Toggle Playback Telemetry & Diagnostics"
            >
              <Activity className="w-4 h-4" />
            </button>

            <button
              onClick={handleClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
              title="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Video Canvas Container */}
        <div className="relative bg-black rounded-xl overflow-hidden flex items-center justify-center flex-1 min-h-[220px] max-h-[62vh]">
          {error ? (
            <div className="p-6 text-center space-y-2">
              <AlertCircle className="w-10 h-10 text-rose-400 mx-auto opacity-90" />
              <p className="text-xs text-rose-300 font-semibold">{error}</p>
              <button
                onClick={handleReload}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs text-white rounded-lg inline-flex items-center space-x-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3 mr-1" /> Reload Video
              </button>
            </div>
          ) : (
            <video
              key={activeUrl}
              id="generated-preview-video"
              ref={videoRef}
              src={activeUrl || undefined}
              controls
              playsInline
              preload="auto"
              className="max-h-[60vh] w-auto max-w-full object-contain rounded-lg shadow-2xl"
              onError={handleVideoError}
              onLoadedMetadata={(e) => {
                if (e.target.duration && !isNaN(e.target.duration) && isFinite(e.target.duration)) {
                  setDuration(e.target.duration);
                }
              }}
            />
          )}

          {/* Development Telemetry Overlay */}
          {showTelemetry && (
            <div className="absolute top-2 left-2 bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 text-[11px] font-mono text-slate-300 space-y-1 backdrop-blur shadow-xl pointer-events-none z-20">
              <div className="flex items-center justify-between space-x-3 text-white font-bold border-b border-slate-800 pb-1">
                <span>Playback Telemetry</span>
                <span className={`inline-flex items-center text-[10px] ${isHealthyPlayback ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {isHealthyPlayback ? <CheckCircle2 className="w-3 h-3 mr-1 inline" /> : null}
                  {isHealthyPlayback ? 'Zero Lag' : 'Frames Dropped'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pt-0.5">
                <span>Decode FPS:</span>
                <span className="text-white font-semibold">{telemetry.fps || 30} FPS</span>
                <span>Dropped Frames:</span>
                <span className={telemetry.droppedFrames > 0 ? 'text-rose-400 font-semibold' : 'text-emerald-400'}>
                  {telemetry.droppedFrames} ({telemetry.dropRate})
                </span>
                <span>Total Decoded:</span>
                <span className="text-slate-200">{telemetry.totalFrames}</span>
                <span>Decoder State:</span>
                <span className="text-slate-200">Ready {telemetry.readyState}/4</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
          <div className="text-xs text-slate-400 font-mono flex items-center space-x-2">
            <span>Duration: {formatTime(duration)}</span>
            {clip?.size && (
              <>
                <span>•</span>
                <span>{(clip.size / (1024 * 1024)).toFixed(1)} MB</span>
              </>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleClose}
              className="px-3.5 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              onClick={() => onDownload && onDownload(clip)}
              className="px-4 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-colors cursor-pointer flex items-center space-x-1.5 shadow-md shadow-emerald-500/20"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download MP4</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
