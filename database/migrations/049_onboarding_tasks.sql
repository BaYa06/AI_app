-- Migration 049: выполненные задания «Начало пути» (plan/new/new_user_activation.md, Start 3.1, 3.9).
-- Применяется автоматически в api/_db-init.js; файл — для истории и ручного применения.
--
-- Новая таблица (Release 2): старые клиенты её не читают. За каждое задание один раз
-- +10 алмазов в users.diamond — вставка строки и начисление одним запросом
-- (api/_handlers/data/onboardingTasks.js).
CREATE TABLE IF NOT EXISTS onboarding_tasks (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task VARCHAR(32) NOT NULL,
  done_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, task)
);
