-- Migration 026: журнал push-уведомлений (plan/push_notifications.md, шаг 0.3).
-- Применяется автоматически в api/_db-init.js; файл — для истории и ручного применения.
-- Строка на каждое решение sendNotification, включая отказы (no_token, disabled…).
-- id уходит в пуш как data.push_id — по нему тап (opened_at) и урок (lesson_*_at) связываются с отправкой.
-- Хранится 180 дней: чистит cron-reminders раз в сутки.

CREATE TABLE IF NOT EXISTS push_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL,
  type                TEXT NOT NULL,          -- review_due, streak_reminder, teacher_review, …
  category            TEXT NOT NULL,          -- lesson | streak | course | rating | reactivation | onboarding
  variant             TEXT,                   -- вариант текста для A/B (этап 4)
  local_date          DATE NOT NULL,          -- день по поясу пользователя
  status              TEXT NOT NULL,          -- sent | failed | no_token | denied | disabled | no_specifics | quiet_hours | capped | backoff | holdout | dry_run | paused
  tokens              INT DEFAULT 0,
  delivered           INT DEFAULT 0,          -- successCount от FCM
  payload             JSONB,                  -- числа из текста: count, streak, place…
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  opened_at           TIMESTAMPTZ,
  lesson_started_at   TIMESTAMPTZ,
  lesson_completed_at TIMESTAMPTZ,
  slot                TEXT                    -- 'daily' — ежедневная рассылка арбитра (2.2); NULL — разовые пуши
);
CREATE INDEX IF NOT EXISTS push_log_user_date ON push_log (user_id, local_date);
CREATE INDEX IF NOT EXISTS push_log_type_created ON push_log (type, created_at);
CREATE INDEX IF NOT EXISTS push_log_created ON push_log (created_at);
-- Защита от дублей (2.2): одна ежедневная рассылка в категории в день, даже если cron запустится дважды.
-- Строка резервируется до отправки (status = 'sending'); неудачная отправка слот освобождает.
CREATE UNIQUE INDEX IF NOT EXISTS push_log_daily_once ON push_log (user_id, category, local_date, slot)
  WHERE slot IS NOT NULL AND status IN ('sending', 'sent');
