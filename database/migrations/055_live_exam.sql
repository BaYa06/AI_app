-- Живой экзамен (plan/new/live_exam.md, LiveExam 1). Только добавляющие изменения:
-- старый живой тест (engine = 1) и старые версии приложения работают как раньше.

-- Подготовка карточек (раздел A алгоритма): тип оборота набора, часть речи, пропуск в примере.
ALTER TABLE card_sets ADD COLUMN IF NOT EXISTS back_kind TEXT
  CHECK (back_kind IN ('translation', 'definition'));
ALTER TABLE card_sets ADD COLUMN IF NOT EXISTS back_kind_source TEXT DEFAULT 'auto';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS pos_guess VARCHAR(8);
ALTER TABLE cards ADD COLUMN IF NOT EXISTS gap_text TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS gap_answer TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS gap_kind VARCHAR(10);

-- Сессия экзамена: engine = 2 — новый режим.
ALTER TABLE test_sessions ADD COLUMN IF NOT EXISTS engine SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE test_sessions ADD COLUMN IF NOT EXISTS config JSONB;
ALTER TABLE test_sessions ADD COLUMN IF NOT EXISTS duration_sec INTEGER;
ALTER TABLE test_sessions ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
ALTER TABLE test_sessions ADD COLUMN IF NOT EXISTS paused_total_sec INTEGER NOT NULL DEFAULT 0;
ALTER TABLE test_sessions ADD COLUMN IF NOT EXISTS reveal_mode VARCHAR(12);
ALTER TABLE test_sessions ADD COLUMN IF NOT EXISTS results_released_at TIMESTAMPTZ;

-- Состав экзамена — общий для всех учеников. prompt/answer/options — снимок на момент сборки:
-- правка или удаление карточки не меняет уже проведённый экзамен.
CREATE TABLE IF NOT EXISTS test_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID NOT NULL REFERENCES test_sessions(id) ON DELETE CASCADE,
  card_id          UUID REFERENCES cards(id) ON DELETE SET NULL,
  block_no         INTEGER NOT NULL,
  format           VARCHAR(10) NOT NULL,
  direction        VARCHAR(10),
  prompt           TEXT NOT NULL,
  answer           TEXT NOT NULL,
  options          JSONB,
  extra            JSONB,
  difficulty       VARCHAR(10),
  points           NUMERIC(6,2) NOT NULL DEFAULT 0,
  voided           BOOLEAN NOT NULL DEFAULT false,
  accepted_answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_key         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_test_items_session ON test_items(session_id);

ALTER TABLE test_participants ADD COLUMN IF NOT EXISTS block_order JSONB;
ALTER TABLE test_participants ADD COLUMN IF NOT EXISTS extra_sec INTEGER NOT NULL DEFAULT 0;
ALTER TABLE test_participants ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE test_participants ADD COLUMN IF NOT EXISTS score_override SMALLINT;
ALTER TABLE test_participants ADD COLUMN IF NOT EXISTS score_comment TEXT;
ALTER TABLE test_participants ADD COLUMN IF NOT EXISTS retake_of UUID;

ALTER TABLE test_answers ADD COLUMN IF NOT EXISTS item_id UUID;
ALTER TABLE test_answers ADD COLUMN IF NOT EXISTS verdict VARCHAR(12);
ALTER TABLE test_answers ADD COLUMN IF NOT EXISTS points NUMERIC(6,2);
ALTER TABLE test_answers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Журнал решений учителя: засчитал ответ, аннулировал вопрос, изменил балл. Отмена = undone_at.
CREATE TABLE IF NOT EXISTS test_score_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES test_sessions(id) ON DELETE CASCADE,
  teacher_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action         VARCHAR(20) NOT NULL,
  item_id        UUID,
  participant_id UUID,
  payload        JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  undone_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_test_score_log_session ON test_score_log(session_id);
