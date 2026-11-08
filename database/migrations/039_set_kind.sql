-- Migration 039: тип набора — язык или предмет (plan/new/set_kind.md, Kind 1).
-- Применяется автоматически в api/_db-init.js; файл — для истории и ручного применения.
--
-- NULL = язык: существующие наборы, наборы старых версий приложения и наборы книг ведут себя как
-- раньше. Автоматически тип не проставляем — владелец размечает наборы вручную.
-- Колонка только добавляется и nullable — старые версии приложения её не замечают (Release 2).

ALTER TABLE card_sets ADD COLUMN IF NOT EXISTS kind TEXT
  CHECK (kind IN ('language', 'subject'));

ALTER TABLE library_sets ADD COLUMN IF NOT EXISTS kind TEXT
  CHECK (kind IN ('language', 'subject'));
