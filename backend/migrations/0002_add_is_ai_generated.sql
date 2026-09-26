-- Migration: 0002_add_is_ai_generated.sql
-- Add is_ai_generated disclosure column for Meta Graph API AI Info label
ALTER TABLE facebook_upload_jobs ADD COLUMN is_ai_generated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE instagram_upload_jobs ADD COLUMN is_ai_generated INTEGER NOT NULL DEFAULT 0;
