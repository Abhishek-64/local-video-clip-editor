/**
 * GPU-First Export Renderer (WebGL / WebGL2 / 2D Canvas)
 * Supports OffscreenCanvas and standard HTMLCanvasElement.
 * Features low-resolution background blur optimization, cached text layout,
 * deterministic caption timing, cached logo bitmap, and smoothed face tracking.
 */

import { calculateCropDimensions } from '../../utils/crop';
import { detectFaceInFrame, FaceTrackerSmoother } from '../faceDetectionService';

const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_image;
  
  uniform float u_brightness; // 1.0 default
  uniform float u_contrast;   // 1.0 default
  uniform float u_saturation; // 1.0 default
  uniform float u_sepia;      // 0.0 default
  uniform float u_grayscale;  // 0.0 default
  uniform float u_invert;     // 0.0 default
  uniform float u_fadeAlpha;  // 0.0 default (black overlay)

  void main() {
    vec4 color = texture2D(u_image, v_texCoord);

    if (u_invert > 0.0) {
      color.rgb = mix(color.rgb, vec3(1.0) - color.rgb, u_invert);
    }

    color.rgb = color.rgb * u_brightness;
    color.rgb = (color.rgb - 0.5) * u_contrast + 0.5;

    float lum = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    if (u_grayscale > 0.0) {
      color.rgb = mix(color.rgb, vec3(lum), u_grayscale);
    }

    if (u_saturation != 1.0) {
      color.rgb = mix(vec3(lum), color.rgb, u_saturation);
    }

    if (u_sepia > 0.0) {
      vec3 sepiaColor;
      sepiaColor.r = dot(color.rgb, vec3(0.393, 0.769, 0.189));
      sepiaColor.g = dot(color.rgb, vec3(0.349, 0.686, 0.168));
      sepiaColor.b = dot(color.rgb, vec3(0.272, 0.534, 0.131));
      color.rgb = mix(color.rgb, sepiaColor, u_sepia);
    }

    if (u_fadeAlpha > 0.0) {
      color.rgb = mix(color.rgb, vec3(0.0), u_fadeAlpha);
    }

    gl_FragColor = vec4(clamp(color.rgb, 0.0, 1.0), color.a);
  }
`;

export class ExportRenderer {
  /**
   * @param {Object} options
   * @param {number} options.width
   * @param {number} options.height
   * @param {HTMLCanvasElement|OffscreenCanvas} [options.canvas]
   */
  constructor({ width, height, canvas = null }) {
    this.width = width;
    this.height = height;

    // Create canvas or OffscreenCanvas
    if (canvas) {
      this.canvas = canvas;
      this.canvas.width = width;
      this.canvas.height = height;
    } else if (typeof OffscreenCanvas !== 'undefined') {
      this.canvas = new OffscreenCanvas(width, height);
    } else {
      this.canvas = document.createElement('canvas');
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.ctx2d = null;
    this.gl = null;
    this.program = null;
    this.texture = null;
    this.positionBuffer = null;
    this.texCoordBuffer = null;
    this.uniforms = {};

    // Low-resolution blur buffer (initialized once, reused every frame)
    this.blurCanvas = null;
    this.blurCtx = null;

    // Text layout measurement cache
    this.textLayoutCache = new Map();

    // Face tracking state
    this.faceSmoother = new FaceTrackerSmoother(0.12);
    this.cachedFaceCenter = null;
    this.lastFaceDetectFrame = -999;

    // Preloaded assets
    this.logoBitmap = null;
    this.bgBitmap = null;

    // Invariant crop cache
    this._cachedCropBox = null;
    this._cachedCropKey = null;

    // Static overlay cache (text + logo pre-rendered once for the entire clip)
    this.staticOverlayCanvas = null;
    this.staticOverlayCtx = null;
    this.hasStaticOverlay = false;

    this.initRenderer();
  }

  initRenderer() {
    // 1. Initialize low-resolution blur buffer (Section 13)
    // 256x455 for portrait or 320x180 for landscape
    const blurW = this.width > this.height ? 320 : 256;
    const blurH = this.width > this.height ? 180 : 455;

    if (typeof OffscreenCanvas !== 'undefined') {
      this.blurCanvas = new OffscreenCanvas(blurW, blurH);
    } else {
      this.blurCanvas = document.createElement('canvas');
      this.blurCanvas.width = blurW;
      this.blurCanvas.height = blurH;
    }
    this.blurCtx = this.blurCanvas.getContext('2d', { alpha: false, willReadFrequently: false });

    // 2. Setup Primary Canvas: Try 2D context first if 2D text overlay needed, or WebGL with 2D fallback
    // Since 2D context supports filter = blur and drawImage with VideoFrame natively in all modern browsers,
    // we use an ultra-fast high-performance 2D context on the main canvas with desynchronized: true
    try {
      this.ctx2d = this.canvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
        willReadFrequently: false
      });
    } catch (e) {
      this.ctx2d = null;
    }
  }

  /**
   * Preload and cache logo image / bitmap
   */
  async setLogoSource(logoSettings) {
    if (!logoSettings?.enabled) {
      this.logoBitmap = null;
      return;
    }

    try {
      if (logoSettings.imageBitmap) {
        this.logoBitmap = logoSettings.imageBitmap;
      } else if (logoSettings.url) {
        if (typeof fetch !== 'undefined') {
          const res = await fetch(logoSettings.url);
          const blob = await res.blob();
          if (typeof createImageBitmap !== 'undefined') {
            this.logoBitmap = await createImageBitmap(blob);
          } else {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = logoSettings.url;
            await new Promise((r) => { img.onload = r; img.onerror = r; });
            this.logoBitmap = img;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load logo source for export:', e);
      this.logoBitmap = null;
    }
  }

  /**
   * Preload and cache custom background image
   */
  async setBackgroundSource(bgSettings) {
    if (bgSettings?.type !== 'image' || !bgSettings?.imageUrl) {
      this.bgBitmap = null;
      return;
    }

    try {
      if (bgSettings.imageBitmap) {
        this.bgBitmap = bgSettings.imageBitmap;
      } else if (bgSettings.imageUrl) {
        const res = await fetch(bgSettings.imageUrl);
        const blob = await res.blob();
        if (typeof createImageBitmap !== 'undefined') {
          this.bgBitmap = await createImageBitmap(blob);
        } else {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = bgSettings.imageUrl;
          await new Promise((r) => { img.onload = r; img.onerror = r; });
          this.bgBitmap = img;
        }
      }
    } catch (e) {
      console.warn('Failed to load custom background image for export:', e);
      this.bgBitmap = null;
    }
  }

  /**
   * Pre-render static text overlays and logo onto an OffscreenCanvas layer.
   * If there are no dynamic or time-varying overlays, this static layer can be composited
   * with a single drawImage() per frame instead of re-measuring and re-drawing invariant text/logo.
   */
  prepareStaticOverlay(settings, partNumber = 1) {
    const { text = {}, logo = {} } = settings || {};
    const hasText = text.enabled || (text.extraTexts && text.extraTexts.length > 0);
    const hasLogo = logo.enabled && this.logoBitmap;

    if (!hasText && !hasLogo) {
      this.hasStaticOverlay = false;
      this.staticOverlayCanvas = null;
      this.staticOverlayCtx = null;
      return;
    }

    try {
      if (typeof OffscreenCanvas !== 'undefined') {
        this.staticOverlayCanvas = new OffscreenCanvas(this.width, this.height);
      } else {
        this.staticOverlayCanvas = document.createElement('canvas');
        this.staticOverlayCanvas.width = this.width;
        this.staticOverlayCanvas.height = this.height;
      }
      this.staticOverlayCtx = this.staticOverlayCanvas.getContext('2d', { alpha: true, willReadFrequently: false });

      if (hasText) {
        this.renderTextOverlayFast(this.staticOverlayCtx, this.width, this.height, text, partNumber);
      }
      if (hasLogo) {
        this.renderLogoFast(this.staticOverlayCtx, this.width, this.height, logo, this.logoBitmap);
      }

      this.hasStaticOverlay = true;
    } catch (e) {
      console.warn('Failed to pre-render static overlay:', e);
      this.hasStaticOverlay = false;
      this.staticOverlayCanvas = null;
      this.staticOverlayCtx = null;
    }
  }

  /**
   * Auto-wrap and fit text with caching
   */
  wrapAndFitTextCached(ctx, text, maxAllowedWidth, initialFontSize, font, minFontSize = 16) {
    const cacheKey = `${text}_${font}_${initialFontSize}_${Math.round(maxAllowedWidth)}`;
    if (this.textLayoutCache.has(cacheKey)) {
      return this.textLayoutCache.get(cacheKey);
    }

    let currentFontSize = initialFontSize;
    const paragraphs = String(text).split('\n');

    const getWrappedLines = (fontSize) => {
      ctx.font = `bold ${fontSize}px ${font}`;
      const wrapped = [];

      paragraphs.forEach((p) => {
        const words = p.split(' ');
        let currentLine = '';

        words.forEach((word) => {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          const metrics = ctx.measureText(testLine);

          if (metrics.width > maxAllowedWidth && currentLine) {
            wrapped.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        });

        if (currentLine) {
          wrapped.push(currentLine);
        }
      });

      return wrapped.length > 0 ? wrapped : [''];
    };

    let lines = getWrappedLines(currentFontSize);
    let maxW = 0;
    lines.forEach((l) => {
      const w = ctx.measureText(l).width;
      if (w > maxW) maxW = w;
    });

    while (maxW > maxAllowedWidth && currentFontSize > minFontSize) {
      currentFontSize -= 2;
      lines = getWrappedLines(currentFontSize);
      maxW = 0;
      lines.forEach((l) => {
        const w = ctx.measureText(l).width;
        if (w > maxW) maxW = w;
      });
    }

    const result = {
      lines,
      fontSize: currentFontSize,
      maxLineWidth: maxW,
      lineHeight: Math.round(currentFontSize * 1.28)
    };

    // Limit cache size to 100 entries
    if (this.textLayoutCache.size > 100) {
      const firstKey = this.textLayoutCache.keys().next().value;
      this.textLayoutCache.delete(firstKey);
    }
    this.textLayoutCache.set(cacheKey, result);

    return result;
  }

  /**
   * Render single video frame and composite all layers onto canvas
   *
   * @param {Object} params
   * @param {VideoFrame} params.sourceVideoFrame
   * @param {number} params.frameIdx
   * @param {number} params.timelineTimeSec
   * @param {number} params.clipElapsedSec
   * @param {number} params.clipDurationSec
   * @param {number} params.partNumber
   * @param {Object} params.settings
   * @returns {VideoFrame}
   */
  async renderFrame({
    sourceVideoFrame,
    frameIdx,
    timelineTimeSec,
    clipElapsedSec,
    clipDurationSec,
    partNumber = 1,
    settings = {}
  }) {
    const {
      crop = {},
      background = {},
      text = {},
      logo = {},
      effects = {}
    } = settings;

    const ctx = this.ctx2d;
    const canvasWidth = this.width;
    const canvasHeight = this.height;

    const srcW = sourceVideoFrame.displayWidth || sourceVideoFrame.codedWidth || 1920;
    const srcH = sourceVideoFrame.displayHeight || sourceVideoFrame.codedHeight || 1080;

    // 1. Face tracking analysis on low-resolution raster (run periodically every 15 frames)
    if (crop.faceTracking && frameIdx - this.lastFaceDetectFrame >= 15) {
      this.lastFaceDetectFrame = frameIdx;
      try {
        const face = await detectFaceInFrame(sourceVideoFrame);
        if (face) {
          this.cachedFaceCenter = this.faceSmoother.update(face);
        }
      } catch (e) {}
    }

    // 2. Crop Window Calculation (with caching for invariant crop)
    let cropBox;
    if (!crop.faceTracking) {
      const cropKey = `${srcW}_${srcH}_${crop.mode || '9:16'}_${crop.fillMode || 'fit'}_${crop.x || 0}_${crop.y || 0}_${crop.customWidth ?? 60}_${crop.customHeight ?? 85}_${crop.zoom || 1}`;
      if (this._cachedCropKey === cropKey && this._cachedCropBox) {
        cropBox = this._cachedCropBox;
      } else {
        cropBox = calculateCropDimensions({
          sourceWidth: srcW,
          sourceHeight: srcH,
          mode: crop.mode || '9:16',
          fillMode: crop.fillMode || 'fit',
          manualX: crop.x || 0,
          manualY: crop.y || 0,
          customWidth: crop.customWidth ?? 60,
          customHeight: crop.customHeight ?? 85,
          zoom: crop.zoom || 1,
          faceCenter: null,
          resolution: '1080p'
        });
        this._cachedCropBox = cropBox;
        this._cachedCropKey = cropKey;
      }
    } else {
      cropBox = calculateCropDimensions({
        sourceWidth: srcW,
        sourceHeight: srcH,
        mode: crop.mode || '9:16',
        fillMode: crop.fillMode || 'fit',
        manualX: crop.x || 0,
        manualY: crop.y || 0,
        customWidth: crop.customWidth ?? 60,
        customHeight: crop.customHeight ?? 85,
        zoom: crop.zoom || 1,
        faceCenter: this.cachedFaceCenter,
        resolution: '1080p'
      });
    }

    // 3. Clear Canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 4. Low-Resolution Background Blur Layer (Section 13)
    const isLetterboxed = (crop.fillMode !== 'fill') && (crop.mode !== 'original');

    if (isLetterboxed && background.type === 'blur-video' && this.blurCtx) {
      const bgOpacity = (background.opacity ?? 65) / 100;
      const bgBlurPx = Math.max(2, Math.round((background.blur || 20) * 0.25));

      // Draw downscaled to blur buffer and apply small blur
      this.blurCtx.save();
      this.blurCtx.filter = `blur(${bgBlurPx}px) brightness(${bgOpacity})`;
      this.blurCtx.drawImage(sourceVideoFrame, 0, 0, this.blurCanvas.width, this.blurCanvas.height);
      this.blurCtx.restore();

      // Upscale blurred buffer to full canvas (smooth bilinear filtering)
      ctx.drawImage(this.blurCanvas, 0, 0, canvasWidth, canvasHeight);
    } else if (isLetterboxed && background.type === 'image' && this.bgBitmap) {
      ctx.drawImage(this.bgBitmap, 0, 0, canvasWidth, canvasHeight);
    } else if (isLetterboxed && background.color) {
      ctx.fillStyle = background.color;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    // 5. Main Sharp Foreground Video Frame
    ctx.save();
    const hasCustomFilters =
      (effects.brightness ?? 100) !== 100 ||
      (effects.contrast ?? 100) !== 100 ||
      (effects.saturation ?? 100) !== 100 ||
      (effects.sepia ?? 0) > 0 ||
      (effects.grayscale ?? 0) > 0 ||
      (effects.invert ?? 0) > 0;

    if (hasCustomFilters) {
      ctx.filter = `brightness(${(effects.brightness ?? 100) / 100}) contrast(${(effects.contrast ?? 100) / 100}) saturate(${(effects.saturation ?? 100) / 100}) sepia(${(effects.sepia ?? 0) / 100}) grayscale(${(effects.grayscale ?? 0) / 100}) invert(${(effects.invert ?? 0) / 100})`;
    }

    ctx.drawImage(
      sourceVideoFrame,
      cropBox.sx,
      cropBox.sy,
      cropBox.sWidth,
      cropBox.sHeight,
      cropBox.dx,
      cropBox.dy,
      cropBox.dWidth,
      cropBox.dHeight
    );
    ctx.restore();

    // 6. Fade Transitions
    const clipRemaining = clipDurationSec - clipElapsedSec;
    if (effects.fadeIn && clipElapsedSec < (effects.fadeInDuration || 0.5)) {
      const alpha = 1.0 - (clipElapsedSec / (effects.fadeInDuration || 0.5));
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0, Math.min(1, alpha))})`;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    } else if (effects.fadeOut && clipRemaining < (effects.fadeOutDuration || 0.5)) {
      const alpha = 1.0 - (clipRemaining / (effects.fadeOutDuration || 0.5));
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0, Math.min(1, alpha))})`;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    // 7. Text & Overlay Rendering (use pre-rendered static layer if available, otherwise fast dynamic fallback)
    if (this.hasStaticOverlay && this.staticOverlayCanvas) {
      ctx.drawImage(this.staticOverlayCanvas, 0, 0);
    } else {
      if (text.enabled || (text.extraTexts && text.extraTexts.length > 0)) {
        this.renderTextOverlayFast(ctx, canvasWidth, canvasHeight, text, partNumber);
      }
      if (logo.enabled && this.logoBitmap) {
        this.renderLogoFast(ctx, canvasWidth, canvasHeight, logo, this.logoBitmap);
      }
    }

    // 9. Wrap Canvas into Output VideoFrame
    const timestampUs = Math.round(timelineTimeSec * 1_000_000);
    const durationUs = Math.round((1 / (settings.export?.fps || 30)) * 1_000_000);

    const outputFrame = new VideoFrame(this.canvas, {
      timestamp: timestampUs,
      duration: durationUs
    });

    return outputFrame;
  }

  /**
   * Fast text overlay rendering using layout cache
   */
  renderTextOverlayFast(ctx, canvasWidth, canvasHeight, textSettings, partNumber) {
    if (!textSettings) return;

    const minDim = Math.min(canvasWidth, canvasHeight);
    const scale = minDim / 540;
    const maxAllowedTextWidth = canvasWidth * 0.86;

    const hexToRgba = (colorStr, alphaPercent = 75) => {
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

    const transformText = (str, transform) => {
      if (!str) return '';
      if (transform === 'uppercase') return str.toUpperCase();
      if (transform === 'lowercase') return str.toLowerCase();
      if (transform === 'capitalize') return str.replace(/\b\w/g, c => c.toUpperCase());
      return str;
    };

    if (textSettings.enabled) {
      const {
        movieName = 'My Movie',
        template = '{movie} - Part {part}',
        zeroPad = true,
        font = 'Inter, sans-serif',
        fontSize = 28,
        color = '#ffffff',
        opacity = 100,
        outline = true,
        outlineColor = '#000000',
        outlineThickness = 3,
        bgEnabled = false,
        bgColor = 'rgba(0, 0, 0, 0.75)',
        bgOpacity = 75,
        bgPadding = 8,
        bgRadius = 8,
        position = 'top-center',
        customY = null,
        customX = null,
        textTransform = 'none',
        fontStyle = 'normal',
        letterSpacing = 0,
        displayMode = 'all'
      } = textSettings;

      const shouldDisplay = displayMode === 'all'
        || (displayMode === 'first' && partNumber === 1)
        || (displayMode === 'last' && textSettings.isLastPart);

      if (shouldDisplay) {
        const formattedPart = zeroPad ? String(partNumber).padStart(2, '0') : String(partNumber);
        const displayText = textSettings.text || movieName || 'My Movie';
        let fullText = (template || '{movie} - Part {part}')
          .replace(/\{movie\}/gi, displayText)
          .replace(/\{title\}/gi, displayText)
          .replace(/\{text\}/gi, displayText)
          .replace(/\{part\}/gi, formattedPart);

        fullText = transformText(fullText, textTransform);

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, (opacity ?? 100) / 100));

        const initialScaledFontSize = Math.max(2, Math.round(fontSize * scale));
        const layout = this.wrapAndFitTextCached(ctx, fullText, maxAllowedTextWidth, initialScaledFontSize, font, 2);

        const stylePrefix = fontStyle === 'italic' ? 'italic ' : '';
        ctx.font = `${stylePrefix}bold ${layout.fontSize}px ${font}`;
        ctx.textBaseline = 'middle';

        if (letterSpacing && 'letterSpacing' in ctx) {
          try { ctx.letterSpacing = `${letterSpacing * scale}px`; } catch (e) {}
        }

        const isTop = position.startsWith('top');
        const isBottom = position.startsWith('bottom');
        const isLeft = position.endsWith('left');
        const isRight = position.endsWith('right');

        let x = canvasWidth / 2;
        let textAlign = 'center';
        if (typeof customX === 'number') {
          x = (customX / 100) * canvasWidth;
        } else if (isLeft) {
          x = canvasWidth * 0.07;
          textAlign = 'left';
        } else if (isRight) {
          x = canvasWidth * 0.93;
          textAlign = 'right';
        }

        let y = canvasHeight * 0.10;
        if (typeof customY === 'number') {
          y = (customY / 100) * canvasHeight;
        } else if (isTop) {
          y = canvasHeight * 0.10;
        } else if (isBottom) {
          y = canvasHeight * 0.90;
        } else {
          y = canvasHeight * 0.50;
        }

        ctx.textAlign = textAlign;
        const totalTextHeight = layout.lines.length * layout.lineHeight;

        if (bgEnabled) {
          const pad = Math.max(2, bgPadding ?? 8);
          const padX = (pad + 4) * scale;
          const padY = pad * scale;
          const radius = (bgRadius ?? 8) * scale;
          let boxX = x - layout.maxLineWidth / 2 - padX;
          if (textAlign === 'left') boxX = x - padX;
          else if (textAlign === 'right') boxX = x - layout.maxLineWidth - padX;

          const boxY = y - totalTextHeight / 2 - padY;
          const boxW = layout.maxLineWidth + padX * 2;
          const boxH = totalTextHeight + padY * 2;

          ctx.fillStyle = hexToRgba(bgColor, bgOpacity);
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(boxX, boxY, boxW, boxH, radius);
          } else {
            ctx.rect(boxX, boxY, boxW, boxH);
          }
          ctx.fill();
        }

        const startY = y - ((layout.lines.length - 1) * layout.lineHeight) / 2;
        layout.lines.forEach((line, idx) => {
          const lineY = startY + idx * layout.lineHeight;
          if (outline) {
            ctx.strokeStyle = outlineColor || '#000000';
            ctx.lineWidth = Math.max(2, (outlineThickness || 3) * scale);
            ctx.lineJoin = 'round';
            ctx.strokeText(line, x, lineY);
          }
          ctx.fillStyle = color || '#ffffff';
          ctx.fillText(line, x, lineY);
        });
        ctx.restore();
      }
    }

    // Extra Text Overlays
    if (textSettings.extraTexts && Array.isArray(textSettings.extraTexts)) {
      textSettings.extraTexts.forEach((extra) => {
        if (!extra.enabled || !extra.text) return;

        const shouldDisplayExtra = (extra.displayMode || 'all') === 'all'
          || (extra.displayMode === 'first' && partNumber === 1)
          || (extra.displayMode === 'last' && textSettings.isLastPart);

        if (!shouldDisplayExtra) return;

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, (extra.opacity ?? 100) / 100));

        const extraFont = extra.font || 'Inter, sans-serif';
        const initialExtraFontSize = Math.max(2, Math.round((extra.fontSize || 22) * scale));
        const extraTransformedText = transformText(extra.text, extra.textTransform || 'none');
        const layout = this.wrapAndFitTextCached(ctx, extraTransformedText, maxAllowedTextWidth, initialExtraFontSize, extraFont, 2);

        const stylePrefix = extra.fontStyle === 'italic' ? 'italic ' : '';
        ctx.font = `${stylePrefix}bold ${layout.fontSize}px ${extraFont}`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';

        if (extra.letterSpacing && 'letterSpacing' in ctx) {
          try { ctx.letterSpacing = `${extra.letterSpacing * scale}px`; } catch (e) {}
        }

        const extraX = ((extra.customX ?? 50) / 100) * canvasWidth;
        const extraY = ((extra.customY ?? 88) / 100) * canvasHeight;
        const totalTextHeight = layout.lines.length * layout.lineHeight;

        if (extra.bgEnabled) {
          const pad = Math.max(2, extra.bgPadding ?? 6);
          const padX = (pad + 4) * scale;
          const padY = pad * scale;
          const radius = (extra.bgRadius ?? 8) * scale;
          const boxX = extraX - layout.maxLineWidth / 2 - padX;
          const boxY = extraY - totalTextHeight / 2 - padY;
          const boxW = layout.maxLineWidth + padX * 2;
          const boxH = totalTextHeight + padY * 2;

          ctx.fillStyle = hexToRgba(extra.bgColor || '#000000', extra.bgOpacity ?? 75);
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(boxX, boxY, boxW, boxH, radius);
          } else {
            ctx.rect(boxX, boxY, boxW, boxH);
          }
          ctx.fill();
        }

        const extraStartY = extraY - ((layout.lines.length - 1) * layout.lineHeight) / 2;
        layout.lines.forEach((line, idx) => {
          const lineY = extraStartY + idx * layout.lineHeight;
          if (extra.outline !== false) {
            ctx.strokeStyle = extra.outlineColor || '#000000';
            ctx.lineWidth = Math.max(2, (extra.outlineThickness || 3) * scale);
            ctx.lineJoin = 'round';
            ctx.strokeText(line, extraX, lineY);
          }
          ctx.fillStyle = extra.color || '#ffffff';
          ctx.fillText(line, extraX, lineY);
        });
        ctx.restore();
      });
    }
  }

  /**
   * Fast logo watermark rendering
   */
  renderLogoFast(ctx, canvasWidth, canvasHeight, logoSettings, logoBitmap) {
    const { size = 60, opacity = 80, position = 'top-right' } = logoSettings;

    ctx.save();
    const minDim = Math.min(canvasWidth, canvasHeight);
    const scale = minDim / 540;
    const scaledWidth = Math.max(20, Math.round((size || 60) * scale));
    const naturalW = logoBitmap.width || 1;
    const naturalH = logoBitmap.height || 1;
    const aspect = naturalH / naturalW;
    const scaledHeight = Math.round(scaledWidth * aspect);

    const marginX = canvasWidth * 0.04;
    const marginY = canvasHeight * 0.04;

    let x = canvasWidth - scaledWidth - marginX;
    let y = marginY;

    if (typeof logoSettings.customX === 'number' && typeof logoSettings.customY === 'number') {
      x = (logoSettings.customX / 100) * canvasWidth - scaledWidth / 2;
      y = (logoSettings.customY / 100) * canvasHeight - scaledHeight / 2;
    } else if (position === 'top-left') {
      x = marginX;
      y = marginY;
    } else if (position === 'top-right') {
      x = canvasWidth - scaledWidth - marginX;
      y = marginY;
    } else if (position === 'bottom-left') {
      x = marginX;
      y = canvasHeight - scaledHeight - marginY;
    } else if (position === 'bottom-right') {
      x = canvasWidth - scaledWidth - marginX;
      y = canvasHeight - scaledHeight - marginY;
    } else if (position === 'center') {
      x = (canvasWidth - scaledWidth) / 2;
      y = (canvasHeight - scaledHeight) / 2;
    }

    ctx.globalAlpha = Math.max(0.05, Math.min(1.0, (opacity || 80) / 100));
    ctx.drawImage(logoBitmap, x, y, scaledWidth, scaledHeight);
    ctx.restore();
  }

  /**
   * Clean up all allocated resources and bitmaps
   */
  destroy() {
    this.textLayoutCache.clear();
    this._cachedCropBox = null;
    this._cachedCropKey = null;
    this.staticOverlayCanvas = null;
    this.staticOverlayCtx = null;
    this.hasStaticOverlay = false;
    if (this.logoBitmap && typeof this.logoBitmap.close === 'function') {
      try { this.logoBitmap.close(); } catch (e) {}
    }
    if (this.bgBitmap && typeof this.bgBitmap.close === 'function') {
      try { this.bgBitmap.close(); } catch (e) {}
    }
    this.logoBitmap = null;
    this.bgBitmap = null;
    this.blurCanvas = null;
    this.blurCtx = null;
    this.ctx2d = null;
    this.canvas = null;
  }
}
