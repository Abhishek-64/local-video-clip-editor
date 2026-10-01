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

  const placement = resolveVideoPlacement({
    sourceWidth,
    sourceHeight,
    stageWidth: canvasWidth,
    stageHeight: canvasHeight,
    mode,
    fillMode,
    zoom,
    x: manualX,
    y: manualY,
    customWidth,
    customHeight,
    faceCenter
  });

  return {
    sx: placement.sourceX,
    sy: placement.sourceY,
    sWidth: placement.sourceWidth,
    sHeight: placement.sourceHeight,
    dx: placement.destinationX,
    dy: placement.destinationY,
    dWidth: placement.destinationWidth,
    dHeight: placement.destinationHeight,
    canvasWidth,
    canvasHeight,
    targetAspect,
    letterbox: placement.letterbox,
    letterboxPct: placement.letterboxPct
  };
}

/**
 * Resolves deterministic source and destination rectangles for video placement,
 * shared between Preview and Export pipelines.
 *
 * @param {Object} params
 * @param {number} params.sourceWidth - Video natural width (e.g. 1920)
 * @param {number} params.sourceHeight - Video natural height (e.g. 1080)
 * @param {number} params.stageWidth - Target stage or canvas width (e.g. 1080 or preview px)
 * @param {number} params.stageHeight - Target stage or canvas height (e.g. 1920 or preview px)
 * @param {string} [params.mode='9:16'] - 'original' | '9:16' | '16:9' | '1:1' | '4:5' | '21:9' | 'custom'
 * @param {string} [params.fillMode='fit'] - 'fit' | 'fill'
 * @param {number} [params.zoom=1] - Zoom factor (0.5 to 3.0)
 * @param {number} [params.x=0] - Horizontal pan offset (-200 to 200)
 * @param {number} [params.y=0] - Vertical pan offset (-200 to 200)
 * @param {number} [params.customWidth=100] - Custom crop width in %
 * @param {number} [params.customHeight=100] - Custom crop height in %
 * @param {Object|null} [params.faceCenter=null]
 * @returns {Object} {
 *   sourceX, sourceY, sourceWidth, sourceHeight,
 *   destinationX, destinationY, destinationWidth, destinationHeight,
 *   letterbox: { top, bottom, left, right },
 *   letterboxPct: { topPct, bottomPct, leftPct, rightPct }
 * }
 */
export function resolveVideoPlacement({
  sourceWidth = 1920,
  sourceHeight = 1080,
  stageWidth = 1080,
  stageHeight = 1920,
  mode = '9:16',
  fillMode = 'fit',
  zoom = 1,
  x = 0,
  y = 0,
  customWidth = 100,
  customHeight = 100,
  faceCenter = null
}) {
  const srcAspect = sourceWidth / sourceHeight;
  const stageAspect = stageWidth / stageHeight;

  let sourceX = 0;
  let sourceY = 0;
  let sWidth = sourceWidth;
  let sHeight = sourceHeight;

  let destinationX = 0;
  let destinationY = 0;
  let destinationWidth = stageWidth;
  let destinationHeight = stageHeight;

  let letterbox = { top: 0, bottom: 0, left: 0, right: 0 };
  let letterboxPct = { topPct: 0, bottomPct: 0, leftPct: 0, rightPct: 0 };

  if (mode === 'original') {
    sWidth = sourceWidth;
    sHeight = sourceHeight;
    sourceX = 0;
    sourceY = 0;
    destinationX = 0;
    destinationY = 0;
    destinationWidth = stageWidth;
    destinationHeight = stageHeight;
  } else if (mode === 'custom') {
    const clampedZoom = Math.max(0.5, Math.min(3.0, zoom || 1));
    sWidth = Math.max(50, ((customWidth || 100) / 100) * sourceWidth / clampedZoom);
    sHeight = Math.max(50, ((customHeight || 100) / 100) * sourceHeight / clampedZoom);

    let centerX = sourceWidth / 2 + (x / 200) * (sourceWidth * 0.45);
    let centerY = sourceHeight / 2 + (y / 200) * (sourceHeight * 0.45);

    sourceX = Math.max(0, Math.min(sourceWidth - sWidth, centerX - sWidth / 2));
    sourceY = Math.max(0, Math.min(sourceHeight - sHeight, centerY - sHeight / 2));

    destinationX = 0;
    destinationY = 0;
    destinationWidth = stageWidth;
    destinationHeight = stageHeight;
  } else if (fillMode === 'fill') {
    if (srcAspect > stageAspect) {
      sHeight = sourceHeight;
      sWidth = sHeight * stageAspect;
    } else {
      sWidth = sourceWidth;
      sHeight = sourceWidth / stageAspect;
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

    const offsetX = (x / 200) * (sourceWidth * 0.45);
    const offsetY = (y / 200) * (sourceHeight * 0.45);

    centerX += offsetX;
    centerY += offsetY;

    sourceX = centerX - sWidth / 2;
    sourceY = centerY - sHeight / 2;

    if (sWidth <= sourceWidth) {
      sourceX = Math.max(0, Math.min(sourceWidth - sWidth, sourceX));
    } else {
      sourceX = (sourceWidth - sWidth) / 2;
    }

    if (sHeight <= sourceHeight) {
      sourceY = Math.max(0, Math.min(sourceHeight - sHeight, sourceY));
    } else {
      sourceY = (sourceHeight - sHeight) / 2;
    }

    destinationX = 0;
    destinationY = 0;
    destinationWidth = stageWidth;
    destinationHeight = stageHeight;
  } else {
    // FIT mode (letterbox or pillarbox)
    sWidth = sourceWidth;
    sHeight = sourceHeight;
    sourceX = 0;
    sourceY = 0;

    if (srcAspect > stageAspect) {
      // Wider than stage -> letterbox top & bottom
      destinationWidth = stageWidth;
      destinationHeight = Math.round(stageWidth / srcAspect);
      destinationX = 0;
      destinationY = Math.round((stageHeight - destinationHeight) / 2);

      const topSlot = destinationY;
      const bottomSlot = Math.max(0, stageHeight - (destinationY + destinationHeight));
      letterbox = { top: topSlot, bottom: bottomSlot, left: 0, right: 0 };
      letterboxPct = {
        topPct: (topSlot / stageHeight) * 100,
        bottomPct: (bottomSlot / stageHeight) * 100,
        leftPct: 0,
        rightPct: 0
      };
    } else {
      // Taller than stage -> pillarbox left & right
      destinationHeight = stageHeight;
      destinationWidth = Math.round(stageHeight * srcAspect);
      destinationY = 0;
      destinationX = Math.round((stageWidth - destinationWidth) / 2);

      const leftSlot = destinationX;
      const rightSlot = Math.max(0, stageWidth - (destinationX + destinationWidth));
      letterbox = { top: 0, bottom: 0, left: leftSlot, right: rightSlot };
      letterboxPct = {
        topPct: 0,
        bottomPct: 0,
        leftPct: (leftSlot / stageWidth) * 100,
        rightPct: (rightSlot / stageWidth) * 100
      };
    }
  }

  return {
    sourceX,
    sourceY,
    sourceWidth: sWidth,
    sourceHeight: sHeight,
    destinationX,
    destinationY,
    destinationWidth,
    destinationHeight,
    letterbox,
    letterboxPct
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
