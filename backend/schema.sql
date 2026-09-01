-- Local Video Clip Editor — Complete D1 Schema (Single SQL File)
-- Apply directly to D1 database:
-- Local:  npx wrangler d1 execute videoclip-db --local --file=schema.sql -c wrangler.toml
-- Remote: npx wrangler d1 execute videoclip-db --remote --file=schema.sql -c wrangler.toml

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Users Table (Authentication & Identity)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT,
  password_hash TEXT,
  salt          TEXT,
  name          TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Sessions Table (Multi-Device Authentication Tokens)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  token       TEXT UNIQUE NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. YouTube Accounts Table (OAuth 2.0 Credentials & Channel Metadata)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS youtube_accounts (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,
  channel_id        TEXT,
  channel_title     TEXT,
  channel_handle    TEXT,
  channel_thumbnail TEXT,
  access_token      TEXT NOT NULL,
  refresh_token     TEXT NOT NULL,
  token_expiry      INTEGER,
  scopes            TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_youtube_accounts_user_id ON youtube_accounts(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Upload Jobs Table (YouTube Resumable Upload Tracking & Audit Logs)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS upload_jobs (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL,
  youtube_account_id  TEXT,
  part_number         INTEGER,
  movie_name          TEXT,
  title               TEXT,
  description         TEXT,
  tags                TEXT,
  visibility          TEXT NOT NULL DEFAULT 'private',
  category            TEXT NOT NULL DEFAULT '22',
  made_for_kids       INTEGER NOT NULL DEFAULT 0,
  notify_subscribers  INTEGER NOT NULL DEFAULT 1,
  scheduled_at        TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',
  youtube_video_id    TEXT,
  error_message       TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  published_at        TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (youtube_account_id) REFERENCES youtube_accounts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_upload_jobs_user_id ON upload_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_upload_jobs_status ON upload_jobs(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Templates Table (Cross-Section Configuration Presets)
-- ─────────────────────────────────────────────────────────────────────────────
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
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Facebook Accounts Table (OAuth 2.0 Credentials & Page Metadata)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facebook_accounts (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,
  fb_user_id        TEXT,
  fb_user_name      TEXT,
  page_id           TEXT NOT NULL,
  page_name         TEXT NOT NULL,
  page_category     TEXT,
  page_thumbnail    TEXT,
  page_access_token TEXT NOT NULL,
  user_access_token TEXT,
  available_pages   TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_facebook_accounts_user_id ON facebook_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_facebook_accounts_page_id ON facebook_accounts(page_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Facebook Upload Jobs Table (Reels & Page Video Publishing Logs)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facebook_upload_jobs (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL,
  facebook_account_id  TEXT,
  page_id              TEXT NOT NULL,
  content_type         TEXT NOT NULL DEFAULT 'reel',
  title                TEXT,
  caption              TEXT,
  description          TEXT,
  hashtags             TEXT,
  scheduled_at         TEXT,
  status               TEXT NOT NULL DEFAULT 'pending',
  b2_file_id           TEXT,
  b2_file_name         TEXT,
  facebook_video_id    TEXT,
  facebook_post_url    TEXT,
  error_message        TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
  published_at         TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (facebook_account_id) REFERENCES facebook_accounts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_facebook_upload_jobs_user_id ON facebook_upload_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_facebook_upload_jobs_status ON facebook_upload_jobs(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Instagram Accounts Table (Meta OAuth Credentials & IG Business/Creator Metadata)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS instagram_accounts (
  id                      TEXT PRIMARY KEY,
  user_id                 TEXT NOT NULL,
  ig_user_id              TEXT NOT NULL,
  ig_username             TEXT,
  ig_name                 TEXT,
  ig_profile_picture_url  TEXT,
  page_id                 TEXT,
  page_name               TEXT,
  access_token            TEXT NOT NULL,
  user_access_token       TEXT,
  available_accounts      TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_instagram_accounts_user_id ON instagram_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_ig_user_id ON instagram_accounts(ig_user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Instagram Upload Jobs Table (Reels & Feed Video Publishing Logs)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS instagram_upload_jobs (
  id                      TEXT PRIMARY KEY,
  user_id                 TEXT NOT NULL,
  instagram_account_id    TEXT,
  ig_user_id              TEXT NOT NULL,
  content_type            TEXT NOT NULL DEFAULT 'reel',
  title                   TEXT,
  caption                 TEXT,
  description             TEXT,
  hashtags                TEXT,
  scheduled_at            TEXT,
  status                  TEXT NOT NULL DEFAULT 'pending',
  b2_file_id              TEXT,
  b2_file_name            TEXT,
  instagram_container_id  TEXT,
  instagram_media_id      TEXT,
  instagram_post_url      TEXT,
  error_message           TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
  published_at            TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (instagram_account_id) REFERENCES instagram_accounts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_instagram_upload_jobs_user_id ON instagram_upload_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_upload_jobs_status ON instagram_upload_jobs(status);
