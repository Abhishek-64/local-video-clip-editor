import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Image as ImageIcon,
  Upload,
  Camera,
  Download,
  Share2,
  Sparkles,
  Type,
  Layers,
  Crop,
  Sliders,
  RotateCcw,
  Youtube,
  Instagram,
  Check,
  ZoomIn,
  ZoomOut,
  Maximize,
  Move,
  Film,
  Palette,
  ChevronRight,
  Eye,
  SlidersHorizontal,
  X,
  Trash2
} from 'lucide-react';
import { toDateTimeLocalString } from '../utils/scheduler';

const ASPECT_RATIOS = [
  { id: '1:1', label: '1:1 Square', sublabel: 'IG & FB Feed', width: 1080, height: 1080, icon: '⏹️' },
  { id: '4:5', label: '4:5 Portrait', sublabel: 'IG Feed Optimal', width: 1080, height: 1350, icon: '📱' },
  { id: '9:16', label: '9:16 Story', sublabel: 'Stories & Reels', width: 1080, height: 1920, icon: '📲' },
  { id: '16:9', label: '16:9 Landscape', sublabel: 'YT Thumbnail & FB', width: 1920, height: 1080, icon: '🖥️' }
];

const FILTER_PRESETS = [
  { id: 'normal', label: 'Normal', brightness: 0, contrast: 0, saturation: 0, warmth: 0, vignette: 0, sepia: 0, grayscale: 0 },
  { id: 'vivid', label: 'Vivid Pop', brightness: 5, contrast: 20, saturation: 35, warmth: 5, vignette: 10, sepia: 0, grayscale: 0 },
  { id: 'cinematic', label: 'Cinematic', brightness: -5, contrast: 25, saturation: 10, warmth: 15, vignette: 35, sepia: 5, grayscale: 0 },
  { id: 'warm_glow', label: 'Warm Glow', brightness: 8, contrast: 10, saturation: 20, warmth: 30, vignette: 15, sepia: 15, grayscale: 0 },
  { id: 'noir', label: 'Noir B&W', brightness: 5, contrast: 40, saturation: -100, warmth: 0, vignette: 40, sepia: 0, grayscale: 100 },
  { id: 'vintage', label: 'Vintage 70s', brightness: 0, contrast: 15, saturation: -15, warmth: 25, vignette: 25, sepia: 40, grayscale: 0 },
  { id: 'cyberpunk', label: 'Cyberpunk', brightness: 10, contrast: 30, saturation: 50, warmth: -20, vignette: 25, sepia: 0, grayscale: 0 }
];

const FONTS = [
  { id: 'Inter', name: 'Inter (Modern)' },
  { id: 'Impact', name: 'Impact (Viral Meme)' },
  { id: 'Montserrat', name: 'Montserrat (Bold)' },
  { id: 'Outfit', name: 'Outfit (Clean)' },
  { id: 'Bebas Neue', name: 'Bebas Neue (Heavy)' },
  { id: 'Georgia', name: 'Georgia (Editorial)' }
];

/**
 * Word wrap helper for canvas text rendering
 */
function wrapCanvasText(ctx, text, maxWidth) {
  if (!text) return [];
  const words = String(text).trim().split(/\s+/);
  if (words.length === 0 || !words[0]) return [];

  const lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine + ' ' + word;
    const testWidth = ctx.measureText(testLine).width;
    if (testWidth > maxWidth) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

export default function PhotoEditor({
  initialImage = null,
  movieName = 'My Movie',
  videoData = null,
  currentVideoTime = 0,
  onCaptureVideoFrame = null,
  onPublishPhoto = null,
  onSetYouTubeThumbnail = null,
  onClearPhoto = null,
  isFbConnected = false,
  isIgConnected = false,
  isYtConnected = false,
  showToast = () => {}
}) {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const logoInputRef = useRef(null);

  // Active Main Tab
  const [activeTab, setActiveTab] = useState('crop'); // 'crop' | 'filter' | 'backdrop' | 'text' | 'logo'

  // Image Source
  const [imageSrc, setImageSrc] = useState(initialImage || null);
  const [loadedImage, setLoadedImage] = useState(null);

  // Ratio / Framing
  const [selectedRatio, setSelectedRatio] = useState('1:1');
  const [fitMode, setFitMode] = useState('cover'); // 'cover' | 'contain' | 'fill'
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0); // in percent (-100 to 100)
  const [panY, setPanY] = useState(0);

  // Filters & Adjustments
  const [filters, setFilters] = useState({
    preset: 'normal',
    brightness: 0,   // -50 to 50
    contrast: 0,     // -50 to 50
    saturation: 0,   // -100 to 100
    warmth: 0,       // -50 to 50
    vignette: 0,     // 0 to 100
    blur: 0,         // 0 to 30
    sepia: 0,        // 0 to 100
    grayscale: 0     // 0 to 100
  });

  // Backdrop / Framing Settings
  const [backdrop, setBackdrop] = useState({
    type: 'blur-image', // 'blur-image' | 'gradient' | 'solid'
    blur: 35,
    opacity: 80,
    solidColor: '#0b0f19',
    gradientColorA: '#ff5500',
    gradientColorB: '#1e1b4b'
  });

  // Text Overlay Settings (Normalized reference sizes for 1080p base)
  const [textConfig, setTextConfig] = useState({
    enabled: true,
    title: movieName || 'NEW RELEASE',
    subtitle: 'PART 1 • WATCH FULL CLIP',
    badgeText: 'HD 4K',
    badgeBgColor: '#ff5500',
    font: 'Impact',
    align: 'center', // 'center' | 'left' | 'right'
    titleSize: 56,   // Base font size
    subtitleSize: 26,
    titleColor: '#ffffff',
    titleStrokeColor: '#000000',
    titleStrokeWidth: 4,
    subtitleColor: '#fbbf24',
    positionX: 50,  // 0 to 100%
    positionY: 82,  // 0 to 100% from top
    showBadge: true,
    showBackgroundPill: true,
    pillColor: 'rgba(0,0,0,0.65)'
  });

  // Logo / Watermark Settings (Normalized to shortest dimension)
  const [logoConfig, setLogoConfig] = useState({
    enabled: false,
    imageSrc: null,
    scale: 20, // percent of base dimension
    opacity: 90,
    margin: 4, // percent of base dimension
    position: 'top-right' // 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center-top' | 'center-bottom'
  });
  const [loadedLogo, setLoadedLogo] = useState(null);

  // Update initial image if changed from outside (e.g. new frame capture or cleared)
  useEffect(() => {
    setImageSrc(initialImage || null);
  }, [initialImage]);

  // Load Main Image
  useEffect(() => {
    if (!imageSrc) {
      setLoadedImage(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setLoadedImage(img);
    img.src = imageSrc;
  }, [imageSrc]);

  // Load Logo Image
  useEffect(() => {
    if (!logoConfig.imageSrc) {
      setLoadedLogo(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setLoadedLogo(img);
    img.src = logoConfig.imageSrc;
  }, [logoConfig.imageSrc]);

  // Handle local image file upload
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImageSrc(ev.target.result);
        setPanX(0);
        setPanY(0);
        setZoom(1);
        showToast('Image loaded successfully', 'success');
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle clear/delete uploaded image
  const handleClearImage = () => {
    setImageSrc(null);
    setLoadedImage(null);
    setPanX(0);
    setPanY(0);
    setZoom(1);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (onClearPhoto) {
      onClearPhoto();
    }
    showToast('Photo removed from studio', 'info');
  };

  // Handle logo file upload
  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setLogoConfig(prev => ({ ...prev, enabled: true, imageSrc: ev.target.result }));
        showToast('Logo overlay loaded', 'success');
      };
      reader.readAsDataURL(file);
    }
  };

  // Apply Filter Preset
  const applyPreset = (presetId) => {
    const p = FILTER_PRESETS.find(x => x.id === presetId) || FILTER_PRESETS[0];
    setFilters({
      preset: p.id,
      brightness: p.brightness,
      contrast: p.contrast,
      saturation: p.saturation,
      warmth: p.warmth,
      vignette: p.vignette,
      blur: 0,
      sepia: p.sepia,
      grayscale: p.grayscale
    });
  };

  // Reset Filters
  const resetFilters = () => applyPreset('normal');

  // Render Canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ratioObj = ASPECT_RATIOS.find(r => r.id === selectedRatio) || ASPECT_RATIOS[0];
    const targetW = ratioObj.width;
    const targetH = ratioObj.height;

    canvas.width = targetW;
    canvas.height = targetH;

    // 1. Draw Backdrop / Background
    if (backdrop.type === 'solid') {
      ctx.fillStyle = backdrop.solidColor;
      ctx.fillRect(0, 0, targetW, targetH);
    } else if (backdrop.type === 'gradient') {
      const grad = ctx.createLinearGradient(0, 0, targetW, targetH);
      grad.addColorStop(0, backdrop.gradientColorA);
      grad.addColorStop(1, backdrop.gradientColorB);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, targetW, targetH);
    } else if (backdrop.type === 'blur-image' && loadedImage) {
      // Draw blurred stretched copy of image
      ctx.save();
      ctx.filter = `blur(${backdrop.blur}px) brightness(${backdrop.opacity}%)`;
      // Draw oversized to avoid white blur fringes
      ctx.drawImage(loadedImage, -40, -40, targetW + 80, targetH + 80);
      ctx.restore();
      // Add subtle dark scrim over blur
      ctx.fillStyle = 'rgba(11, 15, 25, 0.45)';
      ctx.fillRect(0, 0, targetW, targetH);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, targetW, targetH);
    }

    // 2. Draw Main Foreground Image
    if (loadedImage) {
      ctx.save();

      // Apply CSS Filters to Foreground
      const bVal = 100 + filters.brightness;
      const cVal = 100 + filters.contrast;
      const sVal = 100 + filters.saturation;
      const sepiaVal = filters.sepia;
      const grayVal = filters.grayscale;
      const blurVal = filters.blur;

      ctx.filter = `brightness(${bVal}%) contrast(${cVal}%) saturate(${sVal}%) sepia(${sepiaVal}%) grayscale(${grayVal}%) blur(${blurVal}px)`;

      const imgW = loadedImage.naturalWidth || loadedImage.width;
      const imgH = loadedImage.naturalHeight || loadedImage.height;

      let drawW, drawH, drawX, drawY;

      if (fitMode === 'cover') {
        const scale = Math.max(targetW / imgW, targetH / imgH) * zoom;
        drawW = imgW * scale;
        drawH = imgH * scale;
        drawX = (targetW - drawW) / 2 + (panX / 100) * (targetW / 2);
        drawY = (targetH - drawH) / 2 + (panY / 100) * (targetH / 2);
      } else if (fitMode === 'contain') {
        const scale = Math.min(targetW / imgW, targetH / imgH) * zoom;
        drawW = imgW * scale;
        drawH = imgH * scale;
        drawX = (targetW - drawW) / 2 + (panX / 100) * (targetW / 2);
        drawY = (targetH - drawH) / 2 + (panY / 100) * (targetH / 2);
      } else {
        // fill
        drawW = targetW * zoom;
        drawH = targetH * zoom;
        drawX = (targetW - drawW) / 2 + (panX / 100) * (targetW / 2);
        drawY = (targetH - drawH) / 2 + (panY / 100) * (targetH / 2);
      }

      ctx.drawImage(loadedImage, drawX, drawY, drawW, drawH);
      ctx.restore();

      // 3. Draw Warmth Tint if set
      if (filters.warmth !== 0) {
        ctx.save();
        ctx.fillStyle = filters.warmth > 0 ? 'rgba(255, 140, 0, 0.15)' : 'rgba(0, 100, 255, 0.15)';
        ctx.globalAlpha = Math.min(1, Math.abs(filters.warmth) / 50);
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.restore();
      }

      // 4. Draw Vignette
      if (filters.vignette > 0) {
        ctx.save();
        const vRadius = Math.max(targetW, targetH) * 0.7;
        const vignetteGrad = ctx.createRadialGradient(
          targetW / 2, targetH / 2, vRadius * 0.3,
          targetW / 2, targetH / 2, vRadius
        );
        vignetteGrad.addColorStop(0, 'rgba(0,0,0,0)');
        vignetteGrad.addColorStop(1, `rgba(0,0,0,${(filters.vignette / 100) * 0.85})`);
        ctx.fillStyle = vignetteGrad;
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.restore();
      }
    } else {
      // Placeholder instructions if no image loaded
      ctx.fillStyle = '#94a3b8';
      ctx.font = '24px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Upload an image or capture a video frame to begin editing', targetW / 2, targetH / 2);
    }

    // Base reference dimension for consistent proportional sizing across 1:1, 4:5, 9:16, 16:9
    const baseDim = Math.min(targetW, targetH);
    const refScale = baseDim / 1080;

    // 5. Draw Text Overlays with Proportional Scaling & Auto-Wrapping
    if (textConfig.enabled && (textConfig.title || textConfig.subtitle)) {
      ctx.save();
      const centerX = ((textConfig.positionX !== undefined ? textConfig.positionX : 50) / 100) * targetW;
      const centerY = (textConfig.positionY / 100) * targetH;

      const titleFontSize = Math.round((textConfig.titleSize || 56) * refScale);
      const subFontSize = Math.round((textConfig.subtitleSize || 26) * refScale);
      const strokeW = Math.round((textConfig.titleStrokeWidth !== undefined ? textConfig.titleStrokeWidth : 4) * refScale);
      const maxAllowedTextWidth = targetW * 0.86;

      // Measure & wrap Title text
      ctx.font = `900 ${titleFontSize}px "${textConfig.font || 'Impact'}", sans-serif`;
      const titleLines = textConfig.title ? wrapCanvasText(ctx, textConfig.title, maxAllowedTextWidth) : [];

      // Measure & wrap Subtitle text
      ctx.font = `700 ${subFontSize}px "${textConfig.font || 'Impact'}", sans-serif`;
      const subLines = textConfig.subtitle ? wrapCanvasText(ctx, textConfig.subtitle, maxAllowedTextWidth) : [];

      const titleLineHeight = titleFontSize * 1.18;
      const subLineHeight = subFontSize * 1.25;
      const sectionGap = (titleLines.length > 0 && subLines.length > 0) ? Math.round(14 * refScale) : 0;
      const hasBadge = Boolean(textConfig.showBadge && textConfig.badgeText);
      const badgeH = hasBadge ? Math.round(28 * refScale) : 0;
      const badgeGap = hasBadge ? Math.round(12 * refScale) : 0;

      const totalContentHeight = (titleLines.length * titleLineHeight) + sectionGap + (subLines.length * subLineHeight) + badgeH + badgeGap;

      // Compute max line width across all text
      let maxLineWidth = 0;
      ctx.font = `900 ${titleFontSize}px "${textConfig.font || 'Impact'}", sans-serif`;
      titleLines.forEach(l => {
        maxLineWidth = Math.max(maxLineWidth, ctx.measureText(l).width);
      });
      ctx.font = `700 ${subFontSize}px "${textConfig.font || 'Impact'}", sans-serif`;
      subLines.forEach(l => {
        maxLineWidth = Math.max(maxLineWidth, ctx.measureText(l).width);
      });
      if (hasBadge) {
        ctx.font = `800 ${Math.round(16 * refScale)}px Inter, sans-serif`;
        maxLineWidth = Math.max(maxLineWidth, ctx.measureText(textConfig.badgeText).width + Math.round(32 * refScale));
      }

      const pillPaddingX = Math.round(32 * refScale);
      const pillPaddingY = Math.round(20 * refScale);
      const boxW = Math.min(targetW * 0.94, Math.max(maxLineWidth + pillPaddingX * 2, Math.round(220 * refScale)));
      const boxH = totalContentHeight + pillPaddingY * 2;
      const boxX = centerX - boxW / 2;
      const boxY = centerY - boxH / 2;
      const radius = Math.round(20 * refScale);

      // Draw background pill badge if enabled
      if (textConfig.showBackgroundPill) {
        ctx.fillStyle = textConfig.pillColor || 'rgba(0,0,0,0.65)';
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, radius);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = Math.max(1, Math.round(2 * refScale));
        ctx.stroke();
      }

      let currentY = centerY - totalContentHeight / 2;

      // A. Small Badge (e.g. 4K HDR)
      if (hasBadge) {
        const badgeFont = `800 ${Math.round(15 * refScale)}px Inter, sans-serif`;
        ctx.font = badgeFont;
        const bTextW = ctx.measureText(textConfig.badgeText).width;
        const bW = bTextW + Math.round(20 * refScale);
        const bH = badgeH;
        const bX = centerX - bW / 2;
        const bY = currentY;

        ctx.fillStyle = textConfig.badgeBgColor || '#ff5500';
        ctx.beginPath();
        ctx.roundRect(bX, bY, bW, bH, Math.max(4, Math.round(6 * refScale)));
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(textConfig.badgeText, centerX, bY + bH / 2);

        currentY += bH + badgeGap;
      }

      const textAlign = textConfig.align || 'center';
      const textAnchorX = textAlign === 'left' ? boxX + pillPaddingX : textAlign === 'right' ? boxX + boxW - pillPaddingX : centerX;

      // B. Title Lines
      if (titleLines.length > 0) {
        ctx.font = `900 ${titleFontSize}px "${textConfig.font || 'Impact'}", sans-serif`;
        ctx.textAlign = textAlign;
        ctx.textBaseline = 'middle';

        titleLines.forEach((line) => {
          const lineY = currentY + titleLineHeight / 2;
          if (strokeW > 0) {
            ctx.strokeStyle = textConfig.titleStrokeColor || '#000000';
            ctx.lineWidth = strokeW;
            ctx.lineJoin = 'round';
            ctx.strokeText(line, textAnchorX, lineY);
          }
          ctx.fillStyle = textConfig.titleColor || '#ffffff';
          ctx.fillText(line, textAnchorX, lineY);
          currentY += titleLineHeight;
        });

        currentY += sectionGap;
      }

      // C. Subtitle Lines
      if (subLines.length > 0) {
        ctx.font = `700 ${subFontSize}px "${textConfig.font || 'Impact'}", sans-serif`;
        ctx.textAlign = textAlign;
        ctx.textBaseline = 'middle';

        subLines.forEach((line) => {
          const lineY = currentY + subLineHeight / 2;
          ctx.fillStyle = textConfig.subtitleColor || '#fbbf24';
          ctx.fillText(line, textAnchorX, lineY);
          currentY += subLineHeight;
        });
      }

      ctx.restore();
    }

    // 6. Draw Logo Overlay (Normalized proportional size & margins)
    if (logoConfig.enabled && loadedLogo) {
      ctx.save();
      ctx.globalAlpha = (logoConfig.opacity || 90) / 100;

      const logoW = baseDim * ((logoConfig.scale || 20) / 100);
      const aspect = (loadedLogo.naturalWidth || loadedLogo.width) / (loadedLogo.naturalHeight || loadedLogo.height);
      const logoH = logoW / aspect;
      const margin = Math.round(baseDim * ((logoConfig.margin || 4) / 100));

      let lx = margin;
      let ly = margin;

      if (logoConfig.position === 'top-right') {
        lx = targetW - logoW - margin;
        ly = margin;
      } else if (logoConfig.position === 'bottom-left') {
        lx = margin;
        ly = targetH - logoH - margin;
      } else if (logoConfig.position === 'bottom-right') {
        lx = targetW - logoW - margin;
        ly = targetH - logoH - margin;
      } else if (logoConfig.position === 'center-top') {
        lx = (targetW - logoW) / 2;
        ly = margin;
      } else if (logoConfig.position === 'center-bottom') {
        lx = (targetW - logoW) / 2;
        ly = targetH - logoH - margin;
      }

      ctx.drawImage(loadedLogo, lx, ly, logoW, logoH);
      ctx.restore();
    }
  }, [loadedImage, loadedLogo, selectedRatio, fitMode, zoom, panX, panY, filters, backdrop, textConfig, logoConfig]);

  // Re-render whenever parameters change
  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Export as Data URL
  const exportAsDataUrl = (format = 'image/jpeg', quality = 0.95) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.toDataURL(format, quality);
  };

  // Download Image File locally
  const handleDownload = () => {
    const dataUrl = exportAsDataUrl('image/jpeg', 0.95);
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${(movieName || 'photo_post').replace(/\s+/g, '_')}_${selectedRatio.replace(':', 'x')}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Photo exported successfully', 'success');
  };

  // Handle Publish Action
  const handlePublish = () => {
    const dataUrl = exportAsDataUrl('image/jpeg', 0.95);
    if (!dataUrl) {
      showToast('Please load or create an image first', 'error');
      return;
    }

    if (onPublishPhoto) {
      onPublishPhoto({
        dataUrl,
        aspectRatio: selectedRatio,
        title: textConfig.title || movieName,
        caption: `${textConfig.title || movieName}\n\n${textConfig.subtitle || ''}`,
        hashtags: ['#photo', '#trending', '#cinema', '#videoeditor']
      });
    }
  };

  // Handle Set YouTube Thumbnail Action
  const handleSetThumbnail = () => {
    const dataUrl = exportAsDataUrl('image/jpeg', 0.95);
    if (!dataUrl) return;

    if (onSetYouTubeThumbnail) {
      onSetYouTubeThumbnail(dataUrl);
    } else {
      showToast('YouTube account must be connected to set thumbnails', 'info');
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full max-w-7xl mx-auto p-4 sm:p-6 text-slate-100">
      {/* ─── Left / Center: Interactive Canvas Studio Preview ─── */}
      <div className="flex-1 flex flex-col items-center bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl relative">
        {/* Top Studio Toolbar */}
        <div className="w-full flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <span className="p-2 bg-orange-500/10 text-orange-400 rounded-xl">
              <ImageIcon className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Photo & Thumbnail Studio
                <span className="text-xs px-2 py-0.5 bg-orange-500/20 text-orange-400 font-semibold rounded-full border border-orange-500/30">
                  {selectedRatio}
                </span>
              </h2>
              <p className="text-xs text-slate-400">Design high-converting posts for Facebook, Instagram & YouTube</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Capture Frame from Video Button */}
            {videoData && onCaptureVideoFrame && (
              <button
                type="button"
                onClick={onCaptureVideoFrame}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition-colors shadow-sm"
                title="Capture currently paused video frame into Photo Studio"
              >
                <Camera className="w-4 h-4 text-orange-400" />
                <span>Snap Frame</span>
              </button>
            )}

            {/* Upload Custom Image Button */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/png,image/jpeg,image/webp,image/jpg"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition-colors shadow-sm"
            >
              <Upload className="w-4 h-4 text-slate-300" />
              <span>Upload Image</span>
            </button>

            {/* Delete / Clear Loaded Image Button */}
            {imageSrc && (
              <button
                type="button"
                onClick={handleClearImage}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-xl text-xs font-semibold border border-red-500/30 transition-colors shadow-sm"
                title="Delete/remove current image from Photo Studio"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
                <span>Delete Photo</span>
              </button>
            )}
          </div>
        </div>

        {/* Canvas Display Area */}
        <div className="flex-1 w-full flex items-center justify-center p-2 min-h-[360px] sm:min-h-[460px] bg-slate-950/80 rounded-2xl border border-slate-800/80 relative overflow-hidden group">
          <div className="relative shadow-2xl rounded-xl overflow-hidden max-h-[60vh] max-w-full flex items-center justify-center">
            <canvas
              ref={canvasRef}
              className="max-h-[55vh] max-w-full object-contain rounded-lg shadow-2xl transition-transform"
            />
          </div>
        </div>

        {/* Canvas Quick Controls Bar (Zoom, Pan, Fit) */}
        <div className="w-full flex flex-wrap items-center justify-between gap-4 mt-4 pt-4 border-t border-slate-800 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-slate-400 font-medium flex items-center gap-1">
              <ZoomIn className="w-3.5 h-3.5 text-orange-400" /> Zoom:
            </span>
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-24 accent-orange-500 cursor-pointer"
            />
            <span className="text-slate-300 font-mono">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => { setZoom(1); setPanX(0); setPanY(0); }}
              className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200"
              title="Reset Zoom & Pan"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Fit Mode:</span>
            {['cover', 'contain', 'fill'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setFitMode(m)}
                className={`px-2.5 py-1 rounded-lg uppercase tracking-wider text-[10px] font-bold transition-colors ${
                  fitMode === m
                    ? 'bg-orange-500 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Primary Action Buttons Bar */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-2">
          {/* Download Local Image */}
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white font-bold rounded-2xl border border-slate-700 shadow-md transition-all cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-300" />
            <span>Download High-Res</span>
          </button>

          {/* Set YouTube Thumbnail */}
          <button
            type="button"
            onClick={handleSetThumbnail}
            disabled={!isYtConnected}
            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-bold border transition-all cursor-pointer ${
              isYtConnected
                ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30'
                : 'bg-slate-800/40 text-slate-500 border-slate-800 cursor-not-allowed'
            }`}
            title={isYtConnected ? "Set as thumbnail on YouTube" : "Connect YouTube first in YouTube Tab"}
          >
            <Youtube className="w-4 h-4" />
            <span>Set YT Thumbnail</span>
          </button>

          {/* Publish & Schedule Photo */}
          <button
            type="button"
            onClick={handlePublish}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-black rounded-2xl shadow-lg shadow-orange-500/20 transition-all cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
            <span>Publish / Schedule Post</span>
          </button>
        </div>
      </div>

      {/* ─── Right: Tool Panels & Creative Controls ─── */}
      <div className="w-full lg:w-[420px] flex flex-col bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        {/* Navigation Tabs */}
        <div className="flex items-center bg-slate-950/80 border-b border-slate-800 p-1.5 gap-1 overflow-x-auto">
          {[
            { id: 'crop', label: 'Ratio', icon: Crop },
            { id: 'filter', label: 'Filters', icon: Sparkles },
            { id: 'backdrop', label: 'Backdrop', icon: Palette },
            { id: 'text', label: 'Text', icon: Type },
            { id: 'logo', label: 'Logo', icon: Layers }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-6 max-h-[680px]">
          {/* 1. Ratio & Framing Tab */}
          {activeTab === 'crop' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white mb-1">Target Aspect Ratio</h3>
                <p className="text-xs text-slate-400 mb-3">Choose the optimal layout for your destination platform</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {ASPECT_RATIOS.map((ratio) => (
                    <button
                      key={ratio.id}
                      type="button"
                      onClick={() => setSelectedRatio(ratio.id)}
                      className={`flex flex-col text-left p-3 rounded-2xl border transition-all cursor-pointer ${
                        selectedRatio === ratio.id
                          ? 'bg-orange-500/10 border-orange-500 text-white ring-1 ring-orange-500'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="font-bold text-sm">{ratio.label}</span>
                        <span>{ratio.icon}</span>
                      </div>
                      <span className="text-[11px] text-slate-400">{ratio.sublabel}</span>
                      <span className="text-[10px] text-slate-500 mt-1 font-mono">{ratio.width}×{ratio.height}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Pan Position Controls */}
              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>Image Pan Offset</span>
                  <span className="text-[10px] text-slate-500">X: {panX}% | Y: {panY}%</span>
                </h4>
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>Horizontal Pan (X)</span>
                  </div>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={panX}
                    onChange={(e) => setPanX(parseInt(e.target.value))}
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>Vertical Pan (Y)</span>
                  </div>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={panY}
                    onChange={(e) => setPanY(parseInt(e.target.value))}
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 2. Filters & Adjustments Tab */}
          {activeTab === 'filter' && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-white">Color Presets</h3>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-xs text-orange-400 hover:underline flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" /> Reset
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {FILTER_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                        filters.preset === p.id
                          ? 'bg-orange-500 text-white border-orange-500'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fine Sliders */}
              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3.5 text-xs">
                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>Brightness</span>
                    <span className="font-mono text-slate-400">{filters.brightness > 0 ? `+${filters.brightness}` : filters.brightness}</span>
                  </div>
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    value={filters.brightness}
                    onChange={(e) => setFilters(prev => ({ ...prev, preset: 'custom', brightness: parseInt(e.target.value) }))}
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>Contrast</span>
                    <span className="font-mono text-slate-400">{filters.contrast > 0 ? `+${filters.contrast}` : filters.contrast}</span>
                  </div>
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    value={filters.contrast}
                    onChange={(e) => setFilters(prev => ({ ...prev, preset: 'custom', contrast: parseInt(e.target.value) }))}
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>Saturation</span>
                    <span className="font-mono text-slate-400">{filters.saturation > 0 ? `+${filters.saturation}` : filters.saturation}</span>
                  </div>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={filters.saturation}
                    onChange={(e) => setFilters(prev => ({ ...prev, preset: 'custom', saturation: parseInt(e.target.value) }))}
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>Warmth / Temp</span>
                    <span className="font-mono text-slate-400">{filters.warmth > 0 ? `+${filters.warmth}` : filters.warmth}</span>
                  </div>
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    value={filters.warmth}
                    onChange={(e) => setFilters(prev => ({ ...prev, preset: 'custom', warmth: parseInt(e.target.value) }))}
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>Vignette Edge Shadow</span>
                    <span className="font-mono text-slate-400">{filters.vignette}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={filters.vignette}
                    onChange={(e) => setFilters(prev => ({ ...prev, preset: 'custom', vignette: parseInt(e.target.value) }))}
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 3. Backdrop Tab */}
          {activeTab === 'backdrop' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white">Backdrop Style</h3>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'blur-image', label: 'Blurred Image' },
                  { id: 'gradient', label: 'Gradient' },
                  { id: 'solid', label: 'Solid Color' }
                ].map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBackdrop(prev => ({ ...prev, type: b.id }))}
                    className={`p-2.5 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                      backdrop.type === b.id
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>

              {backdrop.type === 'blur-image' && (
                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3 text-xs">
                  <div>
                    <div className="flex justify-between text-slate-300 mb-1">
                      <span>Blur Radius</span>
                      <span className="font-mono">{backdrop.blur}px</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="60"
                      value={backdrop.blur}
                      onChange={(e) => setBackdrop(prev => ({ ...prev, blur: parseInt(e.target.value) }))}
                      className="w-full accent-orange-500 cursor-pointer"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-slate-300 mb-1">
                      <span>Background Opacity</span>
                      <span className="font-mono">{backdrop.opacity}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={backdrop.opacity}
                      onChange={(e) => setBackdrop(prev => ({ ...prev, opacity: parseInt(e.target.value) }))}
                      className="w-full accent-orange-500 cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {backdrop.type === 'solid' && (
                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3 text-xs">
                  <span className="text-slate-300 font-bold block mb-1">Select Color</span>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={backdrop.solidColor}
                      onChange={(e) => setBackdrop(prev => ({ ...prev, solidColor: e.target.value }))}
                      className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border-0"
                    />
                    <span className="font-mono text-slate-300">{backdrop.solidColor}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. Text & Badges Tab */}
          {activeTab === 'text' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Text Overlay</h3>
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={textConfig.enabled}
                    onChange={(e) => setTextConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                    className="accent-orange-500 rounded"
                  />
                  <span>Enable Overlay</span>
                </label>
              </div>

              {textConfig.enabled && (
                <div className="space-y-3.5 text-xs">
                  {/* Headline Title Input */}
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Headline / Title</label>
                    <input
                      type="text"
                      value={textConfig.title}
                      onChange={(e) => setTextConfig(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold focus:border-orange-500 outline-none"
                      placeholder="e.g. MOVIE CLIPS EPISODE 1"
                    />
                  </div>

                  {/* Subtitle Input */}
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Subtitle / Call-To-Action</label>
                    <input
                      type="text"
                      value={textConfig.subtitle}
                      onChange={(e) => setTextConfig(prev => ({ ...prev, subtitle: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-orange-500 outline-none"
                      placeholder="e.g. PART 1 • WATCH FULL VIDEO"
                    />
                  </div>

                  {/* Font Family & Alignment */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-slate-300 font-bold mb-1">Font Family</label>
                      <select
                        value={textConfig.font}
                        onChange={(e) => setTextConfig(prev => ({ ...prev, font: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs outline-none cursor-pointer"
                      >
                        {FONTS.map(f => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-bold mb-1">Alignment</label>
                      <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                        {['left', 'center', 'right'].map((al) => (
                          <button
                            key={al}
                            type="button"
                            onClick={() => setTextConfig(prev => ({ ...prev, align: al }))}
                            className={`py-1 text-[10px] font-bold rounded-lg uppercase transition-colors cursor-pointer ${
                              (textConfig.align || 'center') === al
                                ? 'bg-orange-500 text-white shadow'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {al === 'left' ? 'Left' : al === 'center' ? 'Center' : 'Right'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Font Size Sliders (Title & Subtitle) */}
                  <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
                    <div>
                      <div className="flex justify-between text-slate-300 mb-1">
                        <span className="font-semibold">Title Size</span>
                        <span className="font-mono text-orange-400 font-bold">{textConfig.titleSize || 56}px</span>
                      </div>
                      <input
                        type="range"
                        min="24"
                        max="96"
                        value={textConfig.titleSize || 56}
                        onChange={(e) => setTextConfig(prev => ({ ...prev, titleSize: parseInt(e.target.value) }))}
                        className="w-full accent-orange-500 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-300 mb-1">
                        <span className="font-semibold">Subtitle Size</span>
                        <span className="font-mono text-amber-400 font-bold">{textConfig.subtitleSize || 26}px</span>
                      </div>
                      <input
                        type="range"
                        min="14"
                        max="52"
                        value={textConfig.subtitleSize || 26}
                        onChange={(e) => setTextConfig(prev => ({ ...prev, subtitleSize: parseInt(e.target.value) }))}
                        className="w-full accent-orange-500 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Color & Stroke Pickers */}
                  <div className="grid grid-cols-2 gap-2.5 p-3 bg-slate-950 rounded-2xl border border-slate-800">
                    <div>
                      <span className="block text-slate-300 font-bold mb-1">Title Color</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={textConfig.titleColor || '#ffffff'}
                          onChange={(e) => setTextConfig(prev => ({ ...prev, titleColor: e.target.value }))}
                          className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                        />
                        <span className="font-mono text-[11px] text-slate-300">{textConfig.titleColor || '#ffffff'}</span>
                      </div>
                    </div>

                    <div>
                      <span className="block text-slate-300 font-bold mb-1">Subtitle Color</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={textConfig.subtitleColor || '#fbbf24'}
                          onChange={(e) => setTextConfig(prev => ({ ...prev, subtitleColor: e.target.value }))}
                          className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                        />
                        <span className="font-mono text-[11px] text-slate-300">{textConfig.subtitleColor || '#fbbf24'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Stroke Styling */}
                  <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-300">Title Outline / Stroke</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={textConfig.titleStrokeColor || '#000000'}
                          onChange={(e) => setTextConfig(prev => ({ ...prev, titleStrokeColor: e.target.value }))}
                          className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                          title="Stroke Color"
                        />
                        <span className="font-mono text-orange-400 font-bold">{textConfig.titleStrokeWidth || 4}px</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="12"
                      value={textConfig.titleStrokeWidth !== undefined ? textConfig.titleStrokeWidth : 4}
                      onChange={(e) => setTextConfig(prev => ({ ...prev, titleStrokeWidth: parseInt(e.target.value) }))}
                      className="w-full accent-orange-500 cursor-pointer"
                    />
                  </div>

                  {/* Position Controls (X & Y) */}
                  <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
                    <div>
                      <div className="flex justify-between text-slate-300 mb-1">
                        <span>Vertical Position (Y)</span>
                        <span className="font-mono">{textConfig.positionY}%</span>
                      </div>
                      <input
                        type="range"
                        min="8"
                        max="92"
                        value={textConfig.positionY}
                        onChange={(e) => setTextConfig(prev => ({ ...prev, positionY: parseInt(e.target.value) }))}
                        className="w-full accent-orange-500 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-300 mb-1">
                        <span>Horizontal Position (X)</span>
                        <span className="font-mono">{textConfig.positionX !== undefined ? textConfig.positionX : 50}%</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="90"
                        value={textConfig.positionX !== undefined ? textConfig.positionX : 50}
                        onChange={(e) => setTextConfig(prev => ({ ...prev, positionX: parseInt(e.target.value) }))}
                        className="w-full accent-orange-500 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Badge & Pill Options */}
                  <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer text-slate-300 font-semibold">
                        <input
                          type="checkbox"
                          checked={textConfig.showBadge}
                          onChange={(e) => setTextConfig(prev => ({ ...prev, showBadge: e.target.checked }))}
                          className="accent-orange-500 rounded"
                        />
                        <span>Pill Tag Badge</span>
                      </label>
                      {textConfig.showBadge && (
                        <input
                          type="text"
                          value={textConfig.badgeText}
                          onChange={(e) => setTextConfig(prev => ({ ...prev, badgeText: e.target.value }))}
                          className="w-24 px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs text-center font-bold"
                          placeholder="4K HDR"
                        />
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-900">
                      <label className="flex items-center gap-2 cursor-pointer text-slate-300 font-semibold">
                        <input
                          type="checkbox"
                          checked={textConfig.showBackgroundPill}
                          onChange={(e) => setTextConfig(prev => ({ ...prev, showBackgroundPill: e.target.checked }))}
                          className="accent-orange-500 rounded"
                        />
                        <span>Dark Backdrop Banner</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 5. Logo / Watermark Tab */}
          {activeTab === 'logo' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Watermark / Logo</h3>
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={logoConfig.enabled}
                    onChange={(e) => setLogoConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                    className="accent-orange-500 rounded"
                  />
                  <span>Enable Logo</span>
                </label>
              </div>

              <input
                type="file"
                ref={logoInputRef}
                onChange={handleLogoUpload}
                accept="image/png,image/svg+xml,image/webp"
                className="hidden"
              />

              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 p-3 bg-slate-950 border border-dashed border-slate-700 hover:border-orange-500 rounded-2xl text-xs font-bold text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4 text-orange-400" />
                <span>{logoConfig.imageSrc ? 'Change Logo Image' : 'Upload PNG / Transparent Logo'}</span>
              </button>

              {logoConfig.enabled && logoConfig.imageSrc && (
                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3.5 text-xs">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5">Placement</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'top-left', label: 'Top Left' },
                        { id: 'center-top', label: 'Top Center' },
                        { id: 'top-right', label: 'Top Right' },
                        { id: 'bottom-left', label: 'Bottom Left' },
                        { id: 'center-bottom', label: 'Bottom Center' },
                        { id: 'bottom-right', label: 'Bottom Right' }
                      ].map((pos) => (
                        <button
                          key={pos.id}
                          type="button"
                          onClick={() => setLogoConfig(prev => ({ ...prev, position: pos.id }))}
                          className={`p-2 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer text-center ${
                            logoConfig.position === pos.id
                              ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {pos.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-300 mb-1">
                      <span>Logo Scale (Proportional)</span>
                      <span className="font-mono text-orange-400 font-bold">{logoConfig.scale}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="50"
                      value={logoConfig.scale}
                      onChange={(e) => setLogoConfig(prev => ({ ...prev, scale: parseInt(e.target.value) }))}
                      className="w-full accent-orange-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-300 mb-1">
                      <span>Edge Margin</span>
                      <span className="font-mono text-slate-400">{logoConfig.margin || 4}%</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="12"
                      value={logoConfig.margin || 4}
                      onChange={(e) => setLogoConfig(prev => ({ ...prev, margin: parseInt(e.target.value) }))}
                      className="w-full accent-orange-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-300 mb-1">
                      <span>Opacity</span>
                      <span className="font-mono text-slate-400">{logoConfig.opacity}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={logoConfig.opacity}
                      onChange={(e) => setLogoConfig(prev => ({ ...prev, opacity: parseInt(e.target.value) }))}
                      className="w-full accent-orange-500 cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
