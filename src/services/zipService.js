import JSZip from 'jszip';
import { sanitizeFilename } from '../utils/filename';

/**
 * Package multiple completed clip Blobs into a single ZIP file and trigger browser download
 *
 * @param {Array<{ name: string, blob: Blob }>} completedClips
 * @param {string} [archiveName='Clips']
 * @param {Function} [onProgress] - (pct: number) => void
 * @returns {Promise<void>}
 */
export async function downloadClipsAsZip(completedClips, archiveName = 'Clips', onProgress = () => {}) {
  if (!completedClips || completedClips.length === 0) {
    throw new Error('No completed clips available to ZIP');
  }

  const zip = new JSZip();
  const folder = zip.folder(sanitizeFilename(archiveName));

  // Add each clip Blob to ZIP archive
  for (const clip of completedClips) {
    if (clip.blob) {
      folder.file(clip.name, clip.blob);
    }
  }

  // Generate the ZIP file with progress callback
  const content = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 2 } // Fast local compression
    },
    (metadata) => {
      onProgress(Math.round(metadata.percent));
    }
  );

  // Trigger local browser download
  const cleanZipName = `${sanitizeFilename(archiveName)}.zip`;
  const downloadUrl = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = cleanZipName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Revoke object URL after a short delay
  setTimeout(() => {
    URL.revokeObjectURL(downloadUrl);
  }, 10000);
}
