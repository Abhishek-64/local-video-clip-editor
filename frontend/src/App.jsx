import React, { useState } from 'react';
import Header from './components/Header';
import VideoUploader from './components/VideoUploader';
import VideoPreview from './components/VideoPreview';
import Timeline from './components/Timeline';
import EditorTabs from './components/EditorTabs';
import ProcessingQueue from './components/ProcessingQueue';
import GeneratedClips from './components/GeneratedClips';
import YouTubeUploadHistory from './components/YouTubeUploadHistory';
import AuthModal from './components/AuthModal';
import StorageSettingsModal from './components/StorageSettingsModal';
import TemplateManagerModal from './components/TemplateManagerModal';
import { generateClipFilename } from './utils/filename';
import { calculateSingleScheduleTime, formatScheduledDateTime, getDefaultScheduleStartTime, toDateTimeLocalString } from './utils/scheduler';
import { cleanVideoFilename } from './utils/titleCleaner';
import { useProcessingQueue } from './hooks/useProcessingQueue';
import { useYouTube } from './hooks/useYouTube';
import { useUploadQueue } from './hooks/useUploadQueue';
import { useFacebook } from './hooks/useFacebook';
import { useAuth } from './hooks/useAuth';
import { useTemplates } from './hooks/useTemplates';
import { Check, Info, X, Film, Palette, Layers, Sparkles } from 'lucide-react';

export default function App() {
  // Video Source State
  const [videoData, setVideoData] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);

  // Mobile Active View: 'preview' (Preview + Timeline), 'style' (EditorTabs), 'queue' (Queue + Output)
  const [mobileView, setMobileView] = useState('preview');

  // Active Tab in EditorTabs
  const [activeEditorTab, setActiveEditorTab] = useState('split-cut');

  const handleNavigateTab = (tabId) => {
    setActiveEditorTab(tabId);
    setMobileView('style');
  };

  // Timeline / Range / Parts State
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [clipDuration, setClipDuration] = useState(60);
  const [customParts, setCustomParts] = useState([]);
  const [skipDeletedCuts, setSkipDeletedCuts] = useState(true);

  // YouTube pipeline publish start time
  const [pipelineStartTime, setPipelineStartTime] = useState(() =>
    toDateTimeLocalString(getDefaultScheduleStartTime())
  );

  // Preview Modal for Completed Clip
  const [previewClipModal, setPreviewClipModal] = useState(null);

  // Storage & Database Data Management Modal State
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);

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
    fileTemplate: '{movie} - Part {part}',
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
    concurrency: 1,
    fileTemplate: '{movie} - Part {part}'
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

  // ── Authentication Hook (User Signup, Login, Profile) ────────────────────────
  const {
    user,
    isAuthenticated: isUserLoggedIn,
    authError,
    setAuthError,
    isAuthModalOpen,
    authModalTab,
    openAuthModal,
    closeAuthModal,
    handleSignup,
    handleLogin,
    handleLogout
  } = useAuth({
    onAuthSuccess: (res) => {
      if (res?.user) {
        showToast(`Welcome, ${res.user.name || res.user.email}! Account synced.`, 'success');
      } else {
        showToast('Logged out successfully.', 'info');
      }
    }
  });

  // ── YouTube Hook (scoped to authenticated user only) ─────────────────────────
  const {
    ytAccount,
    isConnected,
    isLoadingAccount,
    accountError,
    connectYouTube,
    disconnectYouTubeAccount,
    clearYouTubeState,
    refreshAccount,
    ytSettings,
    updateYtSettings,
    renderTemplate,
    apiAvailable
  } = useYouTube({ isAuthenticated: isUserLoggedIn });

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
    movieName: ytSettings?.yt_name || textSettings.movieName
  });

  // ── Facebook Hook (Meta Graph API v21.0 & B2 Storage) ─────────────────────────
  const {
    fbAccount,
    availablePages: fbAvailablePages,
    isConnected: isFbConnected,
    isUserConnected: isFbUserConnected,
    isPageConnected: isFbPageConnected,
    isLoadingAccount: isLoadingFbAccount,
    accountError: fbAccountError,
    connectFacebook,
    connectPageById: connectFbPageById,
    isConnectingPage: isConnectingFbPage,
    pageConnectError: fbPageConnectError,
    setPageConnectError: setFbPageConnectError,
    switchPage: switchFbPage,
    disconnectFacebook,
    refreshFbAccount,
    fbSettings,
    updateFbSettings,
    renderFbTemplate,
    publishToFacebookPipeline,
    isPublishing: isPublishingFb,
    publishProgress: publishFbProgress,
    publishStage: publishFbStage,
    publishError: publishFbError,
    lastPublishedPost: lastPublishedFbPost
  } = useFacebook({ isAuthenticated: isUserLoggedIn });

  // ── Templates / Presets Hook (Cross-Section Multi-Configuration) ──────────────
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const {
    templates,
    isLoading: isLoadingTemplates,
    createNewTemplate,
    editTemplate,
    removeTemplate
  } = useTemplates({ isAuthenticated: isUserLoggedIn });

  const handleApplyTemplate = (template) => {
    if (!template) return;
    try {
      const textConfig = typeof template.text_data === 'string' ? JSON.parse(template.text_data || '{}') : (template.text_data || {});
      const ytConfig = typeof template.youtube_data === 'string' ? JSON.parse(template.youtube_data || '{}') : (template.youtube_data || {});
      const fbConfig = typeof template.facebook_data === 'string' ? JSON.parse(template.facebook_data || '{}') : (template.facebook_data || template.fb_data || {});
      const logoConfig = typeof template.logo_data === 'string' ? JSON.parse(template.logo_data || '{}') : (template.logo_data || {});

      if (textConfig && Object.keys(textConfig).length > 0) {
        setTextSettings(prev => ({ ...prev, ...textConfig }));
      }
      if (ytConfig && Object.keys(ytConfig).length > 0) {
        updateYtSettings(ytConfig);
      }
      if (fbConfig && Object.keys(fbConfig).length > 0) {
        updateFbSettings(fbConfig);
      }
      if (logoConfig && Object.keys(logoConfig).length > 0) {
        const logoSrc = logoConfig.dataUrl || (logoConfig.url && !logoConfig.url.startsWith('blob:') ? logoConfig.url : null);
        setLogoSettings(prev => ({
          ...prev,
          ...logoConfig,
          url: logoSrc || prev.url,
          dataUrl: logoConfig.dataUrl || prev.dataUrl,
          enabled: Boolean(logoConfig.enabled && (logoSrc || prev.url || prev.dataUrl))
        }));
      }

      showToast(`Template "${template.name}" applied across all sections!`, 'success');
    } catch (e) {
      console.error('Failed to apply template:', e);
      showToast('Error applying template.', 'error');
    }
  };

  // ── Facebook Direct & Batch Publishing Integration ───────────────────────────
  const [fbPublishedMap, setFbPublishedMap] = useState({});
  const [fbPublishingClipId, setFbPublishingClipId] = useState(null);

  const handlePublishFbClip = async (clip) => {
    if (!clip || !clip.blob) {
      showToast('Clip video data not ready for publishing.', 'error');
      return;
    }
    setFbPublishingClipId(clip.id);
    try {
      const partNum = clip.partNumber || 1;
      const movie = fbSettings?.fb_name || textSettings.movieName || 'My Movie';
      const isZeroPad = fbSettings?.fb_zero_pad !== false;
      const title = renderFbTemplate
        ? renderFbTemplate(fbSettings?.fb_title_template || '{movie} - Part {part} | #Reels', {
            movieName: movie,
            partNumber: partNum,
            zeroPad: isZeroPad,
            tags: fbSettings?.fb_tags || []
          })
        : `${movie} - Part ${partNum} | #Reels`;

      const caption = renderFbTemplate
        ? renderFbTemplate(fbSettings?.fb_caption_template || '{movie} - Part {part}\n\n#Reels #Shorts\n\n{hashtags}', {
            movieName: movie,
            partNumber: partNum,
            zeroPad: isZeroPad,
            tags: fbSettings?.fb_tags || []
          })
        : `${movie} - Part ${partNum}\n\n#Reels #Shorts`;

      const res = await publishToFacebookPipeline(clip.blob, {
        fileName: `${movie.replace(/[\\/:*?"<>|]/g, '_')}_Part_${partNum}.mp4`,
        title,
        caption,
        hashtags: fbSettings?.fb_tags || [],
        contentType: fbSettings?.fb_content_type || 'reel'
      });
      const publishedUrl = res?.postUrl || res?.permalink_url || (res?.videoId ? `https://www.facebook.com/reel/${res.videoId}` : null);
      if (publishedUrl) {
        setFbPublishedMap(prev => ({ ...prev, [clip.id]: publishedUrl }));
        showToast(`Published Part ${partNum} to Facebook Reels!`, 'success');
      } else {
        showToast(`Part ${partNum} sent to Facebook!`, 'success');
      }
    } catch (err) {
      console.error('Facebook publish error:', err);
      showToast(`Facebook publish failed: ${err.message}`, 'error');
    } finally {
      setFbPublishingClipId(null);
    }
  };

  const handleBatchPublishFb = async (clipsToPublish) => {
    if (!clipsToPublish || clipsToPublish.length === 0) return;
    for (const clip of clipsToPublish) {
      await handlePublishFbClip(clip);
    }
  };

  // ── Handle Video Loading and Auto-Detection ───────────────────────────────────
  const handleVideoSelect = (data) => {
    setVideoData(data);
    setStartTime(0);
    setEndTime(data.duration);
    setCurrentTime(0);

    // Auto-populate movie name from demo preset or filename (cleaned)
    const baseName = data.preset?.movieName || cleanVideoFilename(data.file.name);
    setTextSettings((prev) => ({
      ...prev,
      movieName: baseName
    }));

    updateYtSettings({
      yt_name: baseName,
      yt_start_part: 1,
      ...(data.preset?.tags ? { yt_tags: data.preset.tags } : {})
    });

    if (data.preset) {
      updateFbSettings({
        fb_name: baseName,
        fb_tags: data.preset.tags || ['reels', 'shorts', 'viral'],
        fb_caption_template: data.preset.captionTemplate || '{movie} - Part {part}\n\n#Reels #Shorts\n\n{hashtags}',
        fb_title_template: data.preset.titleTemplate || '{movie} - Part {part} | #Reels'
      });

      if (data.preset.defaultParts && data.preset.defaultParts.length > 0) {
        setCustomParts(data.preset.defaultParts);
      }
    }

    // Auto configure smart export profile based on detected media
    if (data.detectedQuality || data.detectedFps) {
      setExportSettings((prev) => ({
        ...prev,
        resolution: data.detectedQuality?.recommendedRes || prev.resolution,
        fps: data.detectedFps?.recommendedFps || prev.fps
      }));
    }

    if (data.preset) {
      showToast(`⚡ Loaded Demo Video: "${data.preset.title}" with 3 split parts & social templates!`, 'success');
    } else {
      showToast(`Loaded "${data.file.name}" (${Math.round(data.duration)}s) successfully!`, 'success');
    }
  };

  // ── Split & Cut Actions for Player & Hotkeys ──────────────────────────────
  const handleSplitAtPlayhead = () => {
    if (!videoData) return;
    const playhead = Math.round((currentTime || 0) * 10) / 10;
    const currentList = customParts && customParts.length > 0
      ? [...customParts]
      : [{ id: 'part-1', partNumber: 1, title: 'Full Video', startTime: 0, endTime: videoData.duration, duration: videoData.duration, isDeleted: false }];

    const targetIdx = currentList.findIndex(p => playhead > p.startTime + 0.1 && playhead < p.endTime - 0.1);
    if (targetIdx !== -1) {
      const original = currentList[targetIdx];
      const first = { ...original, endTime: playhead, duration: Math.max(0, Math.round((playhead - original.startTime) * 10) / 10) };
      const second = {
        id: `part-split-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        partNumber: targetIdx + 2,
        title: original.title ? `${original.title} (Pt 2)` : '',
        startTime: playhead,
        endTime: original.endTime,
        duration: Math.max(0, Math.round((original.endTime - playhead) * 10) / 10),
        isDeleted: Boolean(original.isDeleted)
      };
      const next = [...currentList];
      next[targetIdx] = first;
      next.splice(targetIdx + 1, 0, second);

      let counter = 1;
      const renumbered = next.map((p) => {
        if (p.isDeleted) return p;
        const u = { ...p, partNumber: counter };
        counter++;
        return u;
      });
      setCustomParts(renumbered);
      showToast(`Split video at ${playhead.toFixed(1)}s`, 'info');
    }
  };

  const handleToggleCutAtPlayhead = () => {
    if (!customParts || customParts.length === 0) return;
    const targetIdx = customParts.findIndex(p => currentTime >= p.startTime && currentTime <= p.endTime);
    if (targetIdx !== -1) {
      const updated = customParts.map((p, idx) => idx === targetIdx ? { ...p, isDeleted: !p.isDeleted } : p);
      let counter = 1;
      const renumbered = updated.map((p) => {
        if (p.isDeleted) return p;
        const u = { ...p, partNumber: counter };
        counter++;
        return u;
      });
      setCustomParts(renumbered);
      const isNowCut = updated[targetIdx].isDeleted;
      showToast(`${isNowCut ? 'Cut (Excluded)' : 'Restored'} Part ${targetIdx + 1}`, 'info');
    }
  };

  // ── Global Keyboard Shortcut for Split (Key S) ───────────────────────────────
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        return;
      }
      if (!videoData) return;

      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        handleSplitAtPlayhead();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [videoData, currentTime, customParts]);

  // Derive total calculated active kept parts
  const selectedDuration = Math.max(0, endTime - startTime);
  const totalPossibleParts = customParts && customParts.length > 0
    ? Math.max(1, customParts.filter(p => !p.isDeleted).length)
    : clipDuration > 0 && selectedDuration > 0
    ? Math.ceil(selectedDuration / clipDuration)
    : 1;

  // ── Batch Generation Trigger ─────────────────────────────────────────────────
  const handleGenerateQueue = ({
    mode,
    count,
    start,
    end,
    autoSchedule = false,
    scheduleStartTime = null,
    scheduleInterval = '1hour',
    customPartsList = null
  }) => {
    if (!videoData) return;

    let partsToGenerate = [];

    // Filter out deleted cut sections unless explicitly provided
    const sourceParts = customPartsList || (customParts && customParts.length > 0 ? customParts.filter(p => !p.isDeleted) : []);

    if (sourceParts.length > 0) {
      if (mode === 'all') {
        partsToGenerate = [...sourceParts];
      } else if (mode === 'first-n') {
        partsToGenerate = sourceParts.slice(0, count);
      } else if (mode === 'range') {
        partsToGenerate = sourceParts.slice(Math.max(0, start - 1), end);
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
      showToast('No active parts selected for generation.', 'error');
      return;
    }

    const baseStartPart = Math.max(1, parseInt(textSettings.startPart) || 1);

    const newJobs = partsToGenerate.map((part, idx) => {
      // Clean sequential part number starting from baseStartPart (e.g. 1 + 0 = Part 1)
      const partNum = baseStartPart + idx;
      const customName = part.title ? `${textSettings.movieName || 'Clip'} - ${part.title} (Part ${partNum})` : null;
      const filename = customName
        ? `${customName.replace(/[\\/:*?"<>|]/g, '_')}.${exportSettings.format || 'mp4'}`
        : generateClipFilename({
            movieName: textSettings.movieName || 'Clip',
            partNumber: partNum,
            template: exportSettings.fileTemplate || textSettings.fileTemplate || textSettings.template || '{movie} - Part {part}',
            zeroPad: textSettings.zeroPad,
            extension: exportSettings.format || 'mp4'
          });

      const scheduledAt = autoSchedule
        ? calculateSingleScheduleTime(scheduleStartTime, scheduleInterval || '1hour', idx)
        : null;

      const ytStartPart = Math.max(1, parseInt(ytSettings?.yt_start_part) || 1);
      const ytPartNum = ytStartPart + idx;

      return {
        id: `job-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
        name: filename,
        partNumber: partNum,
        ytPartNumber: ytPartNum,
        movieName: ytSettings?.yt_name || textSettings.movieName || 'My Movie',
        partTitle: part.title || `Part ${partNum}`,
        startTime: part.startTime,
        endTime: part.endTime,
        duration: part.endTime - part.startTime,
        videoData,
        cropSettings,
        bgSettings,
        textSettings: {
          ...textSettings,
          currentPart: partNum,
          totalParts: partsToGenerate.length
        },
        logoSettings,
        effectsSettings,
        audioSettings,
        exportSettings,
        scheduledAt,
        autoUpload: Boolean(autoSchedule)
      };
    });

    addJobs(newJobs);

    if (autoSchedule) {
      showToast(`Added ${newJobs.length} clips to queue! Auto-scheduled with ${scheduleInterval} interval.`, 'success');
    } else {
      showToast(`Added ${newJobs.length} clips to processing queue!`, 'success');
    }
  };

  // ── Action: Export Merged Cleaned Video (Without Deleted Sections) ───────────
  const handleExportMergedCleaned = () => {
    if (!videoData) return;
    const keptList = (customParts && customParts.length > 0
      ? customParts.filter((p) => !p.isDeleted)
      : [{ startTime, endTime, duration: endTime - startTime }]
    ).filter(p => (p.endTime - p.startTime) > 0.05);

    if (keptList.length === 0) {
      showToast('No active kept segments to export. Please keep at least one segment.', 'error');
      return;
    }

    const totalKeptDur = keptList.reduce((acc, p) => acc + Math.max(0, (p.endTime || 0) - (p.startTime || 0)), 0);
    const cleanedFilename = `${(textSettings.movieName || 'Cleaned_Video').replace(/[\\/:*?"<>|]/g, '_')}_Edited_Cleaned.${exportSettings.format || 'mp4'}`;

    const mergedJob = {
      id: `job-merged-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: cleanedFilename,
      partNumber: 1,
      partTitle: 'Cleaned Video (Cut Sections Removed)',
      startTime: keptList[0].startTime,
      endTime: keptList[keptList.length - 1].endTime,
      duration: totalKeptDur,
      segments: keptList.map(p => ({ startTime: p.startTime, endTime: p.endTime })),
      videoData,
      cropSettings,
      bgSettings,
      textSettings: {
        ...textSettings,
        currentPart: 1,
        totalParts: 1
      },
      logoSettings,
      effectsSettings,
      audioSettings,
      exportSettings
    };

    addJob(mergedJob);
    showToast(`Added Cleaned Merged Video (${Math.round(totalKeptDur)}s) to processing queue!`, 'success');
  };

  // ── Action: Export Selective Merged Video (e.g. Merge P2 + P4 only) ─────────
  const handleExportSelectedMerge = (selectedPartsList) => {
    if (!videoData) return;
    const partsToMerge = (selectedPartsList && selectedPartsList.length > 0
      ? selectedPartsList.filter(p => !p.isDeleted)
      : (customParts && customParts.length > 0
          ? customParts.filter(p => !p.isDeleted)
          : [{ startTime, endTime, duration: endTime - startTime }]
        )
    ).filter(p => (p.endTime - p.startTime) > 0.05);

    if (partsToMerge.length === 0) {
      showToast('Please select at least one segment to merge.', 'error');
      return;
    }

    const totalDur = partsToMerge.reduce((acc, p) => acc + Math.max(0, (p.endTime || 0) - (p.startTime || 0)), 0);
    const partNumbersLabel = partsToMerge.map(p => `P${p.partNumber || 1}`).join('_');
    const cleanedFilename = `${(textSettings.movieName || 'Merged_Video').replace(/[\\/:*?"<>|]/g, '_')}_Merged_${partNumbersLabel}.${exportSettings.format || 'mp4'}`;

    const mergedJob = {
      id: `job-merged-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: cleanedFilename,
      partNumber: 1,
      partTitle: `Merged (${partsToMerge.map(p => `Part ${p.partNumber || 1}`).join(' + ')})`,
      startTime: partsToMerge[0].startTime,
      endTime: partsToMerge[partsToMerge.length - 1].endTime,
      duration: totalDur,
      segments: partsToMerge.map(p => ({ startTime: p.startTime, endTime: p.endTime })),
      videoData,
      cropSettings,
      bgSettings,
      textSettings: {
        ...textSettings,
        currentPart: 1,
        totalParts: 1
      },
      logoSettings,
      effectsSettings,
      audioSettings,
      exportSettings
    };

    addJob(mergedJob);
    showToast(`Added Merged Video (${partsToMerge.map(p => `P${p.partNumber || 1}`).join(' + ')}, ${Math.round(totalDur)}s) to queue!`, 'success');
  };

  // ── Action: Send Only Kept or Selected Clips to Processing Queue ─────────────
  const handleGenerateBatchKept = (selectedPartsList = null) => {
    if (!videoData) return;
    const list = selectedPartsList || (customParts || []).filter((p) => !p.isDeleted);
    if (list.length === 0) {
      showToast('No active kept segments to generate clips for.', 'error');
      return;
    }
    handleGenerateQueue({ mode: 'all', customPartsList: list });
  };

  // ── Action: Export Single Part Directly ──────────────────────────────────────
  const handleExportSinglePart = (part) => {
    if (!videoData || !part) return;
    const keptIdx = (customParts || []).filter(p => !p.isDeleted).findIndex(p => p.id === part.id);
    const baseStartPart = Math.max(1, parseInt(textSettings.startPart) || 1);
    const partNum = keptIdx >= 0 ? baseStartPart + keptIdx : (part.partNumber || 1);

    const customName = part.title ? `${textSettings.movieName || 'Clip'} - ${part.title} (Part ${partNum})` : null;
    const filename = customName
      ? `${customName.replace(/[\\/:*?"<>|]/g, '_')}.${exportSettings.format || 'mp4'}`
      : generateClipFilename({
          movieName: textSettings.movieName || 'Clip',
          partNumber: partNum,
          template: exportSettings.fileTemplate || textSettings.fileTemplate || textSettings.template || '{movie} - Part {part}',
          zeroPad: textSettings.zeroPad,
          extension: exportSettings.format || 'mp4'
        });

    const singleJob = {
      id: `job-single-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: filename,
      partNumber: partNum,
      partTitle: part.title || `Part ${partNum}`,
      startTime: part.startTime,
      endTime: part.endTime,
      duration: Math.max(0, part.endTime - part.startTime),
      videoData,
      cropSettings,
      bgSettings,
      textSettings: {
        ...textSettings,
        currentPart: partNum,
        totalParts: (customParts || []).filter(p => !p.isDeleted).length || 1
      },
      logoSettings,
      effectsSettings,
      audioSettings,
      exportSettings
    };

    addJob(singleJob);
    showToast(`Added Part ${partNum} (${Math.round(singleJob.duration)}s) to processing queue!`, 'success');
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
  const handleUploadClip = (clip, overrides = {}) => {
    if (!isConnected) {
      showToast('Connect YouTube first to upload clips.', 'error');
      return;
    }
    uploadClip(clip, overrides);
    if (overrides?.scheduledAt) {
      const formatted = new Date(overrides.scheduledAt).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      showToast(`Part ${clip.partNumber || ''} scheduled for ${formatted}! Starting upload...`, 'success');
    } else {
      showToast(`Starting YouTube upload for Part ${clip.partNumber || ''}...`, 'info');
    }
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
      <Header
        hasVideo={Boolean(videoData)}
        onReset={() => {
          setVideoData(null);
          setCurrentTime(0);
        }}
        user={user}
        isAuthenticated={isUserLoggedIn}
        onOpenAuth={openAuthModal}
        onLogout={handleLogout}
        onOpenStorage={() => setIsStorageModalOpen(true)}
        onOpenTemplates={() => setIsTemplateModalOpen(true)}
        templatesCount={templates.length}
        ytAccount={ytAccount}
        fbAccount={fbAccount}
        isYtConnected={isConnected}
        isFbConnected={isFbConnected}
        activeTab={activeEditorTab}
        onNavigateTab={handleNavigateTab}
      />

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
                  customParts={customParts}
                  skipDeletedCuts={skipDeletedCuts}
                  onSplitAtPlayhead={handleSplitAtPlayhead}
                  onToggleCutAtPlayhead={handleToggleCutAtPlayhead}
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
                  videoData={videoData}
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
                  // Split & Delete props
                  customParts={customParts}
                  onCustomPartsChange={setCustomParts}
                  currentTime={currentTime}
                  duration={videoData.duration}
                  onCurrentTimeChange={setCurrentTime}
                  skipDeletedCuts={skipDeletedCuts}
                  onToggleSkipDeletedCuts={() => setSkipDeletedCuts((prev) => !prev)}
                  onExportMergedCleaned={handleExportMergedCleaned}
                  onExportSelectedMerge={handleExportSelectedMerge}
                  onGenerateBatchKept={handleGenerateBatchKept}
                  onExportSinglePart={handleExportSinglePart}
                  movieName={textSettings.movieName}
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
                  apiAvailable={apiAvailable}
                  isAuthenticated={isUserLoggedIn}
                  onOpenAuth={openAuthModal}
                  pipelineStartTime={pipelineStartTime}
                  setPipelineStartTime={setPipelineStartTime}
                  completedClips={completedClips}
                  // Facebook props
                  fbAccount={fbAccount}
                  availablePages={fbAvailablePages}
                  isFbConnected={isFbConnected}
                  isFbUserConnected={isFbUserConnected}
                  isFbPageConnected={isFbPageConnected}
                  isLoadingFbAccount={isLoadingFbAccount}
                  fbAccountError={fbAccountError}
                  connectFacebook={connectFacebook}
                  connectFbPageById={connectFbPageById}
                  isConnectingFbPage={isConnectingFbPage}
                  fbPageConnectError={fbPageConnectError}
                  setFbPageConnectError={setFbPageConnectError}
                  switchPage={switchFbPage}
                  disconnectFacebook={disconnectFacebook}
                  refreshFbAccount={refreshFbAccount}
                  fbSettings={fbSettings}
                  updateFbSettings={updateFbSettings}
                  renderFbTemplate={renderFbTemplate}
                  publishToFacebookPipeline={publishToFacebookPipeline}
                  isPublishingFb={isPublishingFb}
                  publishFbProgress={publishFbProgress}
                  publishFbStage={publishFbStage}
                  publishFbError={publishFbError}
                  lastPublishedFbPost={lastPublishedFbPost}
                  activeTab={activeEditorTab}
                  onTabChange={setActiveEditorTab}
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
                pipelineStartTime={pipelineStartTime}
                // YouTube upload integration
                uploadJobs={uploadJobs}
                onUploadClip={handleUploadClip}
                onCancelUpload={cancelUpload}
                onRetryUpload={handleRetryUpload}
                isConnected={isConnected}
                ytAccount={ytAccount}
                ytSettings={ytSettings}
                isAuthenticated={isUserLoggedIn}
                onOpenAuth={openAuthModal}
                connectYouTube={connectYouTube}
                // Facebook Reels upload integration
                isFbConnected={isFbConnected}
                fbAccount={fbAccount}
                fbSettings={fbSettings}
                onPublishFbClip={handlePublishFbClip}
                isPublishingFb={isPublishingFb}
                fbPublishProgress={publishFbProgress}
                fbPublishStage={publishFbStage}
                fbPublishingClipId={fbPublishingClipId}
                fbPublishedMap={fbPublishedMap}
              />

              <GeneratedClips
                completedClips={completedClips}
                onDownloadClip={downloadClip}
                onDownloadAllZip={handleDownloadAllZip}
                isZipping={isZipping}
                zipProgress={zipProgress}
                movieName={textSettings.movieName}
                youtubeName={ytSettings?.yt_name || textSettings.movieName}
                // YouTube upload integration
                uploadJobs={uploadJobs}
                onUploadClip={handleUploadClip}
                onRetryUpload={handleRetryUpload}
                isConnected={isConnected}
                ytSettings={ytSettings}
                // Facebook Reels upload integration
                isFbConnected={isFbConnected}
                fbAccount={fbAccount}
                fbSettings={fbSettings}
                onPublishFbClip={handlePublishFbClip}
                onBatchPublishFb={handleBatchPublishFb}
                isPublishingFb={isPublishingFb}
                fbPublishProgress={publishFbProgress}
                fbPublishStage={publishFbStage}
                fbPublishingClipId={fbPublishingClipId}
                fbPublishedMap={fbPublishedMap}
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

      {/* User Login & Signup Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={closeAuthModal}
        initialTab={authModalTab}
        onLogin={handleLogin}
        onSignup={handleSignup}
        error={authError}
        onErrorClear={() => setAuthError(null)}
      />

      {/* Database Storage & Privacy Management Modal */}
      <StorageSettingsModal
        isOpen={isStorageModalOpen}
        onClose={() => setIsStorageModalOpen(false)}
        isAuthenticated={isUserLoggedIn}
        showToast={showToast}
        onDataCleared={(scope) => {
          if (scope === 'history' || scope === 'all') {
            refreshHistory();
          }
          if (scope === 'youtube' || scope === 'all') {
            refreshAccount();
          }
          if (scope === 'settings' || scope === 'all') {
            refreshAccount();
          }
        }}
      />

      {/* Cross-Section Templates Management Modal */}
      <TemplateManagerModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        templates={templates}
        isLoading={isLoadingTemplates}
        onSaveTemplate={createNewTemplate}
        onApplyTemplate={handleApplyTemplate}
        onDeleteTemplate={removeTemplate}
        currentTextSettings={textSettings}
        currentYtSettings={ytSettings}
        currentFbSettings={fbSettings}
        currentLogoSettings={logoSettings}
      />
    </div>
  );
}
