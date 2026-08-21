-- Local Video Clip Editor — D1 Schema
-- Migration: 001_initial
-- Run: wrangler d1 migrations apply videoclip-db

-- ─────────────────────────────────────────────────────────────────────────────
-- Users — simple session-based identity (no passwords)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- YouTube Accounts — one per user (can be replaced/updated)
-- Refresh tokens are stored server-side only, never returned to frontend.
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Project Settings — per-user defaults (title/desc templates, visibility, etc.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_settings (
  id                         TEXT NOT NULL DEFAULT 'default',
  user_id                    TEXT NOT NULL,
  yt_title_template          TEXT NOT NULL DEFAULT '{movie} - Part {part} | #Shorts',
  yt_description_template    TEXT NOT NULL DEFAULT '{movie} - Part {part}

Created with Local Video Clip Editor

#Shorts',
  yt_tags                    TEXT NOT NULL DEFAULT '["shorts","youtube shorts","clips"]',
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
-- Branding Presets — saved logo + text configurations
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branding_presets (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL,
  name                  TEXT NOT NULL,
  logo_enabled          INTEGER NOT NULL DEFAULT 0,
  logo_position         TEXT NOT NULL DEFAULT 'top-right',
  logo_size             INTEGER NOT NULL DEFAULT 70,
  logo_opacity          INTEGER NOT NULL DEFAULT 85,
  logo_margin           INTEGER NOT NULL DEFAULT 16,
  text_enabled          INTEGER NOT NULL DEFAULT 1,
  text_template         TEXT NOT NULL DEFAULT '{movie} - Part {part}',
  text_position         TEXT NOT NULL DEFAULT 'top-center',
  text_font             TEXT NOT NULL DEFAULT 'Inter, sans-serif',
  text_size             INTEGER NOT NULL DEFAULT 28,
  text_color            TEXT NOT NULL DEFAULT '#ffffff',
  text_outline          INTEGER NOT NULL DEFAULT 1,
  text_outline_color    TEXT NOT NULL DEFAULT '#000000',
  text_outline_thickness INTEGER NOT NULL DEFAULT 3,
  text_bg_enabled       INTEGER NOT NULL DEFAULT 0,
  text_bg_color         TEXT NOT NULL DEFAULT '#000000',
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Upload Jobs — metadata/status tracking for each YouTube upload
-- VIDEO BLOBS ARE NEVER STORED HERE. Only metadata.
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
  -- status values: pending | uploading | uploaded | scheduled | published | failed | cancelled
  youtube_video_id    TEXT,
  error_message       TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  published_at        TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (youtube_account_id) REFERENCES youtube_accounts(id) ON DELETE SET NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_upload_jobs_user_id ON upload_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_upload_jobs_status ON upload_jobs(status);
CREATE INDEX IF NOT EXISTS idx_youtube_accounts_user_id ON youtube_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_branding_presets_user_id ON branding_presets(user_id);
