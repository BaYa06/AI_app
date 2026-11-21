-- Migration 050: стартовые наборы второго и третьего изучаемого языка
-- (plan/new/new_user_activation.md, Start 4.3). Применяется автоматически в api/_db-init.js.
--
-- Новая nullable-колонка (Release 2): старые клиенты её не читают.
-- { "de": "<id набора>" } — выдано один раз на язык, удаление набора отметку не снимает.
ALTER TABLE users ADD COLUMN IF NOT EXISTS starter_extra JSONB;
