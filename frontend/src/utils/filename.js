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
 * Generate output clip filename based on movie name, part number, template and extension.
 * Supports both object options `{ movieName, partNumber, template, zeroPad, extension }`
 * and positional parameters `(movieName, partNumber, totalParts, extension, zeroPad)`.
 *
 * @param {Object|string} optionsOrMovieName
 * @param {number} [maybePartNumber=1]
 * @param {number} [maybeTotalParts]
 * @param {string} [maybeExtension='mp4']
 * @param {boolean} [maybeZeroPad=true]
 * @returns {string}
 */
export function generateClipFilename(
  optionsOrMovieName = 'My Movie',
  maybePartNumber = 1,
  maybeTotalParts,
  maybeExtension = 'mp4',
  maybeZeroPad = true
) {
  let movieName = 'My Movie';
  let partNumber = 1;
  let template = '{movie} - Part {part}';
  let zeroPad = true;
  let extension = 'mp4';

  if (typeof optionsOrMovieName === 'object' && optionsOrMovieName !== null) {
    movieName = optionsOrMovieName.movieName || 'My Movie';
    partNumber = optionsOrMovieName.partNumber ?? 1;
    template = optionsOrMovieName.template || '{movie} - Part {part}';
    zeroPad = optionsOrMovieName.zeroPad !== undefined ? optionsOrMovieName.zeroPad : true;
    extension = optionsOrMovieName.extension || optionsOrMovieName.format || 'mp4';
  } else {
    movieName = String(optionsOrMovieName || 'My Movie');
    partNumber = maybePartNumber ?? 1;
    extension = maybeExtension || 'mp4';
    zeroPad = maybeZeroPad !== undefined ? Boolean(maybeZeroPad) : true;
  }

  const formattedPart = zeroPad ? String(partNumber).padStart(2, '0') : String(partNumber);
  let name = template
    .replace(/{movie}/g, movieName || 'My Movie')
    .replace(/{part}/g, formattedPart);

  const cleanName = sanitizeFilename(name);
  return `${cleanName}.${extension}`;
}
