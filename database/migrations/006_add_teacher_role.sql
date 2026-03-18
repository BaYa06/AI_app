-- Migration 006: Add teacher column to users table

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS teacher BOOLEAN DEFAULT false;
