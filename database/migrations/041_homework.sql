-- Migration 041: задания учителя (plan/new/teacher_cabinet.md, этап 2, Teacher 14).
-- Применяется автоматически в api/_db-init.js; файл — для истории и ручного применения.
--
-- Только новые таблицы: старые версии приложения их не замечают (Release 2).
-- «Сдано» — вариант Б: слово засчитано, когда ученик прошёл его в законченной сессии
-- «Изучить» / «Повторить»; задание сдано, когда засчитаны все слова и оценка ≥ порога.

-- Задание: снимок списка слов на момент выдачи. Слова, добавленные в набор позже, не попадают.
-- card_ids без FK: удалённое из набора слово не ломает задание, просто не учитывается.
CREATE TABLE IF NOT EXISTS homework (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  created_by  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,                 -- «Ünite 4» или «Ünite 4–5»
  card_ids    UUID[] NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'learn', -- этап 2: только 'learn'
  due_at      TIMESTAMPTZ NOT NULL,
  min_score   SMALLINT,                      -- порог оценки 60..100, NULL = без порога
  assign_all  BOOLEAN NOT NULL DEFAULT true, -- false → кому — в homework_assignees
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  canceled_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_homework_course ON homework(course_id, due_at) WHERE canceled_at IS NULL;

CREATE TABLE IF NOT EXISTS homework_assignees (
  homework_id UUID NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (homework_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_homework_assignees_user ON homework_assignees(user_id);

-- Засчитанные слова. first_try_correct перезаписывается последней законченной сессией со словом —
-- так ученик поднимает оценку, повторяя трудные слова.
CREATE TABLE IF NOT EXISTS homework_credits (
  homework_id       UUID NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id           UUID NOT NULL,
  credited_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_try_correct BOOLEAN NOT NULL,
  PRIMARY KEY (homework_id, user_id, card_id)
);
CREATE INDEX IF NOT EXISTS idx_homework_credits_user ON homework_credits(user_id);

-- Снимок сдачи: после вставки не меняется (слово откатилось — задание остаётся сданным).
CREATE TABLE IF NOT EXISTS homework_results (
  homework_id  UUID NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  late         BOOLEAN NOT NULL,
  score        SMALLINT NOT NULL,            -- % верных с первой попытки
  diamonds     SMALLINT NOT NULL DEFAULT 0,  -- 20 в срок, 0 с опозданием
  PRIMARY KEY (homework_id, user_id)
);

-- «Напомнить» учителя: каждому ученику не чаще раза в сутки.
CREATE TABLE IF NOT EXISTS homework_reminders (
  homework_id UUID NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (homework_id, user_id)
);
