/**
 * Timeline to Source Frame Mapper & Multi-Clip Scheduler
 * Maps deterministic timeline timestamps to exact source video timestamps across
 * single clips, multiple clips, cuts, trims, and playback speed variations.
 */

export class ExportTimelineMapper {
  /**
   * @param {Object} options
   * @param {Array<{startTime: number, endTime: number}>} [options.segments]
   * @param {number} [options.startTime=0]
   * @param {number} [options.endTime=0]
   * @param {number} [options.playbackSpeed=1.0]
   * @param {number} [options.fps=30]
   */
  constructor({
    segments = null,
    startTime = 0,
    endTime = 0,
    playbackSpeed = 1.0,
    fps = 30
  } = {}) {
    this.playbackSpeed = playbackSpeed > 0 ? playbackSpeed : 1.0;
    this.fps = fps > 0 ? fps : 30;

    // Filter valid segments
    const rawSegments = (segments && segments.length > 0)
      ? segments.filter((s) => (s.endTime - s.startTime) > 0.05)
      : [{ startTime: startTime || 0, endTime: endTime || 0 }];

    this.intervals = [];
    let cumulativeTime = 0;

    for (let i = 0; i < rawSegments.length; i++) {
      const seg = rawSegments[i];
      const segDuration = Math.max(0, seg.endTime - seg.startTime);
      // Timeline duration adjusted by speed
      const timelineDuration = segDuration / this.playbackSpeed;

      this.intervals.push({
        index: i,
        sourceStart: seg.startTime,
        sourceEnd: seg.endTime,
        sourceDuration: segDuration,
        timelineStart: cumulativeTime,
        timelineEnd: cumulativeTime + timelineDuration,
        timelineDuration
      });

      cumulativeTime += timelineDuration;
    }

    this.totalDuration = Math.max(0.1, cumulativeTime);
    this.totalFrames = Math.max(1, Math.round(this.totalDuration * this.fps));
    this.frameIntervalSec = 1 / this.fps;
    this.frameIntervalUs = Math.round(this.frameIntervalSec * 1_000_000);
  }

  /**
   * Map timeline timestamp (in seconds) to exact source video timestamp (in seconds)
   * @param {number} timelineTimeSec
   * @returns {{ sourceTimeSec: number, clipIndex: number, clipElapsedSec: number, isClipBoundary: boolean }}
   */
  mapTimelineTimeToSource(timelineTimeSec) {
    if (this.intervals.length === 0) {
      return { sourceTimeSec: 0, clipIndex: 0, clipElapsedSec: 0, isClipBoundary: false };
    }

    // Clamp within total duration
    const clampedTime = Math.max(0, Math.min(this.totalDuration, timelineTimeSec));

    for (let i = 0; i < this.intervals.length; i++) {
      const interval = this.intervals[i];
      if (clampedTime >= interval.timelineStart && clampedTime < interval.timelineEnd) {
        const offsetInInterval = clampedTime - interval.timelineStart;
        const sourceOffset = offsetInInterval * this.playbackSpeed;
        const sourceTime = Math.min(interval.sourceEnd, interval.sourceStart + sourceOffset);
        const isClipBoundary = offsetInInterval < this.frameIntervalSec;

        return {
          sourceTimeSec: sourceTime,
          clipIndex: i,
          clipElapsedSec: offsetInInterval,
          isClipBoundary
        };
      }
    }

    // Past last interval: return end of last interval
    const last = this.intervals[this.intervals.length - 1];
    return {
      sourceTimeSec: last.sourceEnd,
      clipIndex: this.intervals.length - 1,
      clipElapsedSec: last.timelineDuration,
      isClipBoundary: false
    };
  }

  /**
   * Get deterministic frame timing for frame index
   * @param {number} frameIdx
   * @returns {{ timelineTimeSec: number, timestampUs: number, sourceTimeSec: number, sourceTimeUs: number, clipIndex: number }}
   */
  getFrameInfo(frameIdx) {
    const timelineTimeSec = frameIdx * this.frameIntervalSec;
    const timestampUs = Math.round(timelineTimeSec * 1_000_000);
    const mapped = this.mapTimelineTimeToSource(timelineTimeSec);
    const sourceTimeUs = Math.round(mapped.sourceTimeSec * 1_000_000);

    return {
      frameIdx,
      timelineTimeSec,
      timestampUs,
      durationUs: this.frameIntervalUs,
      sourceTimeSec: mapped.sourceTimeSec,
      sourceTimeUs,
      clipIndex: mapped.clipIndex,
      clipElapsedSec: mapped.clipElapsedSec,
      isClipBoundary: mapped.isClipBoundary
    };
  }
}
