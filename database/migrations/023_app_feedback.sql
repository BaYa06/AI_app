-- Migration 023: обратная связь — «Написать нам» и окно оценки приложения
-- Применяется автоматически в api/_db-init.js; файл — для истории и ручного применения.
-- Смотрится только в админке (api/admin.js).

CREATE TABLE IF NOT EXISTS app_feedback (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,       -- удаляется вместе с аккаунтом
  kind         VARCHAR(10) NOT NULL CHECK (kind IN ('message', 'rating')),
  category     VARCHAR(20),                                       -- message: problem | idea | question
  rating       SMALLINT CHECK (rating BETWEEN 1 AND 5),           -- rating: звёзды
  has_problem  BOOLEAN,                                           -- rating: «были ли проблемы»
  tags         TEXT[],                                            -- rating: что не так (озвучка, карточки, …)
  message      TEXT,
  app_version  VARCHAR(20),
  platform     VARCHAR(10),
  os_version   VARCHAR(40),
  user_role    VARCHAR(10),                                       -- student | teacher
  status       VARCHAR(10) NOT NULL DEFAULT 'new',                -- new | read (отмечает админ)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_feedback_created ON app_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_feedback_user_created ON app_feedback(user_id, created_at DESC);
