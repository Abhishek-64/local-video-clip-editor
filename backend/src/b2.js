/**
 * Backblaze B2 Helper for Cloudflare Worker
 * Handles temporary storage for Facebook Reels & Video ingestion,
 * Instagram Reels & Stories ingestion, and media asset management.
 *
 * Resilience features:
 * - Exponential backoff retry on transient 5xx/522/429 errors and connection timeouts
 * - Automatic 401 token invalidation and refresh
 * - Clean parsing of Cloudflare HTML error pages to avoid leaking raw HTML
 * - Configurable request timeouts via AbortSignal.timeout
 */

/**
 * Transient HTTP status codes from Cloudflare / Backblaze that warrant retrying:
 * 429: Too Many Requests / Rate limit
 * 500: Internal Server Error
 * 502: Bad Gateway
 * 503: Service Unavailable
 * 504: Gateway Timeout
 * 520-526: Cloudflare edge errors (e.g. 522 Connection Timed Out, 524 A Timeout Occurred)
 */
const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526]);

/**
 * Clean error text from Backblaze or Cloudflare error pages
 * Converts raw HTML error pages (like Cloudflare 522) into concise, human-readable strings.
 */
export function cleanB2ErrorText(status, rawText) {
  if (!rawText) {
    if (status === 522) return 'Cloudflare connection timed out to Backblaze origin server (HTTP 522)';
    if (status === 524) return 'Cloudflare gateway timeout contacting Backblaze origin (HTTP 524)';
    if (status === 503) return 'Backblaze service temporarily unavailable (HTTP 503)';
    if (status === 502) return 'Bad Gateway contacting Backblaze (HTTP 502)';
    return `HTTP ${status}`;
  }

  const trimmed = rawText.trim();

  // 1. Try parsing JSON error from Backblaze B2
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      const code = parsed.code ? `[${parsed.code}] ` : '';
      const message = parsed.message || parsed.error || JSON.stringify(parsed);
      return `${code}${message}`;
    } catch {}
  }

  // 2. Check for Cloudflare specific error patterns in HTML or text
  if (status === 522 || /error code:\s*522/i.test(trimmed)) {
    return 'Cloudflare connection timed out to Backblaze origin server (HTTP 522)';
  }
  if (status === 524 || /error code:\s*524/i.test(trimmed)) {
    return 'Cloudflare timeout waiting for Backblaze origin response (HTTP 524)';
  }
  if (status === 520 || /error code:\s*520/i.test(trimmed)) {
    return 'Cloudflare web server returned an unknown error (HTTP 520)';
  }
  if (status === 521 || /error code:\s*521/i.test(trimmed)) {
    return 'Backblaze origin web server is down (HTTP 521)';
  }
  if (status === 502 || /error code:\s*502/i.test(trimmed)) {
    return 'Bad Gateway contacting Backblaze origin (HTTP 502)';
  }
  if (status === 503 || /error code:\s*503/i.test(trimmed)) {
    return 'Backblaze service temporarily unavailable (HTTP 503)';
  }

  // 3. Extract title if HTML document was returned
  const titleMatch = trimmed.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    const title = titleMatch[1].trim();
    return `HTTP ${status} — ${title}`;
  }

  // 4. Strip any other HTML tags
  const stripped = trimmed.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (stripped.length > 0 && stripped.length < 250) {
    return `HTTP ${status}: ${stripped}`;
  }

  return `HTTP ${status} error from Backblaze`;
}

/**
 * Robust fetch wrapper with exponential backoff retry for transient network/5xx/522 errors.
 */
export async function fetchB2WithRetry(url, options = {}, config = {}) {
  const {
    maxRetries = 3,
    initialDelayMs = 800,
    maxDelayMs = 4000,
    timeoutMs = 15000
  } = config;

  let lastError = null;
  let lastResponse = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let controller = null;
    let timeoutId = null;

    try {
      // Support AbortSignal.timeout if available, or fallback to AbortController
      let signal = options.signal;
      if (!signal) {
        if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
          signal = AbortSignal.timeout(timeoutMs);
        } else {
          controller = new AbortController();
          timeoutId = setTimeout(() => controller.abort(), timeoutMs);
          signal = controller.signal;
        }
      }

      const res = await fetch(url, { ...options, signal });
      if (timeoutId) clearTimeout(timeoutId);

      // Success
      if (res.ok) {
        return res;
      }

      lastResponse = res;

      // Check if status is transient (5xx, 429, Cloudflare 522/524, etc.)
      if (TRANSIENT_STATUS_CODES.has(res.status) && attempt < maxRetries) {
        const errBody = await res.text().catch(() => '');
        const cleanMsg = cleanB2ErrorText(res.status, errBody);
        const delay = Math.min(maxDelayMs, initialDelayMs * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 250);
        console.warn(`[B2 Retry] Attempt ${attempt}/${maxRetries} to ${url} failed with ${cleanMsg}. Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // Non-transient status or last attempt reached
      return res;
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      lastError = err;

      if (attempt < maxRetries) {
        const delay = Math.min(maxDelayMs, initialDelayMs * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 250);
        console.warn(`[B2 Retry] Network error on attempt ${attempt}/${maxRetries} to ${url}: ${err.message}. Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError || new Error(`Backblaze B2 request to ${url} failed after ${maxRetries} attempts.`);
}

let cachedAuth = null;
let cachedAuthExpiry = 0;
let inFlightAuthPromise = null;

/**
 * Invalidate cached B2 authorization token (e.g. on 401 Unauthorized)
 */
export function clearB2AuthCache() {
  cachedAuth = null;
  cachedAuthExpiry = 0;
  inFlightAuthPromise = null;
}

/**
 * Authorize Backblaze B2 Account
 * Uses cached credentials when available and valid.
 * Deduplicates simultaneous in-flight authorization calls.
 * Automatically retries transient connection errors (such as Cloudflare 522).
 */
export async function b2Authorize(env, forceRefresh = false) {
  const keyId = env.B2_KEY_ID;
  const applicationKey = env.B2_APPLICATION_KEY;

  if (!keyId || !applicationKey) {
    throw new Error('Backblaze B2 credentials (B2_KEY_ID and B2_APPLICATION_KEY) are not configured.');
  }

  // Use cached token if valid and refresh not forced
  if (!forceRefresh && cachedAuth && Date.now() < cachedAuthExpiry) {
    return cachedAuth;
  }

  // Deduplicate concurrent authorization calls
  if (!forceRefresh && inFlightAuthPromise) {
    return inFlightAuthPromise;
  }

  inFlightAuthPromise = (async () => {
    try {
      const credentials = btoa(`${keyId}:${applicationKey}`);
      const res = await fetchB2WithRetry('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', {
        headers: {
          'Authorization': `Basic ${credentials}`
        }
      }, {
        maxRetries: 3,
        initialDelayMs: 800,
        timeoutMs: 15000
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        const cleanMsg = cleanB2ErrorText(res.status, errText);
        clearB2AuthCache();
        throw new Error(`Backblaze B2 authorization failed: ${cleanMsg}`);
      }

      const data = await res.json();
      cachedAuth = {
        authorizationToken: data.authorizationToken,
        apiUrl: data.apiInfo?.storageApi?.apiUrl || data.apiUrl,
        downloadUrl: data.apiInfo?.storageApi?.downloadUrl || data.downloadUrl
      };
      cachedAuthExpiry = Date.now() + 20 * 60 * 60 * 1000; // 20 hours

      return cachedAuth;
    } finally {
      inFlightAuthPromise = null;
    }
  })();

  return inFlightAuthPromise;
}

/**
 * Get B2 Upload Target (URL + Token) for bucket
 * Handles 401 token invalidation and automatic token refresh.
 */
export async function b2GetUploadUrl(env) {
  const bucketId = env.B2_BUCKET_ID;
  if (!bucketId) {
    throw new Error('B2_BUCKET_ID is not configured in environment.');
  }

  let auth = await b2Authorize(env);
  let res = await fetchB2WithRetry(`${auth.apiUrl}/b2api/v3/b2_get_upload_url`, {
    method: 'POST',
    headers: {
      'Authorization': auth.authorizationToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ bucketId })
  });

  // Handle expired/invalid token with single refresh retry
  if (res.status === 401) {
    console.warn('[B2] Received 401 Unauthorized in b2GetUploadUrl. Refreshing auth token...');
    clearB2AuthCache();
    auth = await b2Authorize(env, true);
    res = await fetchB2WithRetry(`${auth.apiUrl}/b2api/v3/b2_get_upload_url`, {
      method: 'POST',
      headers: {
        'Authorization': auth.authorizationToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ bucketId })
    });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const cleanMsg = cleanB2ErrorText(res.status, errText);
    throw new Error(`Failed to get B2 upload URL: ${cleanMsg}`);
  }

  const data = await res.json();
  return {
    uploadUrl: data.uploadUrl,
    authorizationToken: data.authorizationToken,
    bucketId: data.bucketId
  };
}

/**
 * Generate Authorized Download URL for a specific file
 * Handles 401 token invalidation and automatic token refresh.
 */
export async function b2GetDownloadUrl(env, fileName, validDurationInSeconds = 3600) {
  const bucketId = env.B2_BUCKET_ID;
  const bucketName = env.B2_BUCKET_NAME;

  let auth = await b2Authorize(env);
  let res = await fetchB2WithRetry(`${auth.apiUrl}/b2api/v3/b2_get_download_authorization`, {
    method: 'POST',
    headers: {
      'Authorization': auth.authorizationToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      bucketId,
      fileNamePrefix: fileName,
      validDurationInSeconds
    })
  });

  // Handle expired/invalid token with single refresh retry
  if (res.status === 401) {
    console.warn('[B2] Received 401 Unauthorized in b2GetDownloadUrl. Refreshing auth token...');
    clearB2AuthCache();
    auth = await b2Authorize(env, true);
    res = await fetchB2WithRetry(`${auth.apiUrl}/b2api/v3/b2_get_download_authorization`, {
      method: 'POST',
      headers: {
        'Authorization': auth.authorizationToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bucketId,
        fileNamePrefix: fileName,
        validDurationInSeconds
      })
    });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const cleanMsg = cleanB2ErrorText(res.status, errText);
    throw new Error(`Failed to get B2 download authorization: ${cleanMsg}`);
  }

  const data = await res.json();
  const token = data.authorizationToken;

  return `${auth.downloadUrl}/file/${bucketName}/${encodeURIComponent(fileName)}?Authorization=${token}`;
}

/**
 * Delete a file from B2 bucket (immediate temporary storage cleanup)
 */
export async function b2DeleteFile(env, fileId, fileName) {
  if (!fileId || !fileName) return { success: false, reason: 'Missing fileId or fileName' };

  try {
    let auth = await b2Authorize(env);
    let res = await fetchB2WithRetry(`${auth.apiUrl}/b2api/v3/b2_delete_file_version`, {
      method: 'POST',
      headers: {
        'Authorization': auth.authorizationToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileId,
        fileName
      })
    });

    if (res.status === 401) {
      console.warn('[B2] Received 401 Unauthorized in b2DeleteFile. Refreshing auth token...');
      clearB2AuthCache();
      auth = await b2Authorize(env, true);
      res = await fetchB2WithRetry(`${auth.apiUrl}/b2api/v3/b2_delete_file_version`, {
        method: 'POST',
        headers: {
          'Authorization': auth.authorizationToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileId,
          fileName
        })
      });
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const cleanMsg = cleanB2ErrorText(res.status, errText);
      console.warn(`B2 file deletion warning for ${fileName}:`, cleanMsg);
      return { success: false, error: cleanMsg };
    }

    return { success: true };
  } catch (err) {
    console.warn(`B2 file deletion error for ${fileName}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * List files stored in the Backblaze B2 bucket
 */
export async function b2ListFileNames(env, maxFileCount = 100) {
  const bucketId = env.B2_BUCKET_ID;
  if (!bucketId) {
    throw new Error('B2_BUCKET_ID is not configured in environment.');
  }

  let auth = await b2Authorize(env);
  let res = await fetchB2WithRetry(`${auth.apiUrl}/b2api/v3/b2_list_file_names`, {
    method: 'POST',
    headers: {
      'Authorization': auth.authorizationToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      bucketId,
      maxFileCount
    })
  });

  if (res.status === 401) {
    console.warn('[B2] Received 401 Unauthorized in b2ListFileNames. Refreshing auth token...');
    clearB2AuthCache();
    auth = await b2Authorize(env, true);
    res = await fetchB2WithRetry(`${auth.apiUrl}/b2api/v3/b2_list_file_names`, {
      method: 'POST',
      headers: {
        'Authorization': auth.authorizationToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bucketId,
        maxFileCount
      })
    });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const cleanMsg = cleanB2ErrorText(res.status, errText);
    throw new Error(`Failed to list B2 files: ${cleanMsg}`);
  }

  const data = await res.json();
  const bucketName = env.B2_BUCKET_NAME || '';

  return (data.files || []).map(f => ({
    fileId: f.fileId,
    fileName: f.fileName,
    contentLength: f.contentLength,
    uploadTimestamp: f.uploadTimestamp,
    contentType: f.contentType,
    downloadUrl: `${auth.downloadUrl}/file/${bucketName}/${encodeURIComponent(f.fileName)}`
  }));
}
