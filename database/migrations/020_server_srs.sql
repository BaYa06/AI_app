-- Migration 020: серверный SRS (plan/course_rating_and_review_plan.md, этап 1)
-- Применяется автоматически в api/_db-init.js; файл — для истории и ручного применения.

-- Журнал всех ответов (неизменяемый). Уровень карточки меняет только api/progress.js.
CREATE TABLE IF NOT EXISTS answers (
  id              UUID PRIMARY KEY,            -- answerId с клиента: повтор запроса не засчитывается дважды
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id         UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  mode            VARCHAR(20) NOT NULL,        -- test | builder | flashcard
  correct         BOOLEAN NOT NULL,            -- как рассудил сервер
  self_rating     SMALLINT,                    -- только flashcard
  was_due         BOOLEAN NOT NULL,            -- пришло ли время повторения
  step_before     SMALLINT NOT NULL,
  step_after      SMALLINT NOT NULL,
  answered_at     TIMESTAMPTZ NOT NULL,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  time_spent_ms   INTEGER,
  rejected_reason VARCHAR(40)                  -- NULL = засчитан; bad_time | rate_limit | out_of_order | conflict
);
CREATE INDEX IF NOT EXISTS idx_answers_user_answered ON answers(user_id, answered_at DESC);
CREATE INDEX IF NOT EXISTS idx_answers_user_received ON answers(user_id, received_at DESC);

ALTER TABLE card_progress ADD COLUMN IF NOT EXISTS first_learned_at TIMESTAMPTZ; -- первый переход в young
ALTER TABLE card_progress ADD COLUMN IF NOT EXISTS first_mature_at  TIMESTAMPTZ; -- первый переход в mature
ALTER TABLE card_progress ADD COLUMN IF NOT EXISTS last_answer_id   UUID;        -- защита от гонок

CREATE TABLE IF NOT EXISTS app_migrations (
  name       VARCHAR(100) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Одноразово: уровни, набранные без учёта интервалов, понижаются (решение 2026-09-27, план §1.6)
-- INSERT INTO app_migrations (name) VALUES ('020_downgrade_legacy_levels');
-- UPDATE card_progress SET learning_step = 3, status = 'young', next_review = NOW() WHERE learning_step >= 5;
-- UPDATE cards c SET learning_step = 3, status = 'young', next_review = NOW()
--   FROM card_sets s WHERE s.id = c.set_id AND NOT s.is_official AND c.learning_step >= 5;
