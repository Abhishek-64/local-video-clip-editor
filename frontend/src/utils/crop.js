/**
 * Calculate source crop window (sx, sy, sWidth, sHeight) and target destination dimensions (dx, dy, dWidth, dHeight)
 * based on source video dimensions, target aspect ratio mode, fill mode, manual adjustments, and face coordinates.
 *
 * @param {Object} params
 * @param {number} params.sourceWidth
 * @param {number} params.sourceHeight
 * @param {string} params.mode - 'original' | '9:16' | '16:9' | '1:1' | '4:5' | '21:9' | 'custom'
 * @param {string} [params.fillMode='fill'] - 'fill' (zoom-to-cover full screen, no black bars) | 'fit' (letterbox/pillarbox)
 * @param {number} [params.manualX=0] - offset in pixels (-200 to 200)
 * @param {number} [params.manualY=0] - offset in pixels (-200 to 200)
 * @param {number} [params.customWidth=100] - custom crop box width in % (10 to 100)
 * @param {number} [params.customHeight=100] - custom crop box height in % (10 to 100)
 * @param {number} [params.zoom=1] - zoom scale factor (0.8 to 3.0)
 * @param {Object|null} [params.faceCenter=null] - { x: 0..1, y: 0..1 } normalized face center
 * @param {string} [params.resolution='1080p']
 * @returns {Object} { sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight, canvasWidth, canvasHeight, targetAspect }
 */
export function calculateCropDimensions({
  sourceWidth = 1920,
  sourceHeight = 1080,
  mode = '9:16',
  fillMode = 'fit',
  manualX = 0,
  manualY = 0,
  customWidth = 100,
  customHeight = 100,
  zoom = 1,
  faceCenter = null,
  resolution = '1080p'
}) {
  const srcAspect = sourceWidth / sourceHeight;
  let targetAspect = srcAspect;

  if (mode === '9:16') {
    targetAspect = 9 / 16;
  } else if (mode === '16:9') {
    targetAspect = 16 / 9;
  } else if (mode === '1:1') {
    targetAspect = 1 / 1;
  } else if (mode === '4:5') {
    targetAspect = 4 / 5;
  } else if (mode === '21:9') {
    targetAspect = 21 / 9;
  } else if (mode === 'custom') {
    const w = (customWidth / 100) * sourceWidth;
    const h = (customHeight / 100) * sourceHeight;
    targetAspect = (w && h) ? w / h : srcAspect;
  }

  // Target canvas resolution
  const targetDims = getTargetResolutionDimensions(mode, resolution, sourceWidth, sourceHeight, targetAspect);
  const canvasWidth = targetDims.width;
  const canvasHeight = targetDims.height;

  let sx = 0;
  let sy = 0;
  let sWidth = sourceWidth;
  let sHeight = sourceHeight;

  let dx = 0;
  let dy = 0;
  let dWidth = canvasWidth;
  let dHeight = canvasHeight;

  if (mode === 'original') {
    sWidth = sourceWidth;
    sHeight = sourceHeight;
    sx = 0;
    sy = 0;
    dx = 0;
    dy = 0;
    dWidth = canvasWidth;
    dHeight = canvasHeight;
  } else if (mode === 'custom') {
    // ── MANUAL CUSTOM FREEFORM CROP ──
    const clampedZoom = Math.max(0.5, Math.min(3.0, zoom || 1));
    sWidth = Math.max(50, ((customWidth || 100) / 100) * sourceWidth / clampedZoom);
    sHeight = Math.max(50, ((customHeight || 100) / 100) * sourceHeight / clampedZoom);

    let centerX = sourceWidth / 2 + (manualX / 200) * (sourceWidth * 0.45);
    let centerY = sourceHeight / 2 + (manualY / 200) * (sourceHeight * 0.45);

    sx = Math.max(0, Math.min(sourceWidth - sWidth, centerX - sWidth / 2));
    sy = Math.max(0, Math.min(sourceHeight - sHeight, centerY - sHeight / 2));

    dx = 0;
    dy = 0;
    dWidth = canvasWidth;
    dHeight = canvasHeight;
  } else if (fillMode === 'fill') {
    // ── FILL / COVER MODE: Zoom-to-fill the entire target frame (no black bars) ──
    if (srcAspect > targetAspect) {
      sHeight = sourceHeight;
      sWidth = sHeight * targetAspect;
    } else {
      sWidth = sourceWidth;
      sHeight = sourceWidth / targetAspect;
    }

    const clampedZoom = Math.max(0.5, Math.min(3.0, zoom || 1));
    sWidth = sWidth / clampedZoom;
    sHeight = sHeight / clampedZoom;

    let centerX = sourceWidth / 2;
    let centerY = sourceHeight / 2;

    if (faceCenter && typeof faceCenter.x === 'number' && typeof faceCenter.y === 'number') {
      centerX = faceCenter.x * sourceWidth;
      centerY = faceCenter.y * sourceHeight;
    }

    const offsetX = (manualX / 200) * (sourceWidth * 0.45);
    const offsetY = (manualY / 200) * (sourceHeight * 0.45);

    centerX += offsetX;
    centerY += offsetY;

    sx = centerX - sWidth / 2;
    sy = centerY - sHeight / 2;

    if (sWidth <= sourceWidth) {
      sx = Math.max(0, Math.min(sourceWidth - sWidth, sx));
    } else {
      sx = (sourceWidth - sWidth) / 2;
    }

    if (sHeight <= sourceHeight) {
      sy = Math.max(0, Math.min(sourceHeight - sHeight, sy));
    } else {
      sy = (sourceHeight - sHeight) / 2;
    }

    dx = 0;
    dy = 0;
    dWidth = canvasWidth;
    dHeight = canvasHeight;
  } else {
    // ── FIT / LETTERBOX MODE: Preserve whole source video inside target canvas ──
    sWidth = sourceWidth;
    sHeight = sourceHeight;
    sx = 0;
    sy = 0;

    if (srcAspect > targetAspect) {
      dWidth = canvasWidth;
      dHeight = Math.round(canvasWidth / srcAspect);
      dx = 0;
      dy = Math.round((canvasHeight - dHeight) / 2);
    } else {
      dHeight = canvasHeight;
      dWidth = Math.round(canvasHeight * srcAspect);
      dy = 0;
      dx = Math.round((canvasWidth - dWidth) / 2);
    }
  }

  return {
    sx,
    sy,
    sWidth,
    sHeight,
    dx,
    dy,
    dWidth,
    dHeight,
    canvasWidth,
    canvasHeight,
    targetAspect
  };
}

/**
 * Get output width and height for a given mode and resolution quality preset
 */
export function getTargetResolutionDimensions(mode, resolution = '1080p', sourceWidth = 1920, sourceHeight = 1080, customAspect = 1) {
  if (resolution === 'original') {
    if (mode === '9:16') {
      const h = sourceHeight;
      const w = Math.round((h * 9) / 16);
      return { width: makeEven(w), height: makeEven(h) };
    }
    if (mode === '1:1') {
      const side = Math.min(sourceWidth, sourceHeight);
      return { width: makeEven(side), height: makeEven(side) };
    }
    if (mode === '16:9') {
      const w = sourceWidth;
      const h = Math.round((w * 9) / 16);
      return { width: makeEven(w), height: makeEven(h) };
    }
    if (mode === '4:5') {
      const w = sourceWidth;
      const h = Math.round((w * 5) / 4);
      return { width: makeEven(w), height: makeEven(h) };
    }
    if (mode === '21:9') {
      const h = sourceHeight;
      const w = Math.round((h * 21) / 9);
      return { width: makeEven(w), height: makeEven(h) };
    }
    if (mode === 'custom') {
      const h = sourceHeight;
      const w = Math.round(h * customAspect);
      return { width: makeEven(w), height: makeEven(h) };
    }
    return { width: makeEven(sourceWidth), height: makeEven(sourceHeight) };
  }

  // Standard resolutions based on platform presets
  if (mode === '9:16') {
    // Instagram Reel / YouTube Shorts / TikTok
    switch (resolution) {
      case '720p':
        return { width: 720, height: 1280 };
      case '1080p':
        return { width: 1080, height: 1920 };
      case '1440p':
        return { width: 1440, height: 2560 };
      case '4k':
        return { width: 2160, height: 3840 };
      default:
        return { width: 1080, height: 1920 };
    }
  } else if (mode === '1:1') {
    // Instagram Feed Post Square
    switch (resolution) {
      case '720p':
        return { width: 720, height: 720 };
      case '1080p':
        return { width: 1080, height: 1080 };
      case '1440p':
        return { width: 1440, height: 1440 };
      case '4k':
        return { width: 2160, height: 2160 };
      default:
        return { width: 1080, height: 1080 };
    }
  } else if (mode === '4:5') {
    // Instagram Feed Portrait Post
    switch (resolution) {
      case '720p':
        return { width: 720, height: 900 };
      case '1080p':
        return { width: 1080, height: 1350 };
      case '1440p':
        return { width: 1440, height: 1800 };
      case '4k':
        return { width: 2160, height: 2700 };
      default:
        return { width: 1080, height: 1350 };
    }
  } else if (mode === '21:9') {
    // YouTube Ultrawide / Cinematic Banner
    switch (resolution) {
      case '720p':
        return { width: 1280, height: 548 };
      case '1080p':
        return { width: 2560, height: 1080 };
      case '1440p':
        return { width: 3440, height: 1440 };
      case '4k':
        return { width: 5120, height: 2160 };
      default:
        return { width: 2560, height: 1080 };
    }
  } else if (mode === 'custom') {
    // Custom aspect ratio resolution scaling
    const targetH = resolution === '720p' ? 720 : resolution === '1440p' ? 1440 : resolution === '4k' ? 2160 : 1080;
    const targetW = Math.round(targetH * (customAspect || 1));
    return { width: makeEven(targetW), height: makeEven(targetH) };
  } else {
    // 16:9 YouTube Standard Landscape Video
    switch (resolution) {
      case '720p':
        return { width: 1280, height: 720 };
      case '1080p':
        return { width: 1920, height: 1080 };
      case '1440p':
        return { width: 2560, height: 1440 };
      case '4k':
        return { width: 3840, height: 2160 };
      default:
        return { width: 1920, height: 1080 };
    }
  }
}

function makeEven(val) {
  const rounded = Math.round(val);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}
