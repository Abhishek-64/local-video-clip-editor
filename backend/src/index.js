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
  clearUserData
} from './db.js';

import {
  generateRandomHex,
  generateSessionToken,
  hashPassword,
  verifyPassword
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
    category: body.category || '22',
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
        categoryId: body.category || '22',
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
