/**
 * Sanitize filename by removing invalid Windows and Unix filesystem characters
 * Windows invalid chars: < > : " / \ | ? *
 * @param {string} filename
 * @returns {string}
 */
export function sanitizeFilename(filename) {
  if (!filename) return 'clip';
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generate output clip filename based on movie name, part number, template and extension
 * @param {Object} options
 * @param {string} options.movieName
 * @param {number} options.partNumber
 * @param {string} options.template
 * @param {boolean} options.zeroPad
 * @param {string} options.extension
 * @returns {string}
 */
export function generateClipFilename({
  movieName = 'My Movie',
  partNumber = 1,
  template = '{movie} - Part {part}',
  zeroPad = true,
  extension = 'mp4'
}) {
  const formattedPart = zeroPad ? String(partNumber).padStart(2, '0') : String(partNumber);
  let name = template
    .replace(/{movie}/g, movieName || 'My Movie')
    .replace(/{part}/g, formattedPart);

  const cleanName = sanitizeFilename(name);
  return `${cleanName}.${extension}`;
}
