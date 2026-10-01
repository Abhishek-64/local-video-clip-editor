import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RotateCcw,
  Crop as CropIcon,
  Move,
  Smartphone,
  LayoutGrid,
  Scissors,
  Camera,
  Image as ImageIcon,
  UploadCloud,
  Sparkles
} from 'lucide-react';
import { formatTime } from '../utils/time';
import { resolveVideoPlacement } from '../utils/crop';

function VideoPreviewInner({
  videoData,
  currentTime,
  onTimeUpdate,
  cropSettings,
  onCropChange,
  bgSettings,
  textSettings,
  onTextChange,
  logoSettings,
  onLogoChange,
  effectsSettings,
  audioSettings,
  customParts = [],
  skipDeletedCuts = true,
  onSplitAtPlayhead,
  onToggleCutAtPlayhead,
  onCaptureFrame,
  isSuspended = false
}) {
  const videoRef = useRef(null);
  const bgCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const phoneViewportRef = useRef(null);
  const framingViewportRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [previewMode, setPreviewMode] = useState('vertical');
  const [showCropGuide, setShowCropGuide] = useState(true);
  const [skippedNotice, setSkippedNotice] = useState(false);
  const skipTimeoutRef = useRef(null);

  // Drag & Resize state for Crop Box
  const dragCropRef = useRef({
    active: false,
    handle: 'center',
    startX: 0,
    startY: 0,
    startCropX: 0,
    startCropY: 0,
    startWidth: 60,
    startHeight: 85
  });

  const dragTextRef = useRef({ active: false, startX: 0, startY: 0, startYPct: 10, startXPct: 50, parentWidth: 0, parentHeight: 0 });
  const dragExtraTextRef = useRef({ active: false, extraId: null, startX: 0, startY: 0, startYPct: 88, startXPct: 50, parentWidth: 0, parentHeight: 0 });
  const dragLogoRef = useRef({ active: false, startX: 0, startY: 0, startYPct: 6, startXPct: 94, parentWidth: 0, parentHeight: 0 });

  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [isDraggingText, setIsDraggingText] = useState(false);
  const [draggingExtraId, setDraggingExtraId] = useState(null);
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);

  // Stable refs for drag handlers to avoid tearing down window listeners on every frame
  const textSettingsRef = useRef(textSettings);
  const cropSettingsRef = useRef(cropSettings);
  const logoSettingsRef = useRef(logoSettings);
  const onTextChangeRef = useRef(onTextChange);
  const onCropChangeRef = useRef(onCropChange);
  const onLogoChangeRef = useRef(onLogoChange);
  const textDragRafRef = useRef(null);

  useEffect(() => { textSettingsRef.current = textSettings; }, [textSettings]);
  useEffect(() => { cropSettingsRef.current = cropSettings; }, [cropSettings]);
  useEffect(() => { logoSettingsRef.current = logoSettings; }, [logoSettings]);
  useEffect(() => { onTextChangeRef.current = onTextChange; }, [onTextChange]);
  useEffect(() => { onCropChangeRef.current = onCropChange; }, [onCropChange]);
  useEffect(() => { onLogoChangeRef.current = onLogoChange; }, [onLogoChange]);

  const getActiveViewportRect = useCallback(() => {
    const el = phoneViewportRef.current || framingViewportRef.current || containerRef.current;
    return el ? el.getBoundingClientRect() : null;
  }, []);

  const isVerticalCrop = cropSettings?.mode === '9:16';
  const isCustomCrop = cropSettings?.mode === 'custom';
  const isFillMode = cropSettings?.fillMode === 'fill';

  const reelImages = cropSettings?.reelImages;
  const topReel = reelImages?.top;
  const bottomReel = reelImages?.bottom;
  const hasTopReel = Boolean(topReel?.url);
  const hasBottomReel = Boolean(bottomReel?.url);

  // Compute letterbox slot percentage using shared resolveVideoPlacement
  const slotMetrics = useMemo(() => {
    const vW = videoRef.current?.videoWidth || videoData?.width || 1920;
    const vH = videoRef.current?.videoHeight || videoData?.height || 1080;
    let targetW = 1080;
    let targetH = 1920;
    if (cropSettings?.mode === '1:1') { targetW = 1080; targetH = 1080; }
    else if (cropSettings?.mode === '4:5') { targetW = 1080; targetH = 1350; }
    else if (cropSettings?.mode === '16:9') { targetW = 1920; targetH = 1080; }
    else if (cropSettings?.mode === '21:9') { targetW = 2560; targetH = 1080; }

    const placement = resolveVideoPlacement({
      sourceWidth: vW,
      sourceHeight: vH,
      stageWidth: targetW,
      stageHeight: targetH,
      mode: cropSettings?.mode || '9:16',
      fillMode: cropSettings?.fillMode || 'fit'
    });

    const hasSlots = placement.letterbox.top > 0;
    return {
      hasSlots,
      slotHeightPct: placement.letterboxPct.topPct,
      videoHeightPct: Math.max(0, 100 - (placement.letterboxPct.topPct * 2))
    };
  }, [videoData?.width, videoData?.height, cropSettings?.mode, cropSettings?.fillMode]);

  const bgType = bgSettings?.type || 'blur-video';
  const bgBlur = bgSettings?.blur ?? 20;
  const bgOpacity = (bgSettings?.opacity ?? 65) / 100;

  // When external modal preview opens, suspend editor video playback and release decode loop
  useEffect(() => {
    if (isSuspended && videoRef.current) {
      if (!videoRef.current.paused) {
        try { videoRef.current.pause(); } catch (e) {}
      }
      setIsPlaying(false);
    }
  }, [isSuspended]);

  // Clean unmount of video element to release hardware decoder
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        try {
          videoRef.current.pause();
          videoRef.current.removeAttribute('src');
          videoRef.current.load();
        } catch (e) {}
      }
    };
  }, []);

  // Frame snapshot grabber for Photo Studio & Thumbnails
  const handleSnapFrame = useCallback(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    if (onCaptureFrame) {
      onCaptureFrame(dataUrl);
    }
  }, [onCaptureFrame]);

  // Frame-Driven Background Canvas Blit — throttled to ≤15fps for blur backdrop.
  // At 15fps the human eye cannot perceive blur-background changes; this halves
  // GPU canvas-blit work vs. running at full video frame rate.
  useEffect(() => {
    if (isSuspended) return;

    let animId = null;
    let rVfcId = null;
    let isCancelled = false;
    let lastBlitMs = 0;
    const BLIT_INTERVAL_MS = 67; // ~15fps cap for blur canvas

    const renderBgFrame = (nowMs = 0) => {
      if (
        bgCanvasRef.current &&
        videoRef.current &&
        videoRef.current.videoWidth > 0 &&
        !isFillMode &&
        bgType === 'blur-video'
      ) {
        // Throttle: only blit if ≥67ms have elapsed since last blit (~15fps)
        if (nowMs - lastBlitMs >= BLIT_INTERVAL_MS || nowMs === 0) {
          lastBlitMs = nowMs;
          const bgCanvas = bgCanvasRef.current;
          const bgCtx = bgCanvas.getContext('2d', { alpha: false, willReadFrequently: false });
          if (bgCtx) {
            const v = videoRef.current;
            const vW = v.videoWidth;
            const vH = v.videoHeight;
            const cW = bgCanvas.width;
            const cH = bgCanvas.height;
            if (vW > 0 && vH > 0 && cW > 0 && cH > 0) {
              const bgPlacement = resolveVideoPlacement({
                sourceWidth: vW,
                sourceHeight: vH,
                stageWidth: cW,
                stageHeight: cH,
                fillMode: 'fill'
              });
              bgCtx.imageSmoothingEnabled = true;
              bgCtx.imageSmoothingQuality = 'medium';
              bgCtx.drawImage(
                v,
                bgPlacement.sourceX,
                bgPlacement.sourceY,
                bgPlacement.sourceWidth,
                bgPlacement.sourceHeight,
                0,
                0,
                cW,
                cH
              );
            }
          }
        }
      }
    };

    const scheduleNextFrame = (nowMs) => {
      if (isCancelled || isSuspended) return;
      renderBgFrame(nowMs);

      const video = videoRef.current;
      if (video && isPlaying && !video.paused && !video.ended) {
        if ('requestVideoFrameCallback' in video) {
          rVfcId = video.requestVideoFrameCallback((now) => {
            scheduleNextFrame(now);
          });
        } else {
          animId = requestAnimationFrame(scheduleNextFrame);
        }
      }
    };

    // Trigger frame update on play state change or seek
    if (isPlaying && !isSuspended) {
      scheduleNextFrame(0);
    } else {
      renderBgFrame(0);
    }

    return () => {
      isCancelled = true;
      if (animId) cancelAnimationFrame(animId);
      if (rVfcId && videoRef.current && 'cancelVideoFrameCallback' in videoRef.current) {
        try {
          videoRef.current.cancelVideoFrameCallback(rVfcId);
        } catch (e) {}
      }
    };
  // currentTime intentionally removed: the rVfc/rAF chain is self-sustaining
  // while playing, and re-triggering the effect on every throttled tick would
  // cause the blur canvas loop to teardown and restart unnecessarily.
  }, [isPlaying, isFillMode, bgType, isSuspended]);

  // Suspend playback when background video is suspended by modal preview
  useEffect(() => {
    if (isSuspended && videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, [isSuspended]);

  // Sync video element time if updated externally
  useEffect(() => {
    if (videoRef.current && Math.abs(videoRef.current.currentTime - currentTime) > 0.3) {
      videoRef.current.currentTime = currentTime;
    }
  }, [currentTime]);

  // Handle Play/Pause
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => {});
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdateInternal = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;

    // Real-time skipping of deleted cut sections
    if (skipDeletedCuts && customParts && customParts.length > 0) {
      const activeCut = customParts.find((p) => p.isDeleted && cur >= p.startTime && cur < p.endTime);
      if (activeCut) {
        // Find next kept segment
        const nextKept = customParts.find((p) => !p.isDeleted && p.startTime >= activeCut.endTime);
        if (nextKept) {
          videoRef.current.currentTime = nextKept.startTime;
          onTimeUpdate(nextKept.startTime);
          setSkippedNotice(true);
          clearTimeout(skipTimeoutRef.current);
          skipTimeoutRef.current = setTimeout(() => setSkippedNotice(false), 1400);
          return;
        } else {
          // Reached end of kept content
          videoRef.current.pause();
          setIsPlaying(false);
          return;
        }
      }
    }

    onTimeUpdate(cur);
  };

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      onTimeUpdate(time);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      if (val === 0) {
        setIsMuted(true);
      } else if (isMuted) {
        setIsMuted(false);
        videoRef.current.muted = false;
      }
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Build CSS filter string
  const getFilterStyle = () => {
    if (!effectsSettings) return {};
    const {
      brightness = 100,
      contrast = 100,
      saturation = 100,
      blur = 0,
      sepia = 0,
      grayscale = 0,
      invert = 0
    } = effectsSettings;

    if (
      brightness === 100 &&
      contrast === 100 &&
      saturation === 100 &&
      blur === 0 &&
      sepia === 0 &&
      grayscale === 0 &&
      invert === 0
    ) {
      return {};
    }

    return {
      filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) blur(${blur}px) sepia(${sepia}%) grayscale(${grayscale}%) invert(${invert}%)`
    };
  };

  // ── Multi-Handle Manual Crop Drag & Resize ───────────────────────────────────
  const startCropDrag = (e, handle = 'center') => {
    if (!onCropChange || cropSettings?.mode === 'original') return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();

    const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY;

    setIsDraggingCrop(true);
    dragCropRef.current = {
      active: true,
      handle,
      startX: clientX,
      startY: clientY,
      startCropX: cropSettings?.x || 0,
      startCropY: cropSettings?.y || 0,
      startWidth: cropSettings?.customWidth ?? (cropSettings?.mode === '9:16' ? 42 : cropSettings?.mode === '1:1' ? 62 : 88),
      startHeight: cropSettings?.customHeight ?? (cropSettings?.mode === '9:16' ? 88 : cropSettings?.mode === '1:1' ? 70 : 60)
    };
  };

  // ── Drag-to-Reposition Primary Text ─────────────────────────────────────────
  const handleTextMouseDown = (e) => {
    if (!onTextChangeRef.current || !textSettingsRef.current?.enabled) return;
    e.preventDefault();
    e.stopPropagation();

    const parentRect = getActiveViewportRect();
    if (!parentRect) return;

    setIsDraggingText(true);
    dragTextRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      parentWidth: parentRect.width,
      parentHeight: parentRect.height,
      currentYPct: textSettingsRef.current.customY ?? 10,
      currentXPct: textSettingsRef.current.customX ?? 50
    };
  };

  const handleTextTouchStart = (e) => {
    if (!onTextChangeRef.current || !textSettingsRef.current?.enabled) return;
    const touch = e.touches[0];
    const parentRect = getActiveViewportRect();
    if (!parentRect) return;

    setIsDraggingText(true);
    dragTextRef.current = {
      active: true,
      startX: touch.clientX,
      startY: touch.clientY,
      parentWidth: parentRect.width,
      parentHeight: parentRect.height,
      currentYPct: textSettingsRef.current.customY ?? 10,
      currentXPct: textSettingsRef.current.customX ?? 50
    };
  };

  // ── Drag-to-Reposition Extra Text Overlays ──────────────────────────────────
  const handleExtraTextMouseDown = (e, item) => {
    if (!onTextChangeRef.current || !item.enabled) return;
    e.preventDefault();
    e.stopPropagation();

    const parentRect = getActiveViewportRect();
    if (!parentRect) return;

    setDraggingExtraId(item.id);
    dragExtraTextRef.current = {
      active: true,
      extraId: item.id,
      startX: e.clientX,
      startY: e.clientY,
      parentWidth: parentRect.width,
      parentHeight: parentRect.height,
      currentYPct: item.customY ?? 88,
      currentXPct: item.customX ?? 50
    };
  };

  const handleExtraTextTouchStart = (e, item) => {
    if (!onTextChangeRef.current || !item.enabled) return;
    const touch = e.touches[0];
    const parentRect = getActiveViewportRect();
    if (!parentRect) return;

    setDraggingExtraId(item.id);
    dragExtraTextRef.current = {
      active: true,
      extraId: item.id,
      startX: touch.clientX,
      startY: touch.clientY,
      parentWidth: parentRect.width,
      parentHeight: parentRect.height,
      currentYPct: item.customY ?? 88,
      currentXPct: item.customX ?? 50
    };
  };

  // ── Drag-to-Reposition Logo ────────────────────────────────────────────────
  const handleLogoMouseDown = (e) => {
    if (!onLogoChangeRef.current || !logoSettingsRef.current?.enabled) return;
    e.preventDefault();
    e.stopPropagation();

    const parentRect = getActiveViewportRect();
    if (!parentRect) return;

    setIsDraggingLogo(true);
    dragLogoRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      parentWidth: parentRect.width,
      parentHeight: parentRect.height,
      currentYPct: logoSettingsRef.current.customY ?? 6,
      currentXPct: logoSettingsRef.current.customX ?? 94
    };
  };

  const handleLogoTouchStart = (e) => {
    if (!onLogoChangeRef.current || !logoSettingsRef.current?.enabled) return;
    const touch = e.touches[0];
    const parentRect = getActiveViewportRect();
    if (!parentRect) return;

    setIsDraggingLogo(true);
    dragLogoRef.current = {
      active: true,
      startX: touch.clientX,
      startY: touch.clientY,
      parentWidth: parentRect.width,
      parentHeight: parentRect.height,
      currentYPct: logoSettingsRef.current.customY ?? 6,
      currentXPct: logoSettingsRef.current.customX ?? 94
    };
  };

  const isAnyDragging = isDraggingCrop || isDraggingText || Boolean(draggingExtraId) || isDraggingLogo;

  useEffect(() => {
    if (!isAnyDragging) return;

    const handleMouseMove = (e) => {
      // 1. Crop box drag / resize
      if (dragCropRef.current.active && onCropChangeRef.current) {
        const dx = e.clientX - dragCropRef.current.startX;
        const dy = e.clientY - dragCropRef.current.startY;
        const h = dragCropRef.current.handle;

        if (h === 'center') {
          const newX = Math.max(-200, Math.min(200, dragCropRef.current.startCropX + dx * 1.5));
          const newY = Math.max(-200, Math.min(200, dragCropRef.current.startCropY + dy * 1.5));
          onCropChangeRef.current({ ...cropSettingsRef.current, x: Math.round(newX), y: Math.round(newY) });
        } else {
          let deltaW = 0;
          let deltaH = 0;

          if (h.includes('r')) deltaW = (dx / 400) * 100;
          if (h.includes('l')) deltaW = (-dx / 400) * 100;
          if (h.includes('b')) deltaH = (dy / 300) * 100;
          if (h.includes('t')) deltaH = (-dy / 300) * 100;

          const newW = Math.max(15, Math.min(100, Math.round(dragCropRef.current.startWidth + deltaW)));
          const newH = Math.max(15, Math.min(100, Math.round(dragCropRef.current.startHeight + deltaH)));

          onCropChangeRef.current({
            ...cropSettingsRef.current,
            mode: 'custom',
            customWidth: newW,
            customHeight: newH
          });
        }
      }

      // 2. Primary text overlay drag (throttled via rAF)
      if (dragTextRef.current.active && onTextChangeRef.current) {
        const dy = e.clientY - dragTextRef.current.startY;
        const dx = e.clientX - dragTextRef.current.startX;

        const deltaYPct = (dy / dragTextRef.current.parentHeight) * 100;
        const deltaXPct = (dx / dragTextRef.current.parentWidth) * 100;

        const newYPct = Math.max(4, Math.min(96, dragTextRef.current.currentYPct + deltaYPct));
        const newXPct = Math.max(4, Math.min(96, dragTextRef.current.currentXPct + deltaXPct));

        if (textDragRafRef.current) cancelAnimationFrame(textDragRafRef.current);
        textDragRafRef.current = requestAnimationFrame(() => {
          onTextChangeRef.current?.({
            ...textSettingsRef.current,
            customY: Math.round(newYPct),
            customX: Math.round(newXPct),
            position: 'center'
          });
        });
      }

      // 3. Extra text overlay drag (throttled via rAF)
      if (dragExtraTextRef.current.active && onTextChangeRef.current && textSettingsRef.current?.extraTexts) {
        const dy = e.clientY - dragExtraTextRef.current.startY;
        const dx = e.clientX - dragExtraTextRef.current.startX;

        const deltaYPct = (dy / dragExtraTextRef.current.parentHeight) * 100;
        const deltaXPct = (dx / dragExtraTextRef.current.parentWidth) * 100;

        const newYPct = Math.max(4, Math.min(96, dragExtraTextRef.current.currentYPct + deltaYPct));
        const newXPct = Math.max(4, Math.min(96, dragExtraTextRef.current.currentXPct + deltaXPct));

        const updatedExtras = textSettingsRef.current.extraTexts.map((item) => {
          if (item.id === dragExtraTextRef.current.extraId) {
            return {
              ...item,
              customY: Math.round(newYPct),
              customX: Math.round(newXPct)
            };
          }
          return item;
        });

        if (textDragRafRef.current) cancelAnimationFrame(textDragRafRef.current);
        textDragRafRef.current = requestAnimationFrame(() => {
          onTextChangeRef.current?.({
            ...textSettingsRef.current,
            extraTexts: updatedExtras
          });
        });
      }

      // 4. Logo overlay drag
      if (dragLogoRef.current.active && onLogoChangeRef.current) {
        const dy = e.clientY - dragLogoRef.current.startY;
        const dx = e.clientX - dragLogoRef.current.startX;

        const deltaYPct = (dy / dragLogoRef.current.parentHeight) * 100;
        const deltaXPct = (dx / dragLogoRef.current.parentWidth) * 100;

        const newYPct = Math.max(3, Math.min(97, dragLogoRef.current.currentYPct + deltaYPct));
        const newXPct = Math.max(3, Math.min(97, dragLogoRef.current.currentXPct + deltaXPct));

        onLogoChangeRef.current({
          ...logoSettingsRef.current,
          customY: Math.round(newYPct),
          customX: Math.round(newXPct)
        });
      }
    };

    const handleTouchMove = (e) => {
      const touch = e.touches[0];
      if (!touch) return;

      // 1. Crop box drag / resize on touch
      if (dragCropRef.current.active && onCropChangeRef.current) {
        const dx = touch.clientX - dragCropRef.current.startX;
        const dy = touch.clientY - dragCropRef.current.startY;
        const h = dragCropRef.current.handle;

        if (h === 'center') {
          const newX = Math.max(-200, Math.min(200, dragCropRef.current.startCropX + dx * 1.5));
          const newY = Math.max(-200, Math.min(200, dragCropRef.current.startCropY + dy * 1.5));
          onCropChangeRef.current({ ...cropSettingsRef.current, x: Math.round(newX), y: Math.round(newY) });
        } else {
          let deltaW = 0;
          let deltaH = 0;

          if (h.includes('r')) deltaW = (dx / 300) * 100;
          if (h.includes('l')) deltaW = (-dx / 300) * 100;
          if (h.includes('b')) deltaH = (dy / 250) * 100;
          if (h.includes('t')) deltaH = (-dy / 250) * 100;

          const newW = Math.max(15, Math.min(100, Math.round(dragCropRef.current.startWidth + deltaW)));
          const newH = Math.max(15, Math.min(100, Math.round(dragCropRef.current.startHeight + deltaH)));

          onCropChangeRef.current({
            ...cropSettingsRef.current,
            mode: 'custom',
            customWidth: newW,
            customHeight: newH
          });
        }
      }

      if (dragTextRef.current.active && onTextChangeRef.current) {
        const dy = touch.clientY - dragTextRef.current.startY;
        const dx = touch.clientX - dragTextRef.current.startX;

        const deltaYPct = (dy / dragTextRef.current.parentHeight) * 100;
        const deltaXPct = (dx / dragTextRef.current.parentWidth) * 100;

        const newYPct = Math.max(4, Math.min(96, dragTextRef.current.currentYPct + deltaYPct));
        const newXPct = Math.max(4, Math.min(96, dragTextRef.current.currentXPct + deltaXPct));

        if (textDragRafRef.current) cancelAnimationFrame(textDragRafRef.current);
        textDragRafRef.current = requestAnimationFrame(() => {
          onTextChangeRef.current?.({
            ...textSettingsRef.current,
            customY: Math.round(newYPct),
            customX: Math.round(newXPct),
            position: 'center'
          });
        });
      }

      if (dragExtraTextRef.current.active && onTextChangeRef.current && textSettingsRef.current?.extraTexts) {
        const dy = touch.clientY - dragExtraTextRef.current.startY;
        const dx = touch.clientX - dragExtraTextRef.current.startX;

        const deltaYPct = (dy / dragExtraTextRef.current.parentHeight) * 100;
        const deltaXPct = (dx / dragExtraTextRef.current.parentWidth) * 100;

        const newYPct = Math.max(4, Math.min(96, dragExtraTextRef.current.currentYPct + deltaYPct));
        const newXPct = Math.max(4, Math.min(96, dragExtraTextRef.current.currentXPct + deltaXPct));

        const updatedExtras = textSettingsRef.current.extraTexts.map((item) => {
          if (item.id === dragExtraTextRef.current.extraId) {
            return {
              ...item,
              customY: Math.round(newYPct),
              customX: Math.round(newXPct)
            };
          }
          return item;
        });

        if (textDragRafRef.current) cancelAnimationFrame(textDragRafRef.current);
        textDragRafRef.current = requestAnimationFrame(() => {
          onTextChangeRef.current?.({
            ...textSettingsRef.current,
            extraTexts: updatedExtras
          });
        });
      }

      if (dragLogoRef.current.active && onLogoChangeRef.current) {
        const dy = touch.clientY - dragLogoRef.current.startY;
        const dx = touch.clientX - dragLogoRef.current.startX;

        const deltaYPct = (dy / dragLogoRef.current.parentHeight) * 100;
        const deltaXPct = (dx / dragLogoRef.current.parentWidth) * 100;

        const newYPct = Math.max(3, Math.min(97, dragLogoRef.current.currentYPct + deltaYPct));
        const newXPct = Math.max(3, Math.min(97, dragLogoRef.current.currentXPct + deltaXPct));

        onLogoChangeRef.current({
          ...logoSettingsRef.current,
          customY: Math.round(newYPct),
          customX: Math.round(newXPct)
        });
      }
    };

    const handleEnd = () => {
      if (textDragRafRef.current) {
        cancelAnimationFrame(textDragRafRef.current);
        textDragRafRef.current = null;
      }
      dragCropRef.current.active = false;
      dragTextRef.current.active = false;
      dragExtraTextRef.current.active = false;
      dragLogoRef.current.active = false;
      setIsDraggingCrop(false);
      setIsDraggingText(false);
      setDraggingExtraId(null);
      setIsDraggingLogo(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleEnd);

    return () => {
      if (textDragRafRef.current) {
        cancelAnimationFrame(textDragRafRef.current);
        textDragRafRef.current = null;
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isAnyDragging]);

  // Memoized: only recomputes when currentTime crosses a part boundary or text settings change
  const renderedText = useMemo(() => {
    if (!textSettings) return '';
    const baseStartPart = Math.max(1, parseInt(textSettings.startPart) || 1);

    let activePartNumber = baseStartPart;
    if (customParts && customParts.length > 0) {
      const kept = customParts.filter(p => !p.isDeleted);
      const activeIdx = kept.findIndex(p => currentTime >= p.startTime - 0.05 && currentTime <= p.endTime + 0.05);
      if (activeIdx !== -1) {
        activePartNumber = baseStartPart + activeIdx;
      }
    }

    const formattedPart = textSettings.zeroPad
      ? String(activePartNumber).padStart(2, '0')
      : String(activePartNumber);

    const displayText = textSettings.text || textSettings.movieName || 'My Movie';
    return (textSettings.template || '{movie} - Part {part}')
      .replace(/\{movie\}/gi, displayText)
      .replace(/\{title\}/gi, displayText)
      .replace(/\{text\}/gi, displayText)
      .replace(/\{part\}/gi, formattedPart);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, customParts, textSettings?.template, textSettings?.text, textSettings?.movieName, textSettings?.startPart, textSettings?.zeroPad]);
  const getRenderedText = () => renderedText;

  // Helper to convert hex or rgb string to rgba with opacity
  const hexOrColorToRgba = (colorStr, alphaPercent = 75) => {
    const alpha = Math.max(0, Math.min(1, (alphaPercent ?? 75) / 100));
    if (!colorStr) return `rgba(0, 0, 0, ${alpha})`;
    if (colorStr.startsWith('rgba(')) return colorStr.replace(/[\d\.]+\)$/g, `${alpha})`);
    if (colorStr.startsWith('rgb(')) return colorStr.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
    if (colorStr.startsWith('#')) {
      let hex = colorStr.slice(1);
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      const r = parseInt(hex.slice(0, 2), 16) || 0;
      const g = parseInt(hex.slice(2, 4), 16) || 0;
      const b = parseInt(hex.slice(4, 6), 16) || 0;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return colorStr;
  };

  // Memoized primary text overlay style — only recomputes when text settings or preview mode change
  const textOverlayStyle = useMemo(() => {
    if (!textSettings) return {};

    const pos = textSettings.position || 'top-center';
    const isTop = pos.startsWith('top');
    const isBottom = pos.startsWith('bottom');

    const previewFontSize = previewMode === 'vertical'
      ? Math.max(2, Math.round((textSettings.fontSize || 28) * (236 / 540)))
      : Math.max(2, Math.round((textSettings.fontSize || 28) * 0.85));

    const style = {
      position: 'absolute',
      fontFamily: textSettings.font || 'Inter, sans-serif',
      fontSize: `${previewFontSize}px`,
      color: textSettings.color || '#ffffff',
      opacity: Math.max(0, Math.min(1, (textSettings.opacity ?? 100) / 100)),
      fontWeight: 'bold',
      fontStyle: textSettings.fontStyle || 'normal',
      textTransform: textSettings.textTransform || 'none',
      letterSpacing: textSettings.letterSpacing ? `${textSettings.letterSpacing}px` : 'normal',
      whiteSpace: 'pre-line',
      lineHeight: 1.25,
      zIndex: 40,
      maxWidth: '86%',
      cursor: 'move',
      userSelect: 'none',
      touchAction: 'none',
      willChange: 'transform'
    };

    if (typeof textSettings.customX === 'number') {
      style.left = `${textSettings.customX}%`;
      style.transform = 'translateX(-50%)';
      style.textAlign = 'center';
    } else if (pos.endsWith('left')) {
      style.left = '7%';
      style.textAlign = 'left';
    } else if (pos.endsWith('right')) {
      style.right = '7%';
      style.textAlign = 'right';
    } else {
      style.left = '50%';
      style.transform = 'translateX(-50%)';
      style.textAlign = 'center';
    }

    if (typeof textSettings.customY === 'number') {
      style.top = `${textSettings.customY}%`;
      style.transform = style.transform ? `${style.transform} translateY(-50%)` : 'translateY(-50%)';
    } else if (isTop) {
      style.top = '10%';
    } else if (isBottom) {
      style.bottom = '10%';
    } else {
      style.top = '50%';
      style.transform = style.transform ? `${style.transform} translateY(-50%)` : 'translateY(-50%)';
    }

    if (textSettings.bgEnabled) {
      const pad = Math.max(2, textSettings.bgPadding ?? 6);
      style.backgroundColor = hexOrColorToRgba(textSettings.bgColor, textSettings.bgOpacity ?? 75);
      style.padding = `${pad}px ${Math.max(4, Math.round(pad * 1.5))}px`;
      style.borderRadius = `${textSettings.bgRadius ?? 6}px`;
    }

    if (textSettings.outline) {
      const thickness = Math.max(2, Math.round((textSettings.outlineThickness || 3) * 0.8));
      const color = textSettings.outlineColor || '#000000';
      style.textShadow = `
        -${thickness}px -${thickness}px 0 ${color},
         ${thickness}px -${thickness}px 0 ${color},
        -${thickness}px  ${thickness}px 0 ${color},
         ${thickness}px  ${thickness}px 0 ${color},
         0px  ${thickness}px 0 ${color},
         0px -${thickness}px 0 ${color},
         ${thickness}px 0px 0 ${color},
        -${thickness}px 0px 0 ${color}
      `;
    }

    return style;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textSettings, previewMode]);
  const getTextOverlayStyle = () => textOverlayStyle;

  // Compute Extra Text overlay position style
  const getExtraTextStyle = (extra) => {
    const previewFontSize = previewMode === 'vertical'
      ? Math.max(2, Math.round((extra.fontSize || 22) * (236 / 540)))
      : Math.max(2, Math.round((extra.fontSize || 22) * 0.85));

    const style = {
      position: 'absolute',
      fontFamily: extra.font || 'Inter, sans-serif',
      fontSize: `${previewFontSize}px`,
      color: extra.color || '#ffffff',
      opacity: Math.max(0, Math.min(1, (extra.opacity ?? 100) / 100)),
      fontWeight: 'bold',
      fontStyle: extra.fontStyle || 'normal',
      textTransform: extra.textTransform || 'none',
      letterSpacing: extra.letterSpacing ? `${extra.letterSpacing}px` : 'normal',
      whiteSpace: 'pre-line',
      lineHeight: 1.25,
      zIndex: 42,
      maxWidth: '86%',
      cursor: 'move',
      userSelect: 'none',
      touchAction: 'none',
      left: `${extra.customX ?? 50}%`,
      top: `${extra.customY ?? 88}%`,
      transform: 'translate(-50%, -50%)',
      textAlign: 'center'
    };

    if (extra.bgEnabled) {
      const pad = Math.max(2, extra.bgPadding ?? 5);
      style.backgroundColor = hexOrColorToRgba(extra.bgColor || '#000000', extra.bgOpacity ?? 75);
      style.padding = `${pad}px ${Math.max(4, Math.round(pad * 1.5))}px`;
      style.borderRadius = `${extra.bgRadius ?? 6}px`;
    }

    if (extra.outline !== false) {
      const thickness = Math.max(2, Math.round((extra.outlineThickness || 3) * 0.8));
      const color = extra.outlineColor || '#000000';
      style.textShadow = `
        -${thickness}px -${thickness}px 0 ${color},
         ${thickness}px -${thickness}px 0 ${color},
        -${thickness}px  ${thickness}px 0 ${color},
         ${thickness}px  ${thickness}px 0 ${color},
         0px  ${thickness}px 0 ${color},
         0px -${thickness}px 0 ${color},
         ${thickness}px 0px 0 ${color},
        -${thickness}px 0px 0 ${color}
      `;
    }

    return style;
  };

  // Memoized logo overlay style
  const logoOverlayStyle = useMemo(() => {
    const logoSrc = logoSettings?.dataUrl || logoSettings?.url;
    if (!logoSettings || !logoSrc) return {};

    const previewLogoWidth = previewMode === 'vertical'
      ? Math.max(20, Math.round((logoSettings.size || 60) * (236 / 540)))
      : Math.max(24, Math.round((logoSettings.size || 60) * (380 / 540)));

    const style = {
      position: 'absolute',
      width: `${previewLogoWidth}px`,
      opacity: (logoSettings.opacity || 80) / 100,
      zIndex: 45,
      cursor: 'move',
      userSelect: 'none',
      touchAction: 'none',
      willChange: 'transform'
    };

    if (typeof logoSettings.customX === 'number' && typeof logoSettings.customY === 'number') {
      style.left = `${logoSettings.customX}%`;
      style.top = `${logoSettings.customY}%`;
      style.transform = 'translate(-50%, -50%)';
    } else {
      const pos = logoSettings.position || 'top-right';
      if (pos.includes('top')) style.top = '4%';
      if (pos.includes('bottom')) style.bottom = '4%';
      if (pos.includes('left')) style.left = '4%';
      if (pos.includes('right')) style.right = '4%';
      if (pos === 'center') {
        style.top = '50%';
        style.left = '50%';
        style.transform = 'translate(-50%, -50%)';
      }
    }

    return style;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoSettings, previewMode]);
  const getLogoOverlayStyle = () => logoOverlayStyle;


  const getCropBoxDimensions = () => {
    if (cropSettings?.mode === 'custom') {
      return {
        width: `${cropSettings.customWidth ?? 60}%`,
        height: `${cropSettings.customHeight ?? 85}%`
      };
    }
    const srcW = videoData?.width || 1920;
    const srcH = videoData?.height || 1080;
    const videoAspect = (srcW && srcH) ? srcW / srcH : 16 / 9;

    let targetAspect = 16 / 9;
    if (cropSettings?.mode === '9:16') targetAspect = 9 / 16;
    else if (cropSettings?.mode === '1:1') targetAspect = 1;
    else if (cropSettings?.mode === '4:5') targetAspect = 4 / 5;
    else if (cropSettings?.mode === '21:9') targetAspect = 2560 / 1080;
    else if (cropSettings?.mode === '16:9') targetAspect = 16 / 9;

    if (targetAspect <= videoAspect) {
      const hPct = 92;
      const wPct = Math.round(hPct * (targetAspect / videoAspect) * 10) / 10;
      return { width: `${wPct}%`, height: `${hPct}%` };
    } else {
      const wPct = 94;
      const hPct = Math.round(wPct * (videoAspect / targetAspect) * 10) / 10;
      return { width: `${wPct}%`, height: `${hPct}%` };
    }
  };

  const cropDims = getCropBoxDimensions();
  const extraTextsList = textSettings?.extraTexts || [];

  return (
    <div
      ref={containerRef}
      className="relative bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex flex-col justify-between group min-h-[300px] sm:min-h-[440px]"
    >
      {/* Top Bar with Mode Switch */}
      <div className="bg-slate-900/90 border-b border-slate-800 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2 z-20 backdrop-blur">
        <div className="flex items-center space-x-1.5 sm:space-x-2 min-w-0">
          <span className="text-xs font-semibold text-white flex items-center space-x-1.5 truncate">
            <span>Video Preview</span>
            {isVerticalCrop && (
              <span className={`text-[9px] sm:text-[10px] border px-1.5 sm:px-2 py-0.5 rounded font-mono shrink-0 ${
                !isFillMode
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-orange-500/10 text-orange-400 border-orange-500/30'
              }`}>
                9:16 {!isFillMode ? 'Fit' : 'Zoom'}
              </span>
            )}
            {isCustomCrop && (
              <span className="text-[9px] sm:text-[10px] border px-1.5 sm:px-2 py-0.5 rounded font-mono bg-amber-500/10 text-amber-300 border-amber-500/30 shrink-0">
                Crop ({cropSettings.customWidth ?? 60}%×{cropSettings.customHeight ?? 85}%)
              </span>
            )}
            {cropSettings?.mode === '16:9' && (
              <span className="text-[9px] sm:text-[10px] border px-1.5 sm:px-2 py-0.5 rounded font-mono bg-red-500/10 text-red-300 border-red-500/30 shrink-0">
                16:9
              </span>
            )}
            {cropSettings?.mode === '1:1' && (
              <span className="text-[9px] sm:text-[10px] border px-1.5 sm:px-2 py-0.5 rounded font-mono bg-pink-500/10 text-pink-300 border-pink-500/30 shrink-0">
                1:1
              </span>
            )}
            {cropSettings?.mode === '4:5' && (
              <span className="text-[9px] sm:text-[10px] border px-1.5 sm:px-2 py-0.5 rounded font-mono bg-purple-500/10 text-purple-300 border-purple-500/30 shrink-0">
                4:5
              </span>
            )}
            {cropSettings?.mode === '21:9' && (
              <span className="text-[9px] sm:text-[10px] border px-1.5 sm:px-2 py-0.5 rounded font-mono bg-amber-500/10 text-amber-300 border-amber-500/30 shrink-0">
                21:9
              </span>
            )}
          </span>
        </div>

        {/* View Switch Buttons */}
        {cropSettings?.mode !== 'original' && (
          <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 shrink-0">
            <button
              onClick={() => setPreviewMode('vertical')}
              className={`px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center space-x-1 touch-manipulation ${
                previewMode === 'vertical' || previewMode === 'canvas'
                  ? 'bg-orange-500 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Full Output Screen Canvas Preview"
            >
              <Smartphone className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span>Canvas ({cropSettings?.mode || '9:16'})</span>
            </button>

            <button
              onClick={() => setPreviewMode('framing')}
              className={`px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center space-x-1 touch-manipulation ${
                previewMode === 'framing' || isCustomCrop
                  ? 'bg-orange-500 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Interactive manual crop box and framing handles"
            >
              <LayoutGrid className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span>Framing</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Viewport */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-slate-950 p-2 sm:p-4 min-h-[260px] sm:min-h-[380px]">
        {/* Skipped Cut Notice Badge */}
        {skippedNotice && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-rose-600/90 border border-rose-400 text-white font-semibold text-xs px-3.5 py-1.5 rounded-full shadow-2xl backdrop-blur-md flex items-center space-x-1.5 pointer-events-none animate-bounce">
            <Scissors className="w-3.5 h-3.5 text-white" />
            <span>Skipped Cut Section</span>
          </div>
        )}

        {videoData?.url ? (
          (previewMode === 'vertical' || previewMode === 'canvas') && cropSettings?.mode !== 'original' && !isCustomCrop ? (
            /* ── OUTPUT CANVAS VIEWPORT (Dynamically matches active platform aspect ratio) ── */
            <div
              ref={phoneViewportRef}
              className="relative rounded-sm overflow-hidden bg-black flex items-center justify-center select-none"
              style={{
                aspectRatio: cropSettings?.mode === '1:1'
                  ? '1 / 1'
                  : cropSettings?.mode === '4:5'
                  ? '4 / 5'
                  : cropSettings?.mode === '16:9'
                  ? '16 / 9'
                  : cropSettings?.mode === '21:9'
                  ? '2560 / 1080'
                  : '9 / 16',
                height: 'min(540px, 68vh)',
                maxHeight: '70vh'
              }}
            >
              {/* ── BACKGROUND LAYER (Clean Blur / Picture / Solid Backdrop) ── */}
              {!isFillMode && (
                <div className="absolute inset-0 pointer-events-none z-0">
                  {bgType === 'blur-video' ? (
                    <canvas
                      ref={bgCanvasRef}
                      width={360}
                      height={640}
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                      style={{
                        filter: `blur(${bgBlur}px) brightness(${bgOpacity})`,
                        transform: 'scale(1.10)',
                        transformOrigin: 'center'
                      }}
                    />
                  ) : bgType === 'image' && bgSettings?.imageUrl ? (
                    <img
                      src={bgSettings.imageUrl}
                      alt="Background Backdrop"
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{
                        filter: `blur(${bgBlur}px) brightness(${bgOpacity})`,
                        transform: 'scale(1.10)',
                        transformOrigin: 'center'
                      }}
                    />
                  ) : (
                    <div
                      className="absolute inset-0"
                      style={{ backgroundColor: bgSettings?.color || '#000000' }}
                    />
                  )}
                </div>
              )}

              {/* ── MAIN FOREGROUND VIDEO LAYER ── */}
              <div className="relative w-full h-full flex items-center justify-center z-10 pointer-events-none">
                {isFillMode ? (
                  <video
                    ref={videoRef}
                    src={videoData.url}
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    preload="metadata"
                    style={{
                      ...getFilterStyle(),
                      objectFit: 'cover',
                      transform: `translate(${(cropSettings?.x || 0) * 0.5}px, ${(cropSettings?.y || 0) * 0.5}px) scale(${cropSettings?.zoom || 1})`,
                      transformOrigin: 'center center'
                    }}
                    onTimeUpdate={handleTimeUpdateInternal}
                    onEnded={() => setIsPlaying(false)}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    playsInline
                  />
                ) : (
                  <video
                    ref={videoRef}
                    src={videoData.url}
                    className="w-full h-full pointer-events-none"
                    preload="metadata"
                    style={{
                      ...getFilterStyle(),
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      objectPosition: 'center',
                      display: 'block'
                    }}
                    onTimeUpdate={handleTimeUpdateInternal}
                    onEnded={() => setIsPlaying(false)}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    playsInline
                  />
                )}
              </div>

              {/* ── TOP REEL IMAGE (Above Video Letterbox Space) ── */}
              {!isFillMode && hasTopReel && slotMetrics.hasSlots && (
                <div
                  className="absolute top-0 inset-x-0 overflow-hidden flex items-center justify-center pointer-events-none z-15"
                  style={{
                    height: `${slotMetrics.slotHeightPct}%`,
                    backgroundColor: topReel.bgColor || 'transparent'
                  }}
                >
                  <img
                    src={topReel.url}
                    alt="Top Reel Header"
                    className="w-full h-full"
                    style={{
                      objectFit: topReel.fit || 'contain',
                      opacity: (topReel.opacity ?? 100) / 100
                    }}
                  />
                </div>
              )}

              {/* ── BOTTOM REEL IMAGE (Below Video Letterbox Space) ── */}
              {!isFillMode && hasBottomReel && slotMetrics.hasSlots && (
                <div
                  className="absolute bottom-0 inset-x-0 overflow-hidden flex items-center justify-center pointer-events-none z-15"
                  style={{
                    height: `${slotMetrics.slotHeightPct}%`,
                    backgroundColor: bottomReel.bgColor || 'transparent'
                  }}
                >
                  <img
                    src={bottomReel.url}
                    alt="Bottom Reel Footer"
                    className="w-full h-full"
                    style={{
                      objectFit: bottomReel.fit || 'contain',
                      opacity: (bottomReel.opacity ?? 100) / 100
                    }}
                  />
                </div>
              )}

              {/* ── PRIMARY DRAGGABLE TEXT OVERLAY ── */}
              {textSettings?.enabled && (
                <div
                  style={getTextOverlayStyle()}
                  onMouseDown={handleTextMouseDown}
                  onTouchStart={handleTextTouchStart}
                  className={`group/text transition-shadow touch-manipulation ${
                    isDraggingText
                      ? 'ring-2 ring-orange-500 ring-offset-2 ring-offset-black/50 shadow-2xl'
                      : 'hover:ring-1 hover:ring-amber-400/60'
                  }`}
                  title="Click and drag anywhere on screen to reposition title"
                >
                  <div className="flex items-center space-x-1">
                    <span>{getRenderedText()}</span>
                  </div>
                </div>
              )}

              {/* ── EXTRA DRAGGABLE CUSTOM TEXT OVERLAYS ── */}
              {extraTextsList.map((extra) => {
                if (!extra.enabled || !extra.text) return null;
                const isThisDragging = draggingExtraId === extra.id;

                return (
                  <div
                    key={extra.id}
                    style={getExtraTextStyle(extra)}
                    onMouseDown={(e) => handleExtraTextMouseDown(e, extra)}
                    onTouchStart={(e) => handleExtraTextTouchStart(e, extra)}
                    className={`group/extra transition-shadow touch-manipulation ${
                      isThisDragging
                        ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-black/50 shadow-2xl'
                        : 'hover:ring-1 hover:ring-emerald-400/60'
                    }`}
                    title="Click and drag anywhere on screen to reposition text"
                  >
                    <span>{extra.text}</span>
                  </div>
                );
              })}

              {/* ── DRAGGABLE LOGO OVERLAY ── */}
              {logoSettings?.enabled && (logoSettings?.dataUrl || logoSettings?.url) && (
                <div
                  style={getLogoOverlayStyle()}
                  onMouseDown={handleLogoMouseDown}
                  onTouchStart={handleLogoTouchStart}
                  className={`group/logo transition-shadow touch-manipulation ${
                    isDraggingLogo
                      ? 'ring-2 ring-orange-500 ring-offset-2 ring-offset-black/50 shadow-2xl'
                      : 'hover:ring-1 hover:ring-amber-400/60'
                  }`}
                  title="Click and drag anywhere on screen to reposition logo"
                >
                  <img
                    src={logoSettings.dataUrl || logoSettings.url}
                    alt=""
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      if (e.currentTarget.parentElement) {
                        e.currentTarget.parentElement.style.display = 'none';
                      }
                    }}
                    className="w-full h-auto object-contain pointer-events-none"
                  />
                </div>
              )}


              {/* Phone Status bar */}
              <div className="absolute top-2 inset-x-0 flex justify-between px-3 sm:px-4 text-[9px] font-mono text-white/50 pointer-events-none z-30 drop-shadow">
                <span>
                  {cropSettings?.mode === '1:1'
                    ? '1:1 SQUARE FEED'
                    : cropSettings?.mode === '4:5'
                    ? '4:5 PORTRAIT FEED'
                    : cropSettings?.mode === '16:9'
                    ? '16:9 WIDESCREEN'
                    : cropSettings?.mode === '21:9'
                    ? '21:9 ULTRAWIDE'
                    : '9:16 SHORTS / REELS'}
                </span>
                <span className={!isFillMode ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                  {!isFillMode ? (bgType === 'blur-video' ? 'BLURRED BACKDROP' : bgType === 'image' ? 'CUSTOM BACKDROP' : 'FIT') : 'ZOOM FILL'}
                </span>
              </div>
            </div>
          ) : (
            /* ── WIDE FRAMING / MANUAL CROP VIEWPORT ── */
            <div ref={framingViewportRef} className="relative w-full h-full flex items-center justify-center select-none">
              <video
                ref={videoRef}
                src={videoData.url}
                className="max-h-[300px] sm:max-h-[420px] w-auto max-w-full object-contain mx-auto transition-all"
                preload="metadata"
                style={getFilterStyle()}
                onTimeUpdate={handleTimeUpdateInternal}
                onEnded={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                playsInline
              />

              {/* ── INTERACTIVE CROP FRAME (Professional solid bracket-style, NO dashed lines) ── */}
              {showCropGuide && cropSettings?.mode !== 'original' && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div
                    className="relative pointer-events-auto select-none touch-manipulation"
                    style={{
                      width: cropDims.width,
                      height: cropDims.height,
                      transform: `translate(${(cropSettings?.x || 0) * 0.35}px, ${(cropSettings?.y || 0) * 0.35}px) scale(${cropSettings?.zoom || 1})`,
                      /* Dark overlay outside crop area */
                      boxShadow: isDraggingCrop
                        ? '0 0 0 9999px rgba(0,0,0,0.60)'
                        : '0 0 0 9999px rgba(0,0,0,0.50)',
                      /* Clean solid 1px outline — NO dashes */
                      outline: isDraggingCrop
                        ? '1.5px solid rgba(251,146,60,0.95)'
                        : '1.5px solid rgba(255,255,255,0.70)',
                      outlineOffset: '0px'
                    }}
                    onMouseDown={(e) => startCropDrag(e, 'center')}
                    onTouchStart={(e) => startCropDrag(e, 'center')}
                  >
                    {/* ── L-shaped corner brackets (top-left) ── */}
                    <div className="absolute top-0 left-0 w-5 h-0.5 pointer-events-none"
                      style={{ background: isDraggingCrop ? '#fb923c' : '#ffffff', boxShadow: '0 0 3px rgba(0,0,0,0.8)' }} />
                    <div className="absolute top-0 left-0 w-0.5 h-5 pointer-events-none"
                      style={{ background: isDraggingCrop ? '#fb923c' : '#ffffff', boxShadow: '0 0 3px rgba(0,0,0,0.8)' }} />

                    {/* ── L-shaped corner brackets (top-right) ── */}
                    <div className="absolute top-0 right-0 w-5 h-0.5 pointer-events-none"
                      style={{ background: isDraggingCrop ? '#fb923c' : '#ffffff', boxShadow: '0 0 3px rgba(0,0,0,0.8)' }} />
                    <div className="absolute top-0 right-0 w-0.5 h-5 pointer-events-none"
                      style={{ background: isDraggingCrop ? '#fb923c' : '#ffffff', boxShadow: '0 0 3px rgba(0,0,0,0.8)' }} />

                    {/* ── L-shaped corner brackets (bottom-left) ── */}
                    <div className="absolute bottom-0 left-0 w-5 h-0.5 pointer-events-none"
                      style={{ background: isDraggingCrop ? '#fb923c' : '#ffffff', boxShadow: '0 0 3px rgba(0,0,0,0.8)' }} />
                    <div className="absolute bottom-0 left-0 w-0.5 h-5 pointer-events-none"
                      style={{ background: isDraggingCrop ? '#fb923c' : '#ffffff', boxShadow: '0 0 3px rgba(0,0,0,0.8)' }} />

                    {/* ── L-shaped corner brackets (bottom-right) ── */}
                    <div className="absolute bottom-0 right-0 w-5 h-0.5 pointer-events-none"
                      style={{ background: isDraggingCrop ? '#fb923c' : '#ffffff', boxShadow: '0 0 3px rgba(0,0,0,0.8)' }} />
                    <div className="absolute bottom-0 right-0 w-0.5 h-5 pointer-events-none"
                      style={{ background: isDraggingCrop ? '#fb923c' : '#ffffff', boxShadow: '0 0 3px rgba(0,0,0,0.8)' }} />

                    {/* ── Invisible hit-zone resize handles (full corners & edges) ── */}
                    {/* Top-left corner resize */}
                    <div className="absolute -top-3 -left-3 w-8 h-8 cursor-nwse-resize z-30 touch-manipulation"
                      onMouseDown={(e) => startCropDrag(e, 'tl')}
                      onTouchStart={(e) => startCropDrag(e, 'tl')}
                      title="Drag to resize top-left"
                    />
                    {/* Top-right corner resize */}
                    <div className="absolute -top-3 -right-3 w-8 h-8 cursor-nesw-resize z-30 touch-manipulation"
                      onMouseDown={(e) => startCropDrag(e, 'tr')}
                      onTouchStart={(e) => startCropDrag(e, 'tr')}
                      title="Drag to resize top-right"
                    />
                    {/* Bottom-left corner resize */}
                    <div className="absolute -bottom-3 -left-3 w-8 h-8 cursor-nesw-resize z-30 touch-manipulation"
                      onMouseDown={(e) => startCropDrag(e, 'bl')}
                      onTouchStart={(e) => startCropDrag(e, 'bl')}
                      title="Drag to resize bottom-left"
                    />
                    {/* Bottom-right corner resize */}
                    <div className="absolute -bottom-3 -right-3 w-8 h-8 cursor-nwse-resize z-30 touch-manipulation"
                      onMouseDown={(e) => startCropDrag(e, 'br')}
                      onTouchStart={(e) => startCropDrag(e, 'br')}
                      title="Drag to resize bottom-right"
                    />

                    {/* Edge resize handles */}
                    <div className="absolute top-0 inset-x-8 h-3 -translate-y-1.5 bg-transparent cursor-ns-resize z-20 touch-manipulation"
                      onMouseDown={(e) => startCropDrag(e, 't')}
                      onTouchStart={(e) => startCropDrag(e, 't')}
                      title="Resize height"
                    />
                    <div className="absolute bottom-0 inset-x-8 h-3 translate-y-1.5 bg-transparent cursor-ns-resize z-20 touch-manipulation"
                      onMouseDown={(e) => startCropDrag(e, 'b')}
                      onTouchStart={(e) => startCropDrag(e, 'b')}
                      title="Resize height"
                    />
                    <div className="absolute left-0 inset-y-8 w-3 -translate-x-1.5 bg-transparent cursor-ew-resize z-20 touch-manipulation"
                      onMouseDown={(e) => startCropDrag(e, 'l')}
                      onTouchStart={(e) => startCropDrag(e, 'l')}
                      title="Resize width"
                    />
                    <div className="absolute right-0 inset-y-8 w-3 translate-x-1.5 bg-transparent cursor-ew-resize z-20 touch-manipulation"
                      onMouseDown={(e) => startCropDrag(e, 'r')}
                      onTouchStart={(e) => startCropDrag(e, 'r')}
                      title="Resize width"
                    />

                    {/* Center move label */}
                    <div className="absolute inset-0 flex items-center justify-center cursor-move pointer-events-none">
                      <div className="flex items-center space-x-1 text-[9px] sm:text-[10px] font-bold text-white/90 bg-black/70 px-2 sm:px-2.5 py-1 rounded-full backdrop-blur-sm shadow-lg">
                        <Move className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                        <span className="truncate max-w-[150px] sm:max-w-none">
                          {cropSettings?.mode === 'custom'
                            ? `${cropSettings.customWidth ?? 60}% × ${cropSettings.customHeight ?? 85}%`
                            : `${cropSettings?.mode} · Drag to Move`}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Primary Text in Framing view */}
              {textSettings?.enabled && (
                <div
                  style={getTextOverlayStyle()}
                  onMouseDown={handleTextMouseDown}
                  onTouchStart={handleTextTouchStart}
                  className="hover:ring-1 hover:ring-amber-400/60 rounded touch-manipulation"
                >
                  {getRenderedText()}
                </div>
              )}

              {/* Extra Texts in Framing view */}
              {extraTextsList.map((extra) => {
                if (!extra.enabled || !extra.text) return null;
                return (
                  <div
                    key={extra.id}
                    style={getExtraTextStyle(extra)}
                    onMouseDown={(e) => handleExtraTextMouseDown(e, extra)}
                    onTouchStart={(e) => handleExtraTextTouchStart(e, extra)}
                    className="hover:ring-1 hover:ring-emerald-400/60 rounded touch-manipulation"
                  >
                    {extra.text}
                  </div>
                );
              })}

              {/* Logo in Framing view */}
              {logoSettings?.enabled && (logoSettings?.dataUrl || logoSettings?.url) && (
                <div
                  style={getLogoOverlayStyle()}
                  onMouseDown={handleLogoMouseDown}
                  onTouchStart={handleLogoTouchStart}
                  className="hover:ring-1 hover:ring-emerald-400/60 rounded touch-manipulation"
                >
                  <img
                    src={logoSettings.dataUrl || logoSettings.url}
                    alt=""
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      if (e.currentTarget.parentElement) {
                        e.currentTarget.parentElement.style.display = 'none';
                      }
                    }}
                    className="w-full h-auto object-contain pointer-events-none"
                  />
                </div>
              )}

            </div>
          )
        ) : (
          /* ── DIRECT STUDIO PREVIEW VIEWPORT (Directly visible on load, like Photo Studio) ── */
          <div
            ref={phoneViewportRef}
            className="relative rounded-2xl overflow-hidden shadow-2xl border-2 border-slate-700 bg-slate-900 flex flex-col items-center justify-between select-none p-4"
            style={{
              aspectRatio: '9 / 16',
              height: '360px',
              maxHeight: '44vh'
            }}
          >
            {/* Background Layer Live Preview */}
            <div
              className="absolute inset-0 pointer-events-none z-0"
              style={{
                backgroundColor: bgSettings?.color || '#0b0f19',
                backgroundImage: bgSettings?.imageUrl ? `url(${bgSettings.imageUrl})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: `blur(${bgSettings?.blur || 0}px) brightness(${(bgSettings?.opacity ?? 65) / 100})`
              }}
            />

            {/* Top Text / Title Overlay Live Preview */}
            <div className="relative z-10 w-full text-center">
              {textSettings?.enabled && (
                <div
                  style={getTextOverlayStyle()}
                  onMouseDown={handleTextMouseDown}
                  onTouchStart={handleTextTouchStart}
                  className={`group/text rounded px-2 py-1 max-w-full cursor-move transition-shadow touch-manipulation select-none ${
                    isDraggingText
                      ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-black/50 shadow-2xl scale-105'
                      : 'hover:ring-1 hover:ring-amber-400/60'
                  }`}
                  title="Click and drag anywhere on screen to reposition title"
                >
                  {getRenderedText()}
                </div>
              )}
            </div>

            {/* Extra Text Overlays in Studio Viewport */}
            {extraTextsList.map((extra) => {
              if (!extra.enabled || !extra.text) return null;
              const isThisDragging = draggingExtraId === extra.id;
              return (
                <div
                  key={extra.id}
                  style={getExtraTextStyle(extra)}
                  onMouseDown={(e) => handleExtraTextMouseDown(e, extra)}
                  onTouchStart={(e) => handleExtraTextTouchStart(e, extra)}
                  className={`group/extra transition-shadow touch-manipulation select-none ${
                    isThisDragging
                      ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-black/50 shadow-2xl scale-105'
                      : 'hover:ring-1 hover:ring-emerald-400/60'
                  }`}
                  title="Click and drag anywhere on screen to reposition text"
                >
                  <span>{extra.text}</span>
                </div>
              );
            })}

            {/* Center Studio Mockup / Dropzone Callout */}
            <div className="relative z-10 flex flex-col items-center justify-center text-center p-3.5 bg-slate-950/75 backdrop-blur-md rounded-2xl border border-slate-700/70 shadow-2xl max-w-[210px] sm:max-w-[240px]">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 border border-orange-500/30 text-orange-400 flex items-center justify-center mb-2 shadow-inner">
                <UploadCloud className="w-5 h-5 animate-pulse" />
              </div>
              <p className="text-xs font-bold text-white mb-0.5">Video Studio Canvas</p>
              <p className="text-[10px] text-slate-300 mb-2 leading-tight">
                Preview active styling &amp; templates
              </p>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 font-mono font-semibold border border-orange-500/30">
                  9:16 Vertical
                </span>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700">
                  Ready
                </span>
              </div>
            </div>

            {/* Bottom / Watermark Logo Overlay Live Preview */}
            <div className="relative z-10 w-full flex items-center justify-between">
              {logoSettings?.enabled && (logoSettings?.dataUrl || logoSettings?.url) ? (
                <div style={getLogoOverlayStyle()}>
                  <img
                    src={logoSettings.dataUrl || logoSettings.url}
                    alt=""
                    className="w-10 h-auto object-contain pointer-events-none"
                  />
                </div>
              ) : (
                <div />
              )}
              <span className="text-[9px] font-mono text-slate-400 bg-slate-950/80 px-2 py-0.5 rounded-full border border-slate-800 shadow-sm">
                Studio Mode
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Control Bar */}
      {videoData && (
        <div className="bg-slate-900/95 border-t border-slate-800 px-2.5 sm:px-4 py-2.5 sm:py-3 z-10 backdrop-blur">
          {/* Timeline Scrubber */}
          <div className="flex items-center space-x-2 sm:space-x-3 mb-2">
            <span className="text-[11px] sm:text-xs font-mono text-slate-300 min-w-[34px] sm:min-w-[44px]">
              {formatTime(currentTime)}
            </span>
            <div className="relative flex-1 flex items-center">
              <input
                type="range"
                min="0"
                max={videoData.duration || 100}
                step="0.05"
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-3 sm:h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500 focus:outline-none touch-manipulation"
              />
            </div>
            <span className="text-[11px] sm:text-xs font-mono text-slate-400 min-w-[34px] sm:min-w-[44px] text-right">
              {formatTime(videoData.duration)}
            </span>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-between gap-1 sm:gap-2">
            <div className="flex items-center space-x-1 sm:space-x-2">
              <button
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="w-11 h-11 sm:w-9 sm:h-9 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white flex items-center justify-center transition-all shadow-md shadow-orange-500/20 cursor-pointer shrink-0 touch-manipulation"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-4 h-4 sm:w-4 sm:h-4" /> : <Play className="w-4 h-4 sm:w-4 sm:h-4 fill-white translate-x-0.5" />}
              </button>

              <button
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.currentTime = 0;
                    onTimeUpdate(0);
                  }
                }}
                aria-label="Restart video"
                className="w-11 h-11 sm:w-auto sm:p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl flex items-center justify-center transition-colors cursor-pointer touch-manipulation shrink-0"
                title="Restart"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <div className="flex items-center space-x-1 sm:space-x-2 pl-1 sm:pl-2 border-l border-slate-800">
                <button
                  onClick={toggleMute}
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                  className="w-11 h-11 sm:w-auto sm:p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl flex items-center justify-center transition-colors cursor-pointer touch-manipulation shrink-0"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="hidden xs:block w-14 sm:w-20 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500 focus:outline-none touch-manipulation"
                />
              </div>
            </div>

            <div className="flex items-center space-x-1.5 sm:space-x-2">
              {/* Quick Split at Playhead on Player */}
              {onSplitAtPlayhead && (
                <button
                  onClick={onSplitAtPlayhead}
                  className="min-h-[44px] px-3 sm:min-h-[32px] sm:px-2.5 sm:py-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 rounded-xl sm:rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer touch-manipulation active:scale-95"
                  title="Split video at current time"
                >
                  <Scissors className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden xs:inline">Split</span>
                </button>
              )}

              {/* Quick Cut/Keep Toggle on Player */}
              {onToggleCutAtPlayhead && (
                <button
                  onClick={onToggleCutAtPlayhead}
                  className="min-h-[44px] px-3 sm:min-h-[32px] sm:px-2.5 sm:py-1 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 rounded-xl sm:rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer touch-manipulation active:scale-95"
                  title="Toggle Cut/Keep under playhead"
                >
                  <span className="hidden xs:inline">Cut/Keep</span>
                  <span className="xs:hidden">Cut</span>
                </button>
              )}

              {/* Quick Capture Frame for Photo & Thumbnails */}
              {onCaptureFrame && (
                <button
                  onClick={handleSnapFrame}
                  className="min-h-[44px] px-3 sm:min-h-[32px] sm:px-2.5 sm:py-1 bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/30 text-orange-300 rounded-xl sm:rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer touch-manipulation active:scale-95"
                  title="Capture frame to Photo & Thumbnail Studio"
                >
                  <Camera className="w-3.5 h-3.5 text-orange-400" />
                  <span className="hidden sm:inline">Snap Frame</span>
                </button>
              )}

              <button
                onClick={toggleFullscreen}
                aria-label="Toggle fullscreen"
                className="w-11 h-11 sm:w-auto sm:p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl flex items-center justify-center transition-colors cursor-pointer touch-manipulation shrink-0"
                title="Fullscreen"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// React.memo: prevents re-render when parent App state (crop drag, text drag, time ticks)
// changes something unrelated to VideoPreview's own visual output.
export default React.memo(VideoPreviewInner, (prev, next) => {
  // Re-render only if these props actually change
  return (
    prev.videoData === next.videoData &&
    prev.currentTime === next.currentTime &&
    prev.cropSettings === next.cropSettings &&
    prev.bgSettings === next.bgSettings &&
    prev.textSettings === next.textSettings &&
    prev.logoSettings === next.logoSettings &&
    prev.effectsSettings === next.effectsSettings &&
    prev.audioSettings === next.audioSettings &&
    prev.customParts === next.customParts &&
    prev.skipDeletedCuts === next.skipDeletedCuts &&
    prev.isSuspended === next.isSuspended &&
    prev.onSplitAtPlayhead === next.onSplitAtPlayhead &&
    prev.onToggleCutAtPlayhead === next.onToggleCutAtPlayhead &&
    prev.onCaptureFrame === next.onCaptureFrame
  );
});

function FilmIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
    </svg>
  );
}
