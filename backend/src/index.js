/**
 * Cloudflare Worker — Main Router
 * Local Video Clip Editor Backend
 *
 * Handles: YouTube OAuth, D1 metadata, settings, branding presets, upload job tracking.
 * Does NOT: store video files, proxy video bytes, or act as video storage.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getCookie, setCookie } from 'hono/cookie';

import {
  buildAuthUrl,
  exchangeCodeForTokens,
  fetchChannelInfo,
  decodeState,
  ensureValidToken,
  getOrCreateUserId,
  makeSessionCookie
} from './auth.js';

import {
  createResumableUploadSession,
  updateVideoMetadata,
  getVideoStatus,
  buildYouTubeUrl,
  normalizeYouTubeTags,
  setVideoThumbnail
} from './youtube.js';

import {
  getOrCreateUser,
  getUserById,
  getUserByEmail,
  createUserWithPassword,
  createSession,
  getSession,
  deleteSession,
  getYouTubeAccount,
  upsertYouTubeAccount,
  deleteYouTubeAccount,
  getUploadJobs,
  createUploadJob,
  updateUploadJob,
  getUploadJob,
  runAutoCleanup,
  getUserStorageStats,
  clearUserData,
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getFacebookAccount,
  upsertFacebookAccount,
  updateFacebookPageSelection,
  deleteFacebookAccount,
  createFacebookUploadJob,
  updateFacebookUploadJob,
  getFacebookUploadJob,
  getFacebookUploadJobs,
  getInstagramAccount,
  upsertInstagramAccount,
  updateInstagramAccountSelection,
  deleteInstagramAccount,
  createInstagramUploadJob,
  updateInstagramUploadJob,
  getInstagramUploadJob,
  getInstagramUploadJobs,
  getScheduledSocialJobs,
  getCompletedSocialHistory,
  cancelScheduledSocialJob,
  rescheduleScheduledSocialJob,
  clearCompletedSocialHistory,
  clearUserDataByScope,
  wipeAllUserData,
  isB2FileNeededByOtherJobs,
  deleteSocialHistoryItems,
  deleteScheduledSocialJobs,
  cleanupUnusedData
} from './db.js';

import {
  b2Authorize,
  b2GetUploadUrl,
  b2GetDownloadUrl,
  b2DeleteFile,
  b2ListFileNames
} from './b2.js';

import {
  buildFacebookAuthUrl,
  exchangeFacebookCodeForTokens,
  fetchFacebookPages,
  validateAndGetPageToken,
  validatePageTokenMatch,
  verifyPagePublishCapability,
  publishFacebookReel,
  publishFacebookPageVideo,
  publishFacebookPhoto,
  publishFacebookPhotoStory,
  processScheduledFacebookJobs,
  reconcileStuckFacebookJobs
} from './facebook.js';

import {
  buildInstagramAuthUrl,
  exchangeInstagramCodeForTokens,
  fetchInstagramAccounts,
  validateAndGetInstagramAccount,
  verifyInstagramPublishCapability,
  publishInstagramReel,
  publishInstagramPhoto,
  publishInstagramStory,
  createInstagramImageContainer,
  createInstagramCarouselContainer,
  processScheduledInstagramJobs,
  reconcileStuckInstagramJobs
} from './instagram.js';

/**
 * Normalize any datetime string or epoch to a strict ISO-8601 UTC timestamp.
 * Returns null if invalid or not provided.
 */
function normalizeToUtcIso(dateInput) {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

import {
  generateRandomHex,
  generateSessionToken,
  hashPassword,
  verifyPassword,
  encryptToken,
  decryptToken,
  signOAuthState,
  verifyOAuthState
} from './crypto.js';

// ─── App Setup ────────────────────────────────────────────────────────────────

const app = new Hono();

// CORS — allow frontend origin dynamically for local dev + configured FRONTEND_URL
app.use('*', cors({
  origin: (origin, c) => {
    if (!origin) return '*';
    const configuredFrontend = (c.env?.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    
    // Allow configured origin, localhost, 127.0.0.1, workers.dev, pages.dev, and local private networks
    const isAllowed =
      origin === configuredFrontend || 
      origin.endsWith('.workers.dev') ||
      origin.endsWith('.pages.dev') ||
      origin.startsWith('http://localhost:') || 
      origin.startsWith('https://localhost:') || 
      origin.startsWith('http://127.0.0.1:') || 
      origin.startsWith('https://127.0.0.1:') || 
      /^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin) ||
      /^https?:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/.test(origin) ||
      /^https?:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+(:\d+)?$/.test(origin) ||
      origin.includes('.trycloudflare.com');

    return isAllowed ? origin : configuredFrontend;
  },
  allowHeaders: ['Content-Type', 'content-type', 'Authorization', 'authorization', 'X-Requested-With', 'x-requested-with', 'Accept', 'accept', 'Origin', 'origin', 'X-User-Id', 'x-user-id', 'Range', 'range', '*'],
  allowMethods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  exposeHeaders: ['Content-Length', 'Set-Cookie', 'Content-Range', 'Accept-Ranges'],
  maxAge: 86400,
  credentials: true
}));

// Explicit OPTIONS preflight responder
app.options('*', (c) => {
  return c.text('', 204);
});

// ─── Session Middleware ───────────────────────────────────────────────────────

/**
 * Attach userId & authenticated user to context.
 * Priority: Authorization Bearer token -> X-User-Id header -> query param -> cookie -> new UUID.
 */
async function withUser(c, next) {
  let userId = null;
  let currentUser = null;

  // 1. Check Bearer Token in Authorization header
  const authHeader = c.req.header('Authorization') || c.req.header('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const session = await getSession(c.env.DB, token);
      if (session) {
        userId = session.user_id;
        currentUser = await getUserById(c.env.DB, userId);
      }
    }
  }

  // 2. Check X-User-Id header or query param
  if (!userId) {
    userId = c.req.header('x-user-id') || c.req.header('X-User-Id') || c.req.query('userId');
  }

  // 3. Check session cookie
  if (!userId) {
    const cookie = getCookie(c, '__vcuid');
    if (cookie) {
      try { userId = atob(cookie); } catch {}
    }
  }

  // 4. Generate random user ID if anonymous
  if (!userId) {
    userId = crypto.randomUUID();
  }

  if (!currentUser) {
    currentUser = await getOrCreateUser(c.env.DB, userId);
  }

  c.set('userId', userId);
  c.set('user', currentUser);

  await next();

  // Refresh cookie on every response
  const frontendUrl = c.env.FRONTEND_URL || 'http://localhost:3000';
  const isHttps = frontendUrl.startsWith('https://');
  setCookie(c, '__vcuid', btoa(userId), {
    httpOnly: true,
    path: '/',
    sameSite: 'Lax',
    maxAge: 31536000,
    secure: isHttps
  });
}

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Authentication Endpoints ──────────────────────────────────────────────────

/**
 * POST /api/auth/signup
 * Create a new user account with email and password.
 */
app.post('/api/auth/signup', withUser, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password, name } = body;

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return c.json({ error: 'Please provide a valid email address.' }, 400);
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    return c.json({ error: 'Password must be at least 6 characters long.' }, 400);
  }

  const existing = await getUserByEmail(c.env.DB, email);
  if (existing) {
    return c.json({ error: 'An account with this email address already exists. Please log in.' }, 409);
  }

  // Use current anonymous userId so existing workspace settings / YouTube tokens attach to this account
  const currentUserId = c.get('userId') || crypto.randomUUID();
  const salt = generateRandomHex(16);
  const passwordHash = await hashPassword(password, salt);

  const newUser = await createUserWithPassword(c.env.DB, {
    id: currentUserId,
    email,
    passwordHash,
    salt,
    name: name || email.split('@')[0]
  });

  // Create 30-day session
  const token = generateSessionToken();
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  await createSession(c.env.DB, newUser.id, token, expiresAt);

  const ytAccount = await getYouTubeAccount(c.env.DB, newUser.id);

  return c.json({
    success: true,
    user: {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name
    },
    token,
    expiresAt,
    youtubeAccount: ytAccount ? {
      channel_id: ytAccount.channel_id,
      channel_title: ytAccount.channel_title,
      channel_handle: ytAccount.channel_handle,
      channel_thumbnail: ytAccount.channel_thumbnail
    } : null
  }, 201);
});

/**
 * POST /api/auth/login
 * Authenticate user with email and password.
 */
app.post('/api/auth/login', withUser, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password } = body;

  if (!email || !password) {
    return c.json({ error: 'Please enter your email and password.' }, 400);
  }

  const user = await getUserByEmail(c.env.DB, email);
  if (!user || !user.password_hash || !user.salt) {
    return c.json({ error: 'Invalid email or password.' }, 401);
  }

  const isValid = await verifyPassword(password, user.salt, user.password_hash);
  if (!isValid) {
    return c.json({ error: 'Invalid email or password.' }, 401);
  }

  // Create 30-day session
  const token = generateSessionToken();
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  await createSession(c.env.DB, user.id, token, expiresAt);

  // Update last seen
  await getOrCreateUser(c.env.DB, user.id);

  const ytAccount = await getYouTubeAccount(c.env.DB, user.id);

  return c.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name || user.email.split('@')[0]
    },
    token,
    expiresAt,
    youtubeAccount: ytAccount ? {
      channel_id: ytAccount.channel_id,
      channel_title: ytAccount.channel_title,
      channel_handle: ytAccount.channel_handle,
      channel_thumbnail: ytAccount.channel_thumbnail
    } : null
  });
});

/**
 * GET /api/auth/me
 * Return profile of current authenticated user.
 */
app.get('/api/auth/me', withUser, async (c) => {
  const userId = c.get('userId');
  const user = await getUserById(c.env.DB, userId);
  const ytAccount = await getYouTubeAccount(c.env.DB, userId);

  const isAuthenticated = Boolean(user && user.email);

  return c.json({
    authenticated: isAuthenticated,
    user: isAuthenticated ? {
      id: user.id,
      email: user.email,
      name: user.name || user.email.split('@')[0],
      created_at: user.created_at
    } : null,
    youtubeAccount: ytAccount ? {
      channel_id: ytAccount.channel_id,
      channel_title: ytAccount.channel_title,
      channel_handle: ytAccount.channel_handle,
      channel_thumbnail: ytAccount.channel_thumbnail
    } : null
  });
});

/**
 * POST /api/auth/logout
 * Revoke the current active session.
 */
app.post('/api/auth/logout', withUser, async (c) => {
  const authHeader = c.req.header('Authorization') || c.req.header('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) {
      await deleteSession(c.env.DB, token);
    }
  }
  return c.json({ success: true });
});

// ─── YouTube OAuth ─────────────────────────────────────────────────────────────

/**
 * GET /api/youtube/connect
 * Redirects to Google OAuth authorization page.
 */
app.get('/api/youtube/connect', withUser, (c) => {
  const userId = c.get('userId');
  const frontendUrl = c.req.query('frontendUrl') || c.req.header('referer') || c.env.FRONTEND_URL || 'http://localhost:3000';
  const isPopup = c.req.query('popup') === '1' || c.req.query('popup') === 'true';

  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) {
    return c.json({
      error: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your Worker environment.'
    }, 500);
  }

  const authUrl = buildAuthUrl(c.env, userId, frontendUrl, isPopup);
  return c.redirect(authUrl);
});

/**
 * GET /api/youtube/callback
 * Google redirects here after user grants permission.
 * Exchanges code → tokens, fetches channel info, stores in D1, communicates with frontend via postMessage or redirect.
 */
app.get('/api/youtube/callback', async (c) => {
  const { code, state, error } = c.req.query();
  let frontendUrl = (c.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  let isPopup = false;
  let userId;

  if (state) {
    try {
      const decoded = decodeState(state);
      userId = decoded.userId;
      if (decoded.frontendUrl) {
        frontendUrl = decoded.frontendUrl.replace(/\/$/, '');
      }
      if (decoded.isPopup) {
        isPopup = Boolean(decoded.isPopup);
      }
    } catch {}
  }

  const renderAuthHtml = (success, errorMsg = null) => {
    const isHttps = frontendUrl.startsWith('https://');
    if (userId) {
      setCookie(c, '__vcuid', btoa(userId), {
        httpOnly: true,
        path: '/',
        sameSite: 'Lax',
        maxAge: 31536000,
        secure: isHttps
      });
    }

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${success ? 'YouTube Connected' : 'Connection Error'}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #090d16;
      color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 28px;
      max-width: 420px;
      text-align: center;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    }
    h2 { margin: 0 0 12px; font-size: 1.25rem; }
    p { color: #94a3b8; font-size: 0.9rem; margin: 0 0 16px; }
    .success { color: #10b981; }
    .error { color: #ef4444; }
    .btn {
      background: #6366f1;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.85rem;
    }
  </style>
</head>
<body>
  <div class="card">
    <h2 class="${success ? 'success' : 'error'}">${success ? '✓ YouTube Connected!' : '✕ Connection Failed'}</h2>
    <p>${success ? 'Your account has been connected successfully. Closing window...' : (errorMsg || 'An error occurred during connection.')}</p>
    <button class="btn" onclick="window.close()">Close Window</button>
  </div>
  <script>
    const msg = {
      type: '${success ? 'YOUTUBE_AUTH_SUCCESS' : 'YOUTUBE_AUTH_ERROR'}',
      userId: ${JSON.stringify(userId)},
      error: ${JSON.stringify(errorMsg)}
    };
    if (window.opener) {
      try {
        window.opener.postMessage(msg, '*');
      } catch(e) {}
      setTimeout(() => {
        window.close();
      }, 1000);
    } else {
      setTimeout(() => {
        window.location.href = '${frontendUrl}' + '${success ? '?yt_connected=1' : '?yt_error=' + encodeURIComponent(errorMsg || 'error')}';
      }, 1200);
    }
  </script>
</body>
</html>`;
    return c.html(html);
  };

  if (error) {
    return renderAuthHtml(false, error);
  }

  if (!code || !userId) {
    return renderAuthHtml(false, 'Missing required authorization code or user session state');
  }

  try {
    // Exchange authorization code for tokens
    const tokens = await exchangeCodeForTokens(c.env, code);

    // Fetch YouTube channel info
    const channelInfo = await fetchChannelInfo(tokens.access_token);

    // Store in D1 (refresh token stays server-side)
    await upsertYouTubeAccount(c.env.DB, userId, {
      ...channelInfo,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || '',
      token_expiry: Date.now() + (tokens.expires_in || 3600) * 1000,
      scopes: tokens.scope || ''
    });

    return renderAuthHtml(true);
  } catch (err) {
    console.error('YouTube callback error:', err);
    return renderAuthHtml(false, err.message);
  }
});

/**
 * GET /api/youtube/account
 * Returns the connected YouTube channel info (no tokens in response).
 */
app.get('/api/youtube/account', withUser, async (c) => {
  const userId = c.get('userId');
  const account = await getYouTubeAccount(c.env.DB, userId);

  if (!account) {
    return c.json({ connected: false, account: null });
  }

  // Return channel info only — never return tokens
  return c.json({
    connected: true,
    account: {
      id: account.id,
      channel_id: account.channel_id,
      channel_title: account.channel_title,
      channel_handle: account.channel_handle,
      channel_thumbnail: account.channel_thumbnail,
      created_at: account.created_at,
      updated_at: account.updated_at
    }
  });
});

/**
 * POST /api/youtube/disconnect
 * Removes the YouTube account from D1.
 */
app.post('/api/youtube/disconnect', withUser, async (c) => {
  const userId = c.get('userId');
  await deleteYouTubeAccount(c.env.DB, userId);
  return c.json({ success: true });
});

// ─── Facebook OAuth & Pages (Meta Graph API v26.0) ───────────────────────────

/**
 * GET /api/facebook/connect
 * Redirects to Facebook OAuth authorization page.
 */
/**
 * GET /api/facebook/connect
 * Redirects to Facebook OAuth authorization page.
 */
app.get('/api/facebook/connect', withUser, async (c) => {
  const userId = c.get('userId');
  const frontendUrl = c.req.query('frontendUrl') || c.req.header('referer') || c.env.FRONTEND_URL || 'http://localhost:3000';
  const isPopup = c.req.query('popup') === '1' || c.req.query('popup') === 'true';

  console.log('[FB Worker] /api/facebook/connect requested:', { userId, frontendUrl, isPopup });

  if (!c.env.FACEBOOK_APP_ID || !c.env.FACEBOOK_APP_SECRET) {
    console.error('[FB Worker] FACEBOOK_APP_ID or FACEBOOK_APP_SECRET missing');
    return c.json({
      error: 'Facebook OAuth is not configured. Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in your environment.'
    }, 500);
  }

  const authUrl = await buildFacebookAuthUrl(c.env, userId, frontendUrl, isPopup);
  console.log('[FB Worker] Redirecting to Meta OAuth URL:', authUrl);
  return c.redirect(authUrl);
});

/**
 * GET /api/facebook/callback
 * Facebook redirects here after user authorization.
 */
app.get('/api/facebook/callback', async (c) => {
  const { code, state, error, error_description } = c.req.query();
  let frontendUrl = (c.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  let isPopup = false;
  let userId;

  console.log('[FB Worker] /api/facebook/callback received:', {
    hasCode: !!code,
    state,
    error,
    error_description
  });

  const secretKey = c.env.ENCRYPTION_KEY || c.env.FACEBOOK_APP_SECRET || 'oauth-state-secret-salt-2026';

  if (state) {
    try {
      const decoded = await verifyOAuthState(state, secretKey);
      userId = decoded.userId;
      if (decoded.frontendUrl) {
        // Validate URL format
        try {
          const parsed = new URL(decoded.frontendUrl);
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            frontendUrl = decoded.frontendUrl.replace(/\/$/, '');
          }
        } catch {}
      }
      if (decoded.isPopup) {
        isPopup = Boolean(decoded.isPopup);
      }
      console.log('[FB Worker] Verified OAuth state:', { userId, frontendUrl, isPopup });
    } catch (e) {
      console.error('[FB Worker] Failed to verify OAuth state:', e.message);
      return c.html(`<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;"><div style="text-align:center;"><h2>Security Error</h2><p>${e.message}</p></div></body></html>`, 403);
    }
  }

  const renderAuthHtml = (success, errorMsg = null) => {
    const isHttps = frontendUrl.startsWith('https://');
    if (userId) {
      setCookie(c, '__vcuid', btoa(userId), {
        httpOnly: true,
        path: '/',
        sameSite: 'Lax',
        maxAge: 31536000,
        secure: isHttps
      });
    }

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${success ? 'Facebook Connected' : 'Facebook Connection Error'}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #090d16;
      color: #f8fafc;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
      text-align: center;
    }
    .card {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 16px;
      padding: 32px;
      max-width: 440px;
      width: 100%;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .icon {
      width: 56px;
      height: 56px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
      font-size: 28px;
    }
    .icon.success { background: rgba(24, 119, 242, 0.15); color: #1877f2; border: 1px solid rgba(24, 119, 242, 0.3); }
    .icon.error { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }
    h2 { margin: 0 0 8px; font-size: 20px; font-weight: 700; color: #ffffff; }
    p { margin: 0 0 24px; color: #94a3b8; font-size: 14px; line-height: 1.5; word-break: break-word; }
    .btn {
      display: inline-block;
      width: 100%;
      padding: 12px;
      background: #1877f2;
      color: white;
      text-decoration: none;
      border-radius: 10px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      border: none;
      box-sizing: border-box;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon ${success ? 'success' : 'error'}">
      ${success ? '✓' : '✕'}
    </div>
    <h2>${success ? 'Facebook Connected!' : 'Connection Failed'}</h2>
    <p>${success ? 'Your Facebook Page has been linked successfully. You can now close this window.' : (errorMsg || error_description || 'Unable to connect to Facebook.')}</p>
    <button class="btn" onclick="window.close()">Close Window</button>
  </div>
  <script>
    try {
      const msg = {
        type: 'FACEBOOK_AUTH_RESULT',
        success: ${success},
        error: ${JSON.stringify(errorMsg || error_description || null)}
      };
      if (window.opener) {
        try { window.opener.postMessage(msg, '${frontendUrl}'); } catch(e){}
        try { window.opener.postMessage(msg, '*'); } catch(e){}
        setTimeout(() => window.close(), 1200);
      } else {
        setTimeout(() => { window.location.href = '${frontendUrl}'; }, 1500);
      }
    } catch(e) {
      setTimeout(() => { window.location.href = '${frontendUrl}'; }, 1500);
    }
  </script>
</body>
</html>`;
    return c.html(html);
  };

  if (error) {
    console.error('[FB Worker] Meta returned error in callback:', error, error_description);
    return renderAuthHtml(false, error_description || error);
  }

  if (!code) {
    console.error('[FB Worker] No authorization code received');
    return renderAuthHtml(false, 'No authorization code received.');
  }

  try {
    const secretKey = c.env.ENCRYPTION_KEY || c.env.FACEBOOK_APP_SECRET || '7a279df54155e4f8f70991df0a4e9c9c';
    console.log('[FB Worker] Exchanging authorization code for long-lived tokens...');
    const { userAccessToken } = await exchangeFacebookCodeForTokens(c.env, code);
    console.log('[FB Worker] Tokens received. Fetching user and managed pages from Meta...');
    const { fbUser, pages } = await fetchFacebookPages(c.env, userAccessToken);

    console.log('[FB Worker] Pages found count:', pages?.length, pages?.map(p => ({ id: p.page_id, name: p.page_name })));

    // Encrypt sensitive tokens server-side before storing
    const encryptedUserToken = await encryptToken(userAccessToken, secretKey);
    const encryptedPages = await Promise.all(
      (pages || []).map(async (p) => ({
        page_id: p.page_id,
        page_name: p.page_name,
        page_category: p.page_category,
        page_thumbnail: p.page_thumbnail,
        page_access_token: await encryptToken(p.page_access_token, secretKey),
        tasks: p.tasks || []
      }))
    );

    const hasPages = encryptedPages && encryptedPages.length > 0;
    const primaryPage = hasPages ? encryptedPages[0] : {
      page_id: '',
      page_name: '',
      page_category: '',
      page_thumbnail: null,
      page_access_token: ''
    };

    console.log('[FB Worker] Saving Facebook Account to D1 database for userId:', userId, 'Primary Page:', primaryPage.page_name || '(None yet)');
    await upsertFacebookAccount(c.env.DB, userId, {
      fb_user_id: fbUser?.id || null,
      fb_user_name: fbUser?.name || null,
      page_id: primaryPage.page_id,
      page_name: primaryPage.page_name,
      page_category: primaryPage.page_category,
      page_thumbnail: primaryPage.page_thumbnail,
      page_access_token: primaryPage.page_access_token,
      user_access_token: encryptedUserToken,
      available_pages: encryptedPages
    });

    console.log('[FB Worker] ✓ Upsert successful. Rendering success page.');
    return renderAuthHtml(true);
  } catch (err) {
    console.error('[FB Worker] Callback processing failed:', err.stack || err.message);
    return renderAuthHtml(false, err.message);
  }
});

/**
 * GET /api/facebook/account
 * Returns current connected page and user auth state. Never returns sensitive tokens.
 */
app.get('/api/facebook/account', withUser, async (c) => {
  const userId = c.get('userId');
  const account = await getFacebookAccount(c.env.DB, userId);

  if (!account) {
    return c.json({
      connected: false,
      isUserConnected: false,
      isPageConnected: false,
      facebook: null,
      account: null,
      availablePages: []
    });
  }

  let availablePages = [];
  try {
    availablePages = typeof account.available_pages === 'string'
      ? JSON.parse(account.available_pages || '[]')
      : (account.available_pages || []);
  } catch {}

  // Strip all sensitive tokens from client response
  const sanitizedPages = availablePages.map(p => ({
    page_id: p.page_id,
    page_name: p.page_name,
    page_category: p.page_category,
    page_thumbnail: p.page_thumbnail
  }));

  const hasPage = Boolean(account.page_id && account.page_name && account.page_access_token);
  const hasUser = Boolean(account.user_access_token || account.fb_user_id);

  return c.json({
    connected: hasPage,
    isUserConnected: hasUser,
    isPageConnected: hasPage,
    facebook: hasPage ? {
      page_id: account.page_id,
      page_name: account.page_name
    } : null,
    account: {
      id: account.id,
      fb_user_id: account.fb_user_id,
      fb_user_name: account.fb_user_name,
      page_id: account.page_id || null,
      page_name: account.page_name || null,
      page_category: account.page_category || null,
      page_thumbnail: account.page_thumbnail || null,
      created_at: account.created_at
    },
    availablePages: sanitizedPages
  });
});

/**
 * GET /api/facebook/debug-account
 * GET /api/facebook/debug-page
 * Returns safe diagnostic info without exposing any token.
 */
app.get('/api/facebook/debug-page', withUser, async (c) => {
  const userId = c.get('userId');
  const videoId = c.req.query('videoId') || null;
  const account = await getFacebookAccount(c.env.DB, userId);

  if (!account || !account.page_id) {
    return c.json({
      connected: false,
      page_id: null,
      page_name: null,
      has_page_access_token: false,
      can_publish: false,
      error: 'No Facebook Page connected.'
    });
  }

  const secretKey = c.env.ENCRYPTION_KEY || c.env.FACEBOOK_APP_SECRET || '7a279df54155e4f8f70991df0a4e9c9c';
  const decryptedPageToken = await decryptToken(account.page_access_token, secretKey);

  const diag = await verifyPagePublishCapability(c.env, decryptedPageToken, account.page_id, videoId);

  return c.json({
    connected: diag.connected,
    page_id: account.page_id,
    page_name: diag.page_name || account.page_name,
    has_page_access_token: Boolean(decryptedPageToken),
    can_publish: diag.can_publish,
    tasks: diag.tasks || [],
    graph_version: diag.graph_version,
    token_expired: diag.token_expired || false,
    reel: diag.reel || null,
    reel_error: diag.reelError || null,
    error: diag.error || null
  });
});

app.get('/api/facebook/debug-account', withUser, async (c) => {
  const userId = c.get('userId');
  const videoId = c.req.query('videoId') || null;
  const account = await getFacebookAccount(c.env.DB, userId);

  if (!account || !account.page_id) {
    return c.json({
      connected: false,
      page_id: null,
      page_name: null,
      has_page_access_token: false,
      can_publish: false,
      error: 'No Facebook Page connected.'
    });
  }

  const secretKey = c.env.ENCRYPTION_KEY || c.env.FACEBOOK_APP_SECRET || '7a279df54155e4f8f70991df0a4e9c9c';
  const decryptedPageToken = await decryptToken(account.page_access_token, secretKey);

  const diag = await verifyPagePublishCapability(c.env, decryptedPageToken, account.page_id, videoId);

  return c.json({
    connected: diag.connected,
    page_id: account.page_id,
    page_name: diag.page_name || account.page_name,
    has_page_access_token: Boolean(decryptedPageToken),
    can_publish: diag.can_publish,
    tasks: diag.tasks || [],
    graph_version: diag.graph_version,
    token_expired: diag.token_expired || false,
    reel: diag.reel || null,
    reel_error: diag.reelError || null,
    error: diag.error || null
  });
});

/**
 * POST /api/facebook/connect-page-id
 * Validates that submitted Page ID belongs to the authenticated user and stores verified Meta Page token.
 */
app.post('/api/facebook/connect-page-id', withUser, async (c) => {
  const userId = c.get('userId');
  let body = {};
  try {
    body = await c.req.json();
  } catch {}

  const pageId = body.page_id || body.pageId;

  if (!pageId || !String(pageId).trim()) {
    return c.json({ success: false, error: 'Facebook Page ID is required.' }, 400);
  }

  const account = await getFacebookAccount(c.env.DB, userId);
  if (!account || !account.user_access_token) {
    return c.json({
      success: false,
      error: 'Please authenticate / sign in with Facebook first before connecting a Page ID.'
    }, 401);
  }

  const secretKey = c.env.ENCRYPTION_KEY || c.env.FACEBOOK_APP_SECRET || '7a279df54155e4f8f70991df0a4e9c9c';
  const decryptedUserToken = await decryptToken(account.user_access_token, secretKey);

  try {
    console.log('[FB Worker] Validating Facebook Page ID with Meta:', pageId, 'for userId:', userId);
    const pageData = await validateAndGetPageToken(
      c.env,
      decryptedUserToken,
      pageId
    );

    const encryptedPageToken = await encryptToken(pageData.page_access_token, secretKey);

    // Merge into available_pages
    let availablePages = [];
    try {
      availablePages = typeof account.available_pages === 'string'
        ? JSON.parse(account.available_pages || '[]')
        : (account.available_pages || []);
    } catch {}

    const storedPageObj = {
      page_id: pageData.page_id,
      page_name: pageData.page_name,
      page_category: pageData.page_category,
      page_thumbnail: pageData.page_thumbnail,
      page_access_token: encryptedPageToken,
      tasks: pageData.tasks || []
    };

    const existingIdx = availablePages.findIndex(p => p.page_id === pageData.page_id);
    if (existingIdx >= 0) {
      availablePages[existingIdx] = storedPageObj;
    } else {
      availablePages.push(storedPageObj);
    }

    const updatedAccount = await upsertFacebookAccount(c.env.DB, userId, {
      fb_user_id: account.fb_user_id,
      fb_user_name: account.fb_user_name,
      page_id: pageData.page_id,
      page_name: pageData.page_name,
      page_category: pageData.page_category,
      page_thumbnail: pageData.page_thumbnail,
      page_access_token: encryptedPageToken,
      user_access_token: account.user_access_token,
      available_pages: availablePages
    });

    return c.json({
      success: true,
      connected: true,
      facebook: {
        page_id: pageData.page_id,
        page_name: pageData.page_name
      },
      account: {
        id: updatedAccount.id,
        fb_user_id: updatedAccount.fb_user_id,
        fb_user_name: updatedAccount.fb_user_name,
        page_id: updatedAccount.page_id,
        page_name: updatedAccount.page_name,
        page_category: updatedAccount.page_category,
        page_thumbnail: updatedAccount.page_thumbnail,
        created_at: updatedAccount.created_at
      }
    });
  } catch (err) {
    console.error('[FB Worker] Failed to connect Page ID:', err.message);
    return c.json({
      success: false,
      error: err.message || 'This Facebook Page is not accessible by the connected Facebook account.'
    }, err.status || 400);
  }
});

/**
 * POST /api/facebook/select-page
 * Switch the active Facebook Page from available pages list.
 */
app.post('/api/facebook/select-page', withUser, async (c) => {
  const userId = c.get('userId');
  let body = {};
  try {
    body = await c.req.json();
  } catch {}

  const targetPageId = body.page_id;
  if (!targetPageId) {
    return c.json({ error: 'page_id is required' }, 400);
  }

  const account = await getFacebookAccount(c.env.DB, userId);
  if (!account) {
    return c.json({ error: 'No Facebook account connected' }, 404);
  }

  let availablePages = [];
  try {
    availablePages = typeof account.available_pages === 'string'
      ? JSON.parse(account.available_pages || '[]')
      : (account.available_pages || []);
  } catch {}

  const target = availablePages.find(p => p.page_id === targetPageId);
  if (!target) {
    return c.json({ error: 'Selected page not found in your managed pages list' }, 404);
  }

  const updated = await updateFacebookPageSelection(c.env.DB, userId, target);
  return c.json({
    success: true,
    connected: true,
    facebook: {
      page_id: updated.page_id,
      page_name: updated.page_name
    }
  });
});

/**
 * POST /api/facebook/disconnect
 * Disconnect Facebook account from D1.
 */
app.post('/api/facebook/disconnect', withUser, async (c) => {
  const userId = c.get('userId');
  await deleteFacebookAccount(c.env.DB, userId);
  return c.json({ success: true });
});

// ─── Backblaze B2 Storage Target ─────────────────────────────────────────────

/**
 * POST /api/facebook/b2/upload-url
 * Get presigned B2 upload URL and token.
 */
app.post('/api/facebook/b2/upload-url', withUser, async (c) => {
  try {
    const target = await b2GetUploadUrl(c.env);
    return c.json({
      success: true,
      uploadUrl: target.uploadUrl,
      authorizationToken: target.authorizationToken
    });
  } catch (err) {
    console.error('B2 upload url error:', err);
    return c.json({ error: err.message }, 500);
  }
});

// ─── Facebook Publishing & Reels Ingestion ────────────────────────────────────

/**
 * POST /api/facebook/publish
 * Ingest from temporary B2 file -> upload to Meta Graph API -> cleanup B2 -> record job in D1.
 */
app.post('/api/facebook/publish', withUser, async (c) => {
  const userId = c.get('userId');
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const {
    contentType = 'reel', // 'reel' | 'video'
    b2FileId,
    b2FileName,
    caption = '',
    title = '',
    description = '',
    hashtags = [],
    isAiGenerated = false,
    scheduledAt = null,
    pageId = null,
    retainB2 = false
  } = body;

  if (!b2FileId || !b2FileName) {
    return c.json({ error: 'b2FileId and b2FileName are required for upload ingest.' }, 400);
  }

  const account = await getFacebookAccount(c.env.DB, userId);
  if (!account || !account.page_access_token) {
    return c.json({ error: 'Facebook Page is not connected. Please connect your Facebook account first.' }, 400);
  }

  const secretKey = c.env.ENCRYPTION_KEY || c.env.FACEBOOK_APP_SECRET || '7a279df54155e4f8f70991df0a4e9c9c';
  const activePageId = pageId || account.page_id;
  let encryptedPageToken = account.page_access_token;

  // If specific page requested, check available pages
  if (pageId && pageId !== account.page_id) {
    try {
      const pages = JSON.parse(account.available_pages || '[]');
      const match = pages.find(p => p.page_id === pageId);
      if (match && match.page_access_token) {
        encryptedPageToken = match.page_access_token;
      } else {
        return c.json({ error: `Selected Facebook Page ID (${pageId}) is not in your connected pages list.` }, 400);
      }
    } catch {
      return c.json({ error: `Could not parse managed pages for Page ID (${pageId}).` }, 400);
    }
  }

  const activePageToken = await decryptToken(encryptedPageToken, secretKey);
  if (!activePageToken) {
    return c.json({ error: 'Facebook Page Access Token could not be decrypted. Please reconnect your Page.' }, 400);
  }

  // Pre-publish validation: verify Page token subject ID strictly matches activePageId
  try {
    await validatePageTokenMatch(c.env, activePageToken, activePageId);
  } catch (valErr) {
    return c.json({ error: valErr.message }, 403);
  }

  const normalizedScheduledAt = normalizeToUtcIso(scheduledAt);
  const isFutureSchedule = normalizedScheduledAt && (new Date(normalizedScheduledAt).getTime() > Date.now() + 60000);

  // Create initial D1 job record
  const job = await createFacebookUploadJob(c.env.DB, {
    user_id: userId,
    facebook_account_id: account.id,
    page_id: activePageId,
    content_type: contentType,
    title,
    caption,
    description,
    hashtags,
    is_ai_generated: isAiGenerated ? 1 : 0,
    scheduled_at: normalizedScheduledAt,
    status: isFutureSchedule ? 'scheduled' : 'processing',
    b2_file_id: b2FileId,
    b2_file_name: b2FileName
  });

  // If scheduled in the future, do not publish to Meta immediately.
  // Video remains safely stored in Backblaze B2, and the Cloudflare Worker cron publishes it when scheduled_at arrives.
  if (isFutureSchedule) {
    console.log(`[SCHEDULER] Facebook Reel queued for background schedule at ${normalizedScheduledAt} (jobId=${job.id})`);
    return c.json({
      success: true,
      jobId: job.id,
      page_id: activePageId,
      status: 'scheduled',
      scheduled_at: normalizedScheduledAt,
      message: `Reel scheduled for ${new Date(normalizedScheduledAt).toLocaleString()}. Video file queued in Backblaze B2.`
    });
  }

  try {
    // 1. Generate authorized download link from B2
    const b2DownloadUrl = await b2GetDownloadUrl(c.env, b2FileName, 3600);

    // Pre-flight check: verify file exists in B2 before initiating Meta ingestion
    try {
      const headCheck = await fetch(b2DownloadUrl, { method: 'HEAD' });
      if (headCheck.status === 404) {
        console.warn(`[FB Publish] B2 file not found (404): ${b2FileName}`);
        await updateFacebookUploadJob(c.env.DB, job.id, {
          status: 'failed',
          error_message: `B2_FILE_NOT_FOUND: The media file "${b2FileName}" was not found in temporary storage (it was already published or cleaned up).`
        });
        return c.json({
          success: false,
          error: `B2_FILE_NOT_FOUND: The media file "${b2FileName}" is no longer in temporary storage. Please re-upload the clip.`,
          code: 'B2_FILE_NOT_FOUND',
          b2FileName,
          jobId: job.id
        }, 404);
      }
    } catch (headErr) {
      console.warn('[FB Publish] Pre-flight HEAD check warning:', headErr.message);
    }

    // Format full caption including hashtags
    const hashtagsStr = Array.isArray(hashtags) && hashtags.length > 0
      ? hashtags.map(t => `#${t.replace(/^#+/, '')}`).join(' ')
      : '';
    const fullCaption = `${caption ? caption.trim() : ''}${hashtagsStr ? (caption ? '\n\n' : '') + hashtagsStr : ''}`;

    let publishResult;
    if (contentType === 'image' || contentType === 'photo') {
      publishResult = await publishFacebookPhoto(c.env, activePageToken, activePageId, {
        b2DownloadUrl,
        caption: fullCaption || title || '',
        scheduledAt: null
      });
    } else if (contentType === 'story') {
      publishResult = await publishFacebookPhotoStory(c.env, activePageToken, activePageId, {
        b2DownloadUrl
      });
    } else if (contentType === 'reel') {
      publishResult = await publishFacebookReel(c.env, activePageToken, activePageId, {
        b2DownloadUrl,
        caption: fullCaption,
        title,
        isAiGenerated,
        scheduledAt: null // Immediate publish
      });
    } else {
      publishResult = await publishFacebookPageVideo(c.env, activePageToken, activePageId, {
        b2DownloadUrl,
        title,
        description: fullCaption || description,
        scheduledAt: null
      });
    }

    const postId = publishResult.postId || publishResult.videoId || publishResult.photoId || publishResult.storyId;
    const isPublished = publishResult.status === 'published';
    const postUrl = isPublished ? (publishResult.postUrl || null) : null;
    console.log(`[FB Ingest] Media upload processed (${postId}) - status=${publishResult.status} postUrl=${postUrl}`);

    // 3. Update job in D1
    const updatedJob = await updateFacebookUploadJob(c.env.DB, job.id, {
      status: publishResult.status || 'published',
      facebook_video_id: publishResult.videoId || publishResult.photoId || publishResult.postId || null,
      facebook_post_url: postUrl,
      published_at: isPublished ? new Date().toISOString() : null
    });

    // 4. Clean up temporary B2 file only if published and no other pending/scheduled jobs need it (and not retained for multi-platform publish)
    if (b2FileName && isPublished && !retainB2) {
      const needed = await isB2FileNeededByOtherJobs(c.env.DB, b2FileName, job.id);
      if (!needed && b2FileId) {
        try {
          await b2DeleteFile(c.env, b2FileId, b2FileName);
          console.log(`[FB Ingest] Cleaned up temporary B2 file: ${b2FileName}`);
        } catch (delErr) {
          console.warn('[FB Ingest] B2 cleanup warning:', delErr.message);
        }
      } else {
        console.log(`[FB Ingest] Retaining B2 file ${b2FileName} for dependent platforms.`);
      }
    } else if (retainB2) {
      console.log(`[FB Ingest] Retaining B2 file ${b2FileName} as requested for multi-platform publishing.`);
    } else if (b2FileName && !isPublished) {
      console.log(`[FB Ingest] Retaining B2 file ${b2FileName} while Facebook Reel processing is in-progress.`);
    }

    return c.json({
      success: true,
      videoId: publishResult.videoId,
      video_id: publishResult.videoId,
      page_id: activePageId,
      status: publishResult.status,
      postUrl: postUrl
    });
  } catch (err) {
    console.error('Facebook publish error:', err);

    await updateFacebookUploadJob(c.env.DB, job.id, {
      status: 'failed',
      error_message: err.message
    });

    return c.json({
      success: false,
      error: `Facebook upload failed: ${err.message}`,
      jobId: job.id
    }, 500);
  }
});

/**
 * GET /api/facebook/jobs
 * Returns Facebook upload job history for current user.
 */
app.get('/api/facebook/jobs', withUser, async (c) => {
  const userId = c.get('userId');
  const jobs = await getFacebookUploadJobs(c.env.DB, userId);
  return c.json(jobs);
});

/**
 * GET /api/facebook/jobs/:id
 * Single Facebook job status.
 */
app.get('/api/facebook/jobs/:id', withUser, async (c) => {
  const id = c.req.param('id');
  const job = await getFacebookUploadJob(c.env.DB, id);
  if (!job) return c.json({ error: 'Job not found' }, 404);
  return c.json(job);
});

// ─── Instagram Graph API OAuth & Account Management ──────────────────────────

/**
 * GET /api/instagram/connect
 * Initiate Meta OAuth for Instagram Professional accounts.
 */
app.get('/api/instagram/connect', withUser, async (c) => {
  const userId = c.get('userId');
  const frontendUrl = c.req.query('frontendUrl') || c.req.header('referer') || c.env.FRONTEND_URL || 'http://localhost:3000';
  const isPopup = c.req.query('popup') === '1' || c.req.query('popup') === 'true';

  console.log('[IG Worker] /api/instagram/connect requested:', { userId, frontendUrl, isPopup });

  if (!c.env.FACEBOOK_APP_ID || !c.env.FACEBOOK_APP_SECRET) {
    console.error('[IG Worker] FACEBOOK_APP_ID or FACEBOOK_APP_SECRET missing');
    return c.json({
      error: 'Meta OAuth is not configured. Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in your environment.'
    }, 500);
  }

  const authUrl = await buildInstagramAuthUrl(c.env, userId, frontendUrl, isPopup);
  console.log('[IG Worker] Redirecting to Meta OAuth URL:', authUrl);
  return c.redirect(authUrl);
});

/**
 * GET /api/instagram/callback
 * Meta redirects here after user grants Instagram permissions.
 */
app.get('/api/instagram/callback', async (c) => {
  const { code, state, error, error_description } = c.req.query();
  let frontendUrl = (c.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  let isPopup = false;
  let userId;

  console.log('[IG Worker] /api/instagram/callback received:', {
    hasCode: !!code,
    state,
    error,
    error_description
  });

  const secretKey = c.env.ENCRYPTION_KEY || c.env.FACEBOOK_APP_SECRET || 'oauth-state-secret-salt-2026';

  if (state) {
    try {
      const decoded = await verifyOAuthState(state, secretKey);
      userId = decoded.userId;
      if (decoded.frontendUrl) {
        try {
          const parsed = new URL(decoded.frontendUrl);
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            frontendUrl = decoded.frontendUrl.replace(/\/$/, '');
          }
        } catch {}
      }
      if (decoded.isPopup) {
        isPopup = Boolean(decoded.isPopup);
      }
      console.log('[IG Worker] Verified OAuth state:', { userId, frontendUrl, isPopup });
    } catch (e) {
      console.error('[IG Worker] Failed to verify OAuth state:', e.message);
      return c.html(`<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;"><div style="text-align:center;"><h2>Security Error</h2><p>${e.message}</p></div></body></html>`, 403);
    }
  }

  const renderAuthHtml = (success, errorMsg = null) => {
    const isHttps = frontendUrl.startsWith('https://');
    if (userId) {
      setCookie(c, '__vcuid', btoa(userId), {
        httpOnly: true,
        path: '/',
        sameSite: 'Lax',
        maxAge: 31536000,
        secure: isHttps
      });
    }

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${success ? 'Instagram Connected' : 'Instagram Connection Error'}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #090d16;
      color: #f8fafc;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
      text-align: center;
    }
    .card {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 16px;
      padding: 32px;
      max-width: 440px;
      width: 100%;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .icon {
      width: 56px;
      height: 56px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
      font-size: 28px;
    }
    .icon.success { background: rgba(225, 48, 108, 0.15); color: #e1306c; border: 1px solid rgba(225, 48, 108, 0.3); }
    .icon.error { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }
    h2 { margin: 0 0 8px; font-size: 20px; font-weight: 700; color: #ffffff; }
    p { margin: 0 0 24px; color: #94a3b8; font-size: 14px; line-height: 1.5; word-break: break-word; }
    .btn {
      display: inline-block;
      width: 100%;
      padding: 12px;
      background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);
      color: white;
      text-decoration: none;
      border-radius: 10px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      border: none;
      box-sizing: border-box;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon ${success ? 'success' : 'error'}">
      ${success ? '✓' : '✕'}
    </div>
    <h2>${success ? 'Instagram Connected!' : 'Connection Failed'}</h2>
    <p>${success ? 'Your Instagram Professional account has been linked successfully. You can now close this window.' : (errorMsg || error_description || 'Unable to connect to Instagram.')}</p>
    <button class="btn" onclick="window.close()">Close Window</button>
  </div>
  <script>
    try {
      const msg = {
        type: 'INSTAGRAM_AUTH_RESULT',
        success: ${success},
        error: ${JSON.stringify(errorMsg || error_description || null)}
      };
      if (window.opener) {
        try { window.opener.postMessage(msg, '${frontendUrl}'); } catch(e){}
        try { window.opener.postMessage(msg, '*'); } catch(e){}
        setTimeout(() => window.close(), 1200);
      } else {
        setTimeout(() => { window.location.href = '${frontendUrl}'; }, 1500);
      }
    } catch(e) {
      setTimeout(() => { window.location.href = '${frontendUrl}'; }, 1500);
    }
  </script>
</body>
</html>`;
    return c.html(html);
  };

  if (error) {
    console.error('[IG Worker] Meta returned error in callback:', error, error_description);
    return renderAuthHtml(false, error_description || error);
  }

  if (!code) {
    console.error('[IG Worker] No authorization code received');
    return renderAuthHtml(false, 'No authorization code received.');
  }

  try {
    const secretKey = c.env.ENCRYPTION_KEY || c.env.FACEBOOK_APP_SECRET || '7a279df54155e4f8f70991df0a4e9c9c';
    console.log('[IG Worker] Exchanging authorization code for long-lived tokens...');
    const { userAccessToken } = await exchangeInstagramCodeForTokens(c.env, code);
    console.log('[IG Worker] Tokens received. Fetching linked Instagram accounts...');
    const { fbUser, accounts } = await fetchInstagramAccounts(c.env, userAccessToken);

    console.log('[IG Worker] Accounts found count:', accounts?.length, accounts?.map(a => ({ id: a.ig_user_id, username: a.ig_username })));

    // Encrypt sensitive tokens server-side before storing
    const encryptedUserToken = await encryptToken(userAccessToken, secretKey);
    const encryptedAccounts = await Promise.all(
      (accounts || []).map(async (a) => ({
        ig_user_id: a.ig_user_id,
        ig_username: a.ig_username,
        ig_name: a.ig_name,
        ig_profile_picture_url: a.ig_profile_picture_url,
        page_id: a.page_id,
        page_name: a.page_name,
        access_token: await encryptToken(a.access_token, secretKey)
      }))
    );

    const hasAccounts = encryptedAccounts && encryptedAccounts.length > 0;
    const primaryAccount = hasAccounts ? encryptedAccounts[0] : {
      ig_user_id: '',
      ig_username: '',
      ig_name: '',
      ig_profile_picture_url: null,
      page_id: null,
      page_name: null,
      access_token: ''
    };

    console.log('[IG Worker] Saving Instagram Account to D1 database for userId:', userId, 'Primary IG:', primaryAccount.ig_username || '(None yet)');
    await upsertInstagramAccount(c.env.DB, userId, {
      ig_user_id: primaryAccount.ig_user_id,
      ig_username: primaryAccount.ig_username,
      ig_name: primaryAccount.ig_name,
      ig_profile_picture_url: primaryAccount.ig_profile_picture_url,
      page_id: primaryAccount.page_id,
      page_name: primaryAccount.page_name,
      access_token: primaryAccount.access_token,
      user_access_token: encryptedUserToken,
      available_accounts: encryptedAccounts
    });

    console.log('[IG Worker] ✓ Upsert successful. Rendering success page.');
    return renderAuthHtml(true);
  } catch (err) {
    console.error('[IG Worker] Callback processing failed:', err.stack || err.message);
    return renderAuthHtml(false, err.message);
  }
});

/**
 * GET /api/instagram/account
 * Returns current connected Instagram account and auth state. Never returns sensitive tokens.
 */
app.get('/api/instagram/account', withUser, async (c) => {
  const userId = c.get('userId');
  const account = await getInstagramAccount(c.env.DB, userId);

  if (!account) {
    return c.json({
      connected: false,
      isUserConnected: false,
      isAccountConnected: false,
      instagram: null,
      account: null,
      availableAccounts: []
    });
  }

  let availableAccounts = [];
  try {
    availableAccounts = typeof account.available_accounts === 'string'
      ? JSON.parse(account.available_accounts || '[]')
      : (account.available_accounts || []);
  } catch {}

  // Strip all sensitive tokens from client response
  const sanitizedAccounts = availableAccounts.map(a => ({
    ig_user_id: a.ig_user_id,
    ig_username: a.ig_username,
    ig_name: a.ig_name,
    ig_profile_picture_url: a.ig_profile_picture_url,
    page_id: a.page_id,
    page_name: a.page_name
  }));

  const hasAccount = Boolean(account.ig_user_id && account.access_token);
  const hasUser = Boolean(account.user_access_token || account.ig_user_id);

  return c.json({
    connected: hasAccount,
    isUserConnected: hasUser,
    isAccountConnected: hasAccount,
    instagram: hasAccount ? {
      ig_user_id: account.ig_user_id,
      ig_username: account.ig_username,
      ig_name: account.ig_name
    } : null,
    account: {
      id: account.id,
      ig_user_id: account.ig_user_id || null,
      ig_username: account.ig_username || null,
      ig_name: account.ig_name || null,
      ig_profile_picture_url: account.ig_profile_picture_url || null,
      page_id: account.page_id || null,
      page_name: account.page_name || null,
      created_at: account.created_at
    },
    availableAccounts: sanitizedAccounts
  });
});

/**
 * GET /api/instagram/debug-account
 * GET /api/instagram/diagnostics
 * Safe authenticated diagnostic endpoints returning connection status, permissions, and publishing limits.
 */
app.get('/api/instagram/debug-account', withUser, async (c) => {
  const userId = c.get('userId');
  const account = await getInstagramAccount(c.env.DB, userId);

  if (!account || !account.ig_user_id) {
    return c.json({
      connected: false,
      ig_user_id: null,
      ig_username: null,
      has_access_token: false,
      can_publish: false,
      quotaUsage: null,
      quotaTotal: null,
      error: 'No Instagram account connected.'
    });
  }

  const secretKey = c.env.ENCRYPTION_KEY || c.env.FACEBOOK_APP_SECRET || 'oauth-state-secret-salt-2026';
  const decryptedToken = await decryptToken(account.access_token, secretKey);

  const diag = await verifyInstagramPublishCapability(c.env, decryptedToken, account.ig_user_id);

  return c.json({
    connected: diag.connected,
    ig_user_id: account.ig_user_id,
    ig_username: diag.ig_username || account.ig_username,
    has_access_token: Boolean(decryptedToken),
    can_publish: diag.can_publish,
    quotaUsage: diag.quotaUsage,
    quotaTotal: diag.quotaTotal,
    error: diag.error || null
  });
});

app.get('/api/instagram/diagnostics', withUser, async (c) => {
  const userId = c.get('userId');
  const account = await getInstagramAccount(c.env.DB, userId);

  if (!account || !account.ig_user_id) {
    return c.json({
      connected: false,
      instagram: null,
      facebookPage: null,
      token: { present: false, valid: false },
      permissions: { instagramBasic: false, instagramContentPublish: false },
      canPublish: false,
      publishingQuota: null,
      error: 'No Instagram account connected.'
    });
  }

  const secretKey = c.env.ENCRYPTION_KEY || c.env.FACEBOOK_APP_SECRET || 'oauth-state-secret-salt-2026';
  const decryptedToken = await decryptToken(account.access_token, secretKey);

  const diag = await verifyInstagramPublishCapability(c.env, decryptedToken, account.ig_user_id);

  return c.json({
    connected: diag.connected,
    instagram: {
      id: account.ig_user_id,
      username: diag.ig_username || account.ig_username,
      name: diag.ig_name || account.ig_name,
      profilePictureUrl: diag.ig_profile_picture_url || account.ig_profile_picture_url
    },
    facebookPage: {
      id: account.page_id || null,
      name: account.page_name || null
    },
    token: {
      present: Boolean(decryptedToken),
      valid: diag.connected,
      created_at: account.created_at
    },
    permissions: {
      instagramBasic: diag.connected,
      instagramContentPublish: diag.can_publish
    },
    canPublish: diag.can_publish,
    publishingQuota: {
      quotaUsage: diag.quotaUsage,
      quotaTotal: diag.quotaTotal
    },
    error: diag.error || null
  });
});

/**
 * POST /api/instagram/connect-account-id
 * Validates that submitted Instagram Account ID / username belongs to user and stores verified token.
 */
app.post('/api/instagram/connect-account-id', withUser, async (c) => {
  const userId = c.get('userId');
  let body = {};
  try {
    body = await c.req.json();
  } catch {}

  const identifier = body.accountId || body.account_id || body.username || body.ig_user_id;

  if (!identifier || !String(identifier).trim()) {
    return c.json({ success: false, error: 'Instagram Account ID or Username is required.' }, 400);
  }

  const account = await getInstagramAccount(c.env.DB, userId);
  if (!account || !account.user_access_token) {
    return c.json({
      success: false,
      error: 'Please authenticate / sign in with Meta first before connecting an Instagram Account.'
    }, 401);
  }

  const secretKey = c.env.ENCRYPTION_KEY || c.env.FACEBOOK_APP_SECRET || '7a279df54155e4f8f70991df0a4e9c9c';
  const decryptedUserToken = await decryptToken(account.user_access_token, secretKey);

  try {
    console.log('[IG Worker] Validating Instagram account with Meta:', identifier, 'for userId:', userId);
    const targetData = await validateAndGetInstagramAccount(
      c.env,
      decryptedUserToken,
      identifier
    );

    const encryptedToken = await encryptToken(targetData.access_token, secretKey);

    // Merge into available_accounts
    let availableAccounts = [];
    try {
      availableAccounts = typeof account.available_accounts === 'string'
        ? JSON.parse(account.available_accounts || '[]')
        : (account.available_accounts || []);
    } catch {}

    const storedObj = {
      ig_user_id: targetData.ig_user_id,
      ig_username: targetData.ig_username,
      ig_name: targetData.ig_name,
      ig_profile_picture_url: targetData.ig_profile_picture_url,
      page_id: targetData.page_id,
      page_name: targetData.page_name,
      access_token: encryptedToken
    };

    const existingIdx = availableAccounts.findIndex(a => a.ig_user_id === targetData.ig_user_id);
    if (existingIdx >= 0) {
      availableAccounts[existingIdx] = storedObj;
    } else {
      availableAccounts.push(storedObj);
    }

    const updatedAccount = await upsertInstagramAccount(c.env.DB, userId, {
      ig_user_id: targetData.ig_user_id,
      ig_username: targetData.ig_username,
      ig_name: targetData.ig_name,
      ig_profile_picture_url: targetData.ig_profile_picture_url,
      page_id: targetData.page_id,
      page_name: targetData.page_name,
      access_token: encryptedToken,
      user_access_token: account.user_access_token,
      available_accounts: availableAccounts
    });

    return c.json({
      success: true,
      connected: true,
      instagram: {
        ig_user_id: targetData.ig_user_id,
        ig_username: targetData.ig_username
      },
      account: {
        id: updatedAccount.id,
        ig_user_id: updatedAccount.ig_user_id,
        ig_username: updatedAccount.ig_username,
        ig_name: updatedAccount.ig_name,
        ig_profile_picture_url: updatedAccount.ig_profile_picture_url,
        page_id: updatedAccount.page_id,
        page_name: updatedAccount.page_name,
        created_at: updatedAccount.created_at
      }
    });
  } catch (err) {
    console.error('[IG Worker] Failed to connect Instagram Account:', err.message);
    return c.json({
      success: false,
      error: err.message || 'This Instagram account is not accessible by the connected Meta account.'
    }, err.status || 400);
  }
});

/**
 * POST /api/instagram/select-account
 * Switch the active Instagram Account from available accounts list.
 */
app.post('/api/instagram/select-account', withUser, async (c) => {
  const userId = c.get('userId');
  let body = {};
  try {
    body = await c.req.json();
  } catch {}

  const targetIgUserId = body.ig_user_id || body.accountId;
  if (!targetIgUserId) {
    return c.json({ error: 'ig_user_id is required' }, 400);
  }

  const account = await getInstagramAccount(c.env.DB, userId);
  if (!account) {
    return c.json({ error: 'No Instagram account connected' }, 404);
  }

  let availableAccounts = [];
  try {
    availableAccounts = typeof account.available_accounts === 'string'
      ? JSON.parse(account.available_accounts || '[]')
      : (account.available_accounts || []);
  } catch {}

  const target = availableAccounts.find(a => a.ig_user_id === targetIgUserId);
  if (!target) {
    return c.json({ error: 'Selected Instagram account not found in your connected accounts list' }, 404);
  }

  const updated = await updateInstagramAccountSelection(c.env.DB, userId, target);
  return c.json({
    success: true,
    connected: true,
    instagram: {
      ig_user_id: updated.ig_user_id,
      ig_username: updated.ig_username
    }
  });
});

/**
 * POST /api/instagram/disconnect
 * Disconnect Instagram account from D1.
 */
app.post('/api/instagram/disconnect', withUser, async (c) => {
  const userId = c.get('userId');
  await deleteInstagramAccount(c.env.DB, userId);
  return c.json({ success: true });
});

/**
 * POST /api/instagram/b2/upload-url
 * Get presigned B2 upload URL and token for Instagram upload.
 */
app.post('/api/instagram/b2/upload-url', withUser, async (c) => {
  try {
    const target = await b2GetUploadUrl(c.env);
    return c.json({
      success: true,
      uploadUrl: target.uploadUrl,
      authorizationToken: target.authorizationToken
    });
  } catch (err) {
    console.error('B2 upload url error for Instagram:', err);
    return c.json({ error: err.message }, 500);
  }
});

// ─── Instagram Publishing & Reels Ingestion ───────────────────────────────────

/**
 * POST /api/instagram/publish
 * Ingest from temporary B2 file -> upload to Meta Graph API Instagram Container -> Poll -> Publish -> cleanup B2.
 */
app.post('/api/instagram/publish', withUser, async (c) => {
  const userId = c.get('userId');
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const {
    contentType = 'reel',
    b2FileId,
    b2FileName,
    caption = '',
    title = '',
    description = '',
    hashtags = [],
    shareToFeed = true,
    isAiGenerated = false,
    scheduledAt = null,
    igUserId = null,
    retainB2 = false
  } = body;

  if (!b2FileId || !b2FileName) {
    return c.json({ error: 'b2FileId and b2FileName are required for upload ingest.' }, 400);
  }

  const account = await getInstagramAccount(c.env.DB, userId);
  if (!account || !account.access_token || !account.ig_user_id) {
    return c.json({ error: 'Instagram Account is not connected. Please connect your Instagram account first.' }, 400);
  }

  const secretKey = c.env.ENCRYPTION_KEY || c.env.FACEBOOK_APP_SECRET || '7a279df54155e4f8f70991df0a4e9c9c';
  const activeIgUserId = igUserId || account.ig_user_id;
  let encryptedToken = account.access_token;

  // If specific account requested, check available accounts
  if (igUserId && igUserId !== account.ig_user_id) {
    try {
      const accounts = JSON.parse(account.available_accounts || '[]');
      const match = accounts.find(a => a.ig_user_id === igUserId);
      if (match && match.access_token) {
        encryptedToken = match.access_token;
      }
    } catch {}
  }

  const activeToken = await decryptToken(encryptedToken, secretKey);
  if (!activeToken) {
    return c.json({ error: 'Instagram Access Token could not be decrypted. Please reconnect your account.' }, 400);
  }

  const normalizedScheduledAt = normalizeToUtcIso(scheduledAt);
  const isFutureSchedule = normalizedScheduledAt && (new Date(normalizedScheduledAt).getTime() > Date.now() + 60000);

  // Create initial D1 job record
  const job = await createInstagramUploadJob(c.env.DB, {
    user_id: userId,
    instagram_account_id: account.id,
    ig_user_id: activeIgUserId,
    content_type: contentType,
    title,
    caption,
    description,
    hashtags,
    is_ai_generated: isAiGenerated ? 1 : 0,
    scheduled_at: normalizedScheduledAt,
    status: isFutureSchedule ? 'scheduled' : 'processing',
    b2_file_id: b2FileId,
    b2_file_name: b2FileName
  });

  // If scheduled in the future, do not publish to Meta immediately.
  // Meta Instagram API does NOT support native scheduled_publish_time for standard apps.
  // We keep the video safely in Backblaze B2, and our background scheduler publishes it at scheduled_at.
  if (isFutureSchedule) {
    console.log(`[SCHEDULER] Instagram Reel queued for background schedule at ${normalizedScheduledAt} (jobId=${job.id})`);
    return c.json({
      success: true,
      jobId: job.id,
      ig_user_id: activeIgUserId,
      status: 'scheduled',
      scheduled_at: normalizedScheduledAt,
      message: `Reel scheduled for ${new Date(normalizedScheduledAt).toLocaleString()}. Video file queued in Backblaze B2.`
    });
  }

  try {
    // 1. Generate authorized download link from B2
    const b2DownloadUrl = await b2GetDownloadUrl(c.env, b2FileName, 3600);

    // Pre-flight check: verify file exists in B2 before initiating Meta ingestion
    try {
      const headCheck = await fetch(b2DownloadUrl, { method: 'HEAD' });
      if (headCheck.status === 404) {
        console.warn(`[IG Publish] B2 file not found (404): ${b2FileName}`);
        await updateInstagramUploadJob(c.env.DB, job.id, {
          status: 'failed',
          error_message: `B2_FILE_NOT_FOUND: The media file "${b2FileName}" was not found in temporary storage (it was already published or cleaned up).`
        });
        return c.json({
          success: false,
          error: `B2_FILE_NOT_FOUND: The media file "${b2FileName}" is no longer in temporary storage. Please re-upload the clip.`,
          code: 'B2_FILE_NOT_FOUND',
          b2FileName,
          jobId: job.id
        }, 404);
      }
    } catch (headErr) {
      console.warn('[IG Publish] Pre-flight HEAD check warning:', headErr.message);
    }

    // Format full caption including hashtags
    const hashtagsStr = Array.isArray(hashtags) && hashtags.length > 0
      ? hashtags.map(t => `#${t.replace(/^#+/, '')}`).join(' ')
      : '';
    const fullCaption = `${caption ? caption.trim() : ''}${hashtagsStr ? (caption ? '\n\n' : '') + hashtagsStr : ''}`;

    // 2. Publish based on content type
    let publishResult;
    if (contentType === 'image' || contentType === 'photo') {
      publishResult = await publishInstagramPhoto(c.env, activeToken, activeIgUserId, {
        b2DownloadUrl,
        caption: fullCaption,
        isAiGenerated,
        scheduledAt: null
      });
    } else if (contentType === 'story') {
      publishResult = await publishInstagramStory(c.env, activeToken, activeIgUserId, {
        b2DownloadUrl
      });
    } else {
      publishResult = await publishInstagramReel(c.env, activeToken, activeIgUserId, {
        b2DownloadUrl,
        caption: fullCaption,
        shareToFeed,
        isAiGenerated,
        scheduledAt: null, // Immediate publish
        onStepUpdate: async ({ containerId, status }) => {
          await updateInstagramUploadJob(c.env.DB, job.id, {
            instagram_container_id: containerId,
            status: status || 'processing'
          });
        }
      });
    }

    const isProcessing = publishResult.status === 'processing';
    console.log(`[IG Ingest] Media result: status=${publishResult.status} mediaId=${publishResult.mediaId || 'none'} containerId=${publishResult.containerId}`);

    // 4. Update job in D1
    await updateInstagramUploadJob(c.env.DB, job.id, {
      status: publishResult.status || 'published',
      instagram_container_id: publishResult.containerId,
      instagram_media_id: publishResult.mediaId || null,
      instagram_post_url: publishResult.postUrl || null,
      published_at: isProcessing ? null : new Date().toISOString()
    });

    // 5. Clean up temporary B2 file if no other pending/scheduled jobs need it (and not retained for multi-platform publish, and NOT still processing)
    if (b2FileName && !retainB2 && !isProcessing) {
      const needed = await isB2FileNeededByOtherJobs(c.env.DB, b2FileName, job.id);
      if (!needed && b2FileId) {
        try {
          await b2DeleteFile(c.env, b2FileId, b2FileName);
          console.log(`[IG Ingest] Cleaned up temporary B2 file: ${b2FileName}`);
        } catch (delErr) {
          console.warn('[IG Ingest] B2 cleanup warning:', delErr.message);
        }
      } else {
        console.log(`[IG Ingest] Retaining B2 file ${b2FileName} for dependent platforms.`);
      }
    } else if (isProcessing) {
      console.log(`[IG Ingest] Retaining B2 file ${b2FileName} while Meta encodes the video stream in background.`);
    } else if (retainB2) {
      console.log(`[IG Ingest] Retaining B2 file ${b2FileName} as requested for multi-platform publishing.`);
    }

    return c.json({
      success: true,
      media_id: publishResult.mediaId || null,
      container_id: publishResult.containerId,
      ig_user_id: activeIgUserId,
      status: publishResult.status,
      postUrl: publishResult.postUrl || null,
      message: publishResult.message || undefined
    });
  } catch (err) {
    console.error('Instagram publish error:', err);

    await updateInstagramUploadJob(c.env.DB, job.id, {
      status: 'failed',
      error_message: err.message
    });

    return c.json({
      success: false,
      error: `Instagram upload failed: ${err.message}`,
      jobId: job.id
    }, 500);
  }
});

/**
 * GET /api/instagram/jobs
 * Returns Instagram upload job history for current user.
 */
app.get('/api/instagram/jobs', withUser, async (c) => {
  const userId = c.get('userId');
  const jobs = await getInstagramUploadJobs(c.env.DB, userId);
  return c.json(jobs);
});

/**
 * GET /api/instagram/jobs/:id
 * Single Instagram job status.
 */
app.get('/api/instagram/jobs/:id', withUser, async (c) => {
  const id = c.req.param('id');
  const job = await getInstagramUploadJob(c.env.DB, id);
  if (!job) return c.json({ error: 'Job not found' }, 404);
  return c.json(job);
});



// ─── Upload Jobs ──────────────────────────────────────────────────────────────

/**
 * GET /api/uploads
 * Returns upload job history from D1.
 */
app.get('/api/uploads', withUser, async (c) => {
  const userId = c.get('userId');
  const jobs = await getUploadJobs(c.env.DB, userId);
  return c.json(jobs);
});

/**
 * GET /api/history/all
 * Returns unified upload history across YouTube, Facebook, and Instagram.
 */
app.get('/api/history/all', withUser, async (c) => {
  const userId = c.get('userId');
  const [youtubeJobs, facebookJobs, instagramJobs] = await Promise.all([
    getUploadJobs(c.env.DB, userId),
    getFacebookUploadJobs(c.env.DB, userId),
    getInstagramUploadJobs(c.env.DB, userId)
  ]);
  return c.json({
    success: true,
    youtube: youtubeJobs || [],
    facebook: facebookJobs || [],
    instagram: instagramJobs || []
  });
});

/**
 * POST /api/history/clear
 * Clear upload history by platform scope ('youtube' | 'facebook' | 'instagram' | 'all')
 */
app.post('/api/history/clear', withUser, async (c) => {
  const userId = c.get('userId');
  let body = {};
  try {
    body = await c.req.json();
  } catch {}

  const platform = body.platform || body.scope || 'all';
  let targetScope = 'history';
  if (platform === 'youtube' || platform === 'youtube_history') targetScope = 'youtube_history';
  else if (platform === 'facebook' || platform === 'facebook_history') targetScope = 'facebook_history';
  else if (platform === 'instagram' || platform === 'instagram_history') targetScope = 'instagram_history';
  else targetScope = 'history';

  const result = await clearUserDataByScope(c.env.DB, userId, targetScope);
  return c.json({ success: true, platform, targetScope, result, deletedCount: result?.deletedCount || 0 });
});

// ─── Social Publishing Sections (Scheduled Videos & Upload History) ──────────

/**
 * GET /api/social/scheduled
 * Section 1: Returns only active scheduled publishing jobs (scheduled, pending, uploading, processing).
 * Automatically reconciles any stuck jobs against Meta Graph API before returning.
 * Never returns completed (published, failed, cancelled) jobs.
 */
app.get('/api/social/scheduled', withUser, async (c) => {
  const userId = c.get('userId');
  try {
    await Promise.all([
      reconcileStuckFacebookJobs(c.env, userId),
      reconcileStuckInstagramJobs(c.env, userId)
    ]);
  } catch (recErr) {
    console.warn('[API] Auto-reconcile on /api/social/scheduled warning:', recErr.message);
  }

  const jobs = await getScheduledSocialJobs(c.env.DB, userId);
  return c.json({ success: true, scheduled: jobs });
});

/**
 * POST /api/social/reconcile
 * Explicitly triggers Meta status reconciliation for all stuck/in-progress jobs.
 */
app.post('/api/social/reconcile', withUser, async (c) => {
  const userId = c.get('userId');
  const [fbResult, igResult] = await Promise.all([
    reconcileStuckFacebookJobs(c.env, userId),
    reconcileStuckInstagramJobs(c.env, userId)
  ]);
  return c.json({
    success: true,
    facebook: fbResult,
    instagram: igResult
  });
});

/**
 * GET /api/social/history
 * Section 2: Returns only completed/terminal publishing jobs (published, failed, cancelled).
 * Supports filters: ?platform=all|facebook|instagram & status=all|published|failed|cancelled
 */
app.get('/api/social/history', withUser, async (c) => {
  const userId = c.get('userId');
  const platform = c.req.query('platform') || 'all';
  const status = c.req.query('status') || 'all';
  const limit = parseInt(c.req.query('limit')) || 100;

  const history = await getCompletedSocialHistory(c.env.DB, userId, { platform, status, limit });
  return c.json({ success: true, history });
});

/**
 * GET /api/social/preview-url
 * Section 1: Generates a secure, temporary signed download URL for previewing a scheduled B2 video.
 * Does NOT expose master B2 credentials or private keys. Valid for 1 hour.
 */
app.get('/api/social/preview-url', withUser, async (c) => {
  const userId = c.get('userId');
  const platform = c.req.query('platform') || 'facebook';
  const jobId = c.req.query('jobId');
  const b2FileNameParam = c.req.query('fileName');

  let b2FileName = b2FileNameParam;

  if (jobId) {
    const job = platform === 'instagram'
      ? await getInstagramUploadJob(c.env.DB, jobId)
      : await getFacebookUploadJob(c.env.DB, jobId);

    if (job) {
      b2FileName = job.b2_file_name;
    }
  }

  if (!b2FileName) {
    return c.json({ error: 'No video file associated with this job' }, 400);
  }

  try {
    const directB2Url = await b2GetDownloadUrl(c.env, b2FileName, 3600);
    const reqUrl = new URL(c.req.url);
    const baseUrl = (c.env.APP_URL || `${reqUrl.protocol}//${reqUrl.host}`).replace(/\/$/, '');
    const streamUrl = `${baseUrl}/api/social/preview-stream?fileName=${encodeURIComponent(b2FileName)}&platform=${encodeURIComponent(platform)}${jobId ? `&jobId=${encodeURIComponent(jobId)}` : ''}`;

    return c.json({
      success: true,
      previewUrl: streamUrl,
      b2DirectUrl: directB2Url,
      b2FileName
    });
  } catch (err) {
    console.error('[API] Failed to generate B2 preview URL:', err);
    return c.json({ error: `Failed to generate preview URL: ${err.message}` }, 500);
  }
});

/**
 * GET /api/social/preview-stream
 * Section 1: Streams and proxies scheduled video bytes from Backblaze B2 with full CORS & HTTP 206 Range support.
 * Guarantees browser HTML5 <video> elements and fetch() work without CORS errors or B2 credential exposure.
 */
app.on(['GET', 'HEAD'], '/api/social/preview-stream', async (c) => {
  const fileName = c.req.query('fileName');
  const jobId = c.req.query('jobId');
  const platform = c.req.query('platform') || 'facebook';

  let b2FileName = fileName;

  if (jobId && !b2FileName) {
    const job = platform === 'instagram'
      ? await getInstagramUploadJob(c.env.DB, jobId)
      : await getFacebookUploadJob(c.env.DB, jobId);
    if (job?.b2_file_name) {
      b2FileName = job.b2_file_name;
    }
  }

  if (!b2FileName) {
    return c.text('Video file not specified', 400);
  }

  try {
    const b2Url = await b2GetDownloadUrl(c.env, b2FileName, 3600);
    const rangeHeader = c.req.header('range') || c.req.header('Range');

    const fetchHeaders = {};
    if (rangeHeader) {
      fetchHeaders['Range'] = rangeHeader;
    }

    const b2Res = await fetch(b2Url, {
      method: c.req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: fetchHeaders
    });

    const responseHeaders = new Headers();
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Range, Authorization, Content-Type, Accept');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Content-Type', b2Res.headers.get('content-type') || 'video/mp4');
    responseHeaders.set('Cache-Control', 'public, max-age=3600');

    if (b2Res.headers.get('content-range')) {
      responseHeaders.set('Content-Range', b2Res.headers.get('content-range'));
    }
    if (b2Res.headers.get('content-length')) {
      responseHeaders.set('Content-Length', b2Res.headers.get('content-length'));
    }

    return new Response(c.req.method === 'HEAD' ? null : b2Res.body, {
      status: b2Res.status,
      headers: responseHeaders
    });
  } catch (err) {
    console.error('[API] Failed to stream preview video:', err);
    return c.text(`Stream failed: ${err.message}`, 500);
  }
});

/**
 * POST /api/social/cancel
 * Section 1: Cancels an active scheduled publishing job for a specific platform.
 * Only works if job status is 'scheduled' or 'pending'.
 * Safely retains B2 file if needed by other platforms; deletes B2 if no jobs remain.
 */
app.post('/api/social/cancel', withUser, async (c) => {
  const userId = c.get('userId');
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { platform, jobId } = body;
  if (!platform || !jobId) {
    return c.json({ error: 'platform and jobId are required' }, 400);
  }

  const cancelRes = await cancelScheduledSocialJob(c.env.DB, userId, platform, jobId);
  if (!cancelRes.success) {
    return c.json({ error: cancelRes.error || 'Failed to cancel schedule' }, 400);
  }

  // Safe B2 lifecycle check: delete file only if no other active jobs need it
  if (cancelRes.b2_file_name) {
    try {
      const needed = await isB2FileNeededByOtherJobs(c.env.DB, cancelRes.b2_file_name, jobId);
      if (!needed) {
        let fileId = cancelRes.b2_file_id;
        if (!fileId) {
          const b2Files = await b2ListFileNames(c.env, 100);
          const target = b2Files.find(f => f.fileName === cancelRes.b2_file_name);
          fileId = target?.fileId;
        }
        if (fileId) {
          await b2DeleteFile(c.env, fileId, cancelRes.b2_file_name);
          console.log(`[Cancel Schedule] Cleaned up unused B2 file: ${cancelRes.b2_file_name}`);
        }
      }
    } catch (b2Err) {
      console.warn('[Cancel Schedule] B2 cleanup warning:', b2Err.message);
    }
  }

  return c.json({ success: true, message: 'Schedule cancelled successfully', job: cancelRes.job });
});

/**
 * POST /api/social/scheduled/delete-selected
 * Permanently delete selected scheduled publishing jobs across Facebook and Instagram.
 * If candidate B2 files are no longer needed by any active job, safely delete them from B2.
 */
app.post('/api/social/scheduled/delete-selected', withUser, async (c) => {
  const userId = c.get('userId');
  let body = {};
  try {
    body = await c.req.json();
  } catch {}

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return c.json({ success: true, deletedCount: 0, deletedIds: [] });
  }

  const result = await deleteScheduledSocialJobs(c.env.DB, userId, items);

  // Check candidate B2 files for cleanup
  if (Array.isArray(result.candidateB2Files)) {
    for (const fileName of result.candidateB2Files) {
      try {
        const needed = await isB2FileNeededByOtherJobs(c.env.DB, fileName);
        if (!needed) {
          const b2Files = await b2ListFileNames(c.env, 100);
          const target = b2Files.find(f => f.fileName === fileName);
          if (target?.fileId) {
            await b2DeleteFile(c.env, target.fileId, fileName);
            console.log(`[Batch Delete Scheduled] Cleaned unused B2 file: ${fileName}`);
          }
        }
      } catch (e) {
        console.warn(`[Batch Delete Scheduled] B2 file cleanup check failed: ${e.message}`);
      }
    }
  }

  return c.json(result);
});

/**
 * DELETE /api/social/scheduled/:platform/:id
 * Permanently delete a single scheduled publishing job.
 */
app.delete('/api/social/scheduled/:platform/:id', withUser, async (c) => {
  const userId = c.get('userId');
  const platform = c.req.param('platform');
  const jobId = c.req.param('id');
  const cancelRes = await cancelScheduledSocialJob(c.env.DB, userId, platform, jobId);
  if (!cancelRes.success) {
    return c.json({ error: cancelRes.error || 'Failed to delete scheduled job' }, 400);
  }
  if (cancelRes.b2_file_name) {
    try {
      const needed = await isB2FileNeededByOtherJobs(c.env.DB, cancelRes.b2_file_name, jobId);
      if (!needed) {
        let fileId = cancelRes.b2_file_id;
        if (!fileId) {
          const b2Files = await b2ListFileNames(c.env, 100);
          const target = b2Files.find(f => f.fileName === cancelRes.b2_file_name);
          fileId = target?.fileId;
        }
        if (fileId) {
          await b2DeleteFile(c.env, fileId, cancelRes.b2_file_name);
          console.log(`[Delete Schedule] Cleaned up unused B2 file: ${cancelRes.b2_file_name}`);
        }
      }
    } catch (b2Err) {
      console.warn('[Delete Schedule] B2 cleanup warning:', b2Err.message);
    }
  }
  return c.json({ success: true, message: 'Scheduled post permanently deleted', job: cancelRes.job });
});

/**
 * POST /api/social/reschedule
 * Section 1: Reschedules an active scheduled publishing job (Facebook or Instagram) to a new future time.
 */
app.post('/api/social/reschedule', withUser, async (c) => {
  const userId = c.get('userId');
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { platform, jobId, scheduledAt, scheduled_at } = body || {};
  const targetTime = scheduledAt || scheduled_at;

  if (!platform || !jobId || !targetTime) {
    return c.json({ error: 'platform, jobId, and scheduledAt are required' }, 400);
  }

  const parsedDate = new Date(targetTime);
  if (isNaN(parsedDate.getTime())) {
    return c.json({ error: 'Invalid scheduled date/time provided' }, 400);
  }

  if (parsedDate.getTime() <= Date.now()) {
    return c.json({ error: 'Scheduled time must be in the future' }, 400);
  }

  const normalizedIso = parsedDate.toISOString();
  const rescheduleRes = await rescheduleScheduledSocialJob(c.env.DB, userId, platform, jobId, normalizedIso);

  if (!rescheduleRes.success) {
    return c.json({ error: rescheduleRes.error || 'Failed to reschedule publishing job' }, 400);
  }

  return c.json({
    success: true,
    message: 'Job rescheduled successfully',
    job: rescheduleRes.job,
    scheduled_at: normalizedIso
  });
});

/**
 * POST /api/social/publish-now
 * Section 1: Immediately executes an active scheduled publishing job (Facebook or Instagram) on-demand.
 * Ingests video directly from B2 to Meta Graph API, updates status to published, and cleans up B2 safely.
 */
app.post('/api/social/publish-now', withUser, async (c) => {
  const userId = c.get('userId');
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { platform, jobId } = body || {};
  if (!platform || !jobId) {
    return c.json({ error: 'platform and jobId are required' }, 400);
  }

  const secretKey = c.env.ENCRYPTION_KEY || c.env.FACEBOOK_APP_SECRET || '7a279df54155e4f8f70991df0a4e9c9c';

  if (platform === 'facebook') {
    const job = await getFacebookUploadJob(c.env.DB, jobId);
    if (!job || job.user_id !== userId) {
      return c.json({ error: 'Job not found or unauthorized' }, 404);
    }
    if (!['scheduled', 'pending', 'failed'].includes(job.status)) {
      return c.json({ error: `Job cannot be published in status: ${job.status}` }, 400);
    }

    const account = await getFacebookAccount(c.env.DB, userId);
    if (!account) {
      return c.json({ error: 'No Facebook account connected. Please connect Facebook first.' }, 400);
    }

    let encryptedPageToken = account.page_access_token;
    if (job.page_id && account.available_pages) {
      try {
        const pages = typeof account.available_pages === 'string' ? JSON.parse(account.available_pages || '[]') : (account.available_pages || []);
        const match = pages.find(p => p.page_id === job.page_id);
        if (match && match.page_access_token) {
          encryptedPageToken = match.page_access_token;
        }
      } catch {}
    }

    const activePageToken = await decryptToken(encryptedPageToken, secretKey);
    if (!activePageToken) {
      return c.json({ error: 'Could not decrypt Facebook Page access token. Please reconnect your Facebook account.' }, 400);
    }

    if (!job.b2_file_name) {
      return c.json({ error: 'Missing B2 video file for this job.' }, 400);
    }

    // Set job status to uploading
    await updateFacebookUploadJob(c.env.DB, job.id, { status: 'uploading' });

    try {
      const b2DownloadUrl = await b2GetDownloadUrl(c.env, job.b2_file_name, 3600);

      let hashtagsArr = [];
      try {
        hashtagsArr = typeof job.hashtags === 'string' ? JSON.parse(job.hashtags || '[]') : (job.hashtags || []);
      } catch {}

      const hashtagsStr = Array.isArray(hashtagsArr) && hashtagsArr.length > 0
        ? hashtagsArr.map(t => `#${t.replace(/^#+/, '')}`).join(' ')
        : '';
      const fullCaption = `${job.caption ? job.caption.trim() : ''}${hashtagsStr ? (job.caption ? '\n\n' : '') + hashtagsStr : ''}`;

      let publishResult;
      if (job.content_type === 'video') {
        publishResult = await publishFacebookPageVideo(c.env, activePageToken, job.page_id || account.page_id, {
          b2DownloadUrl,
          title: job.title || '',
          description: fullCaption || job.description || ''
        });
      } else {
        publishResult = await publishFacebookReel(c.env, activePageToken, job.page_id || account.page_id, {
          b2DownloadUrl,
          caption: fullCaption,
          title: job.title || '',
          isAiGenerated: Boolean(job.is_ai_generated),
          onStepUpdate: async ({ step, videoId }) => {
            if (step === 'start') {
              await updateFacebookUploadJob(c.env.DB, job.id, {
                facebook_video_id: videoId
              });
            } else if (step === 'finish') {
              await updateFacebookUploadJob(c.env.DB, job.id, {
                status: 'processing',
                facebook_video_id: videoId
              });
            }
          }
        });
      }

      await updateFacebookUploadJob(c.env.DB, job.id, {
        status: 'published',
        facebook_video_id: publishResult.videoId || publishResult.photoId || publishResult.postId || null,
        facebook_post_url: publishResult.postUrl,
        published_at: new Date().toISOString()
      });

      // Safe B2 lifecycle check
      if (job.b2_file_name) {
        const needed = await isB2FileNeededByOtherJobs(c.env.DB, job.b2_file_name, job.id);
        if (!needed && job.b2_file_id) {
          try {
            await b2DeleteFile(c.env, job.b2_file_id, job.b2_file_name);
            console.log(`[Publish Now] Cleaned up temporary B2 file: ${job.b2_file_name}`);
          } catch (delErr) {
            console.warn('[Publish Now] B2 cleanup warning:', delErr.message);
          }
        }
      }

      return c.json({
        success: true,
        message: 'Facebook Reel published successfully!',
        videoId: publishResult.videoId,
        postUrl: publishResult.postUrl,
        status: 'published'
      });
    } catch (err) {
      console.error('[Publish Now] Facebook publish error:', err);
      await updateFacebookUploadJob(c.env.DB, job.id, {
        status: 'failed',
        error_message: err.message
      });
      return c.json({ success: false, error: err.message }, 500);
    }
  } else if (platform === 'instagram') {
    const job = await getInstagramUploadJob(c.env.DB, jobId);
    if (!job || job.user_id !== userId) {
      return c.json({ error: 'Job not found or unauthorized' }, 404);
    }
    if (!['scheduled', 'pending', 'failed'].includes(job.status)) {
      return c.json({ error: `Job cannot be published in status: ${job.status}` }, 400);
    }

    const account = await getInstagramAccount(c.env.DB, userId);
    if (!account || !account.access_token || !account.ig_user_id) {
      return c.json({ error: 'No Instagram account connected. Please connect Instagram first.' }, 400);
    }

    const activeToken = await decryptToken(account.access_token, secretKey);
    if (!activeToken) {
      return c.json({ error: 'Could not decrypt Instagram access token. Please reconnect your account.' }, 400);
    }

    if (!job.b2_file_name) {
      return c.json({ error: 'Missing B2 video file for this job.' }, 400);
    }

    // Set job status to uploading
    await updateInstagramUploadJob(c.env.DB, job.id, { status: 'uploading' });

    try {
      const b2DownloadUrl = await b2GetDownloadUrl(c.env, job.b2_file_name, 3600);

      let hashtagsArr = [];
      try {
        hashtagsArr = typeof job.hashtags === 'string' ? JSON.parse(job.hashtags || '[]') : (job.hashtags || []);
      } catch {}

      const hashtagsStr = Array.isArray(hashtagsArr) && hashtagsArr.length > 0
        ? hashtagsArr.map(t => `#${t.replace(/^#+/, '')}`).join(' ')
        : '';
      const fullCaption = `${job.caption ? job.caption.trim() : ''}${hashtagsStr ? (job.caption ? '\n\n' : '') + hashtagsStr : ''}`;

      let publishResult;
      if (job.content_type === 'image' || job.content_type === 'photo') {
        publishResult = await publishInstagramPhoto(c.env, activeToken, job.ig_user_id || account.ig_user_id, {
          b2DownloadUrl,
          caption: fullCaption,
          isAiGenerated: Boolean(job.is_ai_generated)
        });
      } else {
        // If container was already created on a previous attempt, check its status on Meta first
        if (job.instagram_container_id) {
          try {
            const st = await checkInstagramContainerStatus(c.env, activeToken, job.instagram_container_id);
            if (st.isFinished) {
              const pub = await publishInstagramMediaContainer(c.env, activeToken, job.ig_user_id || account.ig_user_id, job.instagram_container_id);
              await updateInstagramUploadJob(c.env.DB, job.id, {
                status: 'published',
                instagram_media_id: pub.mediaId,
                instagram_post_url: pub.postUrl,
                published_at: new Date().toISOString()
              });
              if (job.b2_file_name) {
                const needed = await isB2FileNeededByOtherJobs(c.env.DB, job.b2_file_name, job.id);
                if (!needed && job.b2_file_id) {
                  try { await b2DeleteFile(c.env, job.b2_file_id, job.b2_file_name); } catch {}
                }
              }
              return c.json({
                success: true,
                message: 'Instagram Reel published successfully!',
                mediaId: pub.mediaId,
                postUrl: pub.postUrl,
                status: 'published'
              });
            } else if (!st.isError && !st.isExpired) {
              // Still in progress on Meta
              await updateInstagramUploadJob(c.env.DB, job.id, { status: 'processing' });
              return c.json({
                success: true,
                message: 'Meta is still encoding this video in the background. It will publish automatically once finished.',
                containerId: job.instagram_container_id,
                status: 'processing'
              });
            }
          } catch (checkErr) {
            console.warn('[Publish Now] Container check warning:', checkErr.message);
          }
        }

        publishResult = await publishInstagramReel(c.env, activeToken, job.ig_user_id || account.ig_user_id, {
          b2DownloadUrl,
          caption: fullCaption,
          shareToFeed: true,
          isAiGenerated: Boolean(job.is_ai_generated),
          onStepUpdate: async ({ containerId, status }) => {
            await updateInstagramUploadJob(c.env.DB, job.id, {
              instagram_container_id: containerId,
              status: status || 'processing'
            });
          }
        });
      }

      const isProc = publishResult.status === 'processing';
      await updateInstagramUploadJob(c.env.DB, job.id, {
        status: publishResult.status || 'published',
        instagram_container_id: publishResult.containerId,
        instagram_media_id: publishResult.mediaId || null,
        instagram_post_url: publishResult.postUrl || null,
        published_at: isProc ? null : new Date().toISOString()
      });

      // Safe B2 lifecycle check: only clean up if fully published
      if (job.b2_file_name && !isProc) {
        const needed = await isB2FileNeededByOtherJobs(c.env.DB, job.b2_file_name, job.id);
        if (!needed && job.b2_file_id) {
          try {
            await b2DeleteFile(c.env, job.b2_file_id, job.b2_file_name);
            console.log(`[Publish Now] Cleaned up temporary B2 file: ${job.b2_file_name}`);
          } catch (delErr) {
            console.warn('[Publish Now] B2 cleanup warning:', delErr.message);
          }
        }
      }

      return c.json({
        success: true,
        message: isProc ? 'Instagram Reel is being processed by Meta. It will automatically publish once finished.' : 'Instagram Reel published successfully!',
        mediaId: publishResult.mediaId || null,
        containerId: publishResult.containerId,
        postUrl: publishResult.postUrl || null,
        status: publishResult.status
      });
    } catch (err) {
      console.error('[Publish Now] Instagram publish error:', err);
      await updateInstagramUploadJob(c.env.DB, job.id, {
        status: 'failed',
        error_message: err.message
      });
      return c.json({ success: false, error: err.message }, 500);
    }
  } else {
    return c.json({ error: 'Invalid platform. Must be facebook or instagram' }, 400);
  }
});

/**
 * POST /api/social/history/clear
 * Section 3: Safely clears completed publishing history (published, failed, cancelled).
 * STRICTLY PROTECTS all active scheduled, pending, and uploading jobs!
 */
app.post('/api/social/history/clear', withUser, async (c) => {
  const userId = c.get('userId');
  let body = {};
  try {
    body = await c.req.json();
  } catch {}

  const platform = body.platform || 'all';
  const result = await clearCompletedSocialHistory(c.env.DB, userId, platform);
  return c.json({ success: true, ...result });
});

/**
 * POST /api/social/history/delete-selected
 * Permanently delete selected upload history records across YouTube, Facebook, and Instagram.
 * Expects { items: [{ platform, id }] }
 */
app.post('/api/social/history/delete-selected', withUser, async (c) => {
  const userId = c.get('userId');
  let body = {};
  try {
    body = await c.req.json();
  } catch {}

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return c.json({ success: true, deletedCount: 0, deletedIds: [] });
  }

  const result = await deleteSocialHistoryItems(c.env.DB, userId, items);
  return c.json(result);
});

/**
 * DELETE /api/social/history/:platform/:id
 * Permanently delete a single upload history record.
 */
app.delete('/api/social/history/:platform/:id', withUser, async (c) => {
  const userId = c.get('userId');
  const platform = c.req.param('platform');
  const id = c.req.param('id');

  const result = await deleteSocialHistoryItems(c.env.DB, userId, [{ platform, id }]);
  return c.json(result);
});

/**
 * POST /api/uploads/metadata
 * Creates a D1 upload_job record and starts a YouTube resumable upload session.
 * Returns the YouTube upload URL to the browser — the browser uploads directly.
 */
app.post('/api/uploads/metadata', withUser, async (c) => {
  const userId = c.get('userId');

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  // Get the YouTube account
  const account = await getYouTubeAccount(c.env.DB, userId);
  if (!account) {
    return c.json({ error: 'No YouTube account connected. Please connect YouTube first.' }, 401);
  }

  // Ensure we have a valid access token
  let accessToken;
  try {
    accessToken = await ensureValidToken(c.env, c.env.DB, account);
  } catch (err) {
    return c.json({ error: `Token refresh failed: ${err.message}` }, 401);
  }

  const cleanTags = normalizeYouTubeTags(body.tags);

  // Create the upload job record in D1
  const jobData = {
    id: body.jobId || crypto.randomUUID(),
    youtube_account_id: account.id,
    part_number: body.partNumber,
    movie_name: body.movieName,
    title: body.title,
    description: body.description,
    tags: JSON.stringify(cleanTags),
    visibility: body.visibility || 'private',
    category: String(body.category || body.categoryId || body.category_id || '22'),
    made_for_kids: body.madeForKids || false,
    notify_subscribers: body.notifySubscribers !== false,
    scheduled_at: body.scheduledAt || null
  };
  await createUploadJob(c.env.DB, userId, jobData);

  // Create the YouTube resumable upload session
  // This gives the browser a direct upload URL — no video bytes go through the Worker
  let uploadUrl;
  try {
    const rawOrigin = c.req.header('Origin') || (c.req.header('Referer') ? new URL(c.req.header('Referer')).origin : null) || c.env.FRONTEND_URL || 'http://localhost:3000';
    const origin = rawOrigin ? rawOrigin.replace(/\/$/, '') : undefined;

    const session = await createResumableUploadSession(
      accessToken,
      {
        title: body.title,
        description: body.description,
        tags: cleanTags,
        visibility: body.visibility || 'private',
        categoryId: String(body.category || body.categoryId || body.category_id || '22'),
        madeForKids: body.madeForKids || false,
        scheduledAt: body.scheduledAt || null
      },
      {
        size: body.fileSize || 0,
        mimeType: body.mimeType || 'video/mp4'
      },
      origin
    );
    uploadUrl = session.uploadUrl;
  } catch (err) {
    // Mark job as failed in D1
    await updateUploadJob(c.env.DB, userId, jobData.id, {
      status: 'failed',
      error_message: err.message
    });
    return c.json({ error: `Failed to create YouTube upload session: ${err.message}` }, 502);
  }

  // Update job status to 'uploading'
  await updateUploadJob(c.env.DB, userId, jobData.id, { status: 'uploading' });

  return c.json({
    jobId: jobData.id,
    uploadUrl  // Browser uploads directly to this URL
  }, 201);
});

/**
 * PUT /api/uploads/:id
 * Update upload job status (called by browser after upload completes/fails).
 */
app.put('/api/uploads/:id', withUser, async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const allowed = ['status', 'youtube_video_id', 'error_message', 'scheduled_at', 'published_at'];
  const update = {};
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  if (body.scheduledAt !== undefined && update.scheduled_at === undefined) {
    update.scheduled_at = body.scheduledAt;
  }

  await updateUploadJob(c.env.DB, userId, id, update);

  const targetScheduledAt = body.scheduledAt || body.scheduled_at || update.scheduled_at;

  // If we have a video ID and scheduling is requested, apply it via YouTube API
  if (body.youtube_video_id && targetScheduledAt) {
    try {
      const account = await getYouTubeAccount(c.env.DB, userId);
      if (account) {
        const accessToken = await ensureValidToken(c.env, c.env.DB, account);
        const cleanTags = normalizeYouTubeTags(body.tags);
        await updateVideoMetadata(accessToken, body.youtube_video_id, {
          title: body.title,
          description: body.description,
          tags: cleanTags,
          visibility: 'private',
          scheduledAt: targetScheduledAt
        });
        await updateUploadJob(c.env.DB, userId, id, { status: 'scheduled', scheduled_at: targetScheduledAt });
      }
    } catch (err) {
      console.error('Schedule error:', err);
      // Non-fatal — job is still uploaded even if scheduling fails
    }
  }

  return c.json({ success: true });
});

/**
 * POST /api/uploads/:id/retry
 * Reset a failed upload job so the browser can retry.
 * Does NOT replay the video — the browser must re-initiate the upload.
 */
app.post('/api/uploads/:id/retry', withUser, async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const job = await getUploadJob(c.env.DB, userId, id);
  if (!job) return c.json({ error: 'Job not found' }, 404);
  if (job.status !== 'failed') return c.json({ error: 'Only failed jobs can be retried' }, 400);

  // Reset to pending — the frontend will re-initiate the upload
  await updateUploadJob(c.env.DB, userId, id, {
    status: 'pending',
    error_message: null,
    youtube_video_id: null
  });

  return c.json({ success: true, jobId: id });
});

/**
 * POST /api/youtube/set-thumbnail
 * Sets a custom thumbnail image for an uploaded YouTube video.
 * Supports binary image body (with ?videoId=...) or JSON { videoId, imageBase64, mimeType }
 */
app.post('/api/youtube/set-thumbnail', withUser, async (c) => {
  const userId = c.get('userId');
  let videoId = c.req.query('videoId') || c.req.header('x-video-id');
  let imageBytes = null;
  let mimeType = 'image/jpeg';

  const contentType = c.req.header('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      const body = await c.req.json();
      videoId = videoId || body.videoId;
      mimeType = body.mimeType || 'image/jpeg';
      if (body.imageBase64) {
        // Strip data URI prefix if present
        const cleanBase64 = body.imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
        const binaryStr = atob(cleanBase64);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        imageBytes = bytes.buffer;
      }
    } catch (err) {
      return c.json({ error: `Invalid JSON body: ${err.message}` }, 400);
    }
  } else {
    mimeType = contentType.split(';')[0].trim() || 'image/jpeg';
    imageBytes = await c.req.arrayBuffer();
  }

  if (!videoId) {
    return c.json({ error: 'videoId is required to set YouTube thumbnail.' }, 400);
  }

  if (!imageBytes || imageBytes.byteLength === 0) {
    return c.json({ error: 'Image data is required.' }, 400);
  }

  const account = await getYouTubeAccount(c.env.DB, userId);
  if (!account) {
    return c.json({ error: 'No YouTube account connected. Please connect YouTube first.' }, 401);
  }

  let accessToken;
  try {
    accessToken = await ensureValidToken(c.env, c.env.DB, account);
  } catch (err) {
    return c.json({ error: `YouTube token refresh failed: ${err.message}` }, 401);
  }

  try {
    const result = await setVideoThumbnail(accessToken, videoId, imageBytes, mimeType);
    return c.json({
      success: true,
      videoId,
      result
    });
  } catch (err) {
    console.error('[YouTube Thumbnail] Error setting thumbnail:', err);
    return c.json({ error: err.message }, 500);
  }
});

// ─── Schedule (convenience endpoint) ─────────────────────────────────────────

/**
 * GET /api/schedule
 * Returns scheduled upload jobs.
 */
app.get('/api/schedule', withUser, async (c) => {
  const userId = c.get('userId');
  const jobs = await getUploadJobs(c.env.DB, userId);
  return c.json(jobs.filter((j) => j.status === 'scheduled' || Boolean(j.scheduled_at)));
});

// ─── Templates / Presets (Cross-Section Multi-Configuration) ──────────────────

/**
 * GET /api/templates
 * List all saved templates for the current user.
 */
app.get('/api/templates', withUser, async (c) => {
  try {
    const userId = c.get('userId');
    const templates = await getTemplates(c.env.DB, userId);
    return c.json({ success: true, templates: templates || [] });
  } catch (err) {
    console.error('GET /api/templates error:', err);
    return c.json({ success: true, templates: [] });
  }
});

/**
 * GET /api/templates/:id
 * Get a specific saved template.
 */
app.get('/api/templates/:id', withUser, async (c) => {
  try {
    const userId = c.get('userId');
    const id = c.req.param('id');
    const template = await getTemplateById(c.env.DB, userId, id);
    if (!template) return c.json({ error: 'Template not found' }, 404);
    return c.json({ success: true, template });
  } catch (err) {
    console.error('GET /api/templates/:id error:', err);
    return c.json({ error: 'Template not found' }, 404);
  }
});

/**
 * POST /api/templates
 * Create a new saved template.
 */
app.post('/api/templates', withUser, async (c) => {
  const userId = c.get('userId');
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.name || !body.name.trim()) {
    return c.json({ error: 'Please enter a name for the template.' }, 400);
  }

  const newTemplate = await createTemplate(c.env.DB, userId, {
    name: body.name,
    description: body.description,
    text_data: body.text_data,
    youtube_data: body.youtube_data,
    facebook_data: body.facebook_data,
    logo_data: body.logo_data
  });

  return c.json({ success: true, template: newTemplate }, 201);
});

/**
 * PUT /api/templates/:id
 * Update an existing template.
 */
app.put('/api/templates/:id', withUser, async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const updated = await updateTemplate(c.env.DB, userId, id, body);
  if (!updated) return c.json({ error: 'Template not found' }, 404);

  return c.json({ success: true, template: updated });
});

/**
 * DELETE /api/templates/:id
 * Delete a template.
 */
app.delete('/api/templates/:id', withUser, async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const result = await deleteTemplate(c.env.DB, userId, id);
  return c.json(result);
});

// ─── Storage, Backblaze B2 & Database Management ──────────────────────────────

/**
 * GET /api/storage/overview
 * Get comprehensive overview of Backblaze B2 bucket storage, active files, and D1 database stats.
 */
app.get('/api/storage/overview', withUser, async (c) => {
  const userId = c.get('userId');
  const dbStats = await getUserStorageStats(c.env.DB, userId);

  let b2Files = [];
  let b2Error = null;
  let totalB2Bytes = 0;

  try {
    if (c.env.B2_KEY_ID && c.env.B2_APPLICATION_KEY && c.env.B2_BUCKET_ID) {
      b2Files = await b2ListFileNames(c.env, 100);
      totalB2Bytes = b2Files.reduce((acc, f) => acc + (f.contentLength || 0), 0);
    }
  } catch (err) {
    console.warn('[Storage API] B2 file list error:', err.message);
    b2Error = err.message;
  }

  return c.json({
    success: true,
    database: dbStats,
    b2: {
      configured: Boolean(c.env.B2_BUCKET_ID && c.env.B2_KEY_ID),
      bucketName: c.env.B2_BUCKET_NAME || 'videoclip-reels',
      bucketId: c.env.B2_BUCKET_ID || null,
      fileCount: b2Files.length,
      totalBytes: totalB2Bytes,
      totalMb: (totalB2Bytes / (1024 * 1024)).toFixed(2),
      files: b2Files,
      error: b2Error
    }
  });
});

/**
 * POST /api/storage/b2/delete
 * Delete a specific file from Backblaze B2 bucket.
 */
app.post('/api/storage/b2/delete', withUser, async (c) => {
  let body = {};
  try {
    body = await c.req.json();
  } catch {}

  const { fileId, fileName } = body;
  if (!fileId || !fileName) {
    return c.json({ error: 'fileId and fileName are required to delete a B2 file.' }, 400);
  }

  const result = await b2DeleteFile(c.env, fileId, fileName);
  return c.json(result);
});

/**
 * POST /api/storage/b2/delete-all
 * Delete all files stored in Backblaze B2 bucket.
 */
app.post('/api/storage/b2/delete-all', withUser, async (c) => {
  try {
    const files = await b2ListFileNames(c.env, 100);
    const deletePromises = files.map(f => b2DeleteFile(c.env, f.fileId, f.fileName));
    await Promise.all(deletePromises);
    return c.json({ success: true, deletedCount: files.length });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

/**
 * POST /api/storage/b2/delete-batch
 * Delete multiple selected files from Backblaze B2 bucket.
 */
app.post('/api/storage/b2/delete-batch', withUser, async (c) => {
  let body = {};
  try {
    body = await c.req.json();
  } catch {}

  const files = Array.isArray(body.files) ? body.files : [];
  if (files.length === 0) {
    return c.json({ success: true, deletedCount: 0 });
  }

  const deletePromises = files.map(f => {
    if (f.fileId && f.fileName) {
      return b2DeleteFile(c.env, f.fileId, f.fileName);
    }
    return Promise.resolve();
  });
  await Promise.allSettled(deletePromises);
  return c.json({ success: true, deletedCount: files.length });
});

/**
 * POST /api/storage/cleanup
 * On-demand permanent database cleanup across all tables for user & system:
 * - Expired sessions
 * - Stale terminal upload logs
 * - Unneeded data
 */
app.post('/api/storage/cleanup', withUser, async (c) => {
  const userId = c.get('userId');
  const report = await cleanupUnusedData(c.env.DB, userId);
  return c.json({ success: true, report });
});

/**
 * POST /api/storage/clear-scope
 * Clear specific database records for the authenticated user.
 */
app.post('/api/storage/clear-scope', withUser, async (c) => {
  const userId = c.get('userId');
  let body = {};
  try {
    body = await c.req.json();
  } catch {}

  const scope = body.scope || 'history';
  const result = await clearUserDataByScope(c.env.DB, userId, scope);
  return c.json(result);
});

/**
 * DELETE /api/storage/wipe-all
 * POST /api/user/wipe-all
 * Complete wipe: deletes all user rows across all D1 tables, deletes temporary B2 files, and wipes session cookie.
 */
app.on(['DELETE', 'POST'], ['/api/storage/wipe-all', '/api/user/wipe-all'], withUser, async (c) => {
  const userId = c.get('userId');
  console.log('[Storage API] Wiping all data for user:', userId);

  // 1. Wipe D1 Database records
  await wipeAllUserData(c.env.DB, userId);

  // 2. Clear temporary files in B2 if possible
  try {
    const files = await b2ListFileNames(c.env, 100);
    const userFiles = files.filter(f => f.fileName.includes(userId) || f.fileName.startsWith('ig_') || f.fileName.startsWith('fb_'));
    await Promise.all(userFiles.map(f => b2DeleteFile(c.env, f.fileId, f.fileName)));
  } catch (e) {
    console.warn('[Storage API] B2 wipe cleanup warning:', e.message);
  }

  // 3. Clear cookie
  setCookie(c, '__vcuid', '', {
    httpOnly: true,
    path: '/',
    maxAge: 0
  });

  return c.json({
    success: true,
    wiped: true,
    message: 'All user data, templates, tokens, and storage files have been permanently erased.'
  });
});

/**
 * GET /api/user/storage
 * Get user storage breakdown and database health.
 */
app.get('/api/user/storage', withUser, async (c) => {
  const userId = c.get('userId');
  const stats = await getUserStorageStats(c.env.DB, userId);
  return c.json({
    success: true,
    stats,
    autoCleanupPolicy: {
      expiredSessions: 'Purged immediately past expiration',
      oldUploadHistory: 'Purged automatically after 30 days',
      staleGuests: 'Purged automatically after 7 days without activity'
    }
  });
});

/**
 * POST /api/user/storage/clear
 * Clear user data upon explicit user confirmation/approval.
 * Body: { scope: 'history' | 'presets' | 'settings' | 'youtube' | 'all' }
 */
app.post('/api/user/storage/clear', withUser, async (c) => {
  const userId = c.get('userId');
  let body = {};
  try {
    body = await c.req.json();
  } catch {}

  const scope = body.scope || 'history';
  const result = await clearUserDataByScope(c.env.DB, userId, scope);
  return c.json(result);
});

/**
 * POST /api/admin/cleanup
 * Manually trigger background database maintenance.
 */
app.post('/api/admin/cleanup', async (c) => {
  const report = await runAutoCleanup(c.env.DB);
  return c.json({ success: true, report });
});

/**
 * POST /api/instagram/process-scheduled
 * Manually trigger processing of due scheduled Instagram posts.
 */
app.post('/api/instagram/process-scheduled', async (c) => {
  const result = await processScheduledInstagramJobs(c.env);
  return c.json({ success: true, result });
});

/**
 * POST /api/facebook/process-scheduled
 * Manually trigger processing of due scheduled Facebook posts.
 */
app.post('/api/facebook/process-scheduled', async (c) => {
  const result = await processScheduledFacebookJobs(c.env);
  return c.json({ success: true, result });
});

/**
 * POST /api/scheduler/run
 * Manually trigger all scheduled jobs (Instagram + Facebook + cleanup).
 */
app.post('/api/scheduler/run', async (c) => {
  console.log('[API SCHEDULER] Triggering full scheduler pass...');
  const igResult = await processScheduledInstagramJobs(c.env);
  const fbResult = await processScheduledFacebookJobs(c.env);
  const cleanupResult = await runAutoCleanup(c.env.DB);
  return c.json({
    success: true,
    instagram: igResult,
    facebook: fbResult,
    cleanup: cleanupResult
  });
});

// ─── 404 Fallback ─────────────────────────────────────────────────────────────

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  console.error('Worker error:', err);
  return c.json({ error: 'Internal server error', message: err?.message, stack: err?.stack }, 500);
});

/**
 * Automatically cleans up temporary Backblaze B2 files older than 2 hours
 * that are no longer required by any active (pending, scheduled, uploading, processing) jobs.
 */
export async function cleanupStaleB2Uploads(env) {
  if (!env.B2_BUCKET_ID || !env.B2_APPLICATION_KEY) return;
  try {
    const files = await b2ListFileNames(env, 100);
    const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
    let deletedCount = 0;

    for (const f of files) {
      if (f.uploadTimestamp && f.uploadTimestamp < twoHoursAgo) {
        const needed = await isB2FileNeededByOtherJobs(env.DB, f.fileName);
        if (!needed) {
          try {
            await b2DeleteFile(env, f.fileId, f.fileName);
            deletedCount++;
          } catch (delErr) {
            console.warn(`[B2 Stale Cleanup] Failed to delete ${f.fileName}:`, delErr.message);
          }
        }
      }
    }
    if (deletedCount > 0) {
      console.log(`[B2 Stale Cleanup] Cleaned up ${deletedCount} expired temporary files.`);
    }
  } catch (err) {
    console.warn('[B2 Stale Cleanup] Error running stale cleanup:', err.message);
  }
}

export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    const doScheduledTasks = async () => {
      try {
        console.log('[CRON SCHEDULER] Running scheduled Instagram processor...');
        await processScheduledInstagramJobs(env);
      } catch (err) {
        console.error('Scheduled Instagram processor error:', err);
      }
      try {
        console.log('[CRON SCHEDULER] Running scheduled Facebook processor...');
        await processScheduledFacebookJobs(env);
      } catch (err) {
        console.error('Scheduled Facebook processor error:', err);
      }
      try {
        await runAutoCleanup(env.DB);
      } catch (err) {
        console.error('Scheduled DB cleanup error:', err);
      }
      try {
        await cleanupStaleB2Uploads(env);
      } catch (err) {
        console.error('Scheduled B2 cleanup error:', err);
      }
    };

    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(doScheduledTasks());
    } else {
      await doScheduledTasks();
    }
  }
};
