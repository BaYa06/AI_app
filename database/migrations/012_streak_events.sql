-- Migration 012_streak_events: журнал дней серии (streak).
-- Применяется автоматически в api/_db-init.js; файл — для истории и ручного применения.
--
-- Номер 012 исторически занят дважды: 012_add_join_code (ручная миграция) и эта.
-- Номера не хранятся в базе, поэтому оставлены как есть; новые миграции — только со свободным номером.

CREATE TABLE IF NOT EXISTS streak_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  streak_day INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_streak_events_user ON streak_events(user_id);
CREATE INDEX IF NOT EXISTS idx_streak_events_created ON streak_events(created_at DESC);
