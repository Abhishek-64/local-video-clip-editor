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

// ─── Project Settings Helpers ─────────────────────────────────────────────────

export async function getProjectSettings(db, userId) {
  const row = await db
    .prepare('SELECT * FROM project_settings WHERE user_id = ? AND id = "default"')
    .bind(userId)
    .first();

  if (!row) {
    // Return defaults
    return {
      id: 'default',
      user_id: userId,
      yt_title_template: '{movie} - Part {part} | #Shorts',
      yt_description_template: '{movie} - Part {part}\n\nCreated with Local Video Clip Editor\n\n#Shorts',
      yt_tags: '["shorts","youtube shorts","clips"]',
      yt_visibility: 'private',
      yt_category: '22',
      yt_made_for_kids: 0,
      yt_notify_subscribers: 1,
      yt_default_upload: 'manual',
      schedule_interval: '1day',
      schedule_base_time: '20:00',
      schedule_timezone: 'UTC'
    };
  }
  return row;
}

export async function upsertProjectSettings(db, userId, data) {
  await db
    .prepare(`
      INSERT INTO project_settings
        (id, user_id, yt_title_template, yt_description_template, yt_tags,
         yt_visibility, yt_category, yt_made_for_kids, yt_notify_subscribers,
         yt_default_upload, schedule_interval, schedule_base_time, schedule_timezone, updated_at)
      VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id, user_id) DO UPDATE SET
        yt_title_template       = excluded.yt_title_template,
        yt_description_template = excluded.yt_description_template,
        yt_tags                 = excluded.yt_tags,
        yt_visibility           = excluded.yt_visibility,
        yt_category             = excluded.yt_category,
        yt_made_for_kids        = excluded.yt_made_for_kids,
        yt_notify_subscribers   = excluded.yt_notify_subscribers,
        yt_default_upload       = excluded.yt_default_upload,
        schedule_interval       = excluded.schedule_interval,
        schedule_base_time      = excluded.schedule_base_time,
        schedule_timezone       = excluded.schedule_timezone,
        updated_at              = datetime('now')
    `)
    .bind(
      userId,
      data.yt_title_template ?? '{movie} - Part {part} | #Shorts',
      data.yt_description_template ?? '{movie} - Part {part}\n\n#Shorts',
      data.yt_tags ?? '["shorts","youtube shorts","clips"]',
      data.yt_visibility ?? 'private',
      data.yt_category ?? '22',
      data.yt_made_for_kids ?? 0,
      data.yt_notify_subscribers ?? 1,
      data.yt_default_upload ?? 'manual',
      data.schedule_interval ?? '1day',
      data.schedule_base_time ?? '20:00',
      data.schedule_timezone ?? 'UTC'
    )
    .run();
}

// ─── Branding Preset Helpers ──────────────────────────────────────────────────

export async function getBrandingPresets(db, userId) {
  const result = await db
    .prepare('SELECT * FROM branding_presets WHERE user_id = ? ORDER BY created_at ASC')
    .bind(userId)
    .all();
  return result.results || [];
}

export async function createBrandingPreset(db, userId, data) {
  const id = crypto.randomUUID();
  await db
    .prepare(`
      INSERT INTO branding_presets
        (id, user_id, name, logo_enabled, logo_position, logo_size, logo_opacity, logo_margin,
         text_enabled, text_template, text_position, text_font, text_size, text_color,
         text_outline, text_outline_color, text_outline_thickness, text_bg_enabled, text_bg_color)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      id, userId,
      data.name || 'My Preset',
      data.logo_enabled ? 1 : 0,
      data.logo_position || 'top-right',
      data.logo_size || 70,
      data.logo_opacity || 85,
      data.logo_margin || 16,
      data.text_enabled !== false ? 1 : 0,
      data.text_template || '{movie} - Part {part}',
      data.text_position || 'top-center',
      data.text_font || 'Inter, sans-serif',
      data.text_size || 28,
      data.text_color || '#ffffff',
      data.text_outline ? 1 : 0,
      data.text_outline_color || '#000000',
      data.text_outline_thickness || 3,
      data.text_bg_enabled ? 1 : 0,
      data.text_bg_color || '#000000'
    )
    .run();
  return { id, ...data };
}

export async function updateBrandingPreset(db, userId, id, data) {
  await db
    .prepare(`
      UPDATE branding_presets SET
        name = ?, logo_enabled = ?, logo_position = ?, logo_size = ?, logo_opacity = ?, logo_margin = ?,
        text_enabled = ?, text_template = ?, text_position = ?, text_font = ?, text_size = ?,
        text_color = ?, text_outline = ?, text_outline_color = ?, text_outline_thickness = ?,
        text_bg_enabled = ?, text_bg_color = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `)
    .bind(
      data.name, data.logo_enabled ? 1 : 0, data.logo_position, data.logo_size, data.logo_opacity, data.logo_margin,
      data.text_enabled ? 1 : 0, data.text_template, data.text_position, data.text_font, data.text_size,
      data.text_color, data.text_outline ? 1 : 0, data.text_outline_color, data.text_outline_thickness,
      data.text_bg_enabled ? 1 : 0, data.text_bg_color, id, userId
    )
    .run();
}

export async function deleteBrandingPreset(db, userId, id) {
  await db
    .prepare('DELETE FROM branding_presets WHERE id = ? AND user_id = ?')
    .bind(id, userId)
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
    return { uploadJobsCount: 0, brandingPresetsCount: 0, hasYouTube: false, hasSettings: false };
  }

  const [uploadsRes, presetsRes, ytRes, settingsRes] = await Promise.all([
    db.prepare('SELECT COUNT(*) as count FROM upload_jobs WHERE user_id = ?').bind(userId).first(),
    db.prepare('SELECT COUNT(*) as count FROM branding_presets WHERE user_id = ?').bind(userId).first(),
    db.prepare('SELECT id, channel_title FROM youtube_accounts WHERE user_id = ?').bind(userId).first(),
    db.prepare('SELECT id FROM project_settings WHERE user_id = ?').bind(userId).first()
  ]);

  return {
    uploadJobsCount: uploadsRes?.count ?? 0,
    brandingPresetsCount: presetsRes?.count ?? 0,
    hasYouTube: Boolean(ytRes),
    youtubeChannel: ytRes?.channel_title || null,
    hasSettings: Boolean(settingsRes)
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

  if (scope === 'presets' || scope === 'all') {
    const res = await db.prepare('DELETE FROM branding_presets WHERE user_id = ?').bind(userId).run();
    cleared.presets = res?.meta?.changes ?? 0;
  }

  if (scope === 'settings' || scope === 'all') {
    const res = await db.prepare('DELETE FROM project_settings WHERE user_id = ?').bind(userId).run();
    cleared.settings = res?.meta?.changes ?? 0;
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
