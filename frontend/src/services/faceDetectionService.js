/**
 * Local Browser-Based Face Detection & Smooth Speaker Tracking
 * Runs 100% locally in browser without external server calls.
 */

let nativeDetector = null;
if (typeof window !== 'undefined' && 'FaceDetector' in window) {
  try {
    nativeDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 3 });
  } catch (e) {
    nativeDetector = null;
  }
}

// Reusable low-res canvas for face detection
let analysisCanvas = null;
let analysisCtx = null;

function getAnalysisCanvas() {
  if (!analysisCanvas) {
    analysisCanvas = document.createElement('canvas');
    analysisCanvas.width = 160;
    analysisCanvas.height = 90;
    analysisCtx = analysisCanvas.getContext('2d', { willReadFrequently: true });
  }
  return { canvas: analysisCanvas, ctx: analysisCtx };
}

/**
 * Detect normalized face center { x: 0..1, y: 0..1 } in a video frame
 * @param {HTMLVideoElement|HTMLCanvasElement} sourceElement
 * @returns {Promise<{ x: number, y: number, width: number, height: number } | null>}
 */
export async function detectFaceInFrame(sourceElement) {
  if (!sourceElement || (sourceElement.videoWidth === 0 && sourceElement.width === 0)) {
    return null;
  }

  // 1. Try Native Browser FaceDetector API first if available
  if (nativeDetector) {
    try {
      const faces = await nativeDetector.detect(sourceElement);
      if (faces && faces.length > 0) {
        // Pick primary face (largest bounding box)
        let primaryFace = faces[0];
        let maxArea = primaryFace.boundingBox.width * primaryFace.boundingBox.height;

        for (let i = 1; i < faces.length; i++) {
          const area = faces[i].boundingBox.width * faces[i].boundingBox.height;
          if (area > maxArea) {
            maxArea = area;
            primaryFace = faces[i];
          }
        }

        const srcW = sourceElement.videoWidth || sourceElement.width;
        const srcH = sourceElement.videoHeight || sourceElement.height;
        const bb = primaryFace.boundingBox;

        return {
          x: (bb.x + bb.width / 2) / srcW,
          y: (bb.y + bb.height / 2) / srcH,
          width: bb.width / srcW,
          height: bb.height / srcH
        };
      }
    } catch (e) {
      // Fall through to fallback detector
    }
  }

  // 2. High-performance fallback: skin-tone & luminance centroid analysis on 160x90 raster
  try {
    const { canvas, ctx } = getAnalysisCanvas();
    ctx.drawImage(sourceElement, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    let totalWeight = 0;
    let weightedX = 0;
    let weightedY = 0;

    const width = canvas.width;
    const height = canvas.height;

    // Scan pixels for human skin chrominance (YCbCr / normalized RGB range)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Fast skin chrominance check (R > G > B and sensible range)
        if (r > 60 && g > 40 && b > 20 && r > g && (r - g) >= 15 && (r - b) >= 15 && Math.abs(r - g) <= 120) {
          // Weight pixels higher towards the upper/middle half (where heads usually are in video)
          const verticalBias = 1 - Math.abs(y / height - 0.35);
          const weight = verticalBias * (r / 255);

          weightedX += x * weight;
          weightedY += y * weight;
          totalWeight += weight;
        }
      }
    }

    if (totalWeight > 50) {
      const avgX = weightedX / totalWeight / width;
      const avgY = weightedY / totalWeight / height;

      // Check if coordinates are reasonable
      if (avgX >= 0.1 && avgX <= 0.9 && avgY >= 0.1 && avgY <= 0.9) {
        return {
          x: avgX,
          y: avgY,
          width: 0.25,
          height: 0.35
        };
      }
    }
  } catch (e) {
    // Return null on canvas security or processing error
  }

  return null;
}

/**
 * Exponential Moving Average (EMA) smoother for face tracking coordinates
 */
export class FaceTrackerSmoother {
  constructor(smoothingFactor = 0.12) {
    this.alpha = smoothingFactor; // 0.05 to 0.2 (lower = smoother, higher = more responsive)
    this.currentX = 0.5;
    this.currentY = 0.45;
    this.hasTarget = false;
  }

  update(detectedFace) {
    if (detectedFace && typeof detectedFace.x === 'number') {
      if (!this.hasTarget) {
        this.currentX = detectedFace.x;
        this.currentY = detectedFace.y;
        this.hasTarget = true;
      } else {
        // Apply EMA filter
        this.currentX = this.currentX * (1 - this.alpha) + detectedFace.x * this.alpha;
        this.currentY = this.currentY * (1 - this.alpha) + detectedFace.y * this.alpha;
      }
    } else {
      // If lost, slowly drift back towards center (0.5, 0.5)
      this.currentX = this.currentX * 0.97 + 0.5 * 0.03;
      this.currentY = this.currentY * 0.97 + 0.45 * 0.03;
    }

    return {
      x: this.currentX,
      y: this.currentY
    };
  }

  reset() {
    this.currentX = 0.5;
    this.currentY = 0.45;
    this.hasTarget = false;
  }
}
