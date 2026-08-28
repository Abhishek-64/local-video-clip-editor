-- Local Video Clip Editor — Complete Database Reset (Drop All Tables & Recreate)
-- Drop all existing tables
DROP TABLE IF EXISTS branding_presets;
DROP TABLE IF EXISTS upload_jobs;
DROP TABLE IF EXISTS project_settings;
DROP TABLE IF EXISTS youtube_accounts;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS d1_migrations;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Users Table (Authentication & Identity)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT,
  password_hash TEXT,
  salt          TEXT,
  name          TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Sessions Table (Multi-Device Authentication Tokens)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  token       TEXT UNIQUE NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. YouTube Accounts Table (OAuth 2.0 Credentials & Channel Metadata)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE youtube_accounts (
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

CREATE INDEX idx_youtube_accounts_user_id ON youtube_accounts(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Project Settings Table (Per-User Defaults & Templates)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE project_settings (
  id                         TEXT NOT NULL DEFAULT 'default',
  user_id                    TEXT NOT NULL,
  yt_title_template          TEXT NOT NULL DEFAULT '{movie} - Part {part} | #Shorts',
  yt_description_template    TEXT NOT NULL DEFAULT '{movie} - Part {part}

#Shorts

{hashtags}',
  yt_tags                    TEXT NOT NULL DEFAULT '["shorts","youtube shorts","clips","viral","fyp"]',
  yt_visibility              TEXT NOT NULL DEFAULT 'private',
  yt_category                TEXT NOT NULL DEFAULT '22',
  yt_made_for_kids           INTEGER NOT NULL DEFAULT 0,
  yt_notify_subscribers      INTEGER NOT NULL DEFAULT 1,
  yt_default_upload          TEXT NOT NULL DEFAULT 'manual',
  schedule_interval          TEXT NOT NULL DEFAULT '1day',
  schedule_base_time         TEXT NOT NULL DEFAULT '20:00',
  schedule_timezone          TEXT NOT NULL DEFAULT 'UTC',
  updated_at                 TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Upload Jobs Table (YouTube Resumable Upload Tracking & Audit Logs)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE upload_jobs (
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

CREATE INDEX idx_upload_jobs_user_id ON upload_jobs(user_id);
CREATE INDEX idx_upload_jobs_status ON upload_jobs(status);
