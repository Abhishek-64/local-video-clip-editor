import React, { useRef, useState } from 'react';
import {
  UploadCloud, FileVideo, AlertCircle, CheckCircle2
} from 'lucide-react';
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
    <div className="w-full relative">
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
          className={`border-2 border-dashed rounded-2xl p-5 sm:p-8 text-center transition-all duration-200 ${
            isDragging
              ? 'border-orange-500 bg-orange-500/10 scale-[1.01]'
              : 'border-slate-700 bg-slate-900/60 hover:bg-slate-900/90 hover:border-slate-600'
          }`}
        >
          <div className="mx-auto w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 border border-orange-500/30 flex items-center justify-center mb-3 sm:mb-4 text-orange-400 shadow-inner">
            <UploadCloud className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-white mb-1">
            Choose a video or drag &amp; drop here
          </h3>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto mb-4 leading-relaxed">
            Supports MP4, MOV, WebM, MKV, AVI. Auto-detects Quality, Voice/Audio, and FPS automatically.
          </p>

          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-medium rounded-xl text-xs sm:text-sm shadow-lg shadow-orange-500/20 transition-all touch-manipulation cursor-pointer active:scale-95"
            >
              <FileVideo className="w-4 h-4" />
              <span>{isAnalyzing ? 'Analyzing Video...' : 'Select Local Video'}</span>
            </button>
          </div>

          {error && (
            <div className="mt-4 flex items-center justify-center space-x-2 text-rose-400 text-xs sm:text-sm bg-rose-500/10 border border-rose-500/20 py-2 px-3 rounded-lg max-w-md mx-auto">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 sm:p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0">
                <FileVideo className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-white truncate max-w-[180px] sm:max-w-md" title={currentVideo.name}>
                  {currentVideo.name}
                </p>
                <div className="flex items-center space-x-1.5 sm:space-x-2 text-[11px] sm:text-xs text-slate-400 mt-0.5 font-mono">
                  <span>{currentVideo.width}×{currentVideo.height}</span>
                  <span>•</span>
                  <span>{formatFileSize(currentVideo.size)}</span>
                  <span>•</span>
                  <span className="text-emerald-400 hidden xs:inline-flex items-center">
                    <CheckCircle2 className="w-3 h-3 mr-1 inline" /> Ready
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer shrink-0 touch-manipulation"
            >
              Change File
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
