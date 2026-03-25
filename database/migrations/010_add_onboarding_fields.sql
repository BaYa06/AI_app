-- Migration 010: Add onboarding tracking fields
-- Date: 2026-03-25

ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS teacher_subject VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS teacher_group_size VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS learning_goal VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_goal VARCHAR(10);

-- Mark all existing users as already onboarded
UPDATE users SET onboarding_completed = true;
