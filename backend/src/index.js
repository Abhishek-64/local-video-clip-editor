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
  normalizeYouTubeTags
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
  getFacebookUploadJobs
} from './db.js';

import {
  b2Authorize,
  b2GetUploadUrl,
  b2GetDownloadUrl,
  b2DeleteFile
} from './b2.js';

import {
  buildFacebookAuthUrl,
  exchangeFacebookCodeForTokens,
  fetchFacebookPages,
  validateAndGetPageToken,
  verifyPagePublishCapability,
  publishFacebookReel,
  publishFacebookPageVideo
} from './facebook.js';

import {
  generateRandomHex,
  generateSessionToken,
  hashPassword,
  verifyPassword,
  encryptToken,
  decryptToken
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
  allowHeaders: ['Content-Type', 'content-type', 'Authorization', 'authorization', 'X-Requested-With', 'x-requested-with', 'Accept', 'accept', 'Origin', 'origin', 'X-User-Id', 'x-user-id', '*'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  exposeHeaders: ['Content-Length', 'Set-Cookie'],
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

// ─── Facebook OAuth & Pages (Meta Graph API v21.0) ───────────────────────────

/**
 * GET /api/facebook/connect
 * Redirects to Facebook OAuth authorization page.
 */
/**
 * GET /api/facebook/connect
 * Redirects to Facebook OAuth authorization page.
 */
app.get('/api/facebook/connect', withUser, (c) => {
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

  const authUrl = buildFacebookAuthUrl(c.env, userId, frontendUrl, isPopup);
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
      console.log('[FB Worker] Decoded OAuth state:', { userId, frontendUrl, isPopup });
    } catch (e) {
      console.error('[FB Worker] Failed to decode OAuth state:', e.message);
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
 * GET /api/facebook/debug-page
 * Returns safe diagnostic info without exposing any token.
 */
app.get('/api/facebook/debug-page', withUser, async (c) => {
  const userId = c.get('userId');
  const account = await getFacebookAccount(c.env.DB, userId);

  if (!account || !account.page_id) {
    return c.json({
      connected: false,
      page_id: null,
      page_name: null,
      has_page_access_token: false,
      can_publish: false
    });
  }

  const secretKey = c.env.ENCRYPTION_KEY || c.env.FACEBOOK_APP_SECRET || '7a279df54155e4f8f70991df0a4e9c9c';
  const decryptedPageToken = await decryptToken(account.page_access_token, secretKey);

  const diag = await verifyPagePublishCapability(c.env, decryptedPageToken, account.page_id);

  return c.json({
    connected: diag.connected,
    page_id: account.page_id,
    page_name: diag.page_name || account.page_name,
    has_page_access_token: Boolean(decryptedPageToken),
    can_publish: diag.can_publish
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
    scheduledAt = null,
    pageId = null
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
      }
    } catch {}
  }

  const activePageToken = await decryptToken(encryptedPageToken, secretKey);
  if (!activePageToken) {
    return c.json({ error: 'Facebook Page Access Token could not be decrypted. Please reconnect your Page.' }, 400);
  }

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
    scheduled_at: scheduledAt,
    status: 'processing',
    b2_file_id: b2FileId,
    b2_file_name: b2FileName
  });

  try {
    // 1. Generate authorized download link from B2
    const b2DownloadUrl = await b2GetDownloadUrl(c.env, b2FileName, 3600);

    // Format full caption including hashtags
    const hashtagsStr = Array.isArray(hashtags) && hashtags.length > 0
      ? hashtags.map(t => `#${t.replace(/^#+/, '')}`).join(' ')
      : '';
    const fullCaption = `${caption ? caption.trim() : ''}${hashtagsStr ? (caption ? '\n\n' : '') + hashtagsStr : ''}`;

    let publishResult;
    if (contentType === 'reel') {
      publishResult = await publishFacebookReel(c.env, activePageToken, activePageId, {
        b2DownloadUrl,
        caption: fullCaption,
        title,
        scheduledAt
      });
    } else {
      publishResult = await publishFacebookPageVideo(c.env, activePageToken, activePageId, {
        b2DownloadUrl,
        title,
        description: fullCaption || description,
        scheduledAt
      });
    }

    // 2. Immediately cleanup temporary file from Backblaze B2
    await b2DeleteFile(c.env, b2FileId, b2FileName);

    // 3. Update job in D1
    const updatedJob = await updateFacebookUploadJob(c.env.DB, job.id, {
      status: publishResult.status || 'published',
      facebook_video_id: publishResult.videoId,
      facebook_post_url: publishResult.postUrl,
      published_at: scheduledAt ? null : new Date().toISOString()
    });

    return c.json({
      success: true,
      video_id: publishResult.videoId,
      page_id: activePageId,
      status: publishResult.status,
      postUrl: publishResult.postUrl
    });
  } catch (err) {
    console.error('Facebook publish error:', err);

    // Attempt B2 cleanup on error as well
    try {
      await b2DeleteFile(c.env, b2FileId, b2FileName);
    } catch {}

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
  const userId = c.get('userId');
  const templates = await getTemplates(c.env.DB, userId);
  return c.json({ success: true, templates });
});

/**
 * GET /api/templates/:id
 * Get a specific saved template.
 */
app.get('/api/templates/:id', withUser, async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const template = await getTemplateById(c.env.DB, userId, id);
  if (!template) return c.json({ error: 'Template not found' }, 404);
  return c.json({ success: true, template });
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

// ─── User Storage & Database Data Management ──────────────────────────────────

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
  const result = await clearUserData(c.env.DB, userId, scope);
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

// ─── 404 Fallback ─────────────────────────────────────────────────────────────

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  console.error('Worker error:', err);
  return c.json({ error: 'Internal server error', message: err?.message, stack: err?.stack }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(runAutoCleanup(env.DB));
    } else {
      await runAutoCleanup(env.DB);
    }
  }
};
