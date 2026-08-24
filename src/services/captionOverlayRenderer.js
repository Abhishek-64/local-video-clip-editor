/**
 * Caption Overlay Renderer
 * Deterministically renders synchronized captions with word-level highlighting,
 * viral shorts typography, and 9:16 safe-area positioning onto 2D Canvas contexts.
 */

/**
 * Render captions onto a 2D canvas context for a specific timestamp
 *
 * @param {CanvasRenderingContext2D} ctx - 2D rendering context
 * @param {number} canvasWidth - Target canvas width
 * @param {number} canvasHeight - Target canvas height
 * @param {Object} captionSettings - Captions configuration and segments
 * @param {number} currentVideoTime - Current video playhead / frame time in seconds
 */
export function renderCaptionOverlay(
  ctx,
  canvasWidth,
  canvasHeight,
  captionSettings = {},
  currentVideoTime = 0
) {
  if (!captionSettings || !captionSettings.enabled) return;
  const captions = captionSettings.captions;
  if (!captions || captions.length === 0) return;

  // 1. Find active caption segment for current timestamp
  const activeCaption = captions.find(
    (c) => currentVideoTime >= c.startTime - 0.05 && currentVideoTime <= c.endTime + 0.05
  );

  if (!activeCaption) return;

  const {
    style = 'bold-shorts', // 'clean' | 'bold-shorts' | 'highlight-word'
    font = 'Inter, sans-serif',
    fontSize = 32,
    color = '#ffffff',
    highlightColor = '#facc15', // Vibrant yellow for active word
    outline = true,
    outlineColor = '#000000',
    outlineThickness = 4,
    bgEnabled = false,
    bgColor = 'rgba(0, 0, 0, 0.75)',
    position = 'bottom-center',
    customX = null,
    customY = null,
    uppercase = true,
    wordsPerLine = 4
  } = captionSettings;

  ctx.save();

  const scale = canvasWidth / 540;
  const initialFontSize = Math.max(16, Math.round(fontSize * scale));
  const outlinePx = Math.max(2, Math.round(outlineThickness * scale));

  // Determine text case
  let rawText = activeCaption.text || '';
  if (style === 'bold-shorts' || style === 'highlight-word' || uppercase) {
    rawText = rawText.toUpperCase();
  }

  // Active word detection for 'highlight-word' style
  const wordsList = activeCaption.words && activeCaption.words.length > 0
    ? activeCaption.words
    : rawText.split(/\s+/).map((w, idx, arr) => {
        const dur = (activeCaption.endTime - activeCaption.startTime) / arr.length;
        return {
          word: w,
          startTime: activeCaption.startTime + idx * dur,
          endTime: activeCaption.startTime + (idx + 1) * dur
        };
      });

  const activeWordIdx = wordsList.findIndex(
    (w) => currentVideoTime >= w.startTime - 0.05 && currentVideoTime <= w.endTime + 0.05
  );

  // Layout lines of words (maximum wordsPerLine)
  const lines = [];
  let curLine = [];
  wordsList.forEach((wObj, idx) => {
    curLine.push({
      text: (style === 'bold-shorts' || style === 'highlight-word' || uppercase)
        ? wObj.word.toUpperCase()
        : wObj.word,
      isHighlighted: style === 'highlight-word' && idx === activeWordIdx,
      originalIdx: idx
    });

    if (curLine.length >= (wordsPerLine || 4)) {
      lines.push(curLine);
      curLine = [];
    }
  });

  if (curLine.length > 0) {
    lines.push(curLine);
  }

  // Set font
  ctx.font = `900 ${initialFontSize}px ${font}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  const lineHeight = Math.round(initialFontSize * 1.3);
  const totalHeight = lines.length * lineHeight;

  // Calculate X, Y coordinates with 9:16 safe-area positioning
  let x = canvasWidth / 2;
  if (typeof customX === 'number') {
    x = (customX / 100) * canvasWidth;
  }

  let y = canvasHeight * 0.80; // Safe area: 80% from top (avoids bottom Reels/Shorts buttons)
  if (typeof customY === 'number') {
    y = (customY / 100) * canvasHeight;
  } else if (position === 'top-center') {
    y = canvasHeight * 0.16;
  } else if (position === 'center') {
    y = canvasHeight * 0.50;
  } else if (position === 'bottom-center') {
    y = canvasHeight * 0.80;
  }

  // Calculate maximum line width for background pill
  let maxLineWidth = 0;
  lines.forEach((line) => {
    const lineStr = line.map((w) => w.text).join(' ');
    const metrics = ctx.measureText(lineStr);
    if (metrics.width > maxLineWidth) {
      maxLineWidth = metrics.width;
    }
  });

  // Render Background Box if enabled
  if (bgEnabled) {
    const padX = 14 * scale;
    const padY = 8 * scale;
    const boxW = maxLineWidth + padX * 2;
    const boxH = totalHeight + padY * 2;
    const boxX = x - boxW / 2;
    const boxY = y - totalHeight / 2 - padY;
    const radius = 8 * scale;

    ctx.fillStyle = bgColor || 'rgba(0, 0, 0, 0.75)';
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, radius);
    ctx.fill();
  }

  // Render Each Line with Word-by-Word Animation & Coloring
  const startY = y - (totalHeight / 2) + (lineHeight / 2);

  lines.forEach((lineWords, lineIdx) => {
    const currentLineY = startY + lineIdx * lineHeight;

    // Measure each word and spacing
    const spaceWidth = ctx.measureText(' ').width;
    const wordWidths = lineWords.map((w) => ctx.measureText(w.text).width);
    const lineTotalWidth = wordWidths.reduce((a, b) => a + b, 0) + (lineWords.length - 1) * spaceWidth;

    let wordStartX = x - (lineTotalWidth / 2);

    lineWords.forEach((wordObj, wIdx) => {
      const wWidth = wordWidths[wIdx];
      const wordCenterX = wordStartX + (wWidth / 2);

      ctx.save();

      // If active highlighted word in viral shorts style, apply glowing highlight color
      const isWordActive = wordObj.isHighlighted;
      const wordFillColor = isWordActive ? highlightColor : color;

      // Draw Outline Stroke
      if (outline) {
        ctx.strokeStyle = outlineColor || '#000000';
        ctx.lineWidth = isWordActive ? outlinePx + 2 : outlinePx;
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.strokeText(wordObj.text, wordCenterX, currentLineY);
      }

      // Draw Fill Text
      ctx.fillStyle = wordFillColor;
      ctx.fillText(wordObj.text, wordCenterX, currentLineY);

      ctx.restore();

      wordStartX += wWidth + spaceWidth;
    });
  });

  ctx.restore();
}
