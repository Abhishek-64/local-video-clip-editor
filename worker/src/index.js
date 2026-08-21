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
  buildYouTubeUrl
} from './youtube.js';

import {
  getOrCreateUser,
  getYouTubeAccount,
  upsertYouTubeAccount,
  deleteYouTubeAccount,
  getProjectSettings,
  upsertProjectSettings,
  getBrandingPresets,
  createBrandingPreset,
  updateBrandingPreset,
  deleteBrandingPreset,
  getUploadJobs,
  createUploadJob,
  updateUploadJob,
  getUploadJob
} from './db.js';

// ─── App Setup ────────────────────────────────────────────────────────────────

const app = new Hono();

// CORS — allow frontend origin dynamically for local dev + configured FRONTEND_URL
app.use('*', cors({
  origin: (origin, c) => {
    if (!origin) return 'http://localhost:3000';
    const configuredFrontend = (c.env?.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    
    // Allow configured origin, localhost, 127.0.0.1, and local private network origins (192.168.*, 10.*, 172.16-31.*)
    const isAllowed =
      origin === configuredFrontend || 
      origin.startsWith('http://localhost:') || 
      origin.startsWith('http://127.0.0.1:') || 
      /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin) ||
      /^http:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/.test(origin) ||
      /^http:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+(:\d+)?$/.test(origin);

    return isAllowed ? origin : configuredFrontend;
  },
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));

// ─── Session Middleware ───────────────────────────────────────────────────────

/**
 * Attach userId to context. Creates a new user if none exists.
 * userId is stored in a secure HttpOnly cookie (__vcuid).
 */
async function withUser(c, next) {
  const cookie = getCookie(c, '__vcuid');
  let userId = null;

  if (cookie) {
    try { userId = atob(cookie); } catch {}
  }

  if (!userId) {
    userId = crypto.randomUUID();
  }

  await getOrCreateUser(c.env.DB, userId);
  c.set('userId', userId);

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

// ─── YouTube OAuth ─────────────────────────────────────────────────────────────

/**
 * GET /api/youtube/connect
 * Redirects to Google OAuth authorization page.
 */
app.get('/api/youtube/connect', withUser, (c) => {
  const userId = c.get('userId');

  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) {
    return c.json({
      error: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your Worker environment.'
    }, 500);
  }

  const authUrl = buildAuthUrl(c.env, userId);
  return c.redirect(authUrl);
});

/**
 * GET /api/youtube/callback
 * Google redirects here after user grants permission.
 * Exchanges code → tokens, fetches channel info, stores in D1, redirects to frontend.
 */
app.get('/api/youtube/callback', async (c) => {
  const { code, state, error } = c.req.query();
  const frontendUrl = c.env.FRONTEND_URL || 'http://localhost:3000';

  if (error) {
    return c.redirect(`${frontendUrl}?yt_error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return c.redirect(`${frontendUrl}?yt_error=missing_params`);
  }

  let userId;
  try {
    const decoded = decodeState(state);
    userId = decoded.userId;
  } catch {
    return c.redirect(`${frontendUrl}?yt_error=invalid_state`);
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

    // Redirect back to frontend with success indicator
    const response = c.redirect(`${frontendUrl}?yt_connected=1`);

    // Set session cookie
    const isHttps = frontendUrl.startsWith('https://');
    setCookie(c, '__vcuid', btoa(userId), {
      httpOnly: true,
      path: '/',
      sameSite: 'Lax',
      maxAge: 31536000,
      secure: isHttps
    });

    return response;
  } catch (err) {
    console.error('YouTube callback error:', err);
    return c.redirect(`${frontendUrl}?yt_error=${encodeURIComponent(err.message)}`);
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

// ─── Project Settings ─────────────────────────────────────────────────────────

app.get('/api/settings', withUser, async (c) => {
  const userId = c.get('userId');
  const settings = await getProjectSettings(c.env.DB, userId);
  // Parse tags JSON string
  try { settings.yt_tags = JSON.parse(settings.yt_tags); } catch {}
  return c.json(settings);
});

app.put('/api/settings', withUser, async (c) => {
  const userId = c.get('userId');
  const data = await c.req.json();
  // Serialize tags array to JSON string for D1
  if (Array.isArray(data.yt_tags)) {
    data.yt_tags = JSON.stringify(data.yt_tags);
  }
  await upsertProjectSettings(c.env.DB, userId, data);
  return c.json({ success: true });
});

// ─── Branding Presets ─────────────────────────────────────────────────────────

app.get('/api/branding', withUser, async (c) => {
  const userId = c.get('userId');
  const presets = await getBrandingPresets(c.env.DB, userId);
  return c.json(presets);
});

app.post('/api/branding', withUser, async (c) => {
  const userId = c.get('userId');
  const data = await c.req.json();
  const preset = await createBrandingPreset(c.env.DB, userId, data);
  return c.json(preset, 201);
});

app.put('/api/branding/:id', withUser, async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const data = await c.req.json();
  await updateBrandingPreset(c.env.DB, userId, id, data);
  return c.json({ success: true });
});

app.delete('/api/branding/:id', withUser, async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  await deleteBrandingPreset(c.env.DB, userId, id);
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

  // Create the upload job record in D1
  const jobData = {
    id: body.jobId || crypto.randomUUID(),
    youtube_account_id: account.id,
    part_number: body.partNumber,
    movie_name: body.movieName,
    title: body.title,
    description: body.description,
    tags: JSON.stringify(Array.isArray(body.tags) ? body.tags : []),
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
    const session = await createResumableUploadSession(
      accessToken,
      {
        title: body.title,
        description: body.description,
        tags: Array.isArray(body.tags) ? body.tags : [],
        visibility: body.visibility || 'private',
        categoryId: body.category || '22',
        madeForKids: body.madeForKids || false,
        scheduledAt: body.scheduledAt || null
      },
      {
        size: body.fileSize || 0,
        mimeType: body.mimeType || 'video/mp4'
      }
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

  await updateUploadJob(c.env.DB, userId, id, update);

  // If we have a video ID and scheduling is requested, apply it via YouTube API
  if (body.youtube_video_id && body.scheduledAt) {
    try {
      const account = await getYouTubeAccount(c.env.DB, userId);
      if (account) {
        const accessToken = await ensureValidToken(c.env, c.env.DB, account);
        await updateVideoMetadata(accessToken, body.youtube_video_id, {
          title: body.title,
          description: body.description,
          tags: body.tags,
          visibility: 'private',
          scheduledAt: body.scheduledAt
        });
        await updateUploadJob(c.env.DB, userId, id, { status: 'scheduled' });
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
  const scheduled = jobs.filter(j => j.status === 'scheduled' || j.scheduled_at);
  return c.json(scheduled);
});

// ─── 404 Fallback ─────────────────────────────────────────────────────────────

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  console.error('Worker error:', err);
  return c.json({ error: 'Internal server error', message: err?.message, stack: err?.stack }, 500);
});

export default app;
