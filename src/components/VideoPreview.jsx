import React, { useRef, useEffect, useState, useCallback } from 'react';
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
  GripVertical
} from 'lucide-react';
import { formatTime } from '../utils/time';

export default function VideoPreview({
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
  audioSettings
}) {
  const videoRef = useRef(null);
  const bgCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const phoneViewportRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [previewMode, setPreviewMode] = useState('vertical');
  const [showCropGuide, setShowCropGuide] = useState(true);

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

  const isVerticalCrop = cropSettings?.mode === '9:16';
  const isCustomCrop = cropSettings?.mode === 'custom';
  const isFillMode = cropSettings?.fillMode === 'fill';

  const bgType = bgSettings?.type || 'blur-video';
  const bgBlur = bgSettings?.blur ?? 20;
  const bgOpacity = (bgSettings?.opacity ?? 65) / 100;

  // Lightweight Background Canvas Blit for 100% Zero-Lag Single-Decoder Playback
  useEffect(() => {
    let animId;
    const updateBgCanvas = () => {
      if (
        bgCanvasRef.current &&
        videoRef.current &&
        videoRef.current.videoWidth > 0 &&
        !isFillMode &&
        bgType === 'blur-video'
      ) {
        const bgCtx = bgCanvasRef.current.getContext('2d', { alpha: false });
        if (bgCtx) {
          bgCtx.drawImage(videoRef.current, 0, 0, bgCanvasRef.current.width, bgCanvasRef.current.height);
        }
      }
      animId = requestAnimationFrame(updateBgCanvas);
    };

    animId = requestAnimationFrame(updateBgCanvas);
    return () => cancelAnimationFrame(animId);
  }, [isFillMode, bgType]);

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
    if (videoRef.current) {
      onTimeUpdate(videoRef.current.currentTime);
    }
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
    if (!onTextChange || !textSettings?.enabled) return;
    e.preventDefault();
    e.stopPropagation();

    const parentRect = (phoneViewportRef.current || containerRef.current)?.getBoundingClientRect();
    if (!parentRect) return;

    setIsDraggingText(true);
    dragTextRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      parentWidth: parentRect.width,
      parentHeight: parentRect.height,
      currentYPct: textSettings.customY ?? 10,
      currentXPct: textSettings.customX ?? 50
    };
  };

  const handleTextTouchStart = (e) => {
    if (!onTextChange || !textSettings?.enabled) return;
    const touch = e.touches[0];
    const parentRect = (phoneViewportRef.current || containerRef.current)?.getBoundingClientRect();
    if (!parentRect) return;

    setIsDraggingText(true);
    dragTextRef.current = {
      active: true,
      startX: touch.clientX,
      startY: touch.clientY,
      parentWidth: parentRect.width,
      parentHeight: parentRect.height,
      currentYPct: textSettings.customY ?? 10,
      currentXPct: textSettings.customX ?? 50
    };
  };

  // ── Drag-to-Reposition Extra Text Overlays ──────────────────────────────────
  const handleExtraTextMouseDown = (e, item) => {
    if (!onTextChange || !item.enabled) return;
    e.preventDefault();
    e.stopPropagation();

    const parentRect = (phoneViewportRef.current || containerRef.current)?.getBoundingClientRect();
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
    if (!onTextChange || !item.enabled) return;
    const touch = e.touches[0];
    const parentRect = (phoneViewportRef.current || containerRef.current)?.getBoundingClientRect();
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
    if (!onLogoChange || !logoSettings?.enabled) return;
    e.preventDefault();
    e.stopPropagation();

    const parentRect = (phoneViewportRef.current || containerRef.current)?.getBoundingClientRect();
    if (!parentRect) return;

    setIsDraggingLogo(true);
    dragLogoRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      parentWidth: parentRect.width,
      parentHeight: parentRect.height,
      currentYPct: logoSettings.customY ?? 6,
      currentXPct: logoSettings.customX ?? 94
    };
  };

  const handleLogoTouchStart = (e) => {
    if (!onLogoChange || !logoSettings?.enabled) return;
    const touch = e.touches[0];
    const parentRect = (phoneViewportRef.current || containerRef.current)?.getBoundingClientRect();
    if (!parentRect) return;

    setIsDraggingLogo(true);
    dragLogoRef.current = {
      active: true,
      startX: touch.clientX,
      startY: touch.clientY,
      parentWidth: parentRect.width,
      parentHeight: parentRect.height,
      currentYPct: logoSettings.customY ?? 6,
      currentXPct: logoSettings.customX ?? 94
    };
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      // 1. Crop box drag / resize
      if (dragCropRef.current.active && onCropChange) {
        const dx = e.clientX - dragCropRef.current.startX;
        const dy = e.clientY - dragCropRef.current.startY;
        const h = dragCropRef.current.handle;

        if (h === 'center') {
          const newX = Math.max(-200, Math.min(200, dragCropRef.current.startCropX + dx * 1.5));
          const newY = Math.max(-200, Math.min(200, dragCropRef.current.startCropY + dy * 1.5));
          onCropChange({ ...cropSettings, x: Math.round(newX), y: Math.round(newY) });
        } else {
          let deltaW = 0;
          let deltaH = 0;

          if (h.includes('r')) deltaW = (dx / 400) * 100;
          if (h.includes('l')) deltaW = (-dx / 400) * 100;
          if (h.includes('b')) deltaH = (dy / 300) * 100;
          if (h.includes('t')) deltaH = (-dy / 300) * 100;

          const newW = Math.max(15, Math.min(100, Math.round(dragCropRef.current.startWidth + deltaW)));
          const newH = Math.max(15, Math.min(100, Math.round(dragCropRef.current.startHeight + deltaH)));

          onCropChange({
            ...cropSettings,
            mode: 'custom',
            customWidth: newW,
            customHeight: newH
          });
        }
      }

      // 2. Primary text overlay drag
      if (dragTextRef.current.active && onTextChange) {
        const dy = e.clientY - dragTextRef.current.startY;
        const dx = e.clientX - dragTextRef.current.startX;

        const deltaYPct = (dy / dragTextRef.current.parentHeight) * 100;
        const deltaXPct = (dx / dragTextRef.current.parentWidth) * 100;

        const newYPct = Math.max(4, Math.min(96, dragTextRef.current.currentYPct + deltaYPct));
        const newXPct = Math.max(4, Math.min(96, dragTextRef.current.currentXPct + deltaXPct));

        onTextChange({
          ...textSettings,
          customY: Math.round(newYPct),
          customX: Math.round(newXPct),
          position: 'center'
        });
      }

      // 3. Extra text overlay drag
      if (dragExtraTextRef.current.active && onTextChange && textSettings?.extraTexts) {
        const dy = e.clientY - dragExtraTextRef.current.startY;
        const dx = e.clientX - dragExtraTextRef.current.startX;

        const deltaYPct = (dy / dragExtraTextRef.current.parentHeight) * 100;
        const deltaXPct = (dx / dragExtraTextRef.current.parentWidth) * 100;

        const newYPct = Math.max(4, Math.min(96, dragExtraTextRef.current.currentYPct + deltaYPct));
        const newXPct = Math.max(4, Math.min(96, dragExtraTextRef.current.currentXPct + deltaXPct));

        const updatedExtras = textSettings.extraTexts.map((item) => {
          if (item.id === dragExtraTextRef.current.extraId) {
            return {
              ...item,
              customY: Math.round(newYPct),
              customX: Math.round(newXPct)
            };
          }
          return item;
        });

        onTextChange({
          ...textSettings,
          extraTexts: updatedExtras
        });
      }

      // 4. Logo overlay drag
      if (dragLogoRef.current.active && onLogoChange) {
        const dy = e.clientY - dragLogoRef.current.startY;
        const dx = e.clientX - dragLogoRef.current.startX;

        const deltaYPct = (dy / dragLogoRef.current.parentHeight) * 100;
        const deltaXPct = (dx / dragLogoRef.current.parentWidth) * 100;

        const newYPct = Math.max(3, Math.min(97, dragLogoRef.current.currentYPct + deltaYPct));
        const newXPct = Math.max(3, Math.min(97, dragLogoRef.current.currentXPct + deltaXPct));

        onLogoChange({
          ...logoSettings,
          customY: Math.round(newYPct),
          customX: Math.round(newXPct)
        });
      }
    };

    const handleTouchMove = (e) => {
      const touch = e.touches[0];

      // 1. Crop box drag / resize on touch
      if (dragCropRef.current.active && onCropChange) {
        const dx = touch.clientX - dragCropRef.current.startX;
        const dy = touch.clientY - dragCropRef.current.startY;
        const h = dragCropRef.current.handle;

        if (h === 'center') {
          const newX = Math.max(-200, Math.min(200, dragCropRef.current.startCropX + dx * 1.5));
          const newY = Math.max(-200, Math.min(200, dragCropRef.current.startCropY + dy * 1.5));
          onCropChange({ ...cropSettings, x: Math.round(newX), y: Math.round(newY) });
        } else {
          let deltaW = 0;
          let deltaH = 0;

          if (h.includes('r')) deltaW = (dx / 300) * 100;
          if (h.includes('l')) deltaW = (-dx / 300) * 100;
          if (h.includes('b')) deltaH = (dy / 250) * 100;
          if (h.includes('t')) deltaH = (-dy / 250) * 100;

          const newW = Math.max(15, Math.min(100, Math.round(dragCropRef.current.startWidth + deltaW)));
          const newH = Math.max(15, Math.min(100, Math.round(dragCropRef.current.startHeight + deltaH)));

          onCropChange({
            ...cropSettings,
            mode: 'custom',
            customWidth: newW,
            customHeight: newH
          });
        }
      }

      if (dragTextRef.current.active && onTextChange) {
        const dy = touch.clientY - dragTextRef.current.startY;
        const dx = touch.clientX - dragTextRef.current.startX;

        const deltaYPct = (dy / dragTextRef.current.parentHeight) * 100;
        const deltaXPct = (dx / dragTextRef.current.parentWidth) * 100;

        const newYPct = Math.max(4, Math.min(96, dragTextRef.current.currentYPct + deltaYPct));
        const newXPct = Math.max(4, Math.min(96, dragTextRef.current.currentXPct + deltaXPct));

        onTextChange({
          ...textSettings,
          customY: Math.round(newYPct),
          customX: Math.round(newXPct),
          position: 'center'
        });
      }

      if (dragExtraTextRef.current.active && onTextChange && textSettings?.extraTexts) {
        const dy = touch.clientY - dragExtraTextRef.current.startY;
        const dx = touch.clientX - dragExtraTextRef.current.startX;

        const deltaYPct = (dy / dragExtraTextRef.current.parentHeight) * 100;
        const deltaXPct = (dx / dragExtraTextRef.current.parentWidth) * 100;

        const newYPct = Math.max(4, Math.min(96, dragExtraTextRef.current.currentYPct + deltaYPct));
        const newXPct = Math.max(4, Math.min(96, dragExtraTextRef.current.currentXPct + deltaXPct));

        const updatedExtras = textSettings.extraTexts.map((item) => {
          if (item.id === dragExtraTextRef.current.extraId) {
            return {
              ...item,
              customY: Math.round(newYPct),
              customX: Math.round(newXPct)
            };
          }
          return item;
        });

        onTextChange({
          ...textSettings,
          extraTexts: updatedExtras
        });
      }

      if (dragLogoRef.current.active && onLogoChange) {
        const dy = touch.clientY - dragLogoRef.current.startY;
        const dx = touch.clientX - dragLogoRef.current.startX;

        const deltaYPct = (dy / dragLogoRef.current.parentHeight) * 100;
        const deltaXPct = (dx / dragLogoRef.current.parentWidth) * 100;

        const newYPct = Math.max(3, Math.min(97, dragLogoRef.current.currentYPct + deltaYPct));
        const newXPct = Math.max(3, Math.min(97, dragLogoRef.current.currentXPct + deltaXPct));

        onLogoChange({
          ...logoSettings,
          customY: Math.round(newYPct),
          customX: Math.round(newXPct)
        });
      }
    };

    const handleEnd = () => {
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
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [onCropChange, cropSettings, onTextChange, textSettings, onLogoChange, logoSettings]);

  // Compute text string from template
  const getRenderedText = () => {
    if (!textSettings) return '';
    const formattedPart = textSettings.zeroPad
      ? String(textSettings.startPart || 1).padStart(2, '0')
      : String(textSettings.startPart || 1);
    return (textSettings.template || '{movie} - Part {part}')
      .replace(/{movie}/g, textSettings.movieName || 'My Movie')
      .replace(/{part}/g, formattedPart);
  };

  // Compute Primary Text overlay position style
  const getTextOverlayStyle = () => {
    if (!textSettings) return {};

    const pos = textSettings.position || 'top-center';
    const isTop = pos.startsWith('top');
    const isBottom = pos.startsWith('bottom');

    const previewFontSize = previewMode === 'vertical'
      ? Math.max(11, Math.round((textSettings.fontSize || 28) * (236 / 540)))
      : Math.round((textSettings.fontSize || 28) * 0.85);

    const style = {
      position: 'absolute',
      fontFamily: textSettings.font || 'Inter, sans-serif',
      fontSize: `${previewFontSize}px`,
      color: textSettings.color || '#ffffff',
      fontWeight: 'bold',
      whiteSpace: 'pre-line',
      lineHeight: 1.25,
      zIndex: 40,
      maxWidth: '86%',
      cursor: 'move',
      userSelect: 'none',
      touchAction: 'none'
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
      style.backgroundColor = textSettings.bgColor || 'rgba(0, 0, 0, 0.75)';
      style.padding = '4px 10px';
      style.borderRadius = '6px';
    }

    if (textSettings.outline) {
      const thickness = Math.max(1.5, Math.round((textSettings.outlineThickness || 3) * 0.7));
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
  };

  // Compute Extra Text overlay position style
  const getExtraTextStyle = (extra) => {
    const previewFontSize = previewMode === 'vertical'
      ? Math.max(10, Math.round((extra.fontSize || 22) * (236 / 540)))
      : Math.round((extra.fontSize || 22) * 0.85);

    const style = {
      position: 'absolute',
      fontFamily: extra.font || 'Inter, sans-serif',
      fontSize: `${previewFontSize}px`,
      color: extra.color || '#ffffff',
      fontWeight: 'bold',
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
      style.backgroundColor = extra.bgColor || 'rgba(0, 0, 0, 0.75)';
      style.padding = '3px 8px';
      style.borderRadius = '6px';
    }

    if (extra.outline !== false) {
      const thickness = Math.max(1.5, Math.round((extra.outlineThickness || 3) * 0.7));
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

  // Compute Logo overlay position style
  const getLogoOverlayStyle = () => {
    if (!logoSettings || !logoSettings.url) return {};

    const previewLogoWidth = previewMode === 'vertical'
      ? Math.max(20, Math.round((logoSettings.size || 60) * (236 / 540)))
      : Math.round((logoSettings.size || 60) * 0.6);

    const style = {
      position: 'absolute',
      width: `${previewLogoWidth}px`,
      opacity: (logoSettings.opacity || 80) / 100,
      zIndex: 45,
      cursor: 'move',
      userSelect: 'none',
      touchAction: 'none'
    };

    if (typeof logoSettings.customX === 'number' && typeof logoSettings.customY === 'number') {
      style.left = `${logoSettings.customX}%`;
      style.top = `${logoSettings.customY}%`;
      style.transform = 'translate(-50%, -50%)';
    } else {
      const pos = logoSettings.position || 'top-right';
      if (pos.includes('top')) style.top = '12px';
      if (pos.includes('bottom')) style.bottom = '12px';
      if (pos.includes('left')) style.left = '12px';
      if (pos.includes('right')) style.right = '12px';
    }

    return style;
  };

  const getCropBoxDimensions = () => {
    if (cropSettings?.mode === 'custom') {
      return {
        width: `${cropSettings.customWidth ?? 60}%`,
        height: `${cropSettings.customHeight ?? 85}%`
      };
    }
    if (cropSettings?.mode === '9:16') return { width: '42%', height: '88%' };
    if (cropSettings?.mode === '1:1') return { width: '62%', height: '70%' };
    if (cropSettings?.mode === '4:5') return { width: '52%', height: '75%' };
    if (cropSettings?.mode === '21:9') return { width: '92%', height: '40%' };
    return { width: '88%', height: '60%' };
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
          </span>
        </div>

        {/* View Switch Buttons */}
        {cropSettings?.mode !== 'original' && (
          <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 shrink-0">
            <button
              onClick={() => setPreviewMode('vertical')}
              className={`px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center space-x-1 touch-manipulation ${
                previewMode === 'vertical'
                  ? 'bg-orange-500 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Full 9:16 Vertical Screen Preview"
            >
              <Smartphone className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span>Phone</span>
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
        {videoData?.url ? (
          previewMode === 'vertical' && isVerticalCrop && !isCustomCrop ? (
            /* ── VERTICAL 9:16 PHONE VIEWPORT ── */
            <div
              ref={phoneViewportRef}
              className="relative rounded-2xl overflow-hidden shadow-2xl border-2 border-slate-700 bg-black flex items-center justify-center select-none"
              style={{
                aspectRatio: '9 / 16',
                height: '380px',
                maxHeight: '55vh'
              }}
            >
              {/* ── BACKGROUND LAYER (Hardware Fast Canvas Blit) ── */}
              {!isFillMode && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                  {bgType === 'blur-video' ? (
                    <canvas
                      ref={bgCanvasRef}
                      width={180}
                      height={320}
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                      style={{
                        filter: `blur(${bgBlur}px) brightness(${bgOpacity})`,
                        transform: 'scale(1.15)',
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
                        transform: 'scale(1.1)',
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

              {/* ── MAIN VIDEO LAYER ── */}
              <div className="relative w-full h-full overflow-hidden flex items-center justify-center z-10 pointer-events-none">
                {isFillMode ? (
                  <video
                    ref={videoRef}
                    src={videoData.url}
                    className="absolute pointer-events-none"
                    style={{
                      ...getFilterStyle(),
                      width: 'auto',
                      height: '100%',
                      minWidth: '100%',
                      minHeight: '100%',
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
                  <div className="w-full flex items-center justify-center">
                    <video
                      ref={videoRef}
                      src={videoData.url}
                      className="w-full h-auto max-h-full object-contain pointer-events-none shadow-2xl"
                      style={getFilterStyle()}
                      onTimeUpdate={handleTimeUpdateInternal}
                      onEnded={() => setIsPlaying(false)}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      playsInline
                    />
                  </div>
                )}
              </div>

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

                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 opacity-0 group-hover/text:opacity-100 transition-opacity bg-black/80 text-amber-300 text-[9px] px-2 py-0.5 rounded-full border border-amber-500/40 pointer-events-none flex items-center space-x-1 font-mono whitespace-nowrap shadow-lg">
                    <GripVertical className="w-2.5 h-2.5" />
                    <span>Drag title</span>
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

                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 opacity-0 group-hover/extra:opacity-100 transition-opacity bg-black/80 text-emerald-300 text-[9px] px-2 py-0.5 rounded-full border border-emerald-500/40 pointer-events-none flex items-center space-x-1 font-mono whitespace-nowrap shadow-lg">
                      <GripVertical className="w-2.5 h-2.5" />
                      <span>Drag text</span>
                    </div>
                  </div>
                );
              })}

              {/* ── DRAGGABLE LOGO OVERLAY ── */}
              {logoSettings?.enabled && logoSettings?.url && (
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
                  <img src={logoSettings.url} alt="Logo" className="w-full h-auto object-contain pointer-events-none" />

                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 opacity-0 group-hover/logo:opacity-100 transition-opacity bg-black/80 text-emerald-300 text-[9px] px-2 py-0.5 rounded-full border border-emerald-500/40 pointer-events-none flex items-center space-x-1 font-mono whitespace-nowrap shadow-lg">
                    <GripVertical className="w-2.5 h-2.5" />
                    <span>Drag logo</span>
                  </div>
                </div>
              )}

              {/* Phone Status bar */}
              <div className="absolute top-2 inset-x-0 flex justify-between px-3 sm:px-4 text-[9px] font-mono text-white/50 pointer-events-none z-30 drop-shadow">
                <span>9:16 SHORTS / REELS</span>
                <span className={!isFillMode ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                  {!isFillMode ? (bgType === 'blur-video' ? 'BLURRED BACKDROP' : bgType === 'image' ? 'CUSTOM BACKDROP' : 'FIT') : 'ZOOM FILL'}
                </span>
              </div>
            </div>
          ) : (
            /* ── WIDE FRAMING / MANUAL CROP VIEWPORT ── */
            <div className="relative w-full h-full flex items-center justify-center select-none">
              <video
                ref={videoRef}
                src={videoData.url}
                className="max-h-[300px] sm:max-h-[420px] w-auto max-w-full object-contain mx-auto transition-all"
                style={getFilterStyle()}
                onTimeUpdate={handleTimeUpdateInternal}
                onEnded={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                playsInline
              />

              {/* ── 8-POINT INTERACTIVE MANUAL CROP RECTANGLE ── */}
              {showCropGuide && cropSettings?.mode !== 'original' && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div
                    className={`relative border-2 border-dashed rounded-lg pointer-events-auto select-none transition-shadow touch-manipulation ${
                      isDraggingCrop
                        ? 'border-orange-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)] ring-2 ring-orange-500/50'
                        : 'border-amber-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] hover:border-amber-300'
                    }`}
                    style={{
                      width: cropDims.width,
                      height: cropDims.height,
                      transform: `translate(${(cropSettings?.x || 0) * 0.35}px, ${(cropSettings?.y || 0) * 0.35}px) scale(${cropSettings?.zoom || 1})`
                    }}
                    onMouseDown={(e) => startCropDrag(e, 'center')}
                    onTouchStart={(e) => startCropDrag(e, 'center')}
                  >
                    {/* 4 Corner Resize Handles */}
                    <div
                      className="absolute -top-2.5 -left-2.5 w-5 h-5 bg-amber-400 hover:bg-white rounded-full border-2 border-black cursor-nwse-resize z-30 shadow touch-manipulation"
                      onMouseDown={(e) => startCropDrag(e, 'tl')}
                      onTouchStart={(e) => startCropDrag(e, 'tl')}
                      title="Drag to resize top-left"
                    />
                    <div
                      className="absolute -top-2.5 -right-2.5 w-5 h-5 bg-amber-400 hover:bg-white rounded-full border-2 border-black cursor-nesw-resize z-30 shadow touch-manipulation"
                      onMouseDown={(e) => startCropDrag(e, 'tr')}
                      onTouchStart={(e) => startCropDrag(e, 'tr')}
                      title="Drag to resize top-right"
                    />
                    <div
                      className="absolute -bottom-2.5 -left-2.5 w-5 h-5 bg-amber-400 hover:bg-white rounded-full border-2 border-black cursor-nesw-resize z-30 shadow touch-manipulation"
                      onMouseDown={(e) => startCropDrag(e, 'bl')}
                      onTouchStart={(e) => startCropDrag(e, 'bl')}
                      title="Drag to resize bottom-left"
                    />
                    <div
                      className="absolute -bottom-2.5 -right-2.5 w-5 h-5 bg-amber-400 hover:bg-white rounded-full border-2 border-black cursor-nwse-resize z-30 shadow touch-manipulation"
                      onMouseDown={(e) => startCropDrag(e, 'br')}
                      onTouchStart={(e) => startCropDrag(e, 'br')}
                      title="Drag to resize bottom-right"
                    />

                    {/* 4 Edge Resize Handles */}
                    <div
                      className="absolute top-0 inset-x-8 h-3 -translate-y-1.5 bg-transparent hover:bg-amber-400/50 cursor-ns-resize z-20 touch-manipulation"
                      onMouseDown={(e) => startCropDrag(e, 't')}
                      onTouchStart={(e) => startCropDrag(e, 't')}
                      title="Resize height"
                    />
                    <div
                      className="absolute bottom-0 inset-x-8 h-3 translate-y-1.5 bg-transparent hover:bg-amber-400/50 cursor-ns-resize z-20 touch-manipulation"
                      onMouseDown={(e) => startCropDrag(e, 'b')}
                      onTouchStart={(e) => startCropDrag(e, 'b')}
                      title="Resize height"
                    />
                    <div
                      className="absolute left-0 inset-y-8 w-3 -translate-x-1.5 bg-transparent hover:bg-amber-400/50 cursor-ew-resize z-20 touch-manipulation"
                      onMouseDown={(e) => startCropDrag(e, 'l')}
                      onTouchStart={(e) => startCropDrag(e, 'l')}
                      title="Resize width"
                    />
                    <div
                      className="absolute right-0 inset-y-8 w-3 translate-x-1.5 bg-transparent hover:bg-amber-400/50 cursor-ew-resize z-20 touch-manipulation"
                      onMouseDown={(e) => startCropDrag(e, 'r')}
                      onTouchStart={(e) => startCropDrag(e, 'r')}
                      title="Resize width"
                    />

                    {/* Center Move Badge */}
                    <div className="absolute inset-0 flex items-center justify-center cursor-move">
                      <div className="flex items-center space-x-1 text-[9px] sm:text-[10px] font-bold text-amber-300 bg-black/80 px-2 sm:px-2.5 py-1 rounded-full border border-amber-500/40 backdrop-blur-sm shadow-lg pointer-events-none">
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
              {logoSettings?.enabled && logoSettings?.url && (
                <div
                  style={getLogoOverlayStyle()}
                  onMouseDown={handleLogoMouseDown}
                  onTouchStart={handleLogoTouchStart}
                  className="hover:ring-1 hover:ring-emerald-400/60 rounded touch-manipulation"
                >
                  <img src={logoSettings.url} alt="Logo" className="w-full h-auto object-contain pointer-events-none" />
                </div>
              )}
            </div>
          )
        ) : (
          <div className="text-center p-8 text-slate-500">
            <FilmIcon className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No video selected</p>
          </div>
        )}
      </div>

      {/* Control Bar */}
      {videoData && (
        <div className="bg-slate-900/95 border-t border-slate-800 px-3 sm:px-4 py-2.5 sm:py-3 z-10 backdrop-blur">
          {/* Timeline Scrubber */}
          <div className="flex items-center space-x-2 sm:space-x-3 mb-2">
            <span className="text-[11px] sm:text-xs font-mono text-slate-300 min-w-[36px] sm:min-w-[44px]">
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
                className="w-full h-2 sm:h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500 focus:outline-none touch-manipulation"
              />
            </div>
            <span className="text-[11px] sm:text-xs font-mono text-slate-400 min-w-[36px] sm:min-w-[44px] text-right">
              {formatTime(videoData.duration)}
            </span>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <button
                onClick={togglePlay}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white flex items-center justify-center transition-all shadow-md shadow-orange-500/20 cursor-pointer shrink-0 touch-manipulation"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-white translate-x-0.5" />}
              </button>

              <button
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.currentTime = 0;
                    onTimeUpdate(0);
                  }
                }}
                className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer touch-manipulation"
                title="Restart"
              >
                <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>

              <div className="flex items-center space-x-1.5 sm:space-x-2 pl-1.5 sm:pl-2 border-l border-slate-800">
                <button
                  onClick={toggleMute}
                  className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer touch-manipulation"
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

            <div className="flex items-center space-x-1 sm:space-x-2">
              <button
                onClick={toggleFullscreen}
                className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer touch-manipulation"
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

function FilmIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
    </svg>
  );
}
