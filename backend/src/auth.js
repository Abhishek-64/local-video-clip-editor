/**
 * Google OAuth 2.0 helpers for Cloudflare Worker
 *
 * Security model:
 * - GOOGLE_CLIENT_SECRET lives only in Worker environment (set via `wrangler secret put`)
 * - Refresh tokens stored in D1 only — never returned to the frontend
 * - Access tokens are short-lived and may be returned to frontend for direct YouTube API calls
 *   (specifically for creating resumable upload sessions)
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const YOUTUBE_CHANNEL_URL = 'https://www.googleapis.com/youtube/v3/channels';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/userinfo.profile'
].join(' ');

/**
 * Build the Google OAuth authorization URL.
 * The `state` parameter encodes userId, frontendUrl, and isPopup so we can match the callback.
 */
export function buildAuthUrl(env, userId, frontendUrl = null, isPopup = false) {
  const redirectUri = `${env.APP_URL}/api/youtube/callback`;
  const state = btoa(JSON.stringify({ userId, frontendUrl, isPopup, ts: Date.now() }));

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCodeForTokens(env, code) {
  const redirectUri = `${env.APP_URL}/api/youtube/callback`;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  return res.json();
}

/**
 * Use a refresh token to get a new access token.
 * Updates D1 via the caller after success.
 */
export async function refreshAccessToken(env, refreshToken) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token'
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  const data = await res.json();
  return {
    access_token: data.access_token,
    token_expiry: Date.now() + (data.expires_in || 3600) * 1000
  };
}

/**
 * Fetch the authenticated user's YouTube channel information.
 */
export async function fetchChannelInfo(accessToken) {
  const url = `${YOUTUBE_CHANNEL_URL}?part=snippet,id&mine=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    throw new Error(`Channel fetch failed: ${res.status}`);
  }

  const data = await res.json();
  const channel = data.items?.[0];
  if (!channel) throw new Error('No YouTube channel found for this account');

  return {
    channel_id: channel.id,
    channel_title: channel.snippet?.title,
    channel_handle: channel.snippet?.customUrl,
    channel_thumbnail: channel.snippet?.thumbnails?.default?.url
  };
}

/**
 * Decode and validate the OAuth state parameter.
 */
export function decodeState(state) {
  try {
    return JSON.parse(atob(state));
  } catch {
    throw new Error('Invalid OAuth state parameter');
  }
}

/**
 * Check if an access token is expired (with 5-minute buffer).
 */
export function isTokenExpired(tokenExpiry) {
  if (!tokenExpiry) return true;
  return Date.now() > tokenExpiry - 5 * 60 * 1000;
}

/**
 * Ensure the YouTube account has a valid access token.
 * Returns the current access token (refreshing if needed) and updates D1.
 */
export async function ensureValidToken(env, db, account) {
  const { updateAccessToken } = await import('./db.js');

  if (!isTokenExpired(account.token_expiry)) {
    return account.access_token;
  }

  const { access_token, token_expiry } = await refreshAccessToken(env, account.refresh_token);
  await updateAccessToken(db, account.id, access_token, token_expiry);
  return access_token;
}

/**
 * Parse session cookie to get userId.
 * Returns null if no valid session found.
 */
export function getSessionUserId(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)__vcuid=([^;]+)/);
  if (!match) return null;

  try {
    // Simple base64 decode of userId — not cryptographically signed (use SESSION_SECRET for HMAC if needed)
    return atob(match[1]);
  } catch {
    return null;
  }
}

/**
 * Create a Set-Cookie header for the user session.
 */
export function makeSessionCookie(userId, frontendUrl) {
  const encoded = btoa(userId);
  const isHttps = frontendUrl?.startsWith('https://');
  const secure = isHttps ? '; Secure' : '';
  return `__vcuid=${encoded}; HttpOnly; Path=/; SameSite=Lax; Max-Age=31536000${secure}`;
}

/**
 * Get or create a stable user ID from the session.
 * If no session exists, create a new UUID-based user ID.
 */
export function getOrCreateUserId(request) {
  const existing = getSessionUserId(request);
  return existing || crypto.randomUUID();
}
