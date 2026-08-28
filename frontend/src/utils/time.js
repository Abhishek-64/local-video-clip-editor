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

