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

const STORAGE_KEY_USER_ID = 'video_clip_editor_user_id';
const STORAGE_KEY_AUTH_TOKEN = 'video_clip_editor_auth_token';

/**
 * Get or initialize persistent client userId stored in localStorage.
 */
export function getClientUserId() {
  let uid = localStorage.getItem(STORAGE_KEY_USER_ID);
  if (!uid) {
    uid = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY_USER_ID, uid);
  }
  return uid;
}

/**
 * Update the stored client userId.
 */
export function setClientUserId(uid) {
  if (uid && typeof uid === 'string') {
    localStorage.setItem(STORAGE_KEY_USER_ID, uid);
  }
}

/**
 * Get the stored JWT / session auth token.
 */
export function getAuthToken() {
  return localStorage.getItem(STORAGE_KEY_AUTH_TOKEN) || null;
}

/**
 * Set or remove the stored auth token.
 */
export function setAuthToken(token) {
  if (token) {
    localStorage.setItem(STORAGE_KEY_AUTH_TOKEN, token);
  } else {
    localStorage.removeItem(STORAGE_KEY_AUTH_TOKEN);
  }
}

export function clearAuthToken() {
  localStorage.removeItem(STORAGE_KEY_AUTH_TOKEN);
}

/**
 * Generic fetch wrapper with error handling.
 */
async function apiFetch(path, options = {}) {
  if (!API_URL) {
    throw new Error('VITE_API_URL is not configured. Add it to your .env file.');
  }

  const userId = getClientUserId();
  const token = getAuthToken();

  const headers = {
    'Content-Type': 'application/json',
    'X-User-Id': userId,
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include', // Include session cookie
    headers
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

// ─── Authentication ──────────────────────────────────────────────────────────

/**
 * Register a new account.
 * @param {{ email: string, password: string, name?: string }} payload
 */
export async function signup(payload) {
  const data = await apiFetch('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  if (data.token) setAuthToken(data.token);
  if (data.user?.id) setClientUserId(data.user.id);
  return data;
}

/**
 * Log in to an existing account.
 * @param {{ email: string, password: string }} payload
 */
export async function login(payload) {
  const data = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  if (data.token) setAuthToken(data.token);
  if (data.user?.id) setClientUserId(data.user.id);
  return data;
}

/**
 * Get the current user profile and auth status.
 */
export async function getMe() {
  return apiFetch('/api/auth/me');
}

/**
 * Log out and clear session tokens.
 */
export async function logout() {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch {}
  clearAuthToken();
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
export function getYouTubeConnectUrl(options = {}) {
  if (!API_URL) return null;
  const params = new URLSearchParams();
  if (options.popup) params.set('popup', '1');
  if (options.frontendUrl) params.set('frontendUrl', options.frontendUrl);
  params.set('userId', getClientUserId());
  const qs = params.toString();
  return `${API_URL}/api/youtube/connect${qs ? `?${qs}` : ''}`;
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

    xhr.onerror = () => reject(new Error('Network or CORS error during YouTube upload. Please check browser network logs and worker configuration.'));
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

// ─── Storage & Database Data Management ───────────────────────────────────────

/**
 * Get user storage stats and cleanup policy.
 */
export async function getUserStorageStats() {
  return apiFetch('/api/user/storage');
}

/**
 * Clear user data upon explicit user confirmation/approval.
 * @param {'history' | 'presets' | 'settings' | 'youtube' | 'all'} scope
 */
export async function clearUserData(scope = 'history') {
  return apiFetch('/api/user/storage/clear', {
    method: 'POST',
    body: JSON.stringify({ scope })
  });
}

/**
 * Trigger background database maintenance.
 */
export async function triggerAdminCleanup() {
  return apiFetch('/api/admin/cleanup', {
    method: 'POST'
  });
}

