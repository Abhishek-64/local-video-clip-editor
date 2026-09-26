import React, { useState, useCallback, useRef, useEffect } from 'react';
import Header from './components/Header';
import VideoUploader from './components/VideoUploader';
import VideoPreview from './components/VideoPreview';
import Timeline from './components/Timeline';
import EditorTabs from './components/EditorTabs';
import ProcessingQueue from './components/ProcessingQueue';
import AuthModal from './components/AuthModal';
import StorageSettingsModal from './components/StorageSettingsModal';
import TemplateManagerModal from './components/TemplateManagerModal';
import MobileBottomNav from './components/MobileBottomNav';
import MobileEditSheet from './components/MobileEditSheet';
import UnifiedPublishModal from './components/UnifiedPublishModal';
import GeneratedVideoPlayer from './components/GeneratedVideoPlayer';
import PhotoEditor from './components/PhotoEditor';
import { generateClipFilename } from './utils/filename';
import { calculateSingleScheduleTime, formatScheduledDateTime, getDefaultScheduleStartTime, toDateTimeLocalString, getIntervalSeconds } from './utils/scheduler';
import { cleanVideoFilename } from './utils/titleCleaner';
import { useProcessingQueue } from './hooks/useProcessingQueue';
import { useYouTube } from './hooks/useYouTube';
import { useUploadQueue } from './hooks/useUploadQueue';
import { useFacebook } from './hooks/useFacebook';
import { useInstagram } from './hooks/useInstagram';
import { useAuth } from './hooks/useAuth';
import { useTemplates } from './hooks/useTemplates';
import sharedUploadCache from './services/sharedUploadCache';
import { terminateWorkerPool } from './services/export/exportWorkerBridge';
import {
  getB2UploadTarget,
  uploadToB2,
  publishToFacebook,
  publishToInstagram,
  setYouTubeThumbnail
} from './services/apiService';
import {
  Check, Info, X, Film, Palette, Layers, Sparkles,
  Scissors, Crop, Image as ImageIcon, Type, Volume2, SlidersHorizontal,
  Youtube, Share2, Instagram, Database, Sliders, ChevronRight, History
} from 'lucide-react';

export default function App() {
  // Video Source State
  const [videoData, setVideoData] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  // Ref always holds the live playhead position without triggering re-renders.
  // State is throttled to ≤4fps so the Timeline playhead is visually smooth
  // but the entire App tree is NOT re-rendered 25× per second during playback.
  const currentTimeRef = useRef(0);
  const lastTimeUpdateRef = useRef(0);

  /**
   * HOT PATH: called on every `timeupdate` event (4–25×/sec).
   * - Always updates the ref (zero re-render cost, always current for split/cut).
   * - Throttles React state update to ≤4fps so the Timeline playhead animates
   *   smoothly but never forces a full 2000-line App re-render at video frame rate.
   */
  const handleTimeUpdate = useCallback((time) => {
    currentTimeRef.current = time;
    const now = performance.now();
    if (now - lastTimeUpdateRef.current >= 250) { // 4fps cap
      lastTimeUpdateRef.current = now;
      setCurrentTime(time);
    }
  }, []);

  /**
   * COLD PATH: explicit user seek (Timeline click, drag). Always flushes
   * immediately so the playhead snaps to the correct position without delay.
   */
  const handleExplicitSeek = useCallback((time) => {
    currentTimeRef.current = time;
    lastTimeUpdateRef.current = performance.now();
    setCurrentTime(time);
  }, []);

  // Central Unified Publish / Schedule Modal State (Accessible across Queue and Clips)
  const [publishModalClips, setPublishModalClips] = useState(null);
  const [publishModalPhoto, setPublishModalPhoto] = useState(null);
  const [preRenderContext, setPreRenderContext] = useState(null);
  const handleClipCompletedRef = useRef(null);

  // Studio Mode: 'video' (Video Clips & Cut Editor) vs 'photo' (Photo & Thumbnail Studio)
  const [studioMode, setStudioMode] = useState('video');
  const [photoDataUrl, setPhotoDataUrl] = useState(null);

  const handleCaptureFrame = useCallback((dataUrl) => {
    setPhotoDataUrl(dataUrl);
    setStudioMode('photo');
    setToastMessage({ message: 'Frame captured to Photo Studio!', type: 'success' });
  }, []);

  // Background Video Preview Suspension State (for performance when previewing generated clips)
  const [isEditorPreviewSuspended, setIsEditorPreviewSuspended] = useState(false);
  const handlePauseBackgroundVideo = useCallback(() => setIsEditorPreviewSuspended(true), []);
  const handleResumeBackgroundVideo = useCallback(() => setIsEditorPreviewSuspended(false), []);

  // Mobile Slide-Up Edit Sheet & Bottom Nav State (< lg)
  const [isMobileEditOpen, setIsMobileEditOpen] = useState(false);
  const [isMobileSheetFullScreen, setIsMobileSheetFullScreen] = useState(true);
  const [activeMobileNavTab, setActiveMobileNavTab] = useState('edit');

  // Active Tab in EditorTabs
  const [activeEditorTab, setActiveEditorTab] = useState('split-cut');

  const handleNavigateTab = (tabId) => {
    setActiveEditorTab(tabId);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setIsMobileEditOpen(true);
    }
  };

  const handleMobileNavSelect = (tabId) => {
    setActiveMobileNavTab(tabId);
    if (tabId === 'edit') {
      setIsMobileEditOpen(true);
    } else if (tabId === 'clips') {
      setIsMobileEditOpen(false);
      setTimeout(() => {
        document.getElementById('generated-clips-container')?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    } else if (tabId === 'export') {
      setActiveEditorTab('export');
      setIsMobileEditOpen(true);
    } else if (tabId === 'queue') {
      setIsMobileEditOpen(false);
      setTimeout(() => {
        document.getElementById('processing-queue-container')?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    }
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

  // Preview Modal for Completed Clip & Decoder Bandwidth Management
  const [previewClipModal, setPreviewClipModal] = useState(null);

  // Storage & Database Data Management Modal State
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);

  // Toast Notification State
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = useCallback((message, type = 'info') => {
    setToastMessage({ message, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  }, []);

  // ── Persistent Worker Pool Teardown ───────────────────────────────────────
  // The pooled worker must be explicitly terminated on page unload.
  // Between exports the worker stays alive (that's the whole point of pooling).
  useEffect(() => {
    const handleUnload = () => terminateWorkerPool();
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      terminateWorkerPool();
    };
  }, []);

  // ── Editing Settings State ───────────────────────────────────────
  const [cropSettings, setCropSettings] = useState({
    mode: 'original',
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
    movieName: 'My Movie',
    format: 'mp4',
    resolution: 'original',
    bitrate: 'ultra',
    fps: 'original',
    audioBitrate: '320k',
    concurrency: 1,
    fileTemplate: '{movie} - Part {part}'
  });

  const handleTextChange = useCallback((newTextSettings) => {
    setTextSettings(newTextSettings);
    if (newTextSettings?.movieName !== undefined) {
      setExportSettings((prev) => (prev.movieName === newTextSettings.movieName ? prev : {
        ...prev,
        movieName: newTextSettings.movieName
      }));
    }
  }, []);

  const handleExportChange = useCallback((newExportSettings) => {
    setExportSettings(newExportSettings);
    if (newExportSettings?.movieName !== undefined) {
      setTextSettings((prev) => (prev.movieName === newExportSettings.movieName ? prev : {
        ...prev,
        movieName: newExportSettings.movieName
      }));
    }
  }, []);


  // ── Processing Queue Hook (with automatic clip completion hook) ──────────────
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
    downloadAllZip,
    stopGenerating,
    deleteSelectedJobs,
    removeClip
  } = useProcessingQueue({
    onClipCompleted: (job) => {
      handleClipCompletedRef.current?.(job);
    }
  });

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
    refreshHistory,
    removeHistoryRecords
  } = useUploadQueue({
    completedClips,
    isConnected,
    ytSettings,
    renderTemplate,
    movieName: ytSettings?.yt_name || textSettings.movieName
  });

  // ── Facebook Hook (Meta Graph API v26.0 & B2 Storage) ─────────────────────────
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

  // ── Instagram Hook (Meta Graph API & Instagram Reels) ────────────────────────
  const {
    igAccount,
    availableAccounts: igAvailableAccounts,
    isConnected: isIgConnected,
    isUserConnected: isIgUserConnected,
    isAccountConnected: isIgAccountConnected,
    isLoadingAccount: isLoadingIgAccount,
    accountError: igAccountError,
    connectInstagram,
    connectAccountById: connectIgAccountById,
    isConnectingAccount: isConnectingIgAccount,
    accountConnectError: igAccountConnectError,
    setAccountConnectError: setIgAccountConnectError,
    switchAccount: switchIgAccount,
    disconnectInstagram,
    refreshIgAccount,
    igSettings,
    updateIgSettings,
    renderIgTemplate,
    publishToInstagramPipeline,
    isPublishing: isPublishingIg,
    publishProgress: publishIgProgress,
    publishStage: publishIgStage,
    publishError: publishIgError,
    lastPublishedPost: lastPublishedIgPost
  } = useInstagram({ isAuthenticated: isUserLoggedIn });

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
      const igConfig = typeof template.instagram_data === 'string' ? JSON.parse(template.instagram_data || '{}') : (template.instagram_data || template.ig_data || {});
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
      if (igConfig && Object.keys(igConfig).length > 0) {
        updateIgSettings(igConfig);
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

  const handlePublishFbClip = useCallback(async (clip, extraOptions = {}) => {
    let clipBlob = clip?.blob;
    if (!clipBlob && clip?.outputUrl) {
      try {
        const res = await fetch(clip.outputUrl);
        clipBlob = await res.blob();
      } catch (e) {
        console.warn('Could not recover blob from outputUrl:', e);
      }
    }
    if (!clip || !clipBlob) {
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

      const res = await publishToFacebookPipeline(clipBlob, {
        fileName: `${movie.replace(/[\\/:*?"<>|]/g, '_')}_Part_${partNum}.mp4`,
        title,
        caption,
        hashtags: fbSettings?.fb_tags || [],
        contentType: fbSettings?.fb_content_type || 'reel',
        isAiGenerated: Boolean(fbSettings?.fb_is_ai_generated),
        ...extraOptions
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
  }, [fbSettings, textSettings.movieName, renderFbTemplate, publishToFacebookPipeline, showToast]);

  const handleBatchPublishFb = useCallback(async (clipsToPublish) => {
    if (!clipsToPublish || clipsToPublish.length === 0) return;
    for (const clip of clipsToPublish) {
      await handlePublishFbClip(clip);
    }
  }, [handlePublishFbClip]);

  // ── Instagram Direct & Batch Publishing Integration ──────────────────────────
  const [igPublishedMap, setIgPublishedMap] = useState({});
  const [igPublishingClipId, setIgPublishingClipId] = useState(null);

  const handlePublishIgClip = useCallback(async (clip, extraOptions = {}) => {
    let clipBlob = clip?.blob;
    if (!clipBlob && clip?.outputUrl) {
      try {
        const res = await fetch(clip.outputUrl);
        clipBlob = await res.blob();
      } catch (e) {
        console.warn('Could not recover blob from outputUrl:', e);
      }
    }
    if (!clip || !clipBlob) {
      showToast('Clip video data not ready for publishing.', 'error');
      return;
    }
    setIgPublishingClipId(clip.id);
    try {
      const partNum = clip.partNumber || 1;
      const movie = igSettings?.ig_name || textSettings.movieName || 'My Movie';
      const isZeroPad = igSettings?.ig_zero_pad !== false;

      const caption = renderIgTemplate
        ? renderIgTemplate(igSettings?.ig_caption_template || '{movie} - Part {part}\n\n#Reels #InstagramReels #Viral\n\n{hashtags}', {
            movieName: movie,
            partNumber: partNum,
            zeroPad: isZeroPad,
            tags: igSettings?.ig_tags || []
          })
        : `${movie} - Part ${partNum}\n\n#Reels #Viral`;

      const res = await publishToInstagramPipeline(clipBlob, {
        fileName: `${movie.replace(/[\\/:*?"<>|]/g, '_')}_Part_${partNum}.mp4`,
        title: `${movie} - Part ${partNum}`,
        caption,
        hashtags: igSettings?.ig_tags || [],
        shareToFeed: igSettings?.ig_share_to_feed !== false,
        contentType: igSettings?.ig_content_type || 'reel',
        isAiGenerated: Boolean(igSettings?.ig_is_ai_generated),
        ...extraOptions
      });

      const publishedUrl = res?.postUrl || (res?.media_id ? `https://www.instagram.com/reel/${res.media_id}` : null);
      if (publishedUrl) {
        setIgPublishedMap(prev => ({ ...prev, [clip.id]: publishedUrl }));
        showToast(`Published Part ${partNum} to Instagram Reels!`, 'success');
      } else {
        showToast(`Part ${partNum} sent to Instagram!`, 'success');
      }
    } catch (err) {
      console.error('Instagram publish error:', err);
      showToast(`Instagram publish failed: ${err.message}`, 'error');
    } finally {
      setIgPublishingClipId(null);
    }
  }, [igSettings, textSettings.movieName, renderIgTemplate, publishToInstagramPipeline, showToast]);

  const handleBatchPublishIg = useCallback(async (clipsToPublish) => {
    if (!clipsToPublish || clipsToPublish.length === 0) return;
    for (const clip of clipsToPublish) {
      await handlePublishIgClip(clip);
    }
  }, [handlePublishIgClip]);

  // ── Dual FB + IG Direct & Batch Publishing Integration ────────────────────────
  const [isPublishingBoth, setIsPublishingBoth] = useState(false);

  const handlePublishBothClip = useCallback(async (clip) => {
    let clipBlob = clip?.blob;
    if (!clipBlob && clip?.outputUrl) {
      try {
        const res = await fetch(clip.outputUrl);
        clipBlob = await res.blob();
      } catch (e) {}
    }
    if (!clip || !clipBlob) {
      showToast('Clip video data not ready for publishing.', 'error');
      return;
    }
    const resolvedClip = { ...clip, blob: clipBlob };
    setIsPublishingBoth(true);
    const errors = [];
    try {
      showToast(`Publishing Part ${clip.partNumber || 1} to Facebook & Instagram Reels (Temporary upload cached)...`, 'info');
      // 1. Publish to Facebook first (uploads to Backblaze B2 and retains for Instagram)
      try {
        await handlePublishFbClip(resolvedClip, { retainB2: true, retainCache: true });
      } catch (fbErr) {
        console.error('Dual publish FB error:', fbErr);
        errors.push(`Facebook: ${fbErr.message}`);
      }
      // 2. Publish to Instagram (reuses public B2 URL from cache, cleans up afterwards)
      try {
        await handlePublishIgClip(resolvedClip);
      } catch (igErr) {
        console.error('Dual publish IG error:', igErr);
        errors.push(`Instagram: ${igErr.message}`);
      }
      if (errors.length === 0) {
        showToast(`Part ${clip.partNumber || 1} published to both Facebook & Instagram!`, 'success');
      } else if (errors.length === 1) {
        showToast(`Part ${clip.partNumber || 1} publish completed with issue: ${errors[0]}`, 'warning');
      } else {
        showToast(`Dual publish failed: ${errors.join('; ')}`, 'error');
      }
    } finally {
      setIsPublishingBoth(false);
    }
  }, [handlePublishFbClip, handlePublishIgClip, showToast]);

  const handleBatchPublishBoth = useCallback(async (clipsToPublish) => {
    if (!clipsToPublish || clipsToPublish.length === 0) return;
    setIsPublishingBoth(true);
    try {
      for (const clip of clipsToPublish) {
        await handlePublishBothClip(clip);
      }
    } finally {
      setIsPublishingBoth(false);
    }
  }, [handlePublishBothClip]);



  // ── Handle Video Loading and Auto-Detection ───────────────────────────────────
  const handleVideoSelect = (data) => {
    setVideoData(data);
    setStartTime(0);
    setEndTime(data.duration);
    currentTimeRef.current = 0;
    setCurrentTime(0);

    // Auto-populate movie name from demo preset or filename (cleaned)
    const baseName = data.preset?.movieName || cleanVideoFilename(data.file.name);
    setTextSettings((prev) => ({
      ...prev,
      movieName: baseName
    }));
    setExportSettings((prev) => ({
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

    // Ensure export profile preserves original native resolution & FPS
    setExportSettings((prev) => ({
      ...prev,
      resolution: 'original',
      fps: data.detectedFps?.recommendedFps || 'original'
    }));

    if (data.preset) {
      showToast(`⚡ Loaded Demo Video: "${data.preset.title}" with 3 split parts & social templates!`, 'success');
    } else {
      showToast(`Loaded "${data.file.name}" (${Math.round(data.duration)}s) successfully!`, 'success');
    }
  };

  // ── Split & Cut Actions for Player & Hotkeys ──────────────────────────────
  const handleSplitAtPlayhead = useCallback(() => {
    if (!videoData) return;
    // Read from ref so we always have the live position, not the throttled state.
    const playhead = Math.round((currentTimeRef.current || 0) * 10) / 10;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoData, customParts, showToast]);

  const handleToggleCutAtPlayhead = useCallback(() => {
    if (!customParts || customParts.length === 0) return;
    // Read from ref for the exact live position, not the 4fps-throttled state.
    const liveTime = currentTimeRef.current;
    const targetIdx = customParts.findIndex(p => liveTime >= p.startTime && liveTime <= p.endTime);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customParts, showToast]);

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
  // currentTime intentionally omitted: hotkey handler reads currentTimeRef.current
  // directly so we don't re-register the listener on every timeupdate tick.
  }, [videoData, customParts]);

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
    publishConfig = null,
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
    const intervalMinutes = publishConfig?.batchIntervalMinutes || (getIntervalSeconds(scheduleInterval) / 60) || 30;
    const totalActiveCount = (customParts && customParts.length > 0)
      ? customParts.filter(p => !p.isDeleted).length
      : partsToGenerate.length;

    const newJobs = partsToGenerate.map((part, idx) => {
      // Clean part number: preserve original partNumber (e.g. Part 4 in range 4-15), offset by baseStartPart if needed
      const partNum = (part.partNumber != null)
        ? (baseStartPart > 1 ? baseStartPart + (part.partNumber - 1) : part.partNumber)
        : (baseStartPart + idx);
      const effectiveMovie = exportSettings.movieName || textSettings.movieName || ytSettings?.yt_name || igSettings?.ig_name || fbSettings?.fb_name || 'Clip';
      const isCustomTitle = part.title && part.title !== 'Full Video' && !part.title.match(/^Part\s+\d+$/i);
      const customName = isCustomTitle ? `${effectiveMovie} - ${part.title} (Part ${partNum})` : null;
      const filename = customName
        ? `${customName.replace(/[\\/:*?"<>|]/g, '_')}.${exportSettings.format || 'mp4'}`
        : generateClipFilename({
            movieName: effectiveMovie,
            partNumber: partNum,
            totalParts: totalActiveCount,
            template: exportSettings.fileTemplate || textSettings.fileTemplate || textSettings.template || '{movie} - Part {part}',
            zeroPad: textSettings.zeroPad,
            extension: exportSettings.format || 'mp4'
          });

      const ytStartPart = Math.max(1, parseInt(ytSettings?.yt_start_part) || 1);
      const ytPartNum = (part.partNumber != null)
        ? (ytStartPart > 1 ? ytStartPart + (part.partNumber - 1) : part.partNumber)
        : (ytStartPart + idx);

      // Calculate staggered schedule offsets based on configured interval
      const clipOffsetMs = idx * intervalMinutes * 60 * 1000;

      let jobYtScheduledAt = null;
      let jobFbScheduledAt = null;
      let jobIgScheduledAt = null;

      if (publishConfig?.mode === 'schedule') {
        const ytTarget = publishConfig.platforms?.youtube?.scheduleTime || publishConfig.platforms?.youtube?.scheduledAt;
        if (ytTarget) {
          jobYtScheduledAt = new Date(new Date(ytTarget).getTime() + clipOffsetMs).toISOString();
        }
        const fbTarget = publishConfig.platforms?.facebook?.scheduleTime || publishConfig.platforms?.facebook?.scheduledAt;
        if (fbTarget) {
          jobFbScheduledAt = new Date(new Date(fbTarget).getTime() + clipOffsetMs).toISOString();
        }
        const igTarget = publishConfig.platforms?.instagram?.scheduleTime || publishConfig.platforms?.instagram?.scheduledAt;
        if (igTarget) {
          jobIgScheduledAt = new Date(new Date(igTarget).getTime() + clipOffsetMs).toISOString();
        }
      } else if (autoSchedule && scheduleStartTime) {
        jobYtScheduledAt = calculateSingleScheduleTime(scheduleStartTime, scheduleInterval || '1hour', idx);
      }

      const publishPlan = (publishConfig && publishConfig.mode !== 'local_only') ? {
        mode: publishConfig.mode,
        batchInterval: publishConfig.batchInterval,
        batchIntervalMinutes: intervalMinutes,
        clipIndex: idx,
        youtube: publishConfig.platforms?.youtube?.enabled ? {
          enabled: true,
          scheduledAt: jobYtScheduledAt
        } : null,
        facebook: publishConfig.platforms?.facebook?.enabled ? {
          enabled: true,
          scheduledAt: jobFbScheduledAt
        } : null,
        instagram: publishConfig.platforms?.instagram?.enabled ? {
          enabled: true,
          scheduledAt: jobIgScheduledAt
        } : null
      } : null;

      const scheduledAt = jobYtScheduledAt || jobFbScheduledAt || jobIgScheduledAt || null;

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
          totalParts: totalActiveCount
        },
        logoSettings,
        effectsSettings,
        audioSettings,
        exportSettings,
        scheduledAt,
        autoUpload: Boolean(publishPlan?.youtube?.enabled),
        publishPlan
      };
    });

    addJobs(newJobs);
    showToast(`Added ${newJobs.length} clips to processing queue!`, 'success');
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
    const effectiveCleanedMovie = exportSettings.movieName || textSettings.movieName || 'Cleaned_Video';
    const cleanedFilename = `${effectiveCleanedMovie.replace(/[\\/:*?"<>|]/g, '_')}_Edited_Cleaned.${exportSettings.format || 'mp4'}`;

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
    const effectiveMergedMovie = exportSettings.movieName || textSettings.movieName || 'Merged_Video';
    const cleanedFilename = `${effectiveMergedMovie.replace(/[\\/:*?"<>|]/g, '_')}_Merged_${partNumbersLabel}.${exportSettings.format || 'mp4'}`;

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
    const baseStartPart = Math.max(1, parseInt(textSettings.startPart) || 1);
    const effectiveMovie = exportSettings.movieName || textSettings.movieName || ytSettings?.yt_name || igSettings?.ig_name || fbSettings?.fb_name || 'Clip';
    const totalActiveCount = (customParts && customParts.length > 0)
      ? customParts.filter((p) => !p.isDeleted).length
      : list.length;
    const pendingClips = list.map((part, idx) => {
      const partNum = (part.partNumber != null)
        ? (baseStartPart > 1 ? baseStartPart + (part.partNumber - 1) : part.partNumber)
        : (baseStartPart + idx);
      const isCustomTitle = part.title && part.title !== 'Full Video' && !part.title.match(/^Part\s+\d+$/i);
      const name = isCustomTitle
        ? `${effectiveMovie} - ${part.title} (Part ${partNum})`
        : generateClipFilename({
            movieName: effectiveMovie,
            partNumber: partNum,
            totalParts: totalActiveCount,
            template: exportSettings.fileTemplate || textSettings.fileTemplate || textSettings.template || '{movie} - Part {part}',
            zeroPad: textSettings.zeroPad,
            extension: exportSettings.format || 'mp4'
          });
      return {
        id: `pending-${partNum}`,
        partNumber: partNum,
        name,
        duration: Math.max(0, (part.endTime || 0) - (part.startTime || 0))
      };
    });
    setPreRenderContext({ mode: 'all', customPartsList: list });
    setPublishModalClips(pendingClips);
  };

  // ── Action: Export Single Part Directly ──────────────────────────────────────
  const handleExportSinglePart = (part) => {
    if (!videoData || !part) return;
    const keptIdx = (customParts || []).filter(p => !p.isDeleted).findIndex(p => p.id === part.id);
    const baseStartPart = Math.max(1, parseInt(textSettings.startPart) || 1);
    const partNum = keptIdx >= 0 ? baseStartPart + keptIdx : (part.partNumber || 1);

    const effectiveMovie = exportSettings.movieName || textSettings.movieName || ytSettings?.yt_name || igSettings?.ig_name || fbSettings?.fb_name || 'Clip';
    const isCustomTitle = part.title && part.title !== 'Full Video' && !part.title.match(/^Part\s+\d+$/i);
    const customName = isCustomTitle ? `${effectiveMovie} - ${part.title} (Part ${partNum})` : null;
    const filename = customName
      ? `${customName.replace(/[\\/:*?"<>|]/g, '_')}.${exportSettings.format || 'mp4'}`
      : generateClipFilename({
          movieName: effectiveMovie,
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

  const handleDownloadAllZip = useCallback(async () => {
    if (completedClips.length === 0) {
      showToast('No completed clips to download.', 'error');
      return;
    }
    try {
      await downloadAllZip(exportSettings.movieName || textSettings.movieName || 'Video_Clips');
      showToast('Downloaded all clips in a single ZIP file!', 'success');
    } catch (err) {
      showToast('Failed to create ZIP file. Try downloading clips individually.', 'error');
    }
  }, [completedClips.length, downloadAllZip, exportSettings.movieName, textSettings.movieName, showToast]);

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
  const handleUploadClip = useCallback(async (clip, overrides = {}) => {
    if (!isConnected) {
      showToast('Connect YouTube first to upload clips.', 'error');
      return;
    }
    let clipToUpload = clip;
    if (!clipToUpload.blob && clipToUpload.outputUrl) {
      try {
        const res = await fetch(clipToUpload.outputUrl);
        const b = await res.blob();
        clipToUpload = { ...clipToUpload, blob: b };
      } catch (e) {
        console.error('[handleUploadClip] Could not recover blob from outputUrl:', e);
      }
    }
    uploadClip(clipToUpload, overrides);
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
  }, [isConnected, uploadClip, showToast]);

  const handleRetryUpload = useCallback(async (clip) => {
    let clipToRetry = clip;
    if (!clipToRetry.blob && clipToRetry.outputUrl) {
      try {
        const res = await fetch(clipToRetry.outputUrl);
        const b = await res.blob();
        clipToRetry = { ...clipToRetry, blob: b };
      } catch (e) {
        console.error('[handleRetryUpload] Could not recover blob:', e);
      }
    }
    if (!clipToRetry.blob) {
      showToast('Clip blob is no longer available. Please re-export to retry.', 'error');
      return;
    }
    retryUpload(clipToRetry);
    showToast('Retrying YouTube upload...', 'info');
  }, [retryUpload, showToast]);

  // ── Automatic Background Publishing on Render Completion ─────────────────────
  const handleClipCompleted = useCallback(async (completedJob) => {
    if (!completedJob) return;

    const plan = completedJob.publishPlan;
    if (!plan || plan.mode === 'local_only') {
      // Local render only, no social publish requested
      return;
    }

    // Ensure we have a valid video Blob for publishing/scheduling (recover from outputUrl if state blob was nulled)
    let clipBlob = completedJob.blob;
    if (!clipBlob && completedJob.outputUrl) {
      try {
        const res = await fetch(completedJob.outputUrl);
        clipBlob = await res.blob();
      } catch (fetchErr) {
        console.error('[handleClipCompleted] Failed to fetch blob from outputUrl:', fetchErr);
      }
    }

    if (!clipBlob) {
      console.warn('[handleClipCompleted] No video blob available to schedule or publish for job:', completedJob.id);
      showToast(`Cannot schedule Part ${completedJob.partNumber || ''}: video blob unavailable.`, 'error');
      return;
    }

    const jobWithBlob = { ...completedJob, blob: clipBlob };
    const { youtube, facebook, instagram } = plan;

    // 1. YouTube Auto Upload / Schedule
    if (youtube?.enabled && isConnected) {
      try {
        const ytPartNum = completedJob.ytPartNumber || completedJob.partNumber || 1;
        const ytMovie = ytSettings?.yt_name || textSettings?.movieName || 'My Movie';
        const isYtZeroPad = ytSettings?.yt_zero_pad !== false;
        const ytTags = (Array.isArray(ytSettings?.yt_tags) && ytSettings.yt_tags.length > 0)
          ? ytSettings.yt_tags
          : ['shorts', 'viral', 'clips'];

        const ytTitle = renderTemplate
          ? renderTemplate(ytSettings?.yt_title_template || '{movie} - Part {part} | #Shorts', {
              movieName: ytMovie,
              partNumber: ytPartNum,
              zeroPad: isYtZeroPad,
              tags: ytTags
            })
          : `${ytMovie} - Part ${ytPartNum} | #Shorts`;

        const ytDesc = renderTemplate
          ? renderTemplate(ytSettings?.yt_description_template || '{movie} - Part {part}\n\n#Shorts\n\n{hashtags}', {
              movieName: ytMovie,
              partNumber: ytPartNum,
              zeroPad: isYtZeroPad,
              tags: ytTags
            })
          : `${ytMovie} - Part ${ytPartNum}\n\n${ytTags.map(t => `#${t}`).join(' ')}`;

        handleUploadClip(jobWithBlob, {
          title: ytTitle,
          titleOverride: ytTitle,
          description: ytDesc,
          descriptionOverride: ytDesc,
          tags: ytTags,
          tagsOverride: ytTags,
          visibility: ytSettings?.yt_visibility || 'private',
          scheduledAt: youtube.scheduledAt || null
        });
      } catch (ytErr) {
        console.error('[handleClipCompleted] YouTube auto-upload error:', ytErr);
      }
    }

    // Single B2 upload deduplication across Facebook & Instagram for this clip
    const cacheKey = jobWithBlob.id || (jobWithBlob.blob?.size ? `${jobWithBlob.name}_${jobWithBlob.blob.size}` : jobWithBlob.blob);
    let cachedUpload = jobWithBlob.blob ? sharedUploadCache.getCachedUpload(jobWithBlob.blob, cacheKey) : null;

    // 2. Facebook Auto Publish / Schedule
    if (facebook?.enabled && isFbConnected) {
      setFbPublishingClipId(completedJob.id);
      try {
        const fbPartNum = completedJob.partNumber || 1;
        const fbMovie = fbSettings?.fb_name || textSettings?.movieName || 'My Movie';
        const isFbZeroPad = fbSettings?.fb_zero_pad !== false;
        const fbTags = (Array.isArray(fbSettings?.fb_tags) && fbSettings.fb_tags.length > 0)
          ? fbSettings.fb_tags
          : ['reels', 'facebookreels', 'viral'];

        const fbTitle = renderFbTemplate
          ? renderFbTemplate(fbSettings?.fb_title_template || '{movie} - Part {part} | #Reels', {
              movieName: fbMovie,
              partNumber: fbPartNum,
              zeroPad: isFbZeroPad,
              tags: fbTags
            })
          : `${fbMovie} - Part ${fbPartNum} | #Reels`;

        const fbCaption = renderFbTemplate
          ? renderFbTemplate(fbSettings?.fb_caption_template || '{movie} - Part {part}\n\n#Reels #Shorts\n\n{hashtags}', {
              movieName: fbMovie,
              partNumber: fbPartNum,
              zeroPad: isFbZeroPad,
              tags: fbTags
            })
          : `${fbMovie} - Part ${fbPartNum}\n\n${fbTags.map(t => `#${t}`).join(' ')}`;

        const fbRes = await publishToFacebookPipeline(jobWithBlob.blob, {
          clipId: completedJob.id,
          b2FileId: cachedUpload?.b2FileId,
          b2FileName: cachedUpload?.b2FileName,
          fileName: `${fbMovie.replace(/[\\/:*?"<>|]/g, '_')}_Part_${fbPartNum}.mp4`,
          title: fbTitle,
          caption: fbCaption,
          hashtags: fbTags,
          contentType: fbSettings?.fb_content_type || 'reel',
          pageId: fbAccount?.page_id,
          isAiGenerated: Boolean(fbSettings?.fb_is_ai_generated),
          scheduledAt: facebook.scheduledAt || null,
          retainB2: Boolean(instagram?.enabled && isIgConnected),
          retainCache: Boolean(instagram?.enabled && isIgConnected)
        });

        if (!cachedUpload && jobWithBlob.blob) {
          cachedUpload = sharedUploadCache.getCachedUpload(jobWithBlob.blob, cacheKey);
        }

        const fbUrl = fbRes?.postUrl || fbRes?.permalink_url || (fbRes?.videoId ? `https://www.facebook.com/reel/${fbRes.videoId}` : null);
        if (fbUrl) {
          setFbPublishedMap(prev => ({ ...prev, [completedJob.id]: fbUrl }));
        }
        if (facebook.scheduledAt) {
          showToast(`Part ${fbPartNum} scheduled on Facebook for ${new Date(facebook.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, 'success');
        } else {
          showToast(`Part ${fbPartNum} published to Facebook!`, 'success');
        }
      } catch (fbErr) {
        console.error(`[handleClipCompleted] Facebook error on Part ${completedJob.partNumber}:`, fbErr);
        showToast(`Facebook error on Part ${completedJob.partNumber}: ${fbErr.message}`, 'error');
      } finally {
        setFbPublishingClipId(null);
      }
    }

    // 3. Instagram Auto Publish / Schedule
    if (instagram?.enabled && isIgConnected) {
      setIgPublishingClipId(completedJob.id);
      try {
        const igPartNum = completedJob.partNumber || 1;
        const igMovie = igSettings?.ig_name || textSettings?.movieName || 'My Movie';
        const isIgZeroPad = igSettings?.ig_zero_pad !== false;
        const igTags = (Array.isArray(igSettings?.ig_tags) && igSettings.ig_tags.length > 0)
          ? igSettings.ig_tags
          : ['reels', 'instagramreels', 'viral'];

        const igCaption = renderIgTemplate
          ? renderIgTemplate(igSettings?.ig_caption_template || '{movie} - Part {part}\n\n#Reels #InstagramReels #Viral\n\n{hashtags}', {
              movieName: igMovie,
              partNumber: igPartNum,
              zeroPad: isIgZeroPad,
              tags: igTags
            })
          : `${igMovie} - Part ${igPartNum}\n\n${igTags.map(t => `#${t}`).join(' ')}`;

        const igRes = await publishToInstagramPipeline(jobWithBlob.blob, {
          clipId: completedJob.id,
          b2FileId: cachedUpload?.b2FileId,
          b2FileName: cachedUpload?.b2FileName,
          fileName: `${igMovie.replace(/[\\/:*?"<>|]/g, '_')}_Part_${igPartNum}.mp4`,
          title: `${igMovie} - Part ${igPartNum}`,
          caption: igCaption,
          hashtags: igTags,
          shareToFeed: igSettings?.ig_share_to_feed !== false,
          contentType: igSettings?.ig_content_type || 'reel',
          igUserId: igAccount?.ig_user_id,
          scheduledAt: instagram.scheduledAt || null
        });

        const igUrl = igRes?.postUrl || (igRes?.media_id ? `https://www.instagram.com/reel/${igRes.media_id}` : null);
        if (igUrl) {
          setIgPublishedMap(prev => ({ ...prev, [completedJob.id]: igUrl }));
        }
        if (instagram.scheduledAt) {
          showToast(`Part ${igPartNum} scheduled on Instagram for ${new Date(instagram.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, 'success');
        } else {
          showToast(`Part ${igPartNum} published to Instagram!`, 'success');
        }
      } catch (igErr) {
        console.error(`[handleClipCompleted] Instagram error on Part ${completedJob.partNumber}:`, igErr);
        showToast(`Instagram error on Part ${completedJob.partNumber}: ${igErr.message}`, 'error');
      } finally {
        setIgPublishingClipId(null);
      }
    }
  }, [
    isConnected,
    isFbConnected,
    isIgConnected,
    handleUploadClip,
    renderTemplate,
    renderFbTemplate,
    renderIgTemplate,
    textSettings.movieName,
    ytSettings,
    fbSettings,
    fbAccount,
    igSettings,
    igAccount,
    publishToFacebookPipeline,
    publishToInstagramPipeline,
    showToast
  ]);

  useEffect(() => {
    handleClipCompletedRef.current = handleClipCompleted;
  }, [handleClipCompleted]);

  // ── Central Unified Publishing & Scheduling Orchestrator ─────────────────────
  const handleUnifiedPublish = useCallback(async (config) => {
    // Photo Mode: Publish or Schedule Image Post
    if (config.isPhoto) {
      const { photoItem, platforms, mode } = config;
      const isScheduling = mode === 'schedule';
      showToast(`${isScheduling ? 'Scheduling' : 'Publishing'} photo post...`, 'info');

      try {
        const res = await fetch(photoItem.dataUrl);
        const photoBlob = await res.blob();
        const photoFileName = `photo_${Date.now()}_${(photoItem.aspectRatio || '1x1').replace(':', 'x')}.jpg`;

        let b2Info = null;
        if (platforms.facebook?.enabled || platforms.instagram?.enabled) {
          try {
            const target = await getB2UploadTarget();
            b2Info = await uploadToB2(target.uploadUrl, target.authorizationToken, photoBlob, photoFileName);
          } catch (b2Err) {
            console.error('[Photo Publish] B2 upload error:', b2Err);
            showToast(`Photo storage upload failed: ${b2Err.message}`, 'error');
            return;
          }
        }

        // Facebook Photo Post
        if (platforms.facebook?.enabled && b2Info) {
          try {
            await publishToFacebook({
              contentType: 'image',
              b2FileId: b2Info.fileId || b2Info.id,
              b2FileName: b2Info.fileName || photoFileName,
              title: photoItem.title,
              caption: photoItem.caption,
              isAiGenerated: Boolean(config.isAiGenerated !== undefined ? config.isAiGenerated : fbSettings?.fb_is_ai_generated),
              scheduledAt: platforms.facebook.scheduledAt || null
            });
            if (platforms.facebook.scheduledAt) {
              showToast('Facebook Photo scheduled successfully!', 'success');
            } else {
              showToast('Facebook Photo published to Page successfully!', 'success');
            }
          } catch (fbErr) {
            showToast(`Facebook photo error: ${fbErr.message}`, 'error');
          }
        }

        // Instagram Photo Post
        if (platforms.instagram?.enabled && b2Info) {
          try {
            // Instagram feed strictly requires aspect ratio between 4:5 and 1.91:1.
            // 9:16 images are published as Stories to prevent Meta feed rejection errors.
            const isStoryRatio = photoItem.aspectRatio === '9:16';
            await publishToInstagram({
              contentType: isStoryRatio ? 'story' : 'image',
              b2FileId: b2Info.fileId || b2Info.id,
              b2FileName: b2Info.fileName || photoFileName,
              caption: photoItem.caption,
              isAiGenerated: Boolean(config.isAiGenerated !== undefined ? config.isAiGenerated : igSettings?.ig_is_ai_generated),
              scheduledAt: platforms.instagram.scheduledAt || null
            });
            if (platforms.instagram.scheduledAt) {
              showToast(`Instagram ${isStoryRatio ? 'Story' : 'Photo'} scheduled successfully!`, 'success');
            } else {
              showToast(`Instagram ${isStoryRatio ? 'Story' : 'Photo'} published successfully!`, 'success');
            }
          } catch (igErr) {
            showToast(`Instagram photo error: ${igErr.message}`, 'error');
          }
        }

        // Close publish modal and clear photo asset
        setPublishModalClips(null);
        setPublishModalPhoto(null);
        setPhotoDataUrl(null);
      } catch (err) {
        console.error('[handleUnifiedPublish] Photo error:', err);
        showToast(`Photo publish failed: ${err.message}`, 'error');
      }
      return;
    }

    // If opened in pre-render mode, start rendering queue with publishConfig attached
    if (preRenderContext) {
      const savedContext = preRenderContext;
      setPreRenderContext(null);
      setPublishModalClips(null);

      if (config.mode === 'local_only' || (!config.platforms?.youtube?.enabled && !config.platforms?.facebook?.enabled && !config.platforms?.instagram?.enabled)) {
        handleGenerateQueue({ ...savedContext, publishConfig: null });
        showToast('Rendering clips locally (no social upload)...', 'info');
      } else {
        handleGenerateQueue({ ...savedContext, publishConfig: config });
        showToast(
          config.mode === 'schedule'
            ? `Starting rendering! Clips will be scheduled with ${config.batchIntervalMinutes || 30}-min intervals.`
            : 'Starting rendering! Clips will be published as each completes.',
          'success'
        );
      }
      return;
    }

    // Post-render mode (completed clips published directly)
    const { clips, mode, batchIntervalMinutes = 30, platforms } = config;
    if (!clips || clips.length === 0) {
      showToast('No clips selected for publishing.', 'error');
      return;
    }

    const enabledPlatforms = [];
    if (platforms.youtube?.enabled) enabledPlatforms.push('YouTube');
    if (platforms.facebook?.enabled) enabledPlatforms.push('Facebook');
    if (platforms.instagram?.enabled) enabledPlatforms.push('Instagram');

    if (enabledPlatforms.length === 0) {
      showToast('Please select at least one platform.', 'error');
      return;
    }

    const isScheduling = mode === 'schedule';
    showToast(
      `${isScheduling ? 'Scheduling' : 'Publishing'} ${clips.length} clip(s) to ${enabledPlatforms.join(', ')}...`,
      'info'
    );

    // Process each clip sequentially with single B2 upload deduplication
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      let clipBlob = clip.blob;
      if (!clipBlob && clip.outputUrl) {
        try {
          const res = await fetch(clip.outputUrl);
          clipBlob = await res.blob();
        } catch (fetchErr) {
          console.warn(`[handleUnifiedPublish] Could not recover blob from outputUrl for clip ${clip.id}:`, fetchErr);
        }
      }
      const clipWithBlob = clipBlob ? { ...clip, blob: clipBlob } : clip;
      const partNum = clipWithBlob.partNumber || i + 1;
      const clipOffsetMs = i * batchIntervalMinutes * 60 * 1000;

      // 1. YouTube Upload / Schedule
      if (platforms.youtube?.enabled && isConnected) {
        let ytScheduledAt = null;
        const ytTargetTime = platforms.youtube.scheduleTime || platforms.youtube.scheduledAt;
        if (isScheduling && ytTargetTime) {
          ytScheduledAt = new Date(new Date(ytTargetTime).getTime() + clipOffsetMs).toISOString();
        }

        const ytPartNum = clipWithBlob.ytPartNumber || partNum;
        const ytMovie = ytSettings?.yt_name || textSettings?.movieName || 'My Movie';
        const isYtZeroPad = ytSettings?.yt_zero_pad !== false;
        const ytTags = (Array.isArray(ytSettings?.yt_tags) && ytSettings.yt_tags.length > 0)
          ? ytSettings.yt_tags
          : ['shorts', 'viral', 'clips'];

        const ytTitle = renderTemplate
          ? renderTemplate(ytSettings?.yt_title_template || '{movie} - Part {part} | #Shorts', {
              movieName: ytMovie,
              partNumber: ytPartNum,
              zeroPad: isYtZeroPad,
              tags: ytTags
            })
          : `${ytMovie} - Part ${ytPartNum} | #Shorts`;

        const ytDesc = renderTemplate
          ? renderTemplate(ytSettings?.yt_description_template || '{movie} - Part {part}\n\n#Shorts\n\n{hashtags}', {
              movieName: ytMovie,
              partNumber: ytPartNum,
              zeroPad: isYtZeroPad,
              tags: ytTags
            })
          : `${ytMovie} - Part ${ytPartNum}\n\n${ytTags.map(t => `#${t}`).join(' ')}`;

        handleUploadClip(clipWithBlob, {
          title: ytTitle,
          titleOverride: ytTitle,
          description: ytDesc,
          descriptionOverride: ytDesc,
          tags: ytTags,
          tagsOverride: ytTags,
          visibility: ytSettings?.yt_visibility || 'private',
          scheduledAt: ytScheduledAt
        });
      }

      // Check if B2 upload is already cached for FB / IG (deduplicate B2 upload)
      const cacheKey = clipWithBlob.id || (clipWithBlob.blob && clipWithBlob.blob.size ? `${clipWithBlob.name}_${clipWithBlob.blob.size}` : clipWithBlob.blob);
      let cachedUpload = clipWithBlob.blob ? sharedUploadCache.getCachedUpload(clipWithBlob.blob, cacheKey) : null;

      // 2. Facebook Publish / Schedule
      if (platforms.facebook?.enabled && isFbConnected) {
        setFbPublishingClipId(clipWithBlob.id);
        try {
          let fbScheduledAt = null;
          const fbTargetTime = platforms.facebook.scheduleTime || platforms.facebook.scheduledAt;
          if (isScheduling && fbTargetTime) {
            fbScheduledAt = new Date(new Date(fbTargetTime).getTime() + clipOffsetMs).toISOString();
          }

          const fbMovie = fbSettings?.fb_name || textSettings?.movieName || 'My Movie';
          const isFbZeroPad = fbSettings?.fb_zero_pad !== false;
          const fbTags = (Array.isArray(fbSettings?.fb_tags) && fbSettings.fb_tags.length > 0)
            ? fbSettings.fb_tags
            : ['reels', 'facebookreels', 'viral'];

          const fbTitle = renderFbTemplate
            ? renderFbTemplate(fbSettings?.fb_title_template || '{movie} - Part {part} | #Reels', {
                movieName: fbMovie,
                partNumber: partNum,
                zeroPad: isFbZeroPad,
                tags: fbTags
              })
            : `${fbMovie} - Part ${partNum} | #Reels`;

          const fbCaption = renderFbTemplate
            ? renderFbTemplate(fbSettings?.fb_caption_template || '{movie} - Part {part}\n\n#Reels #Shorts\n\n{hashtags}', {
                movieName: fbMovie,
                partNumber: partNum,
                zeroPad: isFbZeroPad,
                tags: fbTags
              })
            : `${fbMovie} - Part ${partNum}\n\n${fbTags.map(t => `#${t}`).join(' ')}`;

          const fbRes = await publishToFacebookPipeline(clipWithBlob.blob, {
            clipId: clipWithBlob.id,
            b2FileId: cachedUpload?.b2FileId,
            b2FileName: cachedUpload?.b2FileName,
            fileName: `${fbMovie.replace(/[\\/:*?"<>|]/g, '_')}_Part_${partNum}.mp4`,
            title: fbTitle,
            caption: fbCaption,
            hashtags: fbTags,
            contentType: fbSettings?.fb_content_type || 'reel',
            pageId: fbAccount?.page_id,
            isAiGenerated: Boolean(config.isAiGenerated !== undefined ? config.isAiGenerated : fbSettings?.fb_is_ai_generated),
            scheduledAt: fbScheduledAt,
            retainB2: Boolean(platforms.instagram?.enabled && isIgConnected),
            retainCache: Boolean(platforms.instagram?.enabled && isIgConnected)
          });

          if (!cachedUpload && clipWithBlob.blob) {
            cachedUpload = sharedUploadCache.getCachedUpload(clipWithBlob.blob, cacheKey);
          }

          const publishedUrl = fbRes?.postUrl || fbRes?.permalink_url || (fbRes?.videoId ? `https://www.facebook.com/reel/${fbRes.videoId}` : null);
          if (publishedUrl) {
            setFbPublishedMap(prev => ({ ...prev, [clipWithBlob.id]: publishedUrl }));
          }
          if (fbScheduledAt) {
            showToast(`Part ${partNum} scheduled on Facebook for ${new Date(fbScheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, 'success');
          } else {
            showToast(`Part ${partNum} published to Facebook!`, 'success');
          }
        } catch (fbErr) {
          console.error(`FB publish error on part ${partNum}:`, fbErr);
          showToast(`Facebook error on Part ${partNum}: ${fbErr.message}`, 'error');
        } finally {
          setFbPublishingClipId(null);
        }
      }

      // 3. Instagram Publish / Schedule
      if (platforms.instagram?.enabled && isIgConnected) {
        setIgPublishingClipId(clipWithBlob.id);
        try {
          let igScheduledAt = null;
          const igTargetTime = platforms.instagram.scheduleTime || platforms.instagram.scheduledAt;
          if (isScheduling && igTargetTime) {
            igScheduledAt = new Date(new Date(igTargetTime).getTime() + clipOffsetMs).toISOString();
          }

          const igMovie = igSettings?.ig_name || textSettings?.movieName || 'My Movie';
          const isIgZeroPad = igSettings?.ig_zero_pad !== false;
          const igTags = (Array.isArray(igSettings?.ig_tags) && igSettings.ig_tags.length > 0)
            ? igSettings.ig_tags
            : ['reels', 'instagramreels', 'viral'];

          const igCaption = renderIgTemplate
            ? renderIgTemplate(igSettings?.ig_caption_template || '{movie} - Part {part}\n\n#Reels #InstagramReels #Viral\n\n{hashtags}', {
                movieName: igMovie,
                partNumber: partNum,
                zeroPad: isIgZeroPad,
                tags: igTags
              })
            : `${igMovie} - Part ${partNum}\n\n${igTags.map(t => `#${t}`).join(' ')}`;

          const igRes = await publishToInstagramPipeline(clipWithBlob.blob, {
            clipId: clipWithBlob.id,
            b2FileId: cachedUpload?.b2FileId,
            b2FileName: cachedUpload?.b2FileName,
            fileName: `${igMovie.replace(/[\\/:*?"<>|]/g, '_')}_Part_${partNum}.mp4`,
            title: `${igMovie} - Part ${partNum}`,
            caption: igCaption,
            hashtags: igTags,
            shareToFeed: igSettings?.ig_share_to_feed !== false,
            contentType: igSettings?.ig_content_type || 'reel',
            igUserId: igAccount?.ig_user_id,
            isAiGenerated: Boolean(config.isAiGenerated !== undefined ? config.isAiGenerated : igSettings?.ig_is_ai_generated),
            scheduledAt: igScheduledAt
          });

          const publishedUrl = igRes?.postUrl || (igRes?.media_id ? `https://www.instagram.com/reel/${igRes.media_id}` : null);
          if (publishedUrl) {
            setIgPublishedMap(prev => ({ ...prev, [clipWithBlob.id]: publishedUrl }));
          }
          if (igScheduledAt) {
            showToast(`Part ${partNum} scheduled on Instagram for ${new Date(igScheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, 'success');
          } else {
            showToast(`Part ${partNum} published to Instagram!`, 'success');
          }
        } catch (igErr) {
          console.error(`Instagram publish error on part ${partNum}:`, igErr);
          showToast(`Instagram error on Part ${partNum}: ${igErr.message}`, 'error');
        } finally {
          setIgPublishingClipId(null);
        }
      }
    }
  }, [
    preRenderContext,
    handleGenerateQueue,
    isConnected,
    isFbConnected,
    isIgConnected,
    handleUploadClip,
    renderTemplate,
    renderFbTemplate,
    renderIgTemplate,
    textSettings.movieName,
    ytSettings,
    fbSettings,
    fbAccount,
    igSettings,
    igAccount,
    publishToFacebookPipeline,
    publishToInstagramPipeline,
    showToast
  ]);

  // ── Render EditorTabs instance for either desktop sidebar or mobile slide-up sheet ────────
  const renderEditorTabs = (isSheet = false) => {
    return (
      <EditorTabs
        isMobileSheet={isSheet}
        isFullScreen={isMobileSheetFullScreen}
        onToggleFullScreen={() => setIsMobileSheetFullScreen(prev => !prev)}
        onCloseMobileSheet={() => setIsMobileEditOpen(false)}
        onCloseSheet={() => setIsMobileEditOpen(false)}
        videoData={videoData}
        cropSettings={cropSettings}
        onCropChange={setCropSettings}
        onCropReset={handleCropReset}
        bgSettings={bgSettings}
        onBgChange={setBgSettings}
        textSettings={textSettings}
        onTextChange={handleTextChange}
        logoSettings={logoSettings}
        onLogoChange={setLogoSettings}
        effectsSettings={effectsSettings}
        onEffectsChange={setEffectsSettings}
        onEffectsReset={handleEffectsReset}
        audioSettings={audioSettings}
        onAudioChange={setAudioSettings}
        exportSettings={exportSettings}
        onExportChange={handleExportChange}
        sourceResolution={{ width: videoData?.width || 1080, height: videoData?.height || 1920 }}
        detectedAudio={videoData?.detectedAudio}
        detectedFps={videoData?.detectedFps}
        detectedQuality={videoData?.detectedQuality}
        onApplyToAll={handleApplyToAll}
        // Split & Delete props
        customParts={customParts}
        onCustomPartsChange={setCustomParts}
        currentTime={currentTime}
        duration={videoData?.duration || 0}
      onCurrentTimeChange={handleExplicitSeek}
      skipDeletedCuts={skipDeletedCuts}
      onToggleSkipDeletedCuts={() => setSkipDeletedCuts((prev) => !prev)}
      onExportMergedCleaned={handleExportMergedCleaned}
      onExportSelectedMerge={handleExportSelectedMerge}
      onGenerateBatchKept={handleGenerateBatchKept}
      onExportSinglePart={handleExportSinglePart}
      isProcessing={isProcessing}
      movieName={exportSettings.movieName || textSettings.movieName}
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
      onOpenPreview={(clip) => setPreviewClipModal(clip)}
      uploadHistory={uploadHistory}
      uploadJobs={uploadJobs}
      isLoadingHistory={isLoadingHistory}
      onRetryUpload={handleRetryUpload}
      refreshHistory={refreshHistory}
      removeHistoryRecords={removeHistoryRecords}
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
      // Instagram props
      igAccount={igAccount}
      availableIgAccounts={igAvailableAccounts}
      isIgConnected={isIgConnected}
      isIgUserConnected={isIgUserConnected}
      isIgAccountConnected={isIgAccountConnected}
      isLoadingIgAccount={isLoadingIgAccount}
      igAccountError={igAccountError}
      connectInstagram={connectInstagram}
      connectIgAccountById={connectIgAccountById}
      isConnectingIgAccount={isConnectingIgAccount}
      igAccountConnectError={igAccountConnectError}
      setIgAccountConnectError={setIgAccountConnectError}
      switchIgAccount={switchIgAccount}
      disconnectInstagram={disconnectInstagram}
      refreshIgAccount={refreshIgAccount}
      igSettings={igSettings}
      updateIgSettings={updateIgSettings}
      renderIgTemplate={renderIgTemplate}
      publishToInstagramPipeline={publishToInstagramPipeline}
      isPublishingIg={isPublishingIg}
      publishIgProgress={publishIgProgress}
      publishIgStage={publishIgStage}
      publishIgError={publishIgError}
      lastPublishedIgPost={lastPublishedIgPost}
      activeTab={activeEditorTab}
      onTabChange={setActiveEditorTab}
      showToast={showToast}
    />
  );
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
          currentTimeRef.current = 0;
          setCurrentTime(0);
        }}
        user={user}
        isAuthenticated={isUserLoggedIn}
        onOpenAuth={openAuthModal}
        onLogout={handleLogout}
        onOpenStorage={() => handleNavigateTab('storage')}
        onOpenTemplates={() => setIsTemplateModalOpen(true)}
        templatesCount={templates.length}
        ytAccount={ytAccount}
        fbAccount={fbAccount}
        igAccount={igAccount}
        isYtConnected={isConnected}
        isFbConnected={isFbConnected}
        isIgConnected={isIgConnected}
        activeTab={activeEditorTab}
        onNavigateTab={handleNavigateTab}
        studioMode={studioMode}
        onStudioModeChange={setStudioMode}
        isGenerating={isProcessing}
        isProcessing={isProcessing}
        onStopGenerating={stopGenerating}
      />

      {/* Main Application Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 lg:pb-8 space-y-4 sm:space-y-6">
        {studioMode === 'photo' ? (
          <PhotoEditor
            initialImage={photoDataUrl}
            movieName={exportSettings.movieName || textSettings.movieName}
            videoData={videoData}
            currentVideoTime={currentTime}
            onClearPhoto={() => setPhotoDataUrl(null)}
            onCaptureVideoFrame={() => {
              if (videoData) {
                setStudioMode('video');
                showToast('Play or pause the video at any frame, then click "Snap Frame"!', 'info');
              } else {
                showToast('Upload a video first to capture video frames', 'info');
              }
            }}
            onPublishPhoto={(photoPayload) => {
              setPublishModalPhoto(photoPayload);
              setPublishModalClips([photoPayload]);
            }}
            onSetYouTubeThumbnail={async (dataUrl) => {
              try {
                const latestYtJob = uploadHistory?.find(j => j.youtube_video_id);
                if (latestYtJob?.youtube_video_id) {
                  showToast('Setting thumbnail on YouTube...', 'info');
                  await setYouTubeThumbnail(latestYtJob.youtube_video_id, dataUrl);
                  showToast(`Thumbnail set successfully on YouTube: ${latestYtJob.title || latestYtJob.youtube_video_id}!`, 'success');
                } else {
                  showToast('Please upload a YouTube video first to assign custom thumbnails.', 'info');
                }
              } catch (err) {
                showToast(`Failed to set YouTube thumbnail: ${err.message}`, 'error');
              }
            }}
            isFbConnected={isFbConnected}
            isIgConnected={isIgConnected}
            isYtConnected={isConnected}
            showToast={showToast}
          />
        ) : (
          <div className="space-y-6">
            {/* Desktop 2-Column Workspace Layout & Single Column on Mobile (Directly Shown UI like Photo Studio) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
              {/* Left Column: Player, Uploader & Mobile Quick Tool Strip */}
              <div className="lg:col-span-7 space-y-4 sm:space-y-6">
                <VideoPreview
                  videoData={videoData}
                  currentTime={currentTime}
                  onTimeUpdate={handleTimeUpdate}
                  cropSettings={cropSettings}
                  onCropChange={setCropSettings}
                  bgSettings={bgSettings}
                  textSettings={textSettings}
                  onTextChange={handleTextChange}
                  logoSettings={logoSettings}
                  onLogoChange={setLogoSettings}
                  effectsSettings={effectsSettings}
                  audioSettings={audioSettings}
                  customParts={customParts}
                  skipDeletedCuts={skipDeletedCuts}
                  onSplitAtPlayhead={handleSplitAtPlayhead}
                  onToggleCutAtPlayhead={handleToggleCutAtPlayhead}
                  onCaptureFrame={handleCaptureFrame}
                  isSuspended={isEditorPreviewSuspended || Boolean(previewClipModal)}
                />

                {/* Video Uploader Area: Drag & Drop Dropzone or Compact File Card */}
                <VideoUploader onVideoSelect={handleVideoSelect} currentVideo={videoData} />

                {/* Timeline Range Scrubber & Manual Parts Time Table (When video is loaded) */}
                {videoData && (
                  <Timeline
                    duration={videoData.duration}
                    startTime={startTime}
                    endTime={endTime}
                    currentTime={currentTime}
                    onStartChange={setStartTime}
                    onEndChange={setEndTime}
                    onCurrentTimeChange={handleExplicitSeek}
                    clipDuration={clipDuration}
                    onClipDurationChange={setClipDuration}
                    movieName={textSettings.movieName}
                    customParts={customParts}
                    onCustomPartsChange={setCustomParts}
                  />
                )}

                {/* Mobile Quick Tool Launcher (visible on screens < lg) */}
                <div className="lg:hidden bg-slate-900/90 border border-slate-800/80 rounded-2xl p-2.5 sm:p-3 backdrop-blur-md shadow-xl">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/60 px-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-orange-400" />
                      Editing &amp; Social Tools
                    </span>
                    <button
                      onClick={() => {
                        setActiveMobileNavTab('edit');
                        setIsMobileEditOpen(true);
                      }}
                      className="text-[11px] font-semibold text-orange-400 hover:text-orange-300 flex items-center gap-0.5 cursor-pointer touch-manipulation"
                    >
                      <span>Open All Tools</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                    {[
                      { id: 'split-cut', label: 'Split & Cut', icon: Scissors, color: 'text-amber-400' },
                      { id: 'history', label: 'Upload History', icon: History, color: 'text-amber-400' },
                      { id: 'crop', label: '9:16 Crop', icon: Crop, color: 'text-cyan-400' },
                      { id: 'backdrop', label: 'Backdrop', icon: ImageIcon, color: 'text-blue-400' },
                      { id: 'text', label: 'Text/Titles', icon: Type, color: 'text-emerald-400' },
                      { id: 'logo', label: 'Logo', icon: ImageIcon, color: 'text-violet-400' },
                      { id: 'effects', label: 'Effects', icon: SlidersHorizontal, color: 'text-pink-400' },
                      { id: 'audio', label: 'Audio', icon: Volume2, color: 'text-green-400' },
                      { id: 'export', label: 'Export', icon: Film, color: 'text-orange-400' },
                      { id: 'youtube', label: 'YouTube', icon: Youtube, color: 'text-red-400' },
                      { id: 'facebook', label: 'Facebook', icon: Share2, color: 'text-blue-500' },
                      { id: 'instagram', label: 'Instagram', icon: Instagram, color: 'text-purple-400' },
                    ].map((item) => {
                      const Icon = item.icon;
                      const isActive = activeEditorTab === item.id ||
                        (item.id === 'backdrop' && activeEditorTab === 'background') ||
                        (item.id === 'history' && (activeEditorTab === 'queue' || activeEditorTab === 'upload-history'));
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setActiveEditorTab(item.id);
                            setActiveMobileNavTab('edit');
                            setIsMobileEditOpen(true);
                          }}
                          className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all cursor-pointer touch-manipulation min-h-[58px] ${
                            isActive
                              ? 'bg-orange-500/20 border border-orange-500/40 text-orange-300 shadow-sm'
                              : 'bg-slate-800/60 border border-slate-700/40 text-slate-300 hover:bg-slate-800 hover:text-white'
                          }`}
                        >
                          <Icon className={`w-4 h-4 mb-1 ${item.color}`} />
                          <span className="text-[10px] font-medium leading-tight text-center truncate w-full">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Multi-tab Editing Panel (Visible on desktop >= lg) */}
              <div className="hidden lg:block lg:col-span-5 space-y-4 lg:space-y-6">
                {renderEditorTabs(false)}
              </div>
            </div>

            {/* Batch Processing Queue & Output */}
            <div id="processing-queue-container" className="space-y-4 sm:space-y-6 pt-1 sm:pt-2">
              <ProcessingQueue
                queue={queue}
                onGenerateQueue={handleGenerateQueue}
                onCancelJob={cancelJob}
                onClearQueue={clearQueue}
                onDeleteSelectedJobs={deleteSelectedJobs}
                onRemoveClip={removeClip}
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
                // Instagram Reels upload integration
                isIgConnected={isIgConnected}
                igAccount={igAccount}
                igSettings={igSettings}
                onPublishIgClip={handlePublishIgClip}
                isPublishingIg={isPublishingIg}
                igPublishProgress={publishIgProgress}
                igPublishStage={publishIgStage}
                igPublishingClipId={igPublishingClipId}
                igPublishedMap={igPublishedMap}
                onOpenPublish={setPublishModalClips}
                onOpenPreRenderModal={(pendingClips, options) => {
                  setPreRenderContext(options);
                  setPublishModalClips(pendingClips);
                }}
                onDownloadAllZip={handleDownloadAllZip}
                isZipping={isZipping}
                zipProgress={zipProgress}
              />
            </div>
          </div>
        )}
      </main>

      {/* Mobile Slide-Up Edit Sheet (< lg) */}
      <MobileEditSheet
        isOpen={isMobileEditOpen}
        onClose={() => setIsMobileEditOpen(false)}
        isFullScreen={isMobileSheetFullScreen}
        onToggleFullScreen={() => setIsMobileSheetFullScreen(prev => !prev)}
      >
        {renderEditorTabs(true)}
      </MobileEditSheet>

      {/* Fixed Mobile Bottom Navigation (< lg) */}
      {studioMode === 'video' && (
        <MobileBottomNav
          activeNavTab={activeMobileNavTab}
          onSelectNavTab={handleMobileNavSelect}
          queueCount={queue.length}
          clipsCount={completedClips.length}
        />
      )}

      {/* Dedicated High-Performance Modal Player for Completed Clips */}
      {previewClipModal && (
        <GeneratedVideoPlayer
          clip={previewClipModal}
          allClips={queue.filter((j) => j.status === 'completed' && (j.outputUrl || j.blob))}
          onSelectClip={(c) => setPreviewClipModal(c)}
          onClose={() => {
            setPreviewClipModal(null);
            handleResumeBackgroundVideo();
          }}
          onDownload={downloadClip}
          onPauseBackgroundVideo={handlePauseBackgroundVideo}
          onResumeBackgroundVideo={handleResumeBackgroundVideo}
        />
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
        currentIgSettings={igSettings}
        currentLogoSettings={logoSettings}
      />

      {/* Central Unified Publish & Schedule Modal */}
      {publishModalClips && (
        <UnifiedPublishModal
          isOpen={Boolean(publishModalClips)}
          onClose={() => {
            setPublishModalClips(null);
            setPublishModalPhoto(null);
            setPreRenderContext(null);
          }}
          clips={publishModalClips}
          isPhotoMode={Boolean(publishModalPhoto)}
          photoItem={publishModalPhoto}
          movieName={exportSettings.movieName || textSettings.movieName}
          youtubeName={exportSettings.movieName || ytSettings?.yt_name || textSettings.movieName}
          textSettings={textSettings}
          isYtConnected={isConnected}
          ytAccount={ytAccount}
          ytSettings={ytSettings}
          isFbConnected={isFbConnected}
          fbAccount={fbAccount}
          fbSettings={fbSettings}
          isIgConnected={isIgConnected}
          igAccount={igAccount}
          igSettings={igSettings}
          isPublishing={isPublishingFb || isPublishingIg || isPublishingBoth}
          publishProgress={publishFbProgress || publishIgProgress || 0}
          onConfirmPublish={handleUnifiedPublish}
          isPreRender={Boolean(preRenderContext)}
        />
      )}
    </div>
  );
}
