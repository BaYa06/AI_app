-- Add short numeric join_code to course_invites
ALTER TABLE course_invites ADD COLUMN IF NOT EXISTS join_code VARCHAR(6) UNIQUE;

-- Backfill existing rows with random 6-digit codes
UPDATE course_invites
SET join_code = LPAD(FLOOR(100000 + RANDOM() * 900000)::bigint::text, 6, '0')
WHERE join_code IS NULL;

-- Index for fast lookup by code
CREATE UNIQUE INDEX IF NOT EXISTS idx_course_invites_join_code ON course_invites(join_code);
