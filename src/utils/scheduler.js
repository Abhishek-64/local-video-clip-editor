/**
 * Scheduler Utility for Video Clip Queue & YouTube Uploads
 *
 * Provides functions for calculating staggered publish schedules,
 * interval presets, custom intervals, and formatting localized dates/times.
 */

export const SCHEDULE_INTERVALS = [
  { id: '15min', label: '15 Minutes', minutes: 15, seconds: 900, badge: '15m' },
  { id: '30min', label: '30 Minutes', minutes: 30, seconds: 1800, badge: '30m' },
  { id: '45min', label: '45 Minutes', minutes: 45, seconds: 2700, badge: '45m' },
  { id: '1hour', label: '1 Hour (Recommended)', minutes: 60, seconds: 3600, badge: '1h' },
  { id: '2hours', label: '2 Hours', minutes: 120, seconds: 7200, badge: '2h' },
  { id: '3hours', label: '3 Hours', minutes: 180, seconds: 10800, badge: '3h' },
  { id: '4hours', label: '4 Hours', minutes: 240, seconds: 14400, badge: '4h' },
  { id: '6hours', label: '6 Hours', minutes: 360, seconds: 21600, badge: '6h' },
  { id: '8hours', label: '8 Hours', minutes: 480, seconds: 28800, badge: '8h' },
  { id: '12hours', label: '12 Hours', minutes: 720, seconds: 43200, badge: '12h' },
  { id: '1day', label: '1 Day (24 Hours)', minutes: 1440, seconds: 86400, badge: '1d' },
  { id: '2days', label: '2 Days', minutes: 2880, seconds: 172800, badge: '2d' },
  { id: '3days', label: '3 Days', minutes: 4320, seconds: 259200, badge: '3d' },
  { id: '1week', label: '1 Week', minutes: 10080, seconds: 604800, badge: '1w' }
];

/**
 * Get interval seconds from interval ID or custom string / number of minutes
 */
export function getIntervalSeconds(intervalIdOrMinutes) {
  if (typeof intervalIdOrMinutes === 'number') {
    return Math.max(60, intervalIdOrMinutes * 60);
  }
  if (typeof intervalIdOrMinutes === 'string') {
    // Custom format: custom_90m, custom_2h, custom_1d
    if (intervalIdOrMinutes.startsWith('custom_')) {
      const match = intervalIdOrMinutes.match(/^custom_(\d+)([mhd])$/);
      if (match) {
        const val = parseInt(match[1], 10) || 1;
        const unit = match[2];
        if (unit === 'm') return val * 60;
        if (unit === 'h') return val * 3600;
        if (unit === 'd') return val * 86400;
      }
    }
    const num = parseFloat(intervalIdOrMinutes);
    if (!isNaN(num) && String(num) === intervalIdOrMinutes) {
      return Math.max(60, num * 60);
    }
  }
  const found = SCHEDULE_INTERVALS.find(i => i.id === intervalIdOrMinutes);
  return found ? found.seconds : 3600; // default 1 hour (3600s)
}

/**
 * Format interval id or custom value into human readable label
 */
export function formatIntervalLabel(intervalId) {
  if (!intervalId) return '1 Hour';
  if (intervalId.startsWith('custom_')) {
    const match = intervalId.match(/^custom_(\d+)([mhd])$/);
    if (match) {
      const val = match[1];
      const unit = match[2] === 'm' ? 'Minutes' : match[2] === 'h' ? 'Hours' : 'Days';
      return `Custom: ${val} ${unit}`;
    }
  }
  const found = SCHEDULE_INTERVALS.find(i => i.id === intervalId);
  return found ? found.label : '1 Hour';
}

/**
 * Format a Date to local ISO string format suitable for datetime-local input: YYYY-MM-DDTHH:mm
 */
export function toDateTimeLocalString(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Get default start time for scheduling:
 * Defaults to +1 hour from current time.
 */
export function getDefaultScheduleStartTime() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

/**
 * Calculate scheduled publication timestamp for a single part index (0-based or 1-based offset)
 * @param {string|Date} baseStartTime - The base start datetime
 * @param {string|number} intervalIdOrMinutes - e.g. '1hour', '30min', 'custom_90m'
 * @param {number} index - 0-based part index (0 for Part 1, 1 for Part 2, etc.)
 * @returns {string} ISO 8601 string
 */
export function calculateSingleScheduleTime(baseStartTime, intervalIdOrMinutes, index = 0) {
  const base = baseStartTime ? new Date(baseStartTime) : getDefaultScheduleStartTime();
  const validBase = isNaN(base.getTime()) ? getDefaultScheduleStartTime() : base;
  const intervalSec = getIntervalSeconds(intervalIdOrMinutes);
  const targetTime = new Date(validBase.getTime() + index * intervalSec * 1000);
  return targetTime.toISOString();
}

/**
 * Calculate array of scheduled ISO times for multiple parts
 * @param {string|Date} baseStartTime
 * @param {string|number} intervalIdOrMinutes
 * @param {number} count
 * @returns {string[]} Array of ISO strings
 */
export function calculateBatchScheduleTimes(baseStartTime, intervalIdOrMinutes, count = 1) {
  const times = [];
  for (let i = 0; i < count; i++) {
    times.push(calculateSingleScheduleTime(baseStartTime, intervalIdOrMinutes, i));
  }
  return times;
}

/**
 * Format a scheduled ISO timestamp into user-friendly localized text with date and time
 */
export function formatScheduledDateTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (isToday) {
    return `Today at ${timeStr}`;
  }
  if (isTomorrow) {
    return `Tomorrow at ${timeStr}`;
  }

  const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${dateStr} at ${timeStr}`;
}

/**
 * Format relative time offset from part 1
 */
export function formatRelativeOffset(index, intervalId) {
  if (index === 0) return 'Start';
  const sec = getIntervalSeconds(intervalId);
  const totalMin = Math.round((index * sec) / 60);
  if (totalMin < 60) return `+${totalMin}m`;
  const hrs = totalMin / 60;
  if (hrs < 24) return `+${hrs}h`;
  const days = Math.round((hrs / 24) * 10) / 10;
  return `+${days}d`;
}
