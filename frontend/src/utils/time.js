/**
 * Format seconds to HH:MM:SS or MM:SS
 * @param {number} totalSeconds
 * @param {boolean} forceHours
 * @returns {string}
 */
export function formatTime(totalSeconds, forceHours = false) {
  if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const pad = (n) => String(n).padStart(2, '0');

  if (hours > 0 || forceHours) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Format milliseconds to time with ms
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatTimeWithMs(totalSeconds) {
  if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00.00';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const ms = Math.floor((totalSeconds % 1) * 100);

  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(minutes)}:${pad(seconds)}.${pad(ms)}`;
}

/**
 * Parse time string HH:MM:SS or MM:SS to seconds
 * @param {string} str
 * @returns {number}
 */
export function parseTimeToSeconds(str) {
  if (!str) return 0;
  const parts = str.split(':').map(Number);
  if (parts.some(isNaN)) return 0;

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return Number(str) || 0;
}

/**
 * Parse flexible time string to seconds:
 * Handles: '01:30', '1:20:30', '1h 30m 10s', '5m', '45s', '90.5'
 */
export function parseFlexibleTime(input) {
  if (!input && input !== 0) return null;
  const str = String(input).trim().toLowerCase();
  if (!str) return null;

  // Case 1: Natural units like 1h 20m 30s, 5m 30s, 45s
  const hourMatch = str.match(/(\d+(?:\.\d+)?)\s*h(?:ours?|r)?/);
  const minMatch = str.match(/(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?/);
  const secMatch = str.match(/(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?/);

  if (hourMatch || minMatch || secMatch) {
    let total = 0;
    if (hourMatch) total += parseFloat(hourMatch[1]) * 3600;
    if (minMatch) total += parseFloat(minMatch[1]) * 60;
    if (secMatch) total += parseFloat(secMatch[1]);
    return isNaN(total) ? null : Math.round(total * 10) / 10;
  }

  // Case 2: Colon separated: HH:MM:SS or MM:SS or MM:SS.ms
  if (str.includes(':')) {
    const parts = str.split(':').map(p => parseFloat(p.trim()));
    if (parts.some(isNaN)) return null;

    if (parts.length === 3) {
      return Math.round((parts[0] * 3600 + parts[1] * 60 + parts[2]) * 10) / 10;
    } else if (parts.length === 2) {
      return Math.round((parts[0] * 60 + parts[1]) * 10) / 10;
    }
  }

  // Case 3: Raw numeric value
  const num = parseFloat(str);
  if (!isNaN(num) && num >= 0) {
    return Math.round(num * 10) / 10;
  }

  return null;
}

/**
 * Parse string containing one or multiple timestamps (separated by comma, semicolon, space, newline)
 */
export function parseMultipleTimestamps(rawInput, maxDuration = Infinity) {
  if (!rawInput || typeof rawInput !== 'string') return [];

  const trimmed = rawInput.trim();
  if (!trimmed) return [];

  const rawChunks = trimmed.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  const candidateStrings = [];

  for (const chunk of rawChunks) {
    // If chunk contains multiple colon times or pure numbers (e.g. "00:30 01:15 02:45" or "30 60 90")
    if (chunk.includes(' ') && !chunk.match(/[hms]/i)) {
      candidateStrings.push(...chunk.split(/\s+/).map(s => s.trim()).filter(Boolean));
    } else if (chunk.includes(' ') && chunk.match(/\b\d+\s*[hms]\b/i)) {
      // Check if chunk is a single compound timestamp like "1h 20m 30s" vs multiple like "30s 60s 90s"
      // Count unit occurrences
      const hCount = (chunk.match(/h/gi) || []).length;
      const mCount = (chunk.match(/m/gi) || []).length;
      const sCount = (chunk.match(/s/gi) || []).length;

      if (hCount <= 1 && mCount <= 1 && sCount <= 1) {
        // It's a single compound timestamp like "1h 20m 30s"
        candidateStrings.push(chunk);
      } else {
        // Multiple timestamps like "30s 60s 90s" or "1m 2m 5m"
        // Match each distinct time segment
        const matches = chunk.match(/\d+(?:\.\d+)?\s*(?:h(?:ours?|r)?|m(?:in(?:ute)?s?)?|s(?:ec(?:ond)?s?)?)/gi);
        if (matches && matches.length > 0) {
          candidateStrings.push(...matches);
        } else {
          candidateStrings.push(chunk);
        }
      }
    } else {
      candidateStrings.push(chunk);
    }
  }

  const secondsSet = new Set();
  for (const str of candidateStrings) {
    const secs = parseFlexibleTime(str);
    if (secs !== null && secs > 0.1 && secs < maxDuration - 0.1) {
      secondsSet.add(secs);
    }
  }

  return Array.from(secondsSet).sort((a, b) => a - b);
}

/**
 * Split parts at an array of timestamps simultaneously
 */
export function splitPartsAtTimestamps(partsList = [], totalDuration = 0, timestamps = []) {
  if (!totalDuration || totalDuration <= 0 || !timestamps || timestamps.length === 0) {
    return partsList;
  }

  const validCuts = [...new Set(timestamps)]
    .filter(t => t > 0.1 && t < totalDuration - 0.1)
    .sort((a, b) => a - b);

  if (validCuts.length === 0) return partsList;

  let currentParts = partsList && partsList.length > 0 ? [...partsList] : [
    {
      id: `part-1-${Date.now()}`,
      partNumber: 1,
      title: 'Full Video',
      startTime: 0,
      endTime: totalDuration,
      duration: totalDuration,
      isDeleted: false
    }
  ];

  for (const cutPoint of validCuts) {
    const targetIdx = currentParts.findIndex(
      p => cutPoint > p.startTime + 0.1 && cutPoint < p.endTime - 0.1
    );

    if (targetIdx !== -1) {
      const originalPart = currentParts[targetIdx];
      const originalEnd = originalPart.endTime;

      const firstSeg = {
        ...originalPart,
        endTime: cutPoint,
        duration: Math.max(0, Math.round((cutPoint - originalPart.startTime) * 10) / 10)
      };

      const secondSeg = {
        id: `part-split-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        partNumber: targetIdx + 2,
        title: originalPart.title ? `${originalPart.title} (Pt 2)` : '',
        startTime: cutPoint,
        endTime: originalEnd,
        duration: Math.max(0, Math.round((originalEnd - cutPoint) * 10) / 10),
        isDeleted: Boolean(originalPart.isDeleted)
      };

      currentParts[targetIdx] = firstSeg;
      currentParts.splice(targetIdx + 1, 0, secondSeg);
    }
  }

  // Renumber active parts sequentially
  let activeCounter = 1;
  return currentParts.map(p => {
    if (p.isDeleted) return p;
    const u = { ...p, partNumber: activeCounter };
    activeCounter++;
    return u;
  });
}

/**
 * Splits active segments of a video into parts, preserving deleted/cut segments.
 * @param {Array} partsList - Current list of segments/parts.
 * @param {number} totalDuration - Full duration of the video.
 * @param {string} mode - 'count' or 'duration'.
 * @param {number} val - Desired count (e.g. 2, 4) or duration (e.g. 15, 30, 60 seconds).
 * @param {Object} defaultRange - Optional { startTime, endTime } to use if partsList is empty.
 * @returns {Array} New list of segments.
 */
export function splitKeptParts(partsList = [], totalDuration = 0, mode = 'count', val = 2, defaultRange = null) {
  if (!totalDuration || totalDuration <= 0) return [];

  let listToUse = partsList && partsList.length > 0 ? partsList : [];
  if (listToUse.length === 0) {
    const range = defaultRange || { startTime: 0, endTime: totalDuration };
    listToUse = [
      {
        id: `part-1-${Date.now()}`,
        partNumber: 1,
        title: 'Full Video',
        startTime: range.startTime,
        endTime: range.endTime,
        duration: Math.round((range.endTime - range.startTime) * 10) / 10,
        isDeleted: false
      }
    ];
  }

  // 1. Sort segments by startTime
  const sorted = [...listToUse].sort((a, b) => (a.startTime || 0) - (b.startTime || 0));

  // 2. Consolidate contiguous adjacent kept segments to form true kept blocks.
  // This is critical so going from small seconds (e.g. 15s) to big seconds (e.g. 60s)
  // or vice-versa always divides from the true underlying continuous kept blocks!
  const consolidated = [];
  sorted.forEach(seg => {
    if (seg.isDeleted) {
      consolidated.push({
        id: seg.id || `part-cut-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: seg.title || '',
        startTime: seg.startTime,
        endTime: seg.endTime,
        duration: Math.max(0, Math.round((seg.endTime - seg.startTime) * 10) / 10),
        isDeleted: true
      });
    } else {
      const last = consolidated[consolidated.length - 1];
      if (last && !last.isDeleted && Math.abs(last.endTime - seg.startTime) < 0.08) {
        // Merge contiguous kept segment
        last.endTime = Math.max(last.endTime, seg.endTime);
        last.duration = Math.max(0, Math.round((last.endTime - last.startTime) * 10) / 10);
      } else {
        consolidated.push({
          id: seg.id || `part-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          title: seg.title || '',
          startTime: seg.startTime,
          endTime: seg.endTime,
          duration: Math.max(0, Math.round((seg.endTime - seg.startTime) * 10) / 10),
          isDeleted: false
        });
      }
    }
  });

  const keptBlocks = consolidated.filter(p => !p.isDeleted);
  if (keptBlocks.length === 0) {
    return consolidated;
  }

  const totalActiveDuration = keptBlocks.reduce((sum, p) => sum + Math.max(0, p.endTime - p.startTime), 0);
  if (totalActiveDuration <= 0.05) {
    return consolidated;
  }

  const newParts = [];

  if (mode === 'duration') {
    const segSec = Math.max(1, Number(val) || 60);

    consolidated.forEach(block => {
      if (block.isDeleted) {
        newParts.push({ ...block });
      } else {
        const blockDur = block.endTime - block.startTime;
        if (blockDur <= segSec + 0.1) {
          newParts.push({
            id: `part-seg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            title: block.title || '',
            startTime: block.startTime,
            endTime: block.endTime,
            duration: Math.max(0, Math.round(blockDur * 10) / 10),
            isDeleted: false
          });
        } else {
          const numSubClips = Math.ceil(blockDur / segSec);
          for (let s = 0; s < numSubClips; s++) {
            const clipStart = Math.round((block.startTime + s * segSec) * 10) / 10;
            const clipEnd = Math.min(block.endTime, Math.round((clipStart + segSec) * 10) / 10);
            if (clipEnd - clipStart > 0.05) {
              newParts.push({
                id: `part-seg-${Date.now()}-${s}-${Math.random().toString(36).substring(2, 6)}`,
                title: block.title ? `${block.title}` : '',
                startTime: clipStart,
                endTime: clipEnd,
                duration: Math.max(0, Math.round((clipEnd - clipStart) * 10) / 10),
                isDeleted: false
              });
            }
          }
        }
      }
    });
  } else {
    // mode === 'count'
    const targetParts = Math.max(1, Number(val) || 2);
    const targetPartDuration = totalActiveDuration / targetParts;

    // Find split points in active continuous time
    const activeSplitPoints = [];
    for (let i = 1; i < targetParts; i++) {
      activeSplitPoints.push(i * targetPartDuration);
    }

    // Map active continuous time to real timeline split points
    const realSplitPoints = [];
    activeSplitPoints.forEach(activeTime => {
      let accumulated = 0;
      for (let i = 0; i < keptBlocks.length; i++) {
        const seg = keptBlocks[i];
        const segDur = seg.endTime - seg.startTime;
        if (accumulated + segDur >= activeTime - 0.001) {
          const diff = activeTime - accumulated;
          const realTime = seg.startTime + diff;
          realSplitPoints.push(Math.round(realTime * 10) / 10);
          break;
        }
        accumulated += segDur;
      }
    });

    consolidated.forEach(block => {
      if (block.isDeleted) {
        newParts.push({ ...block });
      } else {
        const splitsInBlock = realSplitPoints.filter(sp => sp > block.startTime + 0.15 && sp < block.endTime - 0.15);
        splitsInBlock.sort((a, b) => a - b);

        let curStart = block.startTime;
        splitsInBlock.forEach(sp => {
          newParts.push({
            id: `part-split-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            title: block.title || '',
            startTime: curStart,
            endTime: sp,
            duration: Math.max(0, Math.round((sp - curStart) * 10) / 10),
            isDeleted: false
          });
          curStart = sp;
        });

        newParts.push({
          id: `part-split-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          title: block.title || '',
          startTime: curStart,
          endTime: block.endTime,
          duration: Math.max(0, Math.round((block.endTime - curStart) * 10) / 10),
          isDeleted: false
        });
      }
    });
  }

  // Sort by startTime
  newParts.sort((a, b) => a.startTime - b.startTime);

  // Renumber kept parts sequentially
  let counter = 1;
  return newParts.map(p => {
    if (p.isDeleted) return p;
    const updated = { ...p, partNumber: counter };
    counter++;
    return updated;
  });
}

