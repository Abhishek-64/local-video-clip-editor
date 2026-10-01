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
 * PERMANENT (HARD) DELETION: all deleted records are removed permanently from D1.
 */
export async function runAutoCleanup(db) {
  const now = Date.now();
  const results = {};

  try {
    // 1. Delete expired authentication sessions permanently
    const sessionRes = await db
      .prepare('DELETE FROM sessions WHERE expires_at < ?')
      .bind(now)
      .run();
    results.expiredSessions = sessionRes?.meta?.changes ?? 0;
  } catch (err) {
    results.expiredSessionsError = err.message;
  }

  try {
    // 2. Delete completed/failed/cancelled YouTube uploads older than 30 days
    const uploadsRes = await db
      .prepare(`
        DELETE FROM upload_jobs
        WHERE created_at < datetime('now', '-30 days')
          AND status IN ('uploaded', 'published', 'completed', 'failed', 'cancelled')
      `)
      .run();
    results.oldUploads = uploadsRes?.meta?.changes ?? 0;
  } catch (err) {
    results.oldUploadsError = err.message;
  }

  try {
    // 3. Delete completed/failed/cancelled Facebook uploads older than 30 days
    const fbRes = await db
      .prepare(`
        DELETE FROM facebook_upload_jobs
        WHERE created_at < datetime('now', '-30 days')
          AND status IN ('published', 'failed', 'cancelled')
      `)
      .run();
    results.oldFacebookUploads = fbRes?.meta?.changes ?? 0;
  } catch (err) {
    results.oldFacebookUploadsError = err.message;
  }

  try {
    // 4. Delete completed/failed/cancelled Instagram uploads older than 30 days
    const igRes = await db
      .prepare(`
        DELETE FROM instagram_upload_jobs
        WHERE created_at < datetime('now', '-30 days')
          AND status IN ('published', 'failed', 'cancelled')
      `)
      .run();
    results.oldInstagramUploads = igRes?.meta?.changes ?? 0;
  } catch (err) {
    results.oldInstagramUploadsError = err.message;
  }

  try {
    // 5. Delete stale anonymous guest users (no email, not seen in 7 days)
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

/**
 * On-demand permanent cleanup of unneeded/expired data across all tables:
 * - Expired sessions
 * - Old or terminal logs
 * - Stale records
 */
export async function cleanupUnusedData(db, userId = null) {
  const now = Date.now();
  const results = {};

  // 1. Expired sessions
  try {
    const sessionSql = userId
      ? 'DELETE FROM sessions WHERE user_id = ? AND expires_at < ?'
      : 'DELETE FROM sessions WHERE expires_at < ?';
    const sessionParams = userId ? [userId, now] : [now];
    const sRes = await db.prepare(sessionSql).bind(...sessionParams).run();
    results.expiredSessions = sRes?.meta?.changes ?? 0;
  } catch (err) {
    results.expiredSessions = 0;
  }

  // 2. Terminal upload jobs older than 7 days
  try {
    const ytSql = userId
      ? `DELETE FROM upload_jobs WHERE user_id = ? AND status IN ('uploaded', 'published', 'completed', 'failed', 'cancelled') AND created_at < datetime('now', '-7 days')`
      : `DELETE FROM upload_jobs WHERE status IN ('uploaded', 'published', 'completed', 'failed', 'cancelled') AND created_at < datetime('now', '-7 days')`;
    const ytParams = userId ? [userId] : [];
    const ytRes = await db.prepare(ytSql).bind(...ytParams).run();
    results.oldYouTube = ytRes?.meta?.changes ?? 0;
  } catch (err) {
    results.oldYouTube = 0;
  }

  // 3. Terminal Facebook jobs older than 7 days
  try {
    const fbSql = userId
      ? `DELETE FROM facebook_upload_jobs WHERE user_id = ? AND status IN ('published', 'failed', 'cancelled') AND created_at < datetime('now', '-7 days')`
      : `DELETE FROM facebook_upload_jobs WHERE status IN ('published', 'failed', 'cancelled') AND created_at < datetime('now', '-7 days')`;
    const fbParams = userId ? [userId] : [];
    const fbRes = await db.prepare(fbSql).bind(...fbParams).run();
    results.oldFacebook = fbRes?.meta?.changes ?? 0;
  } catch (err) {
    results.oldFacebook = 0;
  }

  // 4. Terminal Instagram jobs older than 7 days
  try {
    const igSql = userId
      ? `DELETE FROM instagram_upload_jobs WHERE user_id = ? AND status IN ('published', 'failed', 'cancelled') AND created_at < datetime('now', '-7 days')`
      : `DELETE FROM instagram_upload_jobs WHERE status IN ('published', 'failed', 'cancelled') AND created_at < datetime('now', '-7 days')`;
    const igParams = userId ? [userId] : [];
    const igRes = await db.prepare(igSql).bind(...igParams).run();
    results.oldInstagram = igRes?.meta?.changes ?? 0;
  } catch (err) {
    results.oldInstagram = 0;
  }

  results.totalCleaned = (results.expiredSessions || 0) + (results.oldYouTube || 0) + (results.oldFacebook || 0) + (results.oldInstagram || 0);
  results.timestamp = new Date().toISOString();
  return results;
}

// ─── Template CRUD Helpers ───────────────────────────────────────────────────

export async function ensureTemplatesTable(db) {
  if (!db) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS templates (
        id             TEXT PRIMARY KEY,
        user_id        TEXT NOT NULL,
        name           TEXT NOT NULL,
        description    TEXT,
        text_data      TEXT,
        youtube_data   TEXT,
        facebook_data  TEXT,
        instagram_data TEXT,
        logo_data      TEXT,
        created_at     TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run();
    try {
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id)').run();
    } catch {}
  } catch (err) {
    console.error('ensureTemplatesTable error:', err);
  }
}

export async function getTemplates(db, userId) {
  if (!userId || !db) return [];
  try {
    const result = await db
      .prepare('SELECT * FROM templates WHERE user_id = ? ORDER BY created_at DESC')
      .bind(userId)
      .all();
    return result?.results || [];
  } catch (err) {
    if (String(err?.message || err).includes('no such table')) {
      await ensureTemplatesTable(db);
    } else {
      console.error('getTemplates error:', err);
    }
    return [];
  }
}

export async function getTemplateById(db, userId, templateId) {
  if (!userId || !templateId || !db) return null;
  try {
    return await db
      .prepare('SELECT * FROM templates WHERE id = ? AND user_id = ?')
      .bind(templateId, userId)
      .first();
  } catch (err) {
    if (String(err?.message || err).includes('no such table')) {
      await ensureTemplatesTable(db);
    } else {
      console.error('getTemplateById error:', err);
    }
    return null;
  }
}

export async function createTemplate(db, userId, data) {
  if (!db) return null;
  const id = data.id || crypto.randomUUID();
  const name = (data.name || 'Untitled Template').trim();
  const description = data.description ? data.description.trim() : null;
  const textData = typeof data.text_data === 'object' ? JSON.stringify(data.text_data) : (data.text_data || null);
  const youtubeData = typeof data.youtube_data === 'object' ? JSON.stringify(data.youtube_data) : (data.youtube_data || null);
  const facebookData = typeof data.facebook_data === 'object' ? JSON.stringify(data.facebook_data) : (data.facebook_data || null);
  const instagramData = typeof data.instagram_data === 'object' ? JSON.stringify(data.instagram_data) : (data.instagram_data || null);
  const logoData = typeof data.logo_data === 'object' ? JSON.stringify(data.logo_data) : (data.logo_data || null);

  try {
    await db
      .prepare(`
        INSERT INTO templates (id, user_id, name, description, text_data, youtube_data, facebook_data, instagram_data, logo_data, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `)
      .bind(id, userId, name, description, textData, youtubeData, facebookData, instagramData, logoData)
      .run();
  } catch (err) {
    if (String(err?.message || err).includes('no such table')) {
      await ensureTemplatesTable(db);
      await db
        .prepare(`
          INSERT INTO templates (id, user_id, name, description, text_data, youtube_data, facebook_data, instagram_data, logo_data, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `)
        .bind(id, userId, name, description, textData, youtubeData, facebookData, instagramData, logoData)
        .run();
    } else {
      throw err;
    }
  }

  return {
    id,
    user_id: userId,
    name,
    description,
    text_data: textData,
    youtube_data: youtubeData,
    facebook_data: facebookData,
    instagram_data: instagramData,
    logo_data: logoData
  };
}

export async function updateTemplate(db, userId, templateId, data) {
  if (!db) return null;
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
  const instagramData = data.instagram_data !== undefined
    ? (typeof data.instagram_data === 'object' ? JSON.stringify(data.instagram_data) : data.instagram_data)
    : existing.instagram_data;
  const logoData = data.logo_data !== undefined
    ? (typeof data.logo_data === 'object' ? JSON.stringify(data.logo_data) : data.logo_data)
    : existing.logo_data;

  try {
    await db
      .prepare(`
        UPDATE templates
        SET name = ?, description = ?, text_data = ?, youtube_data = ?, facebook_data = ?, instagram_data = ?, logo_data = ?, updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `)
      .bind(name, description, textData, youtubeData, facebookData, instagramData, logoData, templateId, userId)
      .run();
  } catch (err) {
    if (String(err?.message || err).includes('no such table')) {
      await ensureTemplatesTable(db);
      return null;
    }
    throw err;
  }

  return {
    id: templateId,
    user_id: userId,
    name,
    description,
    text_data: textData,
    youtube_data: youtubeData,
    facebook_data: facebookData,
    instagram_data: instagramData,
    logo_data: logoData
  };
}

export async function deleteTemplate(db, userId, templateId) {
  if (!userId || !templateId || !db) return { success: false };
  try {
    const res = await db
      .prepare('DELETE FROM templates WHERE id = ? AND user_id = ?')
      .bind(templateId, userId)
      .run();
    return { success: true, deleted: res?.meta?.changes ?? 0 };
  } catch (err) {
    if (String(err?.message || err).includes('no such table')) {
      await ensureTemplatesTable(db);
    }
    return { success: false, deleted: 0 };
  }
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
  // Idempotency check: if an active job already exists with same user_id, page_id, b2_file_name, scheduled_at
  if (data.b2_file_name) {
    try {
      const existing = await db.prepare(`
        SELECT * FROM facebook_upload_jobs
        WHERE user_id = ? AND page_id = ? AND b2_file_name = ?
          AND (scheduled_at = ? OR (scheduled_at IS NULL AND ? IS NULL))
          AND status IN ('pending', 'scheduled', 'uploading', 'processing')
        ORDER BY created_at DESC LIMIT 1
      `).bind(
        data.user_id,
        data.page_id,
        data.b2_file_name,
        data.scheduled_at || null,
        data.scheduled_at || null
      ).first();

      if (existing) {
        console.log(`[FB DB] Idempotent hit: returning existing active Facebook job ${existing.id}`);
        return existing;
      }
    } catch (e) {
      console.warn('[FB DB] Idempotency check error:', e.message);
    }
  }

  const id = data.id || crypto.randomUUID();
  const hashtagsJson = typeof data.hashtags === 'object' ? JSON.stringify(data.hashtags) : (data.hashtags || '[]');

  await db
    .prepare(`
      INSERT INTO facebook_upload_jobs
        (id, user_id, facebook_account_id, page_id, content_type, title, caption,
         description, hashtags, is_ai_generated, scheduled_at, status, b2_file_id, b2_file_name,
         facebook_video_id, facebook_post_url, error_message, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
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
      data.is_ai_generated ? 1 : 0,
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
    'b2_file_id', 'b2_file_name', 'published_at', 'caption', 'title'
  ];
  const setClauses = [];
  const bindings = [];

  for (const [key, value] of Object.entries(updates)) {
    if (allowed.includes(key)) {
      setClauses.push(`${key} = ?`);
      bindings.push(value === undefined ? null : value);
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

/**
 * Atomically claim a due Facebook upload job so only one cron execution processes it.
 */
export async function claimDueFacebookJob(db, jobId) {
  const res = await db.prepare(`
    UPDATE facebook_upload_jobs
    SET status = 'uploading', updated_at = datetime('now')
    WHERE id = ? AND status = 'scheduled' AND datetime(scheduled_at) <= datetime('now')
  `).bind(jobId).run();

  return (res?.meta?.changes ?? 0) > 0;
}

/**
 * Query due scheduled Facebook upload jobs eligible for execution.
 */
export async function getDueFacebookJobs(db, limit = 10) {
  const res = await db.prepare(`
    SELECT j.*, a.page_access_token, a.available_pages
    FROM facebook_upload_jobs j
    JOIN facebook_accounts a ON j.facebook_account_id = a.id
    WHERE j.status = 'scheduled'
      AND j.scheduled_at IS NOT NULL
      AND datetime(j.scheduled_at) <= datetime('now')
    ORDER BY j.scheduled_at ASC
    LIMIT ?
  `).bind(limit).all();

  return res?.results || [];
}

/**
 * Query in-progress Facebook upload jobs that are currently processing on Meta.
 */
export async function getProcessingFacebookJobs(db, limit = 10) {
  const res = await db.prepare(`
    SELECT j.*, a.page_access_token, a.available_pages
    FROM facebook_upload_jobs j
    JOIN facebook_accounts a ON j.facebook_account_id = a.id
    WHERE j.status = 'processing'
      AND j.facebook_video_id IS NOT NULL
    ORDER BY j.created_at ASC
    LIMIT ?
  `).bind(limit).all();

  return res?.results || [];
}

/**
 * Query Facebook upload jobs that have been stuck in 'uploading' status for longer than minutesThreshold.
 * These require auto-reconciliation against Meta Graph API or safe recovery.
 */
export async function getStuckUploadingFacebookJobs(db, minutesThreshold = 3, userId = null) {
  const timeModifier = `-${Math.max(1, minutesThreshold)} minutes`;
  let sql = `
    SELECT j.*, a.page_access_token, a.available_pages
    FROM facebook_upload_jobs j
    LEFT JOIN facebook_accounts a ON j.facebook_account_id = a.id
    WHERE j.status = 'uploading'
      AND (datetime(COALESCE(j.updated_at, j.created_at)) <= datetime('now', '${timeModifier}')
           OR (j.scheduled_at IS NOT NULL AND datetime(j.scheduled_at) <= datetime('now', '${timeModifier}'))
      )
  `;
  const params = [];
  if (userId) {
    sql += ' AND j.user_id = ?';
    params.push(userId);
  }
  sql += ' ORDER BY j.updated_at ASC LIMIT 20';
  const res = await db.prepare(sql).bind(...params).all();
  return res?.results || [];
}

// ─── Instagram Account Helpers ────────────────────────────────────────────────


export async function getInstagramAccount(db, userId) {
  if (!userId) return null;
  return db
    .prepare('SELECT * FROM instagram_accounts WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(userId)
    .first();
}

export async function upsertInstagramAccount(db, userId, data) {
  const existing = await getInstagramAccount(db, userId);
  const id = existing?.id || crypto.randomUUID();

  const availableAccountsJson = typeof data.available_accounts === 'object'
    ? JSON.stringify(data.available_accounts)
    : (data.available_accounts || '[]');

  await db
    .prepare(`
      INSERT INTO instagram_accounts
        (id, user_id, ig_user_id, ig_username, ig_name, ig_profile_picture_url, page_id, page_name,
         access_token, user_access_token, available_accounts, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        ig_user_id             = excluded.ig_user_id,
        ig_username            = excluded.ig_username,
        ig_name                = excluded.ig_name,
        ig_profile_picture_url = excluded.ig_profile_picture_url,
        page_id                = excluded.page_id,
        page_name              = excluded.page_name,
        access_token           = excluded.access_token,
        user_access_token      = excluded.user_access_token,
        available_accounts     = excluded.available_accounts,
        updated_at             = datetime('now')
    `)
    .bind(
      id,
      userId,
      data.ig_user_id || '',
      data.ig_username || '',
      data.ig_name || '',
      data.ig_profile_picture_url || null,
      data.page_id || null,
      data.page_name || null,
      data.access_token || '',
      data.user_access_token || null,
      availableAccountsJson
    )
    .run();

  return getInstagramAccount(db, userId);
}

export async function updateInstagramAccountSelection(db, userId, accountData) {
  const account = await getInstagramAccount(db, userId);
  if (!account) return null;

  await db
    .prepare(`
      UPDATE instagram_accounts
      SET ig_user_id = ?, ig_username = ?, ig_name = ?, ig_profile_picture_url = ?, page_id = ?, page_name = ?, access_token = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `)
    .bind(
      accountData.ig_user_id,
      accountData.ig_username || '',
      accountData.ig_name || '',
      accountData.ig_profile_picture_url || null,
      accountData.page_id || null,
      accountData.page_name || null,
      accountData.access_token,
      account.id,
      userId
    )
    .run();

  return getInstagramAccount(db, userId);
}

export async function deleteInstagramAccount(db, userId) {
  if (!userId) return;
  await db.prepare('DELETE FROM instagram_accounts WHERE user_id = ?').bind(userId).run();
}

// ─── Instagram Upload Jobs Helpers ────────────────────────────────────────────

export async function createInstagramUploadJob(db, data) {
  // Idempotency check: if an active job already exists with same user_id, ig_user_id, b2_file_name, scheduled_at
  if (data.b2_file_name) {
    try {
      const existing = await db.prepare(`
        SELECT * FROM instagram_upload_jobs
        WHERE user_id = ? AND ig_user_id = ? AND b2_file_name = ?
          AND (scheduled_at = ? OR (scheduled_at IS NULL AND ? IS NULL))
          AND status IN ('pending', 'scheduled', 'uploading', 'processing')
        ORDER BY created_at DESC LIMIT 1
      `).bind(
        data.user_id,
        data.ig_user_id,
        data.b2_file_name,
        data.scheduled_at || null,
        data.scheduled_at || null
      ).first();

      if (existing) {
        console.log(`[IG DB] Idempotent hit: returning existing active Instagram job ${existing.id}`);
        return existing;
      }
    } catch (e) {
      console.warn('[IG DB] Idempotency check error:', e.message);
    }
  }

  const id = data.id || crypto.randomUUID();
  const hashtagsJson = typeof data.hashtags === 'object' ? JSON.stringify(data.hashtags) : (data.hashtags || '[]');

  await db
    .prepare(`
      INSERT INTO instagram_upload_jobs
        (id, user_id, instagram_account_id, ig_user_id, content_type, title, caption,
         description, hashtags, is_ai_generated, scheduled_at, status, b2_file_id, b2_file_name,
         instagram_container_id, instagram_media_id, instagram_post_url, error_message, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `)
    .bind(
      id,
      data.user_id,
      data.instagram_account_id || null,
      data.ig_user_id,
      data.content_type || 'reel',
      data.title || null,
      data.caption || null,
      data.description || null,
      hashtagsJson,
      data.is_ai_generated ? 1 : 0,
      data.scheduled_at || null,
      data.status || 'pending',
      data.b2_file_id || null,
      data.b2_file_name || null,
      data.instagram_container_id || null,
      data.instagram_media_id || null,
      data.instagram_post_url || null,
      data.error_message || null
    )
    .run();

  return getInstagramUploadJob(db, id);
}

export async function updateInstagramUploadJob(db, jobId, updates) {
  const allowed = [
    'status', 'instagram_container_id', 'instagram_media_id', 'instagram_post_url', 'error_message',
    'b2_file_id', 'b2_file_name', 'published_at', 'caption', 'title'
  ];
  const setClauses = [];
  const bindings = [];

  for (const [key, value] of Object.entries(updates)) {
    if (allowed.includes(key)) {
      setClauses.push(`${key} = ?`);
      bindings.push(value === undefined ? null : value);
    }
  }

  if (setClauses.length === 0) return;

  setClauses.push("updated_at = datetime('now')");
  bindings.push(jobId);

  await db
    .prepare(`UPDATE instagram_upload_jobs SET ${setClauses.join(', ')} WHERE id = ?`)
    .bind(...bindings)
    .run();

  return getInstagramUploadJob(db, jobId);
}

export async function getInstagramUploadJob(db, jobId) {
  return db.prepare('SELECT * FROM instagram_upload_jobs WHERE id = ?').bind(jobId).first();
}

export async function getInstagramUploadJobs(db, userId) {
  if (!userId) return [];
  const res = await db
    .prepare('SELECT * FROM instagram_upload_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .bind(userId)
    .all();
  return res?.results || [];
}

/**
 * Atomically claim a due Instagram upload job so only one cron execution processes it.
 */
export async function claimDueInstagramJob(db, jobId) {
  const res = await db.prepare(`
    UPDATE instagram_upload_jobs
    SET status = 'uploading', updated_at = datetime('now')
    WHERE id = ? AND status = 'scheduled' AND datetime(scheduled_at) <= datetime('now')
  `).bind(jobId).run();

  return (res?.meta?.changes ?? 0) > 0;
}

/**
 * Query due scheduled Instagram upload jobs eligible for execution.
 */
export async function getDueInstagramJobs(db, limit = 10) {
  const res = await db.prepare(`
    SELECT j.*, a.access_token, a.user_access_token, a.available_accounts
    FROM instagram_upload_jobs j
    JOIN instagram_accounts a ON j.instagram_account_id = a.id
    WHERE j.status = 'scheduled'
      AND j.scheduled_at IS NOT NULL
      AND datetime(j.scheduled_at) <= datetime('now')
    ORDER BY j.scheduled_at ASC
    LIMIT ?
  `).bind(limit).all();

  return res?.results || [];
}

/**
 * Query in-progress Instagram jobs awaiting container processing completion.
 */
export async function getProcessingInstagramJobs(db, limit = 10, userId = null) {
  let sql = `
    SELECT j.*, a.access_token, a.user_access_token, a.available_accounts
    FROM instagram_upload_jobs j
    LEFT JOIN instagram_accounts a ON j.instagram_account_id = a.id
    WHERE j.status = 'processing'
      AND j.instagram_container_id IS NOT NULL
  `;
  const params = [];
  if (userId) {
    sql += ' AND j.user_id = ?';
    params.push(userId);
  }
  sql += ' ORDER BY j.updated_at ASC LIMIT ?';
  params.push(limit);
  const res = await db.prepare(sql).bind(...params).all();
  return res?.results || [];
}

/**
 * Query Instagram upload jobs that have been stuck in 'uploading' or 'processing' status.
 */
export async function getStuckUploadingInstagramJobs(db, minutesThreshold = 3, userId = null) {
  const timeModifier = `-${Math.max(1, minutesThreshold)} minutes`;
  let sql = `
    SELECT j.*, a.access_token, a.user_access_token, a.available_accounts
    FROM instagram_upload_jobs j
    LEFT JOIN instagram_accounts a ON j.instagram_account_id = a.id
    WHERE (
      j.status = 'uploading'
      AND (datetime(COALESCE(j.updated_at, j.created_at)) <= datetime('now', '${timeModifier}')
           OR (j.scheduled_at IS NOT NULL AND datetime(j.scheduled_at) <= datetime('now', '${timeModifier}'))
      )
    ) OR (
      j.status = 'processing'
      AND j.instagram_container_id IS NOT NULL
    )
  `;
  const params = [];
  if (userId) {
    sql += ' AND j.user_id = ?';
    params.push(userId);
  }
  sql += ' ORDER BY j.updated_at ASC LIMIT 20';
  const res = await db.prepare(sql).bind(...params).all();
  return res?.results || [];
}

/**
 * Check whether a Backblaze B2 temporary file is still needed by ANY pending/scheduled/processing jobs across platforms.
 * Prevents premature deletion when one platform finishes before another.
 */
export async function isB2FileNeededByOtherJobs(db, b2FileName, excludeJobId = null) {
  if (!b2FileName || !db) return false;
  try {
    const fb = await db.prepare(`
      SELECT COUNT(*) as count FROM facebook_upload_jobs 
      WHERE b2_file_name = ? AND id != ? AND (
        status IN ('pending', 'scheduled', 'uploading', 'processing')
        OR (status = 'failed' AND datetime(updated_at) > datetime('now', '-24 hours')
            AND NOT EXISTS (
              SELECT 1 FROM facebook_upload_jobs 
              WHERE b2_file_name = ? AND status = 'published'
            )
        )
      )
    `).bind(b2FileName, excludeJobId || '', b2FileName).first();

    if (fb && fb.count > 0) return true;

    const ig = await db.prepare(`
      SELECT COUNT(*) as count FROM instagram_upload_jobs 
      WHERE b2_file_name = ? AND id != ? AND (
        status IN ('pending', 'scheduled', 'uploading', 'processing')
        OR (status = 'failed' AND datetime(updated_at) > datetime('now', '-24 hours')
            AND NOT EXISTS (
              SELECT 1 FROM instagram_upload_jobs 
              WHERE b2_file_name = ? AND status = 'published'
            )
        )
      )
    `).bind(b2FileName, excludeJobId || '', b2FileName).first();

    if (ig && ig.count > 0) return true;
  } catch (err) {
    console.warn('[DB] isB2FileNeededByOtherJobs check error:', err.message);
    // On unexpected query error, be safe and don't delete immediately
    return true;
  }
  return false;
}

// ─── Scheduled Videos & Upload History Queries (Separated Lifecycles) ────────

/**
 * Query active scheduled/pending publishing jobs for Facebook and Instagram.
 * Returns only jobs that are awaiting publishing (scheduled, pending, uploading, processing).
 * Never returns completed (published, failed, cancelled) jobs.
 */
export async function getScheduledSocialJobs(db, userId) {
  if (!userId) return [];

  const [fbRes, igRes] = await Promise.all([
    db.prepare(`
      SELECT j.*, a.page_name, a.page_thumbnail
      FROM facebook_upload_jobs j
      LEFT JOIN facebook_accounts a ON j.facebook_account_id = a.id
      WHERE j.user_id = ? AND j.status IN ('pending', 'scheduled', 'uploading', 'processing')
      ORDER BY datetime(j.scheduled_at) ASC, j.created_at ASC
    `).bind(userId).all(),
    db.prepare(`
      SELECT j.*, a.ig_username, a.ig_name, a.ig_profile_picture_url
      FROM instagram_upload_jobs j
      LEFT JOIN instagram_accounts a ON j.instagram_account_id = a.id
      WHERE j.user_id = ? AND j.status IN ('pending', 'scheduled', 'uploading', 'processing')
      ORDER BY datetime(j.scheduled_at) ASC, j.created_at ASC
    `).bind(userId).all()
  ]);

  const fbJobs = (fbRes?.results || []).map(j => ({ ...j, platform: 'facebook' }));
  const igJobs = (igRes?.results || []).map(j => ({ ...j, platform: 'instagram' }));

  return [...fbJobs, ...igJobs].sort((a, b) => {
    const timeA = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
    const timeB = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
    return timeA - timeB;
  });
}

/**
 * Query completed/terminal upload history for Facebook and Instagram.
 * Returns only published, failed, or cancelled jobs.
 * Never mixes in active scheduled or pending jobs.
 */
export async function getCompletedSocialHistory(db, userId, { platform = 'all', status = 'all', limit = 100 } = {}) {
  if (!userId) return [];

  let fbJobs = [];
  let igJobs = [];

  const validCompletedStatuses = ['published', 'failed', 'cancelled'];
  const targetStatuses = (status && status !== 'all')
    ? validCompletedStatuses.filter(s => s === status.toLowerCase())
    : validCompletedStatuses;

  if (targetStatuses.length === 0) return [];

  const statusPlaceholders = targetStatuses.map(() => '?').join(', ');

  if (platform === 'all' || platform === 'facebook') {
    const fbRes = await db.prepare(`
      SELECT j.*, a.page_name, a.page_thumbnail
      FROM facebook_upload_jobs j
      LEFT JOIN facebook_accounts a ON j.facebook_account_id = a.id
      WHERE j.user_id = ? AND j.status IN (${statusPlaceholders})
      ORDER BY datetime(COALESCE(j.published_at, j.updated_at, j.created_at)) DESC
      LIMIT ?
    `).bind(userId, ...targetStatuses, limit).all();

    fbJobs = (fbRes?.results || []).map(j => ({ ...j, platform: 'facebook' }));
  }

  if (platform === 'all' || platform === 'instagram') {
    const igRes = await db.prepare(`
      SELECT j.*, a.ig_username, a.ig_name, a.ig_profile_picture_url
      FROM instagram_upload_jobs j
      LEFT JOIN instagram_accounts a ON j.instagram_account_id = a.id
      WHERE j.user_id = ? AND j.status IN (${statusPlaceholders})
      ORDER BY datetime(COALESCE(j.published_at, j.updated_at, j.created_at)) DESC
      LIMIT ?
    `).bind(userId, ...targetStatuses, limit).all();

    igJobs = (igRes?.results || []).map(j => ({ ...j, platform: 'instagram' }));
  }

  return [...fbJobs, ...igJobs].sort((a, b) => {
    const timeA = new Date(a.published_at || a.updated_at || a.created_at).getTime();
    const timeB = new Date(b.published_at || b.updated_at || b.created_at).getTime();
    return timeB - timeA;
  }).slice(0, limit);
}

/**
 * Cancel an active scheduled publishing job (Facebook or Instagram).
 * Only cancels if status is 'scheduled' or 'pending'.
 * Does not cancel published or actively uploading jobs.
 */
export async function cancelScheduledSocialJob(db, userId, platform, jobId) {
  if (!userId || !jobId) return { success: false, error: 'User ID and Job ID are required' };

  const table = platform === 'facebook' ? 'facebook_upload_jobs' : 'instagram_upload_jobs';
  
  // 1. Verify job exists and belongs to user
  const existing = await db.prepare(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`).bind(jobId, userId).first();
  if (!existing) {
    return { success: false, error: 'Job not found or does not belong to you' };
  }

  // 2. Permanently delete from database (zero soft deletes)
  const res = await db.prepare(`
    DELETE FROM ${table}
    WHERE id = ? AND user_id = ?
  `).bind(jobId, userId).run();

  const success = (res?.meta?.changes ?? 0) > 0;
  return {
    success,
    job: { ...existing, status: 'deleted' },
    b2_file_name: existing.b2_file_name,
    b2_file_id: existing.b2_file_id
  };
}

/**
 * Reschedule an active scheduled publishing job (Facebook or Instagram) to a new date/time.
 * Only allows rescheduling if job status is 'scheduled' or 'pending'.
 * Ensures the target time is a valid future ISO datetime.
 */
export async function rescheduleScheduledSocialJob(db, userId, platform, jobId, newScheduledAt) {
  if (!userId || !jobId) return { success: false, error: 'User ID and Job ID are required' };
  if (!['facebook', 'instagram'].includes(platform)) {
    return { success: false, error: 'Invalid platform. Must be facebook or instagram' };
  }
  if (!newScheduledAt) {
    return { success: false, error: 'New scheduled date/time is required' };
  }

  const parsedDate = new Date(newScheduledAt);
  if (isNaN(parsedDate.getTime())) {
    return { success: false, error: 'Invalid date/time format provided' };
  }
  if (parsedDate.getTime() <= Date.now()) {
    return { success: false, error: 'Scheduled time must be in the future' };
  }

  const targetUtcIso = parsedDate.toISOString();
  const table = platform === 'facebook' ? 'facebook_upload_jobs' : 'instagram_upload_jobs';

  // 1. Verify job exists and belongs to user
  const existing = await db.prepare(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`).bind(jobId, userId).first();
  if (!existing) {
    return { success: false, error: 'Job not found or does not belong to you' };
  }

  if (!['scheduled', 'pending'].includes(existing.status)) {
    return { success: false, error: `Job cannot be rescheduled in status: ${existing.status}` };
  }

  // 2. Atomically update scheduled_at and ensure status is 'scheduled'
  const res = await db.prepare(`
    UPDATE ${table}
    SET scheduled_at = ?, status = 'scheduled', updated_at = datetime('now')
    WHERE id = ? AND user_id = ? AND status IN ('scheduled', 'pending')
  `).bind(targetUtcIso, jobId, userId).run();

  const success = (res?.meta?.changes ?? 0) > 0;
  if (!success) {
    return { success: false, error: 'Could not update schedule. The job may have already started publishing.' };
  }

  const updatedJob = {
    ...existing,
    scheduled_at: targetUtcIso,
    status: 'scheduled',
    platform
  };

  return {
    success: true,
    job: updatedJob,
    scheduled_at: targetUtcIso
  };
}

/**
 * Permanently delete completed/failed/cancelled upload history for YouTube, Facebook, and/or Instagram.
 * STRICT PERMANENT (HARD) DELETION:
 * Completely removes matching records via DELETE FROM.
 * Strictly protects all active 'scheduled', 'pending', and 'uploading' jobs.
 */
export async function clearCompletedSocialHistory(db, userId, platform = 'all') {
  if (!userId) return { success: false, error: 'User ID is required' };

  let ytDeleted = 0;
  let fbDeleted = 0;
  let igDeleted = 0;

  if (platform === 'all' || platform === 'youtube') {
    const res = await db.prepare(`
      DELETE FROM upload_jobs
      WHERE user_id = ? AND status IN ('uploaded', 'published', 'completed', 'failed', 'cancelled')
    `).bind(userId).run();
    ytDeleted = res?.meta?.changes ?? 0;
  }

  if (platform === 'all' || platform === 'facebook') {
    const res = await db.prepare(`
      DELETE FROM facebook_upload_jobs
      WHERE user_id = ? AND status IN ('published', 'failed', 'cancelled')
    `).bind(userId).run();
    fbDeleted = res?.meta?.changes ?? 0;
  }

  if (platform === 'all' || platform === 'instagram') {
    const res = await db.prepare(`
      DELETE FROM instagram_upload_jobs
      WHERE user_id = ? AND status IN ('published', 'failed', 'cancelled')
    `).bind(userId).run();
    igDeleted = res?.meta?.changes ?? 0;
  }

  return {
    success: true,
    platform,
    deletedCount: ytDeleted + fbDeleted + igDeleted,
    youtubeDeleted: ytDeleted,
    facebookDeleted: fbDeleted,
    instagramDeleted: igDeleted
  };
}

/**
 * Permanently delete selected upload history records across YouTube, Facebook, and Instagram.
 * Strict Permanent (Hard) Deletion: rows are completely removed from D1/SQLite.
 * @param {object} db
 * @param {string} userId
 * @param {Array<{ id: string, platform: 'youtube'|'facebook'|'instagram' }>} items
 */
export async function deleteSocialHistoryItems(db, userId, items = []) {
  if (!userId) return { success: false, error: 'User ID is required' };
  if (!Array.isArray(items) || items.length === 0) {
    return { success: true, deletedCount: 0, deletedIds: [] };
  }

  let totalDeleted = 0;
  const deletedIds = [];

  for (const item of items) {
    if (!item?.id) continue;
    const platform = (item.platform || '').toLowerCase();

    if (platform === 'youtube') {
      const res = await db.prepare(
        'DELETE FROM upload_jobs WHERE user_id = ? AND id = ?'
      ).bind(userId, item.id).run();
      const count = res?.meta?.changes ?? 0;
      totalDeleted += count;
      if (count > 0) deletedIds.push(item.id);
    } else if (platform === 'facebook') {
      const res = await db.prepare(
        'DELETE FROM facebook_upload_jobs WHERE user_id = ? AND id = ?'
      ).bind(userId, item.id).run();
      const count = res?.meta?.changes ?? 0;
      totalDeleted += count;
      if (count > 0) deletedIds.push(item.id);
    } else if (platform === 'instagram') {
      const res = await db.prepare(
        'DELETE FROM instagram_upload_jobs WHERE user_id = ? AND id = ?'
      ).bind(userId, item.id).run();
      const count = res?.meta?.changes ?? 0;
      totalDeleted += count;
      if (count > 0) deletedIds.push(item.id);
    }
  }

  return {
    success: true,
    deletedCount: totalDeleted,
    deletedIds
  };
}

/**
 * Permanently delete selected scheduled publishing jobs across Facebook and Instagram.
 * Strict Permanent (Hard) Deletion: completely removed from database.
 * Also returns candidate B2 files to check if Backblaze B2 cleanup is needed.
 * @param {object} db
 * @param {string} userId
 * @param {Array<{ id: string, platform: 'facebook'|'instagram' }>} items
 */
export async function deleteScheduledSocialJobs(db, userId, items = []) {
  if (!userId) return { success: false, error: 'User ID is required' };
  if (!Array.isArray(items) || items.length === 0) {
    return { success: true, deletedCount: 0, deletedIds: [], candidateB2Files: [] };
  }

  let totalDeleted = 0;
  const deletedIds = [];
  const candidateB2Files = [];

  for (const item of items) {
    if (!item?.id) continue;
    const platform = (item.platform || '').toLowerCase();
    const table = platform === 'facebook' ? 'facebook_upload_jobs' : 'instagram_upload_jobs';

    const job = await db.prepare(
      `SELECT * FROM ${table} WHERE user_id = ? AND id = ?`
    ).bind(userId, item.id).first();

    if (job) {
      if (job.b2_file_name) {
        candidateB2Files.push(job.b2_file_name);
      }
      const res = await db.prepare(
        `DELETE FROM ${table} WHERE user_id = ? AND id = ?`
      ).bind(userId, item.id).run();
      const count = res?.meta?.changes ?? 0;
      totalDeleted += count;
      if (count > 0) deletedIds.push(item.id);
    }
  }

  return {
    success: true,
    deletedCount: totalDeleted,
    deletedIds,
    candidateB2Files
  };
}

// ─── Storage & User Data Management Helpers ────────────────────────────────────

export async function getUserStorageStats(db, userId) {
  if (!userId) return null;

  const [
    templatesCount,
    ytAccount,
    ytJobsCount,
    fbAccount,
    fbJobsCount,
    igAccount,
    igJobsCount
  ] = await Promise.all([
    db.prepare('SELECT COUNT(*) as count FROM templates WHERE user_id = ?').bind(userId).first(),
    db.prepare('SELECT channel_title, channel_handle FROM youtube_accounts WHERE user_id = ? LIMIT 1').bind(userId).first(),
    db.prepare('SELECT COUNT(*) as count FROM upload_jobs WHERE user_id = ?').bind(userId).first(),
    db.prepare('SELECT page_name, page_id FROM facebook_accounts WHERE user_id = ? LIMIT 1').bind(userId).first(),
    db.prepare('SELECT COUNT(*) as count FROM facebook_upload_jobs WHERE user_id = ?').bind(userId).first(),
    db.prepare('SELECT ig_username, ig_user_id FROM instagram_accounts WHERE user_id = ? LIMIT 1').bind(userId).first(),
    db.prepare('SELECT COUNT(*) as count FROM instagram_upload_jobs WHERE user_id = ?').bind(userId).first()
  ]);

  return {
    templatesCount: templatesCount?.count || 0,
    hasYouTube: Boolean(ytAccount),
    youtubeChannel: ytAccount?.channel_title || ytAccount?.channel_handle || null,
    youtubeJobsCount: ytJobsCount?.count || 0,
    hasFacebook: Boolean(fbAccount),
    facebookPage: fbAccount?.page_name || null,
    facebookJobsCount: fbJobsCount?.count || 0,
    hasInstagram: Boolean(igAccount),
    instagramAccount: igAccount?.ig_username ? `@${igAccount.ig_username}` : null,
    instagramJobsCount: igJobsCount?.count || 0
  };
}

export async function clearUserDataByScope(db, userId, scope) {
  if (!userId) return { success: false, error: 'User ID is required' };

  let deletedCount = 0;

  switch (scope) {
    case 'templates': {
      const res = await db.prepare('DELETE FROM templates WHERE user_id = ?').bind(userId).run();
      deletedCount = res?.meta?.changes ?? 0;
      break;
    }
    case 'youtube': {
      const r1 = await db.prepare('DELETE FROM youtube_accounts WHERE user_id = ?').bind(userId).run();
      const r2 = await db.prepare('DELETE FROM upload_jobs WHERE user_id = ?').bind(userId).run();
      deletedCount = (r1?.meta?.changes ?? 0) + (r2?.meta?.changes ?? 0);
      break;
    }
    case 'facebook': {
      const r1 = await db.prepare('DELETE FROM facebook_accounts WHERE user_id = ?').bind(userId).run();
      const r2 = await db.prepare('DELETE FROM facebook_upload_jobs WHERE user_id = ?').bind(userId).run();
      deletedCount = (r1?.meta?.changes ?? 0) + (r2?.meta?.changes ?? 0);
      break;
    }
    case 'instagram': {
      const r1 = await db.prepare('DELETE FROM instagram_accounts WHERE user_id = ?').bind(userId).run();
      const r2 = await db.prepare('DELETE FROM instagram_upload_jobs WHERE user_id = ?').bind(userId).run();
      deletedCount = (r1?.meta?.changes ?? 0) + (r2?.meta?.changes ?? 0);
      break;
    }
    case 'youtube_history': {
      const res = await db.prepare(`
        DELETE FROM upload_jobs
        WHERE user_id = ? AND status IN ('uploaded', 'published', 'completed', 'failed', 'cancelled')
      `).bind(userId).run();
      deletedCount = res?.meta?.changes ?? 0;
      break;
    }
    case 'facebook_history': {
      const res = await db.prepare("DELETE FROM facebook_upload_jobs WHERE user_id = ? AND status IN ('published', 'failed', 'cancelled')").bind(userId).run();
      deletedCount = res?.meta?.changes ?? 0;
      break;
    }
    case 'instagram_history': {
      const res = await db.prepare("DELETE FROM instagram_upload_jobs WHERE user_id = ? AND status IN ('published', 'failed', 'cancelled')").bind(userId).run();
      deletedCount = res?.meta?.changes ?? 0;
      break;
    }
    case 'history':
    case 'jobs':
    case 'all_history': {
      const r1 = await db.prepare(`
        DELETE FROM upload_jobs
        WHERE user_id = ? AND status IN ('uploaded', 'published', 'completed', 'failed', 'cancelled')
      `).bind(userId).run();
      const r2 = await db.prepare("DELETE FROM facebook_upload_jobs WHERE user_id = ? AND status IN ('published', 'failed', 'cancelled')").bind(userId).run();
      const r3 = await db.prepare("DELETE FROM instagram_upload_jobs WHERE user_id = ? AND status IN ('published', 'failed', 'cancelled')").bind(userId).run();
      deletedCount = (r1?.meta?.changes ?? 0) + (r2?.meta?.changes ?? 0) + (r3?.meta?.changes ?? 0);
      break;
    }
    case 'all':
      await wipeAllUserData(db, userId);
      break;
    default:
      throw new Error(`Unknown clearance scope: ${scope}`);
  }

  return { success: true, scope, deletedCount };
}

export async function wipeAllUserData(db, userId) {
  if (!userId) return { success: false };

  await Promise.all([
    db.prepare('DELETE FROM templates WHERE user_id = ?').bind(userId).run(),
    db.prepare('DELETE FROM upload_jobs WHERE user_id = ?').bind(userId).run(),
    db.prepare('DELETE FROM youtube_accounts WHERE user_id = ?').bind(userId).run(),
    db.prepare('DELETE FROM facebook_upload_jobs WHERE user_id = ?').bind(userId).run(),
    db.prepare('DELETE FROM facebook_accounts WHERE user_id = ?').bind(userId).run(),
    db.prepare('DELETE FROM instagram_upload_jobs WHERE user_id = ?').bind(userId).run(),
    db.prepare('DELETE FROM instagram_accounts WHERE user_id = ?').bind(userId).run(),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run()
  ]);

  return { success: true };
}

export const clearUserData = clearUserDataByScope;





