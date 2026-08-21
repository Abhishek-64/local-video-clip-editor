/**
 * Frontend API Service
 * Clean HTTP client for all Cloudflare Worker API calls.
 *
 * Security:
 * - VITE_API_URL is the only frontend-visible configuration.
 * - All OAuth secrets and refresh tokens are handled server-side.
 * - No video blobs are sent to the Worker — only metadata.
 */

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/**
 * Generic fetch wrapper with error handling.
 */
async function apiFetch(path, options = {}) {
  if (!API_URL) {
    throw new Error('VITE_API_URL is not configured. Add it to your .env file.');
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include', // Include session cookie
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    let errorMsg = `API error ${res.status}`;
    try {
      const data = await res.json();
      errorMsg = data.error || errorMsg;
    } catch {}
    throw new Error(errorMsg);
  }

  // After checking status
  if (res.status === 204) return null;

  // Guard against non‑JSON (e.g., HTML error page)
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    console.warn('Non‑JSON API response:', text);
    return null; // caller should handle missing data
  }

  return res.json();
}

// ─── Health ───────────────────────────────────────────────────────────────────

export async function checkHealth() {
  return apiFetch('/api/health');
}

// ─── YouTube Account ──────────────────────────────────────────────────────────

/**
 * Returns whether YouTube is connected and the channel info.
 * { connected: boolean, account: { channel_id, channel_title, channel_handle, channel_thumbnail } | null }
 */
export async function getYouTubeAccount() {
  return apiFetch('/api/youtube/account');
}

/**
 * Build the URL that initiates the YouTube OAuth flow.
 * The user is redirected to this URL — it goes through the Worker → Google.
 */
export function getYouTubeConnectUrl() {
  if (!API_URL) return null;
  return `${API_URL}/api/youtube/connect`;
}

/**
 * Disconnect the connected YouTube account.
 */
export async function disconnectYouTube() {
  return apiFetch('/api/youtube/disconnect', { method: 'POST' });
}

// ─── Project Settings ─────────────────────────────────────────────────────────

export async function getSettings() {
  return apiFetch('/api/settings');
}

export async function saveSettings(settings) {
  return apiFetch('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(settings)
  });
}

// ─── Branding Presets ─────────────────────────────────────────────────────────

export async function getBrandingPresets() {
  return apiFetch('/api/branding');
}

export async function createBrandingPreset(data) {
  return apiFetch('/api/branding', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function updateBrandingPreset(id, data) {
  return apiFetch(`/api/branding/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

export async function deleteBrandingPreset(id) {
  return apiFetch(`/api/branding/${id}`, { method: 'DELETE' });
}

// ─── Upload Jobs ──────────────────────────────────────────────────────────────

export async function getUploadHistory() {
  return apiFetch('/api/uploads');
}

/**
 * Create an upload job in D1 and get a YouTube resumable upload URL.
 * The browser then uploads the video blob directly to the returned uploadUrl.
 *
 * @param {object} params
 * @param {string} params.jobId - Local queue job ID (used as D1 record ID for correlation)
 * @param {number} params.partNumber
 * @param {string} params.movieName
 * @param {string} params.title - YouTube video title
 * @param {string} params.description - YouTube video description
 * @param {string[]} params.tags
 * @param {string} params.visibility - 'private' | 'unlisted' | 'public'
 * @param {string} params.category - YouTube category ID
 * @param {boolean} params.madeForKids
 * @param {boolean} params.notifySubscribers
 * @param {string|null} params.scheduledAt - ISO 8601 datetime or null
 * @param {number} params.fileSize - Blob size in bytes
 * @param {string} params.mimeType - e.g. 'video/mp4'
 * @returns {{ jobId: string, uploadUrl: string }}
 */
export async function createUploadSession(params) {
  return apiFetch('/api/uploads/metadata', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

/**
 * Update an upload job's status after upload completes or fails.
 */
export async function updateUploadJob(jobId, data) {
  return apiFetch(`/api/uploads/${jobId}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

/**
 * Reset a failed job for retry.
 */
export async function retryUploadJob(jobId) {
  return apiFetch(`/api/uploads/${jobId}/retry`, { method: 'POST' });
}

// ─── Direct YouTube Resumable Upload (Browser → YouTube) ─────────────────────

/**
 * Upload a video Blob directly to YouTube using a resumable upload URL.
 * This function sends bytes directly from the browser to YouTube's servers.
 * No bytes go through the Cloudflare Worker.
 *
 * @param {string} uploadUrl - The resumable upload URL from createUploadSession
 * @param {Blob} blob - The video blob to upload
 * @param {object} options
 * @param {function} options.onProgress - (percent: number) => void
 * @param {AbortSignal} options.signal - For cancellation
 * @returns {{ videoId: string }}
 */
export async function uploadBlobToYouTube(uploadUrl, blob, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', blob.type || 'video/mp4');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve({ videoId: data.id });
        } catch {
          reject(new Error('YouTube upload succeeded but response was not valid JSON'));
        }
      } else {
        let errMsg = `YouTube upload failed with status ${xhr.status}`;
        try {
          const err = JSON.parse(xhr.responseText);
          errMsg = err?.error?.message || errMsg;
        } catch {}
        reject(new Error(errMsg));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during YouTube upload'));
    xhr.onabort = () => reject(new Error('YouTube upload was cancelled'));

    if (signal) {
      signal.addEventListener('abort', () => xhr.abort());
    }

    xhr.send(blob);
  });
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Returns true if the API is configured (VITE_API_URL is set).
 */
export function isApiConfigured() {
  return Boolean(API_URL);
}

/**
 * Build a YouTube watch URL from a video ID.
 */
export function buildYouTubeUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
