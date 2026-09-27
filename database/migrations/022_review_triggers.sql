-- Migration 022: триггеры повторения (plan/course_rating_and_review_plan.md, этап 3)
-- Применяется автоматически в api/_db-init.js; файл — для истории и ручного применения.

ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_freezes INTEGER NOT NULL DEFAULT 0;        -- заморозки серии в запасе (≤ 2)
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS last_reminder_date DATE;                   -- не больше одного напоминания в день
ALTER TABLE courses ADD COLUMN IF NOT EXISTS last_review_reminder_at TIMESTAMPTZ;          -- «Напомнить» классу — раз в сутки

-- Статистика учителя читала reviews, а ответы с этапа 1 пишутся в answers — объединяем оба журнала
CREATE OR REPLACE VIEW review_log AS
  SELECT id, card_id, user_id, reviewed_at FROM reviews
  UNION ALL
  SELECT id, card_id, user_id, (answered_at AT TIME ZONE 'UTC') AS reviewed_at
  FROM answers WHERE rejected_reason IS NULL;
