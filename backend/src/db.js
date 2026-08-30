/**
 * D1 Database Query Helpers
 * All queries go through these typed helpers — no raw SQL in route handlers.
 */

// ─── User Helpers ─────────────────────────────────────────────────────────────

export async function getOrCreateUser(db, userId) {
  const existing = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  if (existing) {
    await db.prepare('UPDATE users SET last_seen = datetime("now") WHERE id = ?').bind(userId).run();
    return existing;
  }
  await db.prepare('INSERT INTO users (id) VALUES (?)').bind(userId).run();
  return { id: userId };
}

export async function getUserById(db, userId) {
  return db.prepare('SELECT id, email, name, created_at, last_seen, updated_at FROM users WHERE id = ?').bind(userId).first();
}

export async function getUserByEmail(db, email) {
  if (!email) return null;
  return db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').bind(email.trim()).first();
}

export async function createUserWithPassword(db, { id, email, passwordHash, salt, name }) {
  const userId = id || crypto.randomUUID();
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name ? name.trim() : cleanEmail.split('@')[0];

  await db
    .prepare(`
      INSERT INTO users (id, email, password_hash, salt, name, created_at, last_seen, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        email         = excluded.email,
        password_hash = excluded.password_hash,
        salt          = excluded.salt,
        name          = excluded.name,
        updated_at    = datetime('now')
    `)
    .bind(userId, cleanEmail, passwordHash, salt, cleanName)
    .run();

  return { id: userId, email: cleanEmail, name: cleanName };
}

export async function createSession(db, userId, token, expiresAt) {
  const sessionId = crypto.randomUUID();
  await db
    .prepare(`
      INSERT INTO sessions (id, user_id, token, created_at, expires_at)
      VALUES (?, ?, ?, datetime('now'), ?)
    `)
    .bind(sessionId, userId, token, expiresAt)
    .run();

  return { id: sessionId, userId, token, expiresAt };
}

export async function getSession(db, token) {
  if (!token) return null;
  const now = Date.now();
  const session = await db
    .prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > ?')
    .bind(token, now)
    .first();

  return session;
}

export async function deleteSession(db, token) {
  if (!token) return;
  await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}

export async function deleteSessionsForUser(db, userId) {
  if (!userId) return;
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
}

// ─── YouTube Account Helpers ──────────────────────────────────────────────────

export async function getYouTubeAccount(db, userId) {
  if (!userId) return null;
  return db
    .prepare('SELECT * FROM youtube_accounts WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(userId)
    .first();
}

export async function upsertYouTubeAccount(db, userId, data) {
  const existing = await getYouTubeAccount(db, userId);
  const id = existing?.id || crypto.randomUUID();

  await db
    .prepare(`
      INSERT INTO youtube_accounts
        (id, user_id, channel_id, channel_title, channel_handle, channel_thumbnail,
         access_token, refresh_token, token_expiry, scopes, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        channel_id        = excluded.channel_id,
        channel_title     = excluded.channel_title,
        channel_handle    = excluded.channel_handle,
        channel_thumbnail = excluded.channel_thumbnail,
        access_token      = excluded.access_token,
        refresh_token     = CASE WHEN excluded.refresh_token != '' THEN excluded.refresh_token ELSE refresh_token END,
        token_expiry      = excluded.token_expiry,
        scopes            = excluded.scopes,
        updated_at        = datetime('now')
    `)
    .bind(
      id,
      userId,
      data.channel_id || null,
      data.channel_title || null,
      data.channel_handle || null,
      data.channel_thumbnail || null,
      data.access_token,
      data.refresh_token || existing?.refresh_token || '',
      data.token_expiry || null,
      data.scopes || null
    )
    .run();

  return { id, ...data };
}

export async function deleteYouTubeAccount(db, userId) {
  await db.prepare('DELETE FROM youtube_accounts WHERE user_id = ?').bind(userId).run();
}

export async function updateAccessToken(db, accountId, accessToken, tokenExpiry) {
  await db
    .prepare('UPDATE youtube_accounts SET access_token = ?, token_expiry = ?, updated_at = datetime("now") WHERE id = ?')
    .bind(accessToken, tokenExpiry, accountId)
    .run();
}


// ─── Upload Job Helpers ───────────────────────────────────────────────────────

export async function getUploadJobs(db, userId, limit = 100) {
  const result = await db
    .prepare('SELECT * FROM upload_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
    .bind(userId, limit)
    .all();
  return result.results || [];
}

export async function createUploadJob(db, userId, data) {
  const id = data.id || crypto.randomUUID();
  await db
    .prepare(`
      INSERT INTO upload_jobs
        (id, user_id, youtube_account_id, part_number, movie_name, title, description,
         tags, visibility, category, made_for_kids, notify_subscribers, scheduled_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `)
    .bind(
      id, userId,
      data.youtube_account_id || null,
      data.part_number || null,
      data.movie_name || null,
      data.title || null,
      data.description || null,
      data.tags || '[]',
      data.visibility || 'private',
      data.category || '22',
      data.made_for_kids ? 1 : 0,
      data.notify_subscribers !== false ? 1 : 0,
      data.scheduled_at || null
    )
    .run();
  return { id };
}

export async function updateUploadJob(db, userId, id, data) {
  const fields = [];
  const values = [];

  const allowed = [
    'status', 'youtube_video_id', 'error_message', 'scheduled_at',
    'title', 'description', 'tags', 'visibility', 'published_at'
  ];

  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }

  if (fields.length === 0) return;
  fields.push("updated_at = datetime('now')");
  values.push(id, userId);

  await db
    .prepare(`UPDATE upload_jobs SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...values)
    .run();
}

export async function getUploadJob(db, userId, id) {
  return db
    .prepare('SELECT * FROM upload_jobs WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first();
}

// ─── Automatic Time-Based Database Cleanup ────────────────────────────────────

/**
 * Automatically clean up stale and expired records to prevent database overflow.
 * Runs in background without requiring user prompt.
 */
export async function runAutoCleanup(db) {
  const now = Date.now();
  const results = {};

  try {
    // 1. Delete expired authentication sessions
    const sessionRes = await db
      .prepare('DELETE FROM sessions WHERE expires_at < ?')
      .bind(now)
      .run();
    results.expiredSessions = sessionRes?.meta?.changes ?? 0;
  } catch (err) {
    results.expiredSessionsError = err.message;
  }

  try {
    // 2. Delete completed/failed/cancelled uploads older than 30 days (keep pending & scheduled)
    const uploadsRes = await db
      .prepare(`
        DELETE FROM upload_jobs
        WHERE created_at < datetime('now', '-30 days')
          AND status IN ('uploaded', 'published', 'failed', 'cancelled')
      `)
      .run();
    results.oldUploads = uploadsRes?.meta?.changes ?? 0;
  } catch (err) {
    results.oldUploadsError = err.message;
  }

  try {
    // 3. Delete stale anonymous guest users (no email, not seen in 7 days)
    const staleGuestsRes = await db
      .prepare(`
        DELETE FROM users
        WHERE email IS NULL
          AND last_seen < datetime('now', '-7 days')
      `)
      .run();
    results.staleGuests = staleGuestsRes?.meta?.changes ?? 0;
  } catch (err) {
    results.staleGuestsError = err.message;
  }

  results.timestamp = new Date().toISOString();
  return results;
}

// ─── User-Approved Storage & Data Management ──────────────────────────────────

/**
 * Get data stats for a specific user.
 */
export async function getUserStorageStats(db, userId) {
  if (!userId) {
    return { uploadJobsCount: 0, hasYouTube: false };
  }

  const [uploadsRes, ytRes] = await Promise.all([
    db.prepare('SELECT COUNT(*) as count FROM upload_jobs WHERE user_id = ?').bind(userId).first(),
    db.prepare('SELECT id, channel_title FROM youtube_accounts WHERE user_id = ?').bind(userId).first()
  ]);

  return {
    uploadJobsCount: uploadsRes?.count ?? 0,
    hasYouTube: Boolean(ytRes),
    youtubeChannel: ytRes?.channel_title || null
  };
}

/**
 * Clear specific scopes of user data upon explicit user approval.
 */
export async function clearUserData(db, userId, scope = 'all') {
  if (!userId) return { success: false, error: 'User ID required' };

  const cleared = {};

  if (scope === 'history' || scope === 'all') {
    const res = await db.prepare('DELETE FROM upload_jobs WHERE user_id = ?').bind(userId).run();
    cleared.history = res?.meta?.changes ?? 0;
  }

  if (scope === 'youtube' || scope === 'all') {
    const res = await db.prepare('DELETE FROM youtube_accounts WHERE user_id = ?').bind(userId).run();
    cleared.youtube = res?.meta?.changes ?? 0;
  }

  if (scope === 'all') {
    // Delete user sessions
    await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
  }

  return { success: true, scope, cleared };
}

// ─── Template CRUD Helpers ───────────────────────────────────────────────────

export async function getTemplates(db, userId) {
  if (!userId) return [];
  const result = await db
    .prepare('SELECT * FROM templates WHERE user_id = ? ORDER BY created_at DESC')
    .bind(userId)
    .all();
  return result?.results || [];
}

export async function getTemplateById(db, userId, templateId) {
  if (!userId || !templateId) return null;
  return db
    .prepare('SELECT * FROM templates WHERE id = ? AND user_id = ?')
    .bind(templateId, userId)
    .first();
}

export async function createTemplate(db, userId, data) {
  const id = data.id || crypto.randomUUID();
  const name = (data.name || 'Untitled Template').trim();
  const description = data.description ? data.description.trim() : null;
  const textData = typeof data.text_data === 'object' ? JSON.stringify(data.text_data) : (data.text_data || null);
  const youtubeData = typeof data.youtube_data === 'object' ? JSON.stringify(data.youtube_data) : (data.youtube_data || null);
  const facebookData = typeof data.facebook_data === 'object' ? JSON.stringify(data.facebook_data) : (data.facebook_data || null);
  const logoData = typeof data.logo_data === 'object' ? JSON.stringify(data.logo_data) : (data.logo_data || null);

  await db
    .prepare(`
      INSERT INTO templates (id, user_id, name, description, text_data, youtube_data, facebook_data, logo_data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `)
    .bind(id, userId, name, description, textData, youtubeData, facebookData, logoData)
    .run();

  return {
    id,
    user_id: userId,
    name,
    description,
    text_data: textData,
    youtube_data: youtubeData,
    facebook_data: facebookData,
    logo_data: logoData
  };
}

export async function updateTemplate(db, userId, templateId, data) {
  const existing = await getTemplateById(db, userId, templateId);
  if (!existing) return null;

  const name = data.name !== undefined ? data.name.trim() : existing.name;
  const description = data.description !== undefined ? (data.description ? data.description.trim() : null) : existing.description;
  const textData = data.text_data !== undefined
    ? (typeof data.text_data === 'object' ? JSON.stringify(data.text_data) : data.text_data)
    : existing.text_data;
  const youtubeData = data.youtube_data !== undefined
    ? (typeof data.youtube_data === 'object' ? JSON.stringify(data.youtube_data) : data.youtube_data)
    : existing.youtube_data;
  const facebookData = data.facebook_data !== undefined
    ? (typeof data.facebook_data === 'object' ? JSON.stringify(data.facebook_data) : data.facebook_data)
    : existing.facebook_data;
  const logoData = data.logo_data !== undefined
    ? (typeof data.logo_data === 'object' ? JSON.stringify(data.logo_data) : data.logo_data)
    : existing.logo_data;

  await db
    .prepare(`
      UPDATE templates
      SET name = ?, description = ?, text_data = ?, youtube_data = ?, facebook_data = ?, logo_data = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `)
    .bind(name, description, textData, youtubeData, facebookData, logoData, templateId, userId)
    .run();

  return {
    id: templateId,
    user_id: userId,
    name,
    description,
    text_data: textData,
    youtube_data: youtubeData,
    facebook_data: facebookData,
    logo_data: logoData
  };
}

export async function deleteTemplate(db, userId, templateId) {
  if (!userId || !templateId) return { success: false };
  const res = await db
    .prepare('DELETE FROM templates WHERE id = ? AND user_id = ?')
    .bind(templateId, userId)
    .run();
  return { success: true, deleted: res?.meta?.changes ?? 0 };
}

// ─── Facebook Account Helpers ─────────────────────────────────────────────────

export async function getFacebookAccount(db, userId) {
  if (!userId) return null;
  return db
    .prepare('SELECT * FROM facebook_accounts WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(userId)
    .first();
}

export async function upsertFacebookAccount(db, userId, data) {
  const existing = await getFacebookAccount(db, userId);
  const id = existing?.id || crypto.randomUUID();

  const availablePagesJson = typeof data.available_pages === 'object'
    ? JSON.stringify(data.available_pages)
    : (data.available_pages || '[]');

  await db
    .prepare(`
      INSERT INTO facebook_accounts
        (id, user_id, fb_user_id, fb_user_name, page_id, page_name, page_category,
         page_thumbnail, page_access_token, user_access_token, available_pages, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        fb_user_id        = excluded.fb_user_id,
        fb_user_name      = excluded.fb_user_name,
        page_id           = excluded.page_id,
        page_name         = excluded.page_name,
        page_category     = excluded.page_category,
        page_thumbnail    = excluded.page_thumbnail,
        page_access_token = excluded.page_access_token,
        user_access_token = excluded.user_access_token,
        available_pages   = excluded.available_pages,
        updated_at        = datetime('now')
    `)
    .bind(
      id,
      userId,
      data.fb_user_id || null,
      data.fb_user_name || null,
      data.page_id || '',
      data.page_name || '',
      data.page_category || null,
      data.page_thumbnail || null,
      data.page_access_token || '',
      data.user_access_token || null,
      availablePagesJson
    )
    .run();

  return getFacebookAccount(db, userId);
}

export async function updateFacebookPageSelection(db, userId, pageData) {
  const account = await getFacebookAccount(db, userId);
  if (!account) return null;

  await db
    .prepare(`
      UPDATE facebook_accounts
      SET page_id = ?, page_name = ?, page_category = ?, page_thumbnail = ?, page_access_token = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `)
    .bind(
      pageData.page_id,
      pageData.page_name,
      pageData.page_category || null,
      pageData.page_thumbnail || null,
      pageData.page_access_token,
      account.id,
      userId
    )
    .run();

  return getFacebookAccount(db, userId);
}

export async function deleteFacebookAccount(db, userId) {
  if (!userId) return;
  await db.prepare('DELETE FROM facebook_accounts WHERE user_id = ?').bind(userId).run();
}

// ─── Facebook Upload Jobs Helpers ─────────────────────────────────────────────

export async function createFacebookUploadJob(db, data) {
  const id = data.id || crypto.randomUUID();
  const hashtagsJson = typeof data.hashtags === 'object' ? JSON.stringify(data.hashtags) : (data.hashtags || '[]');

  await db
    .prepare(`
      INSERT INTO facebook_upload_jobs
        (id, user_id, facebook_account_id, page_id, content_type, title, caption,
         description, hashtags, scheduled_at, status, b2_file_id, b2_file_name,
         facebook_video_id, facebook_post_url, error_message, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `)
    .bind(
      id,
      data.user_id,
      data.facebook_account_id || null,
      data.page_id,
      data.content_type || 'reel',
      data.title || null,
      data.caption || null,
      data.description || null,
      hashtagsJson,
      data.scheduled_at || null,
      data.status || 'pending',
      data.b2_file_id || null,
      data.b2_file_name || null,
      data.facebook_video_id || null,
      data.facebook_post_url || null,
      data.error_message || null
    )
    .run();

  return getFacebookUploadJob(db, id);
}

export async function updateFacebookUploadJob(db, jobId, updates) {
  const allowed = [
    'status', 'facebook_video_id', 'facebook_post_url', 'error_message',
    'b2_file_id', 'b2_file_name', 'published_at'
  ];
  const setClauses = [];
  const bindings = [];

  for (const [key, value] of Object.entries(updates)) {
    if (allowed.includes(key)) {
      setClauses.push(`${key} = ?`);
      bindings.push(value);
    }
  }

  if (setClauses.length === 0) return;

  setClauses.push("updated_at = datetime('now')");
  bindings.push(jobId);

  await db
    .prepare(`UPDATE facebook_upload_jobs SET ${setClauses.join(', ')} WHERE id = ?`)
    .bind(...bindings)
    .run();

  return getFacebookUploadJob(db, jobId);
}

export async function getFacebookUploadJob(db, jobId) {
  return db.prepare('SELECT * FROM facebook_upload_jobs WHERE id = ?').bind(jobId).first();
}

export async function getFacebookUploadJobs(db, userId) {
  if (!userId) return [];
  const res = await db
    .prepare('SELECT * FROM facebook_upload_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .bind(userId)
    .all();
  return res?.results || [];
}


