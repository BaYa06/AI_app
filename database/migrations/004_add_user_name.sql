-- Migration: Add user_name column to users table
-- Each user gets a unique @username

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS user_name VARCHAR(50) UNIQUE;

-- Generate default user_name from email for existing users
UPDATE users
  SET user_name = '@' || LOWER(SPLIT_PART(email, '@', 1))
  WHERE user_name IS NULL AND email IS NOT NULL;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_user_name ON users(user_name);
