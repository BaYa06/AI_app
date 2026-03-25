-- Migration 009: Add diamond column to users table

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS diamond INTEGER DEFAULT 0;
