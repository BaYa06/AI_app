-- Migration 021: очки и рейтинг курса (plan/course_rating_and_review_plan.md, этап 2)
-- Применяется автоматически в api/_db-init.js; файл — для истории и ручного применения.

-- Срок повторения назначил правильный ответ (не ошибка): только тогда повторение вовремя даёт очки
ALTER TABLE card_progress ADD COLUMN IF NOT EXISTS review_scheduled BOOLEAN NOT NULL DEFAULT false;

-- Журнал очков: рейтинг — это сумма событий, его всегда можно пересчитать
CREATE TABLE IF NOT EXISTS score_events (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id    UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  answer_id  UUID NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
  kind       VARCHAR(20) NOT NULL,    -- new (+1) | review (+2) | learned (+3) | mature (+5)
  points     SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,    -- = answers.answered_at
  UNIQUE (answer_id, kind)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_score_events_once
  ON score_events (user_id, card_id, kind) WHERE kind IN ('new', 'learned', 'mature');
CREATE INDEX IF NOT EXISTS idx_score_events_user_created ON score_events(user_id, created_at);

ALTER TABLE courses ADD COLUMN IF NOT EXISTS timezone TEXT;                               -- NULL = пояс учителя
ALTER TABLE courses ADD COLUMN IF NOT EXISTS rating_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE course_members ADD COLUMN IF NOT EXISTS hide_from_rating BOOLEAN NOT NULL DEFAULT false;

-- Закрытые недели (даже пустые) и замороженные итоги с наградами
CREATE TABLE IF NOT EXISTS weekly_closures (
  course_id  UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  closed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (course_id, week_start)
);
CREATE TABLE IF NOT EXISTS weekly_results (
  course_id  UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place      SMALLINT NOT NULL,
  points     INTEGER NOT NULL,
  reward     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (course_id, week_start, user_id)
);
