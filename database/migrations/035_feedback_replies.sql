-- Migration 035: «Мои обращения» (plan/new/support_threads.md, Support 1).
-- Строка app_feedback — обращение (ветка). Первое сообщение остаётся в app_feedback.message,
-- всё последующее (ответы команды и дописки пользователя) — в app_feedback_replies.

CREATE TABLE IF NOT EXISTS app_feedback_replies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES app_feedback(id) ON DELETE CASCADE,
  author      VARCHAR(5) NOT NULL CHECK (author IN ('user', 'admin')),
  admin_id    UUID,                 -- кто из админов ответил (для author = 'admin')
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_feedback_replies_thread ON app_feedback_replies(feedback_id, created_at);

-- status: new (ждёт ответа) → read → answered → closed; дописка пользователя снова ставит new.
ALTER TABLE app_feedback ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;              -- когда админ впервые открыл
ALTER TABLE app_feedback ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(); -- сортировка списка
ALTER TABLE app_feedback ADD COLUMN IF NOT EXISTS last_admin_reply_at TIMESTAMPTZ;  -- последний ответ команды
ALTER TABLE app_feedback ADD COLUMN IF NOT EXISTS user_seen_at TIMESTAMPTZ;         -- пользователь открыл переписку

-- Старые обращения: последнее сообщение — само обращение; «Прочитано» до 035 — без даты.
UPDATE app_feedback f SET last_message_at = f.created_at
  WHERE f.last_message_at <> f.created_at
    AND NOT EXISTS (SELECT 1 FROM app_feedback_replies r WHERE r.feedback_id = f.id);
UPDATE app_feedback SET read_at = created_at WHERE status = 'read' AND read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_app_feedback_user_last ON app_feedback(user_id, last_message_at DESC);
