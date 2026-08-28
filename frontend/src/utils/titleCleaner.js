/**
 * Video Filename Cleaner & Title Formatter Utility
 * Strips release group tags, resolutions, codecs, and web noise to produce clean titles.
 */

const JUNK_PATTERNS = [
  /\b(1080p|720p|480p|2160p|4k|uhd|hdrip|webrip|web-dl|webdl|bluray|blu-ray|brrip|bdrip|dvdrip|x264|x265|hevc|h264|h265|avc|aac|ac3|dts|mp3|eac3|10bit|8bit|hdr|remux|repack|proper|unrated|extended|directors\.cut|yify|yts|eztv|rarbg|psa|galaxy|trakzt)\b/gi,
  /\[.*?\]/g,
  /\(.*?(1080|720|480|2160|4k|x264|x265|bluray|webrip).*?\)/gi,
  /\b(www\.[a-z0-9\-]+\.[a-z]{2,4}|[a-z0-9\-]+\.(com|org|net|to|is|io|ru))\b/gi
];

/**
 * Clean a raw video file name into a human-readable title.
 * Example: "Inception.2010.1080p.BluRay.x264-YIFY.mp4" -> "Inception (2010)"
 * Example: "Naruto_Shippuden_Ep_120_720p_Dual_Audio.mkv" -> "Naruto Shippuden Ep 120"
 */
export function cleanVideoFilename(rawName = '') {
  if (!rawName || typeof rawName !== 'string') return 'My Video';

  // 1. Remove file extension
  let clean = rawName.replace(/\.[a-z0-9]{2,5}$/i, '');

  // 2. Extract year if present (e.g. 1990-2030)
  let year = null;
  const yearMatch = clean.match(/\b(19\d\d|20[0-3]\d)\b/);
  if (yearMatch) {
    year = yearMatch[1];
  }

  // 3. Remove all junk patterns
  for (const pattern of JUNK_PATTERNS) {
    clean = clean.replace(pattern, ' ');
  }

  // 4. Replace dots, underscores, hyphens, and multiple spaces with a single space
  clean = clean
    .replace(/[._\-+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 5. If year was extracted and not already cleanly formatted, format nicely
  if (year && !clean.includes(`(${year})`)) {
    // Remove standalone year
    clean = clean.replace(new RegExp(`\\b${year}\\b`), '').trim();
    clean = `${clean} (${year})`.replace(/\s+/g, ' ');
  }

  // 6. Title-case words nicely
  clean = clean
    .split(' ')
    .filter(Boolean)
    .map(word => {
      if (word.startsWith('(') && word.endsWith(')')) return word;
      if (word.length <= 2 && !/^(ep|pt|no|v)$/i.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');

  return clean.trim() || 'My Video';
}

/**
 * Format a single tag into a valid YouTube hashtag (#Tag or #MultiWordTag).
 * YouTube requires hashtags to have no spaces.
 * Example: "shorts" -> "#shorts"
 * Example: "movie clips" -> "#MovieClips"
 * Example: "#viral" -> "#viral"
 */
export function formatTagAsHashtag(tag) {
  if (!tag) return '';
  let clean = String(tag).trim().replace(/^#+/, '').trim();
  if (!clean) return '';
  // If tag contains spaces or separators, convert to PascalCase
  if (/[\s\-_]+/.test(clean)) {
    clean = clean
      .split(/[\s\-_]+/)
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join('');
  }
  return `#${clean}`;
}

/**
 * Convert an array or string of tags into a space-separated hashtag string.
 * Example: ['shorts', 'movie clips', 'viral'] -> "#shorts #MovieClips #viral"
 */
export function formatTagsAsHashtagString(tags) {
  if (!tags) return '';
  const list = Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(/[\s,]+/) : []);
  const seen = new Set();
  const hashtags = [];
  for (const item of list) {
    const ht = formatTagAsHashtag(item);
    if (ht && !seen.has(ht.toLowerCase())) {
      seen.add(ht.toLowerCase());
      hashtags.push(ht);
    }
  }
  return hashtags.join(' ');
}

/**
 * Parse any user tag input (comma-separated with multi-word tags or space-separated hashtags) into clean array.
 */
export function parseTagsInput(input) {
  if (!input) return [];
  let rawList = [];
  if (Array.isArray(input)) {
    rawList = input;
  } else if (typeof input === 'string') {
    if (input.includes(',')) {
      rawList = input.split(',');
    } else {
      rawList = input.split(/[\s]+/);
    }
  }

  const seen = new Set();
  const clean = [];
  for (const item of rawList) {
    if (typeof item !== 'string') continue;
    const tag = item.trim().toLowerCase().replace(/^#+/, '').trim();
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      clean.push(tag);
    }
  }
  return clean;
}

/**
 * Preset Part Formats available for 1-click selection
 */
export const PART_FORMAT_PRESETS = [
  { id: 'part', label: 'Part {n}', template: '{movie} - Part {part}', example: 'Movie - Part 1' },
  { id: 'pt', label: 'Pt. {n}', template: '{movie} - Pt. {part}', example: 'Movie - Pt. 1' },
  { id: 'ep_part', label: 'Ep. {n} Pt. {n}', template: '{movie} - Part {part}', example: 'Series - Part 1' },
  { id: 'bracket', label: '[Part {n}]', template: '{movie} [Part {part}]', example: 'Movie [Part 1]' },
  { id: 'hashtag', label: '#{n} Clip', template: '#{part} | {movie}', example: '#1 | Movie' }
];

/**
 * Common Viral Hashtag Packs for 1-click sync
 */
export const GLOBAL_HASHTAG_PACKS = [
  { label: '🔥 All-In-One', tags: '#reels #shorts #viral #fyp #trending' },
  { label: '🍿 Movie & Cinema', tags: '#movies #cinema #filmclips #scenes #hollywood' },
  { label: '⛩️ Anime & Manga', tags: '#anime #animereels #otaku #animeclips #manga' },
  { label: '🎮 Gaming & Action', tags: '#gaming #gamer #gameplay #gametok #twitch' },
  { label: '😂 Funny & Memes', tags: '#funny #comedy #memes #hilarious #relatable' }
];
