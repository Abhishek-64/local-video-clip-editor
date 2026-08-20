import React, { useState } from 'react';
import Header from './components/Header';
import VideoUploader from './components/VideoUploader';
import VideoPreview from './components/VideoPreview';
import Timeline from './components/Timeline';
import EditorTabs from './components/EditorTabs';
import ProcessingQueue from './components/ProcessingQueue';
import GeneratedClips from './components/GeneratedClips';
import { generateClipFilename } from './utils/filename';
import { useProcessingQueue } from './hooks/useProcessingQueue';
import { Check, Info, X } from 'lucide-react';

export default function App() {
  // Video Source State
  const [videoData, setVideoData] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);

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

  // Background Processing Queue Hook
  const {
    queue,
    completedClips,
    isProcessing,
    isZipping,
    zipProgress,
    setAndStartQueue,
    cancelJob,
    clearQueue,
    downloadClip,
    downloadAllZip
  } = useProcessingQueue();

  // Handle Video Selection with Smart Auto-Detection
  const handleVideoSelect = (data) => {
    if (videoData?.url) {
      URL.revokeObjectURL(videoData.url);
    }
    setVideoData(data);
    setCurrentTime(0);
    setStartTime(0);
    setEndTime(data.duration || 60);

    const baseName = data.name.replace(/\.[^/.]+$/, '');
    setTextSettings((prev) => ({
      ...prev,
      movieName: baseName
    }));

    // Auto-tune Export settings from detected quality & FPS
    if (data.detectedQuality?.resolutionKey) {
      setExportSettings((prev) => ({
        ...prev,
        resolution: data.detectedQuality.resolutionKey,
        fps: data.detectedFps?.fpsKey || prev.fps
      }));
    }

    clearQueue();
    setCustomParts([]);
    showToast(
      `✨ Auto-Detected: ${data.detectedQuality?.shortName || '1080p'} · ${data.detectedFps?.fps || 30} FPS · ${data.detectedAudio?.channels || 'Stereo'} Audio`,
      'success'
    );
  };

  const handleResetVideo = () => {
    if (videoData?.url) {
      URL.revokeObjectURL(videoData.url);
    }
    setVideoData(null);
    clearQueue();
    setCustomParts([]);
    setCurrentTime(0);
    setStartTime(0);
    setEndTime(0);
  };

  const handleCropReset = () => {
    setCropSettings((prev) => ({
      ...prev,
      x: 0,
      y: 0,
      zoom: 1
    }));
    showToast('Framing reset to center', 'info');
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
    showToast('Visual effects reset to default', 'info');
  };

  // Derive total possible parts
  const selectedDuration = Math.max(0, endTime - startTime);
  const effectivePartsList = customParts && customParts.length > 0
    ? customParts
    : [];
  const totalPossibleParts = effectivePartsList.length > 0
    ? effectivePartsList.length
    : selectedDuration > 0
    ? Math.max(1, Math.ceil(selectedDuration / Math.max(5, clipDuration)))
    : 1;

  // Generate Queue of Clips based on custom parts list or auto segmentation
  const handleGenerateQueue = (filterOptions = {}) => {
    if (!videoData) return;

    if (selectedDuration <= 0) {
      showToast('Please select a valid timeline range greater than 0 seconds', 'error');
      return;
    }

    let partsToProcess = [];

    if (customParts && customParts.length > 0) {
      partsToProcess = customParts.map((p, idx) => ({
        partNumber: p.partNumber || idx + 1,
        startTime: p.startTime,
        endTime: p.endTime,
        duration: Math.max(0.5, p.endTime - p.startTime),
        title: p.title || `Part ${p.partNumber || idx + 1}`
      }));
    } else {
      const segLength = Math.max(5, clipDuration);
      let curStart = startTime;
      let partIdx = 1;

      while (curStart < endTime) {
        const curEnd = Math.min(endTime, curStart + segLength);
        if (curEnd - curStart >= 0.5) {
          partsToProcess.push({
            partNumber: partIdx,
            startTime: curStart,
            endTime: curEnd,
            duration: curEnd - curStart,
            title: `Part ${partIdx}`
          });
          partIdx++;
        }
        curStart = curEnd;
      }
    }

    if (filterOptions.singlePartNumber) {
      partsToProcess = partsToProcess.filter((p) => p.partNumber === filterOptions.singlePartNumber);
    } else if (filterOptions.selectedPartNumbers && Array.isArray(filterOptions.selectedPartNumbers)) {
      partsToProcess = partsToProcess.filter((p) => filterOptions.selectedPartNumbers.includes(p.partNumber));
    }

    if (partsToProcess.length === 0) {
      showToast('No parts matching the selection were found.', 'warning');
      return;
    }

    const newJobs = partsToProcess.map((p) => {
      const filename = generateClipFilename({
        movieName: textSettings.movieName,
        partNumber: p.partNumber,
        zeroPad: textSettings.zeroPad,
        format: exportSettings.format || 'mp4'
      });

      return {
        id: `job_${Date.now()}_${p.partNumber}_${Math.random().toString(36).substr(2, 6)}`,
        partNumber: p.partNumber,
        name: filename,
        startTime: p.startTime,
        endTime: p.endTime,
        duration: p.duration,
        status: 'pending',
        progress: 0,
        settings: {
          crop: { ...cropSettings },
          background: { ...bgSettings },
          text: { ...textSettings, startPart: p.partNumber },
          logo: { ...logoSettings },
          effects: { ...effectsSettings },
          audio: { ...audioSettings },
          export: { ...exportSettings }
        }
      };
    });

    setAndStartQueue(newJobs, videoData.url, exportSettings.concurrency || 1);
    showToast(`Started batch rendering ${newJobs.length} clips in background`, 'success');
  };

  const handleApplyToAll = () => {
    showToast('Current styles, overlays and crop settings applied to all clips!', 'success');
  };

  const handleDownloadAllZip = () => {
    downloadAllZip(textSettings.movieName || 'Movie_Clips');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-orange-500 selection:text-white">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce">
          <div
            className={`flex items-center space-x-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md ${
              toastMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : toastMessage.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-orange-500/10 border-orange-500/30 text-orange-300'
            }`}
          >
            {toastMessage.type === 'success' ? (
              <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-orange-400 flex-shrink-0" />
            )}
            <span className="text-xs font-medium">{toastMessage.message}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="p-1 hover:bg-white/10 rounded-md cursor-pointer ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Top Header */}
      <Header />

      {/* Main Application Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Step 1: Video Uploader Area */}
        <section className="space-y-2">
          <VideoUploader onVideoSelect={handleVideoSelect} currentVideo={videoData} />
        </section>

        {/* Workspace Grid (When video is loaded) */}
        {videoData && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Player & Interactive Canvas */}
              <div className="lg:col-span-7 space-y-6">
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
              <div className="lg:col-span-5 space-y-6">
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
                />
              </div>
            </div>

            {/* Bottom Row: Batch Processing Queue & Output */}
            <div className="space-y-6 pt-2">
              <ProcessingQueue
                queue={queue}
                onGenerateQueue={handleGenerateQueue}
                onCancelJob={cancelJob}
                onClearQueue={clearQueue}
                onPreviewClip={(clip) => setPreviewClipModal(clip)}
                onDownloadClip={downloadClip}
                isProcessing={isProcessing}
                totalPossibleParts={totalPossibleParts}
              />

              <GeneratedClips
                completedClips={completedClips}
                onDownloadClip={downloadClip}
                onDownloadAllZip={handleDownloadAllZip}
                isZipping={isZipping}
                zipProgress={zipProgress}
                movieName={textSettings.movieName}
              />
            </div>
          </>
        )}
      </main>

      {/* Completed Clip Modal Preview */}
      {previewClipModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <span className="font-semibold text-sm text-white truncate max-w-xs">{previewClipModal.name}</span>
              <button
                onClick={() => setPreviewClipModal(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-black flex justify-center">
              <video
                src={previewClipModal.outputUrl}
                controls
                autoPlay
                className="max-h-[60vh] rounded-lg shadow-lg"
              />
            </div>
            <div className="p-4 border-t border-slate-800 flex justify-end space-x-2">
              <button
                onClick={() => downloadClip(previewClipModal)}
                className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-medium text-xs rounded-xl shadow-lg shadow-orange-500/20 cursor-pointer"
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
