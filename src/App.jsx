import React, { useState } from 'react';
import Header from './components/Header';
import VideoUploader from './components/VideoUploader';
import VideoPreview from './components/VideoPreview';
import Timeline from './components/Timeline';
import EditorTabs from './components/EditorTabs';
import ProcessingQueue from './components/ProcessingQueue';
import GeneratedClips from './components/GeneratedClips';
import YouTubeUploadHistory from './components/YouTubeUploadHistory';
import { generateClipFilename } from './utils/filename';
import { useProcessingQueue } from './hooks/useProcessingQueue';
import { useYouTube } from './hooks/useYouTube';
import { useUploadQueue } from './hooks/useUploadQueue';
import { Check, Info, X, Film, Palette, Layers, Sparkles } from 'lucide-react';

export default function App() {
  // Video Source State
  const [videoData, setVideoData] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);

  // Mobile Active View: 'preview' (Preview + Timeline), 'style' (EditorTabs), 'queue' (Queue + Output)
  const [mobileView, setMobileView] = useState('preview');

  // Timeline / Range / Parts State
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [clipDuration, setClipDuration] = useState(60);
  const [customParts, setCustomParts] = useState([]);

  // Preview Modal for Completed Clip
  const [previewClipModal, setPreviewClipModal] = useState(null);

  // Toast Notification State
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (message, type = 'info') => {
    setToastMessage({ message, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Editing Settings State
  const [cropSettings, setCropSettings] = useState({
    mode: '9:16',
    fillMode: 'fit',
    customWidth: 60,
    customHeight: 85,
    x: 0,
    y: 0,
    zoom: 1,
    faceTracking: false
  });

  // Top & Bottom Background Backdrop Settings
  const [bgSettings, setBgSettings] = useState({
    type: 'blur-video',
    blur: 20,
    opacity: 65,
    imageFile: null,
    imageUrl: null,
    color: '#000000'
  });

  const [textSettings, setTextSettings] = useState({
    enabled: true,
    movieName: 'My Movie',
    template: '{movie} - Part {part}',
    startPart: 1,
    zeroPad: true,
    font: 'Inter, sans-serif',
    fontSize: 28,
    color: '#ffffff',
    outline: true,
    outlineColor: '#000000',
    outlineThickness: 3,
    bgEnabled: false,
    bgColor: '#000000',
    position: 'top-center',
    customY: 10,
    customX: 50,
    extraTexts: []
  });

  const [logoSettings, setLogoSettings] = useState({
    enabled: false,
    file: null,
    url: null,
    size: 70,
    opacity: 85,
    position: 'top-right'
  });

  const [effectsSettings, setEffectsSettings] = useState({
    preset: 'normal',
    brightness: 100,
    contrast: 100,
    saturation: 100,
    sepia: 0,
    grayscale: 0,
    invert: 0,
    blur: 0,
    fadeIn: false,
    fadeInDuration: 0.5,
    fadeOut: false,
    fadeOutDuration: 0.5
  });

  const [audioSettings, setAudioSettings] = useState({
    speed: 1.0,
    volume: 100,
    silentMonitoring: false,
    voiceoverEnabled: false,
    voiceoverFile: null,
    voiceoverUrl: null,
    voiceoverVolume: 100,
    autoDucking: true,
    bgMusicEnabled: false,
    bgMusicFile: null,
    bgMusicUrl: null,
    bgMusicVolume: 30,
    muteOriginal: false
  });

  const [exportSettings, setExportSettings] = useState({
    format: 'mp4',
    resolution: '1080p',
    bitrate: 'high',
    fps: 'original',
    audioBitrate: '256k',
    concurrency: 1
  });

  // ── Processing Queue Hook (existing — unchanged) ──────────────────────────────
  const {
    queue,
    completedClips,
    isProcessing,
    isZipping,
    zipProgress,
    addJob,
    addJobs,
    cancelJob,
    clearQueue,
    downloadClip,
    downloadAllZip
  } = useProcessingQueue();

  // ── YouTube Hook (new — optional, degrades gracefully when unconfigured) ──────
  const {
    ytAccount,
    isConnected,
    isLoadingAccount,
    accountError,
    connectYouTube,
    disconnectYouTubeAccount,
    refreshAccount,
    ytSettings,
    isLoadingSettings,
    isSavingSettings,
    updateYtSettings,
    persistSettings,
    brandingPresets,
    isLoadingPresets,
    addBrandingPreset,
    editBrandingPreset,
    removeBrandingPreset,
    renderTemplate,
    apiAvailable
  } = useYouTube();

  // ── Upload Queue Hook (new — optional pipeline, extends existing queue) ────────
  const {
    uploadJobs,
    uploadHistory,
    isLoadingHistory,
    uploadClip,
    cancelUpload,
    retryUpload,
    refreshHistory
  } = useUploadQueue({
    completedClips,
    isConnected,
    ytSettings,
    renderTemplate,
    movieName: textSettings.movieName
  });

  // ── Handle Video Loading and Auto-Detection ───────────────────────────────────
  const handleVideoSelect = (data) => {
    setVideoData(data);
    setStartTime(0);
    setEndTime(data.duration);
    setCurrentTime(0);

    // Auto-populate movie name from filename (cleaned)
    const baseName = data.file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
    setTextSettings((prev) => ({
      ...prev,
      movieName: baseName
    }));

    // Auto configure smart export profile based on detected media
    if (data.detectedQuality || data.detectedFps) {
      setExportSettings((prev) => ({
        ...prev,
        resolution: data.detectedQuality?.recommendedRes || prev.resolution,
        fps: data.detectedFps?.recommendedFps || prev.fps
      }));
    }

    showToast(`Loaded "${data.file.name}" (${Math.round(data.duration)}s) successfully!`, 'success');
  };

  // Derive total calculated parts
  const selectedDuration = Math.max(0, endTime - startTime);
  const totalPossibleParts = customParts && customParts.length > 0
    ? customParts.length
    : clipDuration > 0 && selectedDuration > 0
    ? Math.ceil(selectedDuration / clipDuration)
    : 1;

  // ── Batch Generation Trigger ─────────────────────────────────────────────────
  const handleGenerateQueue = ({ mode, count, start, end }) => {
    if (!videoData) return;

    let partsToGenerate = [];

    if (customParts && customParts.length > 0) {
      if (mode === 'all') {
        partsToGenerate = [...customParts];
      } else if (mode === 'first-n') {
        partsToGenerate = customParts.slice(0, count);
      } else if (mode === 'range') {
        partsToGenerate = customParts.slice(Math.max(0, start - 1), end);
      }
    } else {
      // Fallback math calculation if customParts isn't set
      const numClips = Math.max(1, Math.ceil(selectedDuration / clipDuration));
      const fullList = [];
      for (let i = 0; i < numClips; i++) {
        const segStart = Math.round((startTime + i * clipDuration) * 10) / 10;
        const segEnd = Math.min(endTime, Math.round((segStart + clipDuration) * 10) / 10);
        fullList.push({
          partNumber: i + 1,
          startTime: segStart,
          endTime: segEnd
        });
      }

      if (mode === 'all') {
        partsToGenerate = fullList;
      } else if (mode === 'first-n') {
        partsToGenerate = fullList.slice(0, count);
      } else if (mode === 'range') {
        partsToGenerate = fullList.slice(Math.max(0, start - 1), end);
      }
    }

    if (partsToGenerate.length === 0) {
      showToast('No parts selected for generation.', 'error');
      return;
    }

    const newJobs = partsToGenerate.map((part, idx) => {
      const partNum = part.partNumber || (idx + 1);
      const filename = generateClipFilename({
        movieName: textSettings.movieName || 'Clip',
        partNumber: partNum,
        template: textSettings.template || '{movie} - Part {part}',
        zeroPad: textSettings.zeroPad,
        extension: exportSettings.format || 'mp4'
      });

      return {
        id: `job-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
        name: filename,
        partNumber: partNum,
        startTime: part.startTime,
        endTime: part.endTime,
        duration: part.endTime - part.startTime,
        videoData,
        cropSettings,
        bgSettings,
        textSettings: {
          ...textSettings,
          currentPart: partNum,
          totalParts: totalPossibleParts
        },
        logoSettings,
        effectsSettings,
        audioSettings,
        exportSettings
      };
    });

    addJobs(newJobs);

    showToast(`Added ${newJobs.length} clips to processing queue!`, 'success');
  };

  const handleApplyToAll = () => {
    showToast('Current styling & presets will be applied to all generated parts!', 'success');
  };

  const handleDownloadAllZip = async () => {
    if (completedClips.length === 0) {
      showToast('No completed clips to download.', 'error');
      return;
    }
    try {
      await downloadAllZip(textSettings.movieName || 'Video_Clips');
      showToast('Downloaded all clips in a single ZIP file!', 'success');
    } catch (err) {
      showToast('Failed to create ZIP file. Try downloading clips individually.', 'error');
    }
  };

  const handleCropReset = () => {
    setCropSettings({
      mode: '9:16',
      fillMode: 'fit',
      customWidth: 60,
      customHeight: 85,
      x: 0,
      y: 0,
      zoom: 1,
      faceTracking: false
    });
    showToast('Crop settings reset to default.', 'info');
  };

  const handleEffectsReset = () => {
    setEffectsSettings({
      preset: 'normal',
      brightness: 100,
      contrast: 100,
      saturation: 100,
      sepia: 0,
      grayscale: 0,
      invert: 0,
      blur: 0,
      fadeIn: false,
      fadeInDuration: 0.5,
      fadeOut: false,
      fadeOutDuration: 0.5
    });
    showToast('Effects reset to normal.', 'info');
  };

  // ── Handle YouTube upload callbacks ──────────────────────────────────────────
  const handleUploadClip = (clip) => {
    if (!isConnected) {
      showToast('Connect YouTube first to upload clips.', 'error');
      return;
    }
    uploadClip(clip);
    showToast(`Starting YouTube upload for Part ${clip.partNumber || ''}...`, 'info');
  };

  const handleRetryUpload = (clip) => {
    if (!clip.blob) {
      showToast('Clip blob is no longer available. Please re-export to retry.', 'error');
      return;
    }
    retryUpload(clip);
    showToast('Retrying YouTube upload...', 'info');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-orange-500/30 selection:text-orange-200 pb-safe">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 sm:bottom-6 left-4 right-4 sm:left-auto sm:right-6 z-50 animate-bounce">
          <div
            className={`flex items-center justify-between sm:justify-start space-x-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md ${
              toastMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : toastMessage.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-orange-500/10 border-orange-500/30 text-orange-300'
            }`}
          >
            <div className="flex items-center space-x-2.5 min-w-0">
              {toastMessage.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <Info className="w-4 h-4 text-orange-400 shrink-0" />
              )}
              <span className="text-xs font-medium truncate">{toastMessage.message}</span>
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className="p-1 hover:bg-white/10 rounded-md cursor-pointer ml-2 shrink-0 touch-manipulation"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Top Header */}
      <Header />

      {/* Main Application Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Step 1: Video Uploader Area */}
        <section className="space-y-2">
          <VideoUploader onVideoSelect={handleVideoSelect} currentVideo={videoData} />
        </section>

        {/* Workspace Grid (When video is loaded) */}
        {videoData && (
          <>
            {/* Mobile View Mode Navigation Switcher (visible on screens < lg) */}
            <div className="lg:hidden bg-slate-900 border border-slate-800 rounded-2xl p-1.5 grid grid-cols-3 gap-1 shadow-lg touch-manipulation sticky top-16 z-30 backdrop-blur-md bg-slate-900/95">
              <button
                onClick={() => setMobileView('preview')}
                className={`py-2 px-1 text-xs font-semibold rounded-xl flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                  mobileView === 'preview'
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Film className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Preview &amp; Cut</span>
              </button>

              <button
                onClick={() => setMobileView('style')}
                className={`py-2 px-1 text-xs font-semibold rounded-xl flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                  mobileView === 'style'
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Palette className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Style &amp; Text</span>
              </button>

              <button
                onClick={() => setMobileView('queue')}
                className={`py-2 px-1 text-xs font-semibold rounded-xl flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                  mobileView === 'queue'
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  Queue {queue.length > 0 || completedClips.length > 0 ? `(${queue.length + completedClips.length})` : ''}
                </span>
              </button>
            </div>

            {/* Desktop 2-Column Workspace Layout (and Responsive Mobile Panels) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
              {/* Left Column: Player & Interactive Canvas */}
              <div className={`lg:col-span-7 space-y-4 sm:space-y-6 ${mobileView === 'preview' ? 'block' : 'hidden lg:block'}`}>
                <VideoPreview
                  videoData={videoData}
                  currentTime={currentTime}
                  onTimeUpdate={setCurrentTime}
                  cropSettings={cropSettings}
                  onCropChange={setCropSettings}
                  bgSettings={bgSettings}
                  textSettings={textSettings}
                  onTextChange={setTextSettings}
                  logoSettings={logoSettings}
                  onLogoChange={setLogoSettings}
                  effectsSettings={effectsSettings}
                  audioSettings={audioSettings}
                />

                {/* Timeline Range Scrubber & Manual Parts Time Table */}
                <Timeline
                  duration={videoData.duration}
                  startTime={startTime}
                  endTime={endTime}
                  currentTime={currentTime}
                  onStartChange={setStartTime}
                  onEndChange={setEndTime}
                  onCurrentTimeChange={setCurrentTime}
                  clipDuration={clipDuration}
                  onClipDurationChange={setClipDuration}
                  movieName={textSettings.movieName}
                  customParts={customParts}
                  onCustomPartsChange={setCustomParts}
                />
              </div>

              {/* Right Column: Multi-tab Editing Panel */}
              <div className={`lg:col-span-5 space-y-4 sm:space-y-6 ${mobileView === 'style' ? 'block' : 'hidden lg:block'}`}>
                <EditorTabs
                  cropSettings={cropSettings}
                  onCropChange={setCropSettings}
                  onCropReset={handleCropReset}
                  bgSettings={bgSettings}
                  onBgChange={setBgSettings}
                  textSettings={textSettings}
                  onTextChange={setTextSettings}
                  logoSettings={logoSettings}
                  onLogoChange={setLogoSettings}
                  effectsSettings={effectsSettings}
                  onEffectsChange={setEffectsSettings}
                  onEffectsReset={handleEffectsReset}
                  audioSettings={audioSettings}
                  onAudioChange={setAudioSettings}
                  exportSettings={exportSettings}
                  onExportChange={setExportSettings}
                  sourceResolution={{ width: videoData.width, height: videoData.height }}
                  detectedAudio={videoData.detectedAudio}
                  detectedFps={videoData.detectedFps}
                  detectedQuality={videoData.detectedQuality}
                  onApplyToAll={handleApplyToAll}
                  // YouTube props
                  ytAccount={ytAccount}
                  isConnected={isConnected}
                  isLoadingAccount={isLoadingAccount}
                  accountError={accountError}
                  connectYouTube={connectYouTube}
                  disconnectYouTubeAccount={disconnectYouTubeAccount}
                  refreshAccount={refreshAccount}
                  ytSettings={ytSettings}
                  updateYtSettings={updateYtSettings}
                  persistSettings={persistSettings}
                  isSavingSettings={isSavingSettings}
                  apiAvailable={apiAvailable}
                  // Branding props
                  brandingPresets={brandingPresets}
                  addBrandingPreset={addBrandingPreset}
                  editBrandingPreset={editBrandingPreset}
                  removeBrandingPreset={removeBrandingPreset}
                  isLoadingPresets={isLoadingPresets}
                />
              </div>
            </div>

            {/* Bottom Row: Batch Processing Queue & Output */}
            <div className={`space-y-4 sm:space-y-6 pt-1 sm:pt-2 ${mobileView === 'queue' ? 'block' : 'hidden lg:block'}`}>
              <ProcessingQueue
                queue={queue}
                onGenerateQueue={handleGenerateQueue}
                onCancelJob={cancelJob}
                onClearQueue={clearQueue}
                onPreviewClip={(clip) => setPreviewClipModal(clip)}
                onDownloadClip={downloadClip}
                isProcessing={isProcessing}
                totalPossibleParts={totalPossibleParts}
                // YouTube upload integration
                uploadJobs={uploadJobs}
                onUploadClip={handleUploadClip}
                onCancelUpload={cancelUpload}
                onRetryUpload={handleRetryUpload}
                isConnected={isConnected}
              />

              <GeneratedClips
                completedClips={completedClips}
                onDownloadClip={downloadClip}
                onDownloadAllZip={handleDownloadAllZip}
                isZipping={isZipping}
                zipProgress={zipProgress}
                movieName={textSettings.movieName}
                // YouTube upload integration
                uploadJobs={uploadJobs}
                onUploadClip={handleUploadClip}
                onRetryUpload={handleRetryUpload}
                isConnected={isConnected}
              />

              {/* YouTube Upload History (only shown when there are history records) */}
              <YouTubeUploadHistory
                uploadHistory={uploadHistory}
                uploadJobs={uploadJobs}
                isLoadingHistory={isLoadingHistory}
                onRetry={handleRetryUpload}
                onRefresh={refreshHistory}
                completedClips={completedClips}
              />
            </div>
          </>
        )}
      </main>

      {/* Completed Clip Modal Preview */}
      {previewClipModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150 max-h-[92vh] flex flex-col">
            <div className="p-3.5 sm:p-4 border-b border-slate-800 flex items-center justify-between">
              <span className="font-semibold text-xs sm:text-sm text-white truncate max-w-[200px] sm:max-w-xs">{previewClipModal.name}</span>
              <button
                onClick={() => setPreviewClipModal(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer touch-manipulation"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
            <div className="p-3 sm:p-4 bg-black flex justify-center flex-1 min-h-0">
              <video
                src={previewClipModal.outputUrl}
                controls
                autoPlay
                className="max-h-[55vh] rounded-lg shadow-lg w-auto object-contain"
              />
            </div>
            <div className="p-3.5 sm:p-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => downloadClip(previewClipModal)}
                className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 active:scale-98 text-white font-semibold text-xs rounded-xl shadow-lg shadow-orange-500/20 cursor-pointer touch-manipulation flex items-center justify-center space-x-1.5"
              >
                Download This Part
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
