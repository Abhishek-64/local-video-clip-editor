import { resolveVideoPlacement, calculateCropDimensions, getTargetResolutionDimensions } from './crop.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertClose(actual, expected, tolerance = 0.5, message = '') {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`Assertion failed: ${message} (Expected ~${expected}, got ${actual})`);
  }
}

console.log('Running Crop & Video Placement Regression Test Suite...\n');

// ── TEST 1: 16:9 → 9:16 FIT (1920×1080 into 1080×1920) ──
{
  const p = resolveVideoPlacement({
    sourceWidth: 1920,
    sourceHeight: 1080,
    stageWidth: 1080,
    stageHeight: 1920,
    mode: '9:16',
    fillMode: 'fit'
  });
  assert(p.sourceX === 0 && p.sourceY === 0, 'Test 1: sourceX/Y must be 0 for FIT');
  assert(p.sourceWidth === 1920 && p.sourceHeight === 1080, 'Test 1: entire source must be visible');
  assert(p.destinationWidth === 1080, 'Test 1: destinationWidth should equal stageWidth');
  assertClose(p.destinationHeight, 608, 1, 'Test 1: destinationHeight ~608');
  assert(p.destinationX === 0, 'Test 1: destinationX should be 0');
  assertClose(p.destinationY, 656, 1, 'Test 1: destinationY ~656 (vertically centered)');
  assertClose(p.letterbox.top, 656, 1, 'Test 1: top letterbox');
  assertClose(p.letterbox.bottom, 656, 1, 'Test 1: bottom letterbox');
  assertClose(p.letterboxPct.topPct, 34.17, 0.1, 'Test 1: top letterbox % ~34.17%');
  console.log('✓ Test 1: 16:9 → 9:16 FIT passed');
}

// ── TEST 2: 16:9 → 9:16 FILL (1920×1080 into 1080×1920) ──
{
  const p = resolveVideoPlacement({
    sourceWidth: 1920,
    sourceHeight: 1080,
    stageWidth: 1080,
    stageHeight: 1920,
    mode: '9:16',
    fillMode: 'fill'
  });
  assert(p.destinationX === 0 && p.destinationY === 0, 'Test 2: destinationX/Y should be 0 for FILL');
  assert(p.destinationWidth === 1080 && p.destinationHeight === 1920, 'Test 2: destination should fill stage');
  assertClose(p.sourceWidth, 607.5, 0.5, 'Test 2: sourceWidth ~607.5');
  assert(p.sourceHeight === 1080, 'Test 2: sourceHeight should equal 1080');
  assertClose(p.sourceX, 656.25, 0.5, 'Test 2: sourceX ~656.25 (horizontally centered)');
  assert(p.sourceY === 0, 'Test 2: sourceY should be 0');
  assert(p.letterbox.top === 0 && p.letterbox.bottom === 0, 'Test 2: no letterbox in FILL');
  console.log('✓ Test 2: 16:9 → 9:16 FILL passed');
}

// ── TEST 3: 9:16 → 16:9 FIT (1080×1920 into 1920×1080) ──
{
  const p = resolveVideoPlacement({
    sourceWidth: 1080,
    sourceHeight: 1920,
    stageWidth: 1920,
    stageHeight: 1080,
    mode: '16:9',
    fillMode: 'fit'
  });
  assert(p.sourceWidth === 1080 && p.sourceHeight === 1920, 'Test 3: full portrait source visible');
  assert(p.destinationHeight === 1080, 'Test 3: destinationHeight should equal stageHeight');
  assertClose(p.destinationWidth, 608, 1, 'Test 3: destinationWidth ~608');
  assertClose(p.destinationX, 656, 1, 'Test 3: pillarbox centered horizontally');
  assert(p.destinationY === 0, 'Test 3: destinationY should be 0');
  assertClose(p.letterbox.left, 656, 1, 'Test 3: left pillarbox');
  assertClose(p.letterbox.right, 656, 1, 'Test 3: right pillarbox');
  console.log('✓ Test 3: 9:16 → 16:9 FIT passed (pillarboxing)');
}

// ── TEST 4: 9:16 → 16:9 FILL (1080×1920 into 1920×1080) ──
{
  const p = resolveVideoPlacement({
    sourceWidth: 1080,
    sourceHeight: 1920,
    stageWidth: 1920,
    stageHeight: 1080,
    mode: '16:9',
    fillMode: 'fill'
  });
  assert(p.destinationWidth === 1920 && p.destinationHeight === 1080, 'Test 4: destination fills stage');
  assert(p.sourceWidth === 1080, 'Test 4: sourceWidth equals 1080');
  assertClose(p.sourceHeight, 607.5, 0.5, 'Test 4: sourceHeight ~607.5');
  assertClose(p.sourceY, 656.25, 0.5, 'Test 4: sourceY centered vertically');
  console.log('✓ Test 4: 9:16 → 16:9 FILL passed');
}

// ── TEST 5: 1:1 FIT (1920×1080 into 1080×1080) ──
{
  const p = resolveVideoPlacement({
    sourceWidth: 1920,
    sourceHeight: 1080,
    stageWidth: 1080,
    stageHeight: 1080,
    mode: '1:1',
    fillMode: 'fit'
  });
  assert(p.destinationWidth === 1080, 'Test 5: destinationWidth equals 1080');
  assertClose(p.destinationHeight, 608, 1, 'Test 5: destinationHeight ~608');
  assertClose(p.destinationY, 236, 1, 'Test 5: destinationY ~236');
  console.log('✓ Test 5: 1:1 FIT passed');
}

// ── TEST 6: 4:5 FIT (1920×1080 into 1080×1350) ──
{
  const p = resolveVideoPlacement({
    sourceWidth: 1920,
    sourceHeight: 1080,
    stageWidth: 1080,
    stageHeight: 1350,
    mode: '4:5',
    fillMode: 'fit'
  });
  assert(p.destinationWidth === 1080, 'Test 6: destinationWidth equals 1080');
  assertClose(p.destinationHeight, 608, 1, 'Test 6: destinationHeight ~608');
  assertClose(p.destinationY, 371, 1, 'Test 6: destinationY ~371');
  console.log('✓ Test 6: 4:5 FIT passed');
}

// ── TEST 7: ZOOM and PAN in FILL mode ──
{
  const p = resolveVideoPlacement({
    sourceWidth: 1920,
    sourceHeight: 1080,
    stageWidth: 1080,
    stageHeight: 1920,
    mode: '9:16',
    fillMode: 'fill',
    zoom: 1.5,
    x: 40,
    y: -30
  });
  assertClose(p.sourceWidth, 405, 0.5, 'Test 7: zoom reduces source crop window');
  assertClose(p.sourceHeight, 720, 0.5, 'Test 7: zoom reduces source crop window height');
  assert(p.sourceX > 656.25, 'Test 7: positive x pans right');
  assert(p.sourceY < 180, 'Test 7: negative y pans up');
  console.log('✓ Test 7: Zoom and Pan passed');
}

// ── TEST 8: FACE CENTER POSITIONING ──
{
  const p = resolveVideoPlacement({
    sourceWidth: 1920,
    sourceHeight: 1080,
    stageWidth: 1080,
    stageHeight: 1920,
    mode: '9:16',
    fillMode: 'fill',
    faceCenter: { x: 0.3, y: 0.4 }
  });
  assert(p.sourceX < 656.25, 'Test 8: faceCenter.x < 0.5 shifts crop window to the left');
  assert(p.sourceY === 0, 'Test 8: sourceY clamps to top boundary');
  console.log('✓ Test 8: Face center positioning passed');
}

// ── TEST 9: PREVIEW DIMENSIONS VS EXPORT CANVAS INVARIANCE ──
{
  const preview = resolveVideoPlacement({
    sourceWidth: 1920,
    sourceHeight: 1080,
    stageWidth: 303.75,
    stageHeight: 540,
    mode: '9:16',
    fillMode: 'fit'
  });
  const exportPlacement = resolveVideoPlacement({
    sourceWidth: 1920,
    sourceHeight: 1080,
    stageWidth: 1080,
    stageHeight: 1920,
    mode: '9:16',
    fillMode: 'fit'
  });
  assertClose(preview.letterboxPct.topPct, exportPlacement.letterboxPct.topPct, 0.15, 'Test 9: letterbox % matches across scales');
  console.log('✓ Test 9: Preview vs Export percentage invariance passed');
}

// ── TEST 10: calculateCropDimensions Output Contract ──
{
  const crop = calculateCropDimensions({
    sourceWidth: 1920,
    sourceHeight: 1080,
    mode: '9:16',
    fillMode: 'fit',
    resolution: '1080p'
  });
  assert(crop.canvasWidth === 1080 && crop.canvasHeight === 1920, 'Test 10: canvasWidth/Height 1080x1920');
  assert(crop.sx === 0 && crop.sy === 0, 'Test 10: sx/sy 0');
  assert(crop.sWidth === 1920 && crop.sHeight === 1080, 'Test 10: sWidth/sHeight 1920x1080');
  assert(crop.dx === 0, 'Test 10: dx 0');
  assertClose(crop.dy, 656, 1, 'Test 10: dy ~656');
  assert(crop.dWidth === 1080, 'Test 10: dWidth 1080');
  assertClose(crop.dHeight, 608, 1, 'Test 10: dHeight ~608');
  assert(crop.targetAspect === 9 / 16, 'Test 10: targetAspect 9/16');
  console.log('✓ Test 10: calculateCropDimensions output contract passed');
}

// ── TEST 11: Resolution presets (720p, 1080p, 1440p, 4k) ──
{
  const r720 = getTargetResolutionDimensions('9:16', '720p');
  const r1080 = getTargetResolutionDimensions('9:16', '1080p');
  const r1440 = getTargetResolutionDimensions('9:16', '1440p');
  const r4k = getTargetResolutionDimensions('9:16', '4k');

  assert(r720.width === 720 && r720.height === 1280, 'Test 11: 720p');
  assert(r1080.width === 1080 && r1080.height === 1920, 'Test 11: 1080p');
  assert(r1440.width === 1440 && r1440.height === 2560, 'Test 11: 1440p');
  assert(r4k.width === 2160 && r4k.height === 3840, 'Test 11: 4K');
  console.log('✓ Test 11: Target resolution presets passed');
}

console.log('\nAll 11 regression test suites completed successfully with 0 errors!');
