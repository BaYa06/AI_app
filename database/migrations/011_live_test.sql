-- Migration 011: Live test system
-- Закрытый Live-тест: учитель создаёт тест → ученики подключаются по коду → проходят тест → учитель видит результаты
-- Дата: 2026-03-26

-- ==============================================
-- Таблица test_sessions — одна запись на каждый тест
-- ==============================================

CREATE TABLE IF NOT EXISTS test_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              VARCHAR(4) NOT NULL,
  teacher_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  set_id            UUID NOT NULL REFERENCES card_sets(id) ON DELETE CASCADE,
  course_id         UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  test_mode         VARCHAR(20) NOT NULL DEFAULT 'multiple',
  question_count    INTEGER NOT NULL,
  time_per_question INTEGER NOT NULL DEFAULT 0,
  status            VARCHAR(20) NOT NULL DEFAULT 'waiting',
  started_at        TIMESTAMPTZ,
  finished_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE test_sessions IS 'Live-тест сессии. Учитель создаёт, ученики подключаются по 4-значному коду';
COMMENT ON COLUMN test_sessions.code IS '4-значный числовой код для входа учеников';
COMMENT ON COLUMN test_sessions.test_mode IS 'Тип теста: multiple / writing / mixed';
COMMENT ON COLUMN test_sessions.time_per_question IS 'Секунды на вопрос (0 = без лимита)';
COMMENT ON COLUMN test_sessions.status IS 'Статус: waiting / active / finished';

-- ==============================================
-- Таблица test_participants — один ученик в одной сессии
-- ==============================================

CREATE TABLE IF NOT EXISTS test_participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES test_sessions(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name    VARCHAR(255),
  question_order  JSONB,
  answer_count    INTEGER DEFAULT 0,
  correct_count   INTEGER DEFAULT 0,
  score           INTEGER DEFAULT 0,
  joined_at       TIMESTAMPTZ DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  is_disqualified BOOLEAN DEFAULT FALSE,
  UNIQUE(session_id, user_id)
);

COMMENT ON TABLE test_participants IS 'Участники Live-теста. UNIQUE(session_id, user_id) предотвращает повторное подключение';
COMMENT ON COLUMN test_participants.question_order IS 'Уникальная перемешка — массив card_id для этого ученика';
COMMENT ON COLUMN test_participants.score IS 'Итоговый процент правильных (0-100)';
COMMENT ON COLUMN test_participants.is_disqualified IS 'Вышел из приложения во время теста';

-- ==============================================
-- Таблица test_answers — каждый ответ каждого ученика
-- ==============================================

CREATE TABLE IF NOT EXISTS test_answers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id  UUID NOT NULL REFERENCES test_participants(id) ON DELETE CASCADE,
  card_id         UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  chosen_answer   TEXT,
  correct_answer  TEXT NOT NULL,
  is_correct      BOOLEAN NOT NULL,
  time_spent_sec  INTEGER,
  answered_at     TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE test_answers IS 'Ответы учеников на вопросы Live-теста';

-- ==============================================
-- Индексы
-- ==============================================

-- Частичный индекс на код — поиск только среди активных сессий
CREATE INDEX IF NOT EXISTS idx_test_sessions_code ON test_sessions(code) WHERE status IN ('waiting', 'active');
CREATE INDEX IF NOT EXISTS idx_test_sessions_teacher ON test_sessions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_test_sessions_course ON test_sessions(course_id);

CREATE INDEX IF NOT EXISTS idx_test_participants_session ON test_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_test_participants_user ON test_participants(user_id);

CREATE INDEX IF NOT EXISTS idx_test_answers_participant ON test_answers(participant_id);
