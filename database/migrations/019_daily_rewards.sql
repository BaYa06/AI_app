-- Migration 019: Daily challenge rewards
-- Один claim на челлендж в день. Баланс — users.diamond (миграция 009),
-- начисляется только сервером (api/push.js?action=claim-reward).

ALTER TABLE users ADD COLUMN IF NOT EXISTS diamond INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS daily_rewards (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge  VARCHAR(32) NOT NULL,
  day        DATE NOT NULL,
  amount     INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, challenge, day)
);
