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
