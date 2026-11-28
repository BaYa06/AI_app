-- Журнал событий экзамена (plan/new/web_cabinet.md, Web 22). Только добавляющее изменение:
-- новая таблица, существующие таблицы и старые версии приложения не затронуты.
-- Пишется «с оглядкой»: сбой записи события не ломает экзамен (api/_exam/events.js).
CREATE TABLE IF NOT EXISTS exam_events (
  id          BIGSERIAL PRIMARY KEY,
  session_id  UUID NOT NULL REFERENCES test_sessions(id) ON DELETE CASCADE,
  user_id     UUID,
  kind        VARCHAR(24) NOT NULL,
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exam_events_session ON exam_events(session_id, created_at DESC);
