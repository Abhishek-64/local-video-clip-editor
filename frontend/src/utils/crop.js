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
    targetAspect = 2560 / 1080;
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
  // 1. If mode is 'original', strictly preserve 100% of source video dimensions
  if (mode === 'original') {
    return { width: makeEven(sourceWidth), height: makeEven(sourceHeight) };
  }

  // Detect if source media is Ultra HD 4K or 2K 1440p
  const maxSrcDim = Math.max(sourceWidth || 1920, sourceHeight || 1080);
  const isSource4K = maxSrcDim >= 3840;
  const isSource1440p = maxSrcDim >= 2560 && !isSource4K;

  // Resolve 'original' resolution quality to the best native tier for the chosen platform aspect ratio
  const effectiveResolution = (resolution === 'original')
    ? (isSource4K ? '4k' : isSource1440p ? '1440p' : '1080p')
    : resolution;

  // 2. Standard resolutions adhering to official Meta (Instagram & Facebook), YouTube, and TikTok specs
  if (mode === '9:16') {
    // Instagram Reels / Stories, Facebook Reels, YouTube Shorts, TikTok
    switch (effectiveResolution) {
      case '720p':
        return { width: 720, height: 1280 };
      case '1440p':
        return { width: 1440, height: 2560 };
      case '4k':
        return { width: 2160, height: 3840 };
      case '1080p':
      default:
        return { width: 1080, height: 1920 };
    }
  } else if (mode === '1:1') {
    // Instagram Feed Square, Facebook Feed Square, LinkedIn
    switch (effectiveResolution) {
      case '720p':
        return { width: 720, height: 720 };
      case '1440p':
        return { width: 1440, height: 1440 };
      case '4k':
        return { width: 2160, height: 2160 };
      case '1080p':
      default:
        return { width: 1080, height: 1080 };
    }
  } else if (mode === '4:5') {
    // Instagram Portrait Feed (Optimal 4:5), Facebook Feed Portrait
    switch (effectiveResolution) {
      case '720p':
        return { width: 720, height: 900 };
      case '1440p':
        return { width: 1440, height: 1800 };
      case '4k':
        return { width: 2160, height: 2700 };
      case '1080p':
      default:
        return { width: 1080, height: 1350 };
    }
  } else if (mode === '21:9') {
    // YouTube Ultrawide Cinema Banner (64:27 / 2560×1080)
    switch (effectiveResolution) {
      case '720p':
        return { width: 1680, height: 720 };
      case '1440p':
        return { width: 3440, height: 1440 };
      case '4k':
        return { width: 5120, height: 2160 };
      case '1080p':
      default:
        return { width: 2560, height: 1080 };
    }
  } else if (mode === 'custom') {
    // Custom aspect ratio resolution scaling
    const targetH = effectiveResolution === '720p' ? 720 : effectiveResolution === '1440p' ? 1440 : effectiveResolution === '4k' ? 2160 : 1080;
    const targetW = Math.round(targetH * (customAspect || 1));
    return { width: makeEven(targetW), height: makeEven(targetH) };
  } else {
    // 16:9 YouTube Standard Landscape Video, Facebook Landscape Video
    switch (effectiveResolution) {
      case '720p':
        return { width: 1280, height: 720 };
      case '1440p':
        return { width: 2560, height: 1440 };
      case '4k':
        return { width: 3840, height: 2160 };
      case '1080p':
      default:
        return { width: 1920, height: 1080 };
    }
  }
}

function makeEven(val) {
  const rounded = Math.round(val);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}
