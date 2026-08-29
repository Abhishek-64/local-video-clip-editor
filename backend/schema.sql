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
