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

/**
 * Helper to retry transient API calls with exponential backoff.
 */
async function fetchWithRetry(fn, { retries = 3, delay = 1000, backoff = 2, name = 'operation' } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isTransient = /522|524|520|521|503|502|504|429|timeout|timed out|network|failed to fetch/i.test(err.message || '');
      if (attempt < retries && isTransient) {
        const waitTime = delay * Math.pow(backoff, attempt - 1);
        console.warn(`[${name}] Attempt ${attempt}/${retries} failed (${err.message}). Retrying in ${waitTime}ms...`);
        await new Promise(r => setTimeout(r, waitTime));
      } else {
        throw err;
      }
    }
  }
  throw lastErr;
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

// ─── Upload Jobs ──────────────────────────────────────────────────────────────

export async function getUploadHistory() {
  return apiFetch('/api/uploads');
}

/**
 * Get unified upload history across YouTube, Facebook, and Instagram from D1.
 */
export async function getAllUploadHistory() {
  return apiFetch('/api/history/all');
}

/**
 * Clear upload history for a specific platform or all platforms without revoking account credentials.
 * @param {'youtube' | 'facebook' | 'instagram' | 'all'} platform
 */
export async function clearPlatformHistory(platform = 'all') {
  return apiFetch('/api/history/clear', {
    method: 'POST',
    body: JSON.stringify({ platform })
  });
}

/**
 * SECTION 1: Get active scheduled publishing jobs for Facebook & Instagram.
 */
export async function getSocialScheduledJobs() {
  return apiFetch('/api/social/scheduled');
}

/**
 * SECTION 1: Reconcile in-progress/stuck upload jobs against Meta Graph API.
 */
export async function reconcileSocialJobs() {
  return apiFetch('/api/social/reconcile', { method: 'POST' });
}

/**
 * SECTION 2: Get completed publishing history (published, failed, cancelled) with filters.
 */
export async function getSocialUploadHistory({ platform = 'all', status = 'all', limit = 100 } = {}) {
  const query = new URLSearchParams();
  if (platform && platform !== 'all') query.set('platform', platform);
  if (status && status !== 'all') query.set('status', status);
  if (limit) query.set('limit', String(limit));
  const qs = query.toString() ? `?${query.toString()}` : '';
  return apiFetch(`/api/social/history${qs}`);
}

/**
 * SECTION 1: Generate safe temporary signed B2 preview URL for a scheduled video.
 */
export async function getSocialPreviewUrl({ platform, jobId, fileName }) {
  const query = new URLSearchParams();
  if (platform) query.set('platform', platform);
  if (jobId) query.set('jobId', jobId);
  if (fileName) query.set('fileName', fileName);
  return apiFetch(`/api/social/preview-url?${query.toString()}`);
}

/**
 * SECTION 1: Cancel and permanently delete an active scheduled publishing job.
 */
export async function cancelSocialScheduledJob(platform, jobId) {
  try {
    return await apiFetch(`/api/social/scheduled/${platform}/${jobId}`, {
      method: 'DELETE'
    });
  } catch {
    return apiFetch('/api/social/cancel', {
      method: 'POST',
      body: JSON.stringify({ platform, jobId })
    });
  }
}

export async function deleteSingleSocialScheduledJob(platform, jobId) {
  return cancelSocialScheduledJob(platform, jobId);
}

/**
 * SECTION 1: Reschedule an active scheduled publishing job to a new date/time.
 */
export async function rescheduleSocialScheduledJob(platform, jobId, scheduledAt) {
  return apiFetch('/api/social/reschedule', {
    method: 'POST',
    body: JSON.stringify({ platform, jobId, scheduledAt })
  });
}

/**
 * SECTION 1: Publish an active scheduled publishing job immediately on-demand.
 */
export async function publishSocialJobNow(platform, jobId) {
  return apiFetch('/api/social/publish-now', {
    method: 'POST',
    body: JSON.stringify({ platform, jobId })
  });
}

/**
 * SECTION 3: Safely clear completed/failed/cancelled upload history.
 */
export async function clearSocialUploadHistory(platform = 'all') {
  return apiFetch('/api/social/history/clear', {
    method: 'POST',
    body: JSON.stringify({ platform })
  });
}

/**
 * Permanently delete selected upload history items.
 * @param {Array<{ platform: string, id: string }> | { items: Array<{ platform: string, id: string }> }} itemsOrParams
 */
export async function deleteSocialHistoryItems(itemsOrParams) {
  const items = Array.isArray(itemsOrParams) ? itemsOrParams : (itemsOrParams?.items || []);
  return apiFetch('/api/social/history/delete-selected', {
    method: 'POST',
    body: JSON.stringify({ items })
  });
}

/**
 * Permanently delete a single upload history item.
 * @param {string} platform
 * @param {string} id
 */
export async function deleteSingleSocialHistoryItem(platform, id) {
  return apiFetch(`/api/social/history/${platform}/${id}`, {
    method: 'DELETE'
  });
}

/**
 * Permanently delete selected scheduled publishing jobs.
 * @param {Array<{ platform: string, id: string }> | { items: Array<{ platform: string, id: string }> }} itemsOrParams
 */
export async function deleteSelectedScheduledJobs(itemsOrParams) {
  const items = Array.isArray(itemsOrParams) ? itemsOrParams : (itemsOrParams?.items || []);
  return apiFetch('/api/social/scheduled/delete-selected', {
    method: 'POST',
    body: JSON.stringify({ items })
  });
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

/**
 * Set custom thumbnail on a YouTube video.
 * @param {string} videoId - YouTube video ID
 * @param {Blob|string} imageBlobOrBase64 - Image Blob or Base64 data string
 * @param {string} mimeType - Image mime type
 */
export async function setYouTubeThumbnail(videoId, imageBlobOrBase64, mimeType = 'image/jpeg') {
  if (typeof imageBlobOrBase64 === 'string') {
    return apiFetch('/api/youtube/set-thumbnail', {
      method: 'POST',
      body: JSON.stringify({
        videoId,
        imageBase64: imageBlobOrBase64,
        mimeType
      })
    });
  } else {
    const userId = getClientUserId();
    const token = getAuthToken();
    const headers = {
      'Content-Type': mimeType || imageBlobOrBase64.type || 'image/jpeg',
      'X-User-Id': userId
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_URL}/api/youtube/set-thumbnail?videoId=${encodeURIComponent(videoId)}`, {
      method: 'POST',
      headers,
      body: imageBlobOrBase64
    });
    if (!res.ok) {
      const text = await res.text();
      let err = text;
      try { err = JSON.parse(text).error || text; } catch {}
      throw new Error(err);
    }
    return res.json();
  }
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
 * @param {'history' | 'settings' | 'youtube' | 'all'} scope
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

// ─── Templates / Presets Management ──────────────────────────────────────────

/**
 * Fetch all saved templates for the current user.
 */
export async function getTemplates() {
  try {
    const res = await apiFetch('/api/templates');
    return res?.templates || [];
  } catch (err) {
    console.warn('getTemplates failed (using local fallback):', err?.message || err);
    return [];
  }
}

/**
 * Fetch a single saved template by ID.
 */
export async function getTemplate(id) {
  try {
    const res = await apiFetch(`/api/templates/${id}`);
    return res?.template || null;
  } catch (err) {
    console.warn(`getTemplate(${id}) failed:`, err?.message || err);
    return null;
  }
}

/**
 * Save a new cross-section template.
 */
export async function saveTemplate(templateData) {
  const res = await apiFetch('/api/templates', {
    method: 'POST',
    body: JSON.stringify(templateData)
  });
  return res?.template || null;
}

/**
 * Update an existing template.
 */
export async function updateTemplate(id, templateData) {
  const res = await apiFetch(`/api/templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(templateData)
  });
  return res?.template || null;
}

/**
 * Delete a saved template.
 */
export async function deleteTemplate(id) {
  return apiFetch(`/api/templates/${id}`, {
    method: 'DELETE'
  });
}

// ─── Facebook & Meta Graph API Management ─────────────────────────────────────

/**
 * Fetch connected Facebook account & managed pages.
 */
export async function getFacebookAccount() {
  return apiFetch('/api/facebook/account');
}

/**
 * Select active Facebook Page to publish to.
 */
export async function selectFacebookPage(pageId) {
  return apiFetch('/api/facebook/select-page', {
    method: 'POST',
    body: JSON.stringify({ page_id: pageId })
  });
}

/**
 * Safe Page Diagnostics Check
 */
export async function debugFacebookPage() {
  return apiFetch('/api/facebook/debug-page');
}

/**
 * Safe Facebook Account Diagnostics Check
 */
export async function debugFacebookAccount() {
  return apiFetch('/api/facebook/debug-account');
}

/**
 * Connect a Facebook Page by Page ID
 */
export async function connectFacebookPageById({ pageId }) {
  return apiFetch('/api/facebook/connect-page-id', {
    method: 'POST',
    body: JSON.stringify({
      page_id: pageId
    })
  });
}

/**
 * Disconnect Facebook account.
 */
export async function disconnectFacebookAccount() {
  return apiFetch('/api/facebook/disconnect', {
    method: 'POST'
  });
}

/**
 * Get presigned Backblaze B2 upload target for Facebook with retry resilience.
 */
export async function getB2UploadTarget() {
  return fetchWithRetry(
    () => apiFetch('/api/facebook/b2/upload-url', { method: 'POST' }),
    { retries: 3, delay: 1000, name: 'Facebook B2 Upload Target' }
  );
}

/**
 * Upload binary clip to Backblaze B2 using direct XHR with progress tracking.
 */
export function uploadToB2(uploadUrl, authorizationToken, blob, fileName, onProgress = null, signal = null) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl, true);

    xhr.setRequestHeader('Authorization', authorizationToken);
    xhr.setRequestHeader('X-Bz-File-Name', encodeURIComponent(fileName));
    xhr.setRequestHeader('Content-Type', blob.type || 'video/mp4');
    xhr.setRequestHeader('Content-Length', String(blob.size));
    xhr.setRequestHeader('X-Bz-Content-Sha1', 'do_not_verify');

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent, e.loaded, e.total);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data);
        } catch {
          resolve({ fileName, success: true });
        }
      } else {
        let errSnippet = (xhr.responseText || '').trim();
        if (errSnippet.includes('<html') || errSnippet.includes('<!DOCTYPE') || errSnippet.includes('<title>')) {
          const titleMatch = errSnippet.match(/<title[^>]*>([^<]+)<\/title>/i);
          errSnippet = titleMatch ? titleMatch[1].trim() : `Cloudflare error (HTTP ${xhr.status})`;
        } else if (errSnippet.length > 200) {
          errSnippet = errSnippet.slice(0, 200);
        }
        reject(new Error(`B2 upload failed: HTTP ${xhr.status} ${xhr.statusText}${errSnippet ? ` — ${errSnippet}` : ''}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during B2 video upload'));
    xhr.ontimeout = () => reject(new Error('B2 video upload timed out'));

    if (signal) {
      signal.addEventListener('abort', () => xhr.abort());
    }

    xhr.send(blob);
  });
}

/**
 * Initiate Facebook publishing (Reel or Page Video) via worker ingest & B2 cleanup.
 */
export async function publishToFacebook(payload) {
  return apiFetch('/api/facebook/publish', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Get Facebook upload job history.
 */
export async function getFacebookJobs() {
  return apiFetch('/api/facebook/jobs');
}

/**
 * Get single Facebook job status.
 */
export async function getFacebookJob(id) {
  return apiFetch(`/api/facebook/jobs/${id}`);
}

// ─── Instagram Account & Reels Publishing ─────────────────────────────────────

/**
 * Returns whether Instagram is connected and active account info.
 */
export async function getInstagramAccount() {
  return apiFetch('/api/instagram/account');
}

/**
 * Switch active Instagram Account.
 */
export async function selectInstagramAccount(igUserId) {
  return apiFetch('/api/instagram/select-account', {
    method: 'POST',
    body: JSON.stringify({ ig_user_id: igUserId })
  });
}

/**
 * Safe Instagram Diagnostics Check
 */
export async function debugInstagramAccount() {
  return apiFetch('/api/instagram/debug-account');
}

/**
 * Safe Instagram Diagnostics Check (full info endpoint)
 */
export async function getInstagramDiagnostics() {
  return apiFetch('/api/instagram/diagnostics');
}

/**
 * Connect an Instagram Account by Account ID / Username
 */
export async function connectInstagramAccountById({ accountId }) {
  return apiFetch('/api/instagram/connect-account-id', {
    method: 'POST',
    body: JSON.stringify({
      accountId
    })
  });
}

/**
 * Disconnect Instagram account.
 */
export async function disconnectInstagramAccount() {
  return apiFetch('/api/instagram/disconnect', {
    method: 'POST'
  });
}

/**
 * Get presigned Backblaze B2 upload target for Instagram with retry resilience.
 */
export async function getInstagramB2UploadTarget() {
  return fetchWithRetry(
    () => apiFetch('/api/instagram/b2/upload-url', { method: 'POST' }),
    { retries: 3, delay: 1000, name: 'Instagram B2 Upload Target' }
  );
}

/**
 * Initiate Instagram publishing (Reels) via worker ingest & B2 cleanup.
 */
export async function publishToInstagram(payload) {
  return apiFetch('/api/instagram/publish', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Get Instagram upload job history.
 */
export async function getInstagramJobs() {
  return apiFetch('/api/instagram/jobs');
}

/**
 * Get single Instagram job status.
 */
export async function getInstagramJob(id) {
  return apiFetch(`/api/instagram/jobs/${id}`);
}

// ─── Storage, Backblaze B2 & Database Management ──────────────────────────────

/**
 * Get comprehensive overview of Backblaze B2 bucket storage, files, and D1 stats.
 */
export async function getStorageOverview() {
  return apiFetch('/api/storage/overview');
}

/**
 * Delete a specific file from B2.
 */
export async function deleteB2File({ fileId, fileName }) {
  return apiFetch('/api/storage/b2/delete', {
    method: 'POST',
    body: JSON.stringify({ fileId, fileName })
  });
}

/**
 * Delete all files in B2 bucket.
 */
export async function deleteAllB2Files() {
  return apiFetch('/api/storage/b2/delete-all', {
    method: 'POST'
  });
}

/**
 * Permanently delete selected B2 files.
 * @param {Array<{ fileId: string, fileName: string }> | { files: Array<{ fileId: string, fileName: string }> }} filesOrParams
 */
export async function deleteBatchB2Files(filesOrParams) {
  const files = Array.isArray(filesOrParams) ? filesOrParams : (filesOrParams?.files || []);
  return apiFetch('/api/storage/b2/delete-batch', {
    method: 'POST',
    body: JSON.stringify({ files })
  });
}

/**
 * Trigger on-demand permanent database cleanup across all tables.
 */
export async function triggerPermanentCleanup() {
  return apiFetch('/api/storage/cleanup', {
    method: 'POST'
  });
}

/**
 * Clear specific database records for the authenticated user.
 */
export async function clearDataScope(scope) {
  return apiFetch('/api/storage/clear-scope', {
    method: 'POST',
    body: JSON.stringify({ scope })
  });
}

/**
 * Wipe all user data across all tables, temporary B2 files, and sessions.
 */
export async function wipeAllUserData() {
  return apiFetch('/api/storage/wipe-all', {
    method: 'POST'
  });
}

