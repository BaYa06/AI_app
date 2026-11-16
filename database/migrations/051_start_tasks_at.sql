-- Migration 051: ученик пришёл по коду или ссылке учителя (plan/new/new_user_activation.md, Start 7.4).
-- Применяется автоматически в api/_db-init.js.
--
-- Новая nullable-колонка (Release 2). Когда ученик курса закончил короткий онбординг — его задания
-- «Начала пути» дают алмазы, как у учеников со стартовым набором.
ALTER TABLE users ADD COLUMN IF NOT EXISTS start_tasks_at TIMESTAMPTZ;
