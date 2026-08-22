-- Local Video Clip Editor — D1 Schema
-- Migration: 002_auth
-- Run: wrangler d1 migrations apply videoclip-db

-- ─────────────────────────────────────────────────────────────────────────────
-- Update users table with authentication fields
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN salt TEXT;
ALTER TABLE users ADD COLUMN name TEXT;
ALTER TABLE users ADD COLUMN updated_at TEXT;

-- Index on email for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- User Sessions — for multi-device token authentication
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
