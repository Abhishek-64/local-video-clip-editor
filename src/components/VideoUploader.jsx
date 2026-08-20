import React, { useRef, useState } from 'react';
import { UploadCloud, FileVideo, AlertCircle, CheckCircle2, Sparkles, Zap, Mic, Film } from 'lucide-react';
import { detectVideoQuality, detectVideoFps, detectAudioAndVoice } from '../utils/mediaDetector';

export default function VideoUploader({ onVideoSelect, currentVideo }) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleFileInput = (e) => {
    setError(null);
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const processFile = async (file) => {
    if (!file.type.startsWith('video/') && !file.name.match(/\.(mp4|mov|webm|mkv|avi|m4v)$/i)) {
      setError('Please select a valid video file (.mp4, .mov, .webm, .mkv, .avi)');
      return;
    }

    setIsAnalyzing(true);
    const objectUrl = URL.createObjectURL(file);
    const videoElement = document.createElement('video');
    videoElement.preload = 'auto';
    videoElement.muted = true;

    videoElement.onloadedmetadata = async () => {
      const srcWidth = videoElement.videoWidth || 1920;
      const srcHeight = videoElement.videoHeight || 1080;

      // 1. Auto-Detect Video Quality Profile
      const qualityProfile = detectVideoQuality(srcWidth, srcHeight);

      // 2. Auto-Detect Voice & Audio Profile
      const audioProfile = await detectAudioAndVoice(videoElement);

      // 3. Auto-Detect Frame Rate (FPS)
      let fpsProfile = { fps: 30, label: '30 FPS (Standard)', fpsKey: '30' };
      try {
        fpsProfile = await detectVideoFps(videoElement);
      } catch (e) {}

      setIsAnalyzing(false);

      onVideoSelect({
        file,
        name: file.name,
        size: file.size,
        type: file.type || 'video/mp4',
        duration: videoElement.duration || 0,
        width: srcWidth,
        height: srcHeight,
        url: objectUrl,
        detectedQuality: qualityProfile,
        detectedFps: fpsProfile,
        detectedAudio: audioProfile
      });
    };

    videoElement.onerror = () => {
      setIsAnalyzing(false);
      setError('Unable to load video metadata. The format may be unsupported or corrupted.');
    };

    videoElement.src = objectUrl;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.mkv,.mov,.mp4,.webm,.avi"
        onChange={handleFileInput}
        className="hidden"
      />

      {!currentVideo ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 ${
            isDragging
              ? 'border-orange-500 bg-orange-500/10 scale-[1.01]'
              : 'border-slate-700 bg-slate-900/60 hover:bg-slate-900 hover:border-slate-600'
          }`}
        >
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 border border-orange-500/30 flex items-center justify-center mb-4 text-orange-400 group-hover:scale-110 transition-transform">
            <UploadCloud className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">
            Choose a video or drag & drop here
          </h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-4">
            Supports MP4, MOV, WebM, MKV, AVI. Auto-detects native Quality, Voice/Audio, and FPS automatically.
          </p>

          <div className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-medium rounded-xl text-sm shadow-lg shadow-orange-500/20 transition-all">
            <FileVideo className="w-4 h-4" />
            <span>{isAnalyzing ? 'Analyzing Video...' : 'Select Local Video'}</span>
          </div>

          {error && (
            <div className="mt-4 flex items-center justify-center space-x-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 py-2 px-3 rounded-lg max-w-md mx-auto">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 flex-shrink-0">
                <FileVideo className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate max-w-xs sm:max-w-md" title={currentVideo.name}>
                  {currentVideo.name}
                </p>
                <div className="flex items-center space-x-2 text-xs text-slate-400 mt-0.5">
                  <span>{currentVideo.width} × {currentVideo.height}</span>
                  <span>&bull;</span>
                  <span>{formatFileSize(currentVideo.size)}</span>
                  <span>&bull;</span>
                  <span className="text-emerald-400 flex items-center">
                    <CheckCircle2 className="w-3 h-3 mr-1 inline" /> Loaded Locally
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              Change File
            </button>
          </div>

          {/* ── AUTO-DETECTED MEDIA BADGES ── */}
          <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-400 flex items-center mr-1">
              <Sparkles className="w-3 h-3 mr-1 text-amber-400" />
              Auto-Detected:
            </span>

            {/* Quality Badge */}
            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-orange-500/10 text-orange-300 border border-orange-500/30">
              <Film className="w-3 h-3 text-orange-400" />
              <span>Quality: {currentVideo.detectedQuality?.shortName || `${currentVideo.height}p`} ({currentVideo.width}×{currentVideo.height})</span>
            </span>

            {/* FPS Badge */}
            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              <Zap className="w-3 h-3 text-emerald-400" />
              <span>FPS: {currentVideo.detectedFps?.label || '30 FPS'}</span>
            </span>

            {/* Audio & Voice Badge */}
            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-purple-500/10 text-purple-300 border border-purple-500/30">
              <Mic className="w-3 h-3 text-purple-400" />
              <span>Voice: {currentVideo.detectedAudio?.label || 'Audio Active'}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
