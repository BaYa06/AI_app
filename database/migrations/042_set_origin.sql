-- Migration 042: откуда взялся набор (plan/new/teacher_cabinet.md, Teacher 31).
-- Применяется автоматически в api/_db-init.js; файл — для истории и ручного применения.
--
-- manual / ai / file / library / share; NULL — старый набор (клиент показывает общий значок,
-- для копий из библиотеки и по ссылке сервер подставляет library / share по таблицам импорта).
-- Только новая колонка: старые версии приложения её не замечают (Release 2).
ALTER TABLE card_sets ADD COLUMN IF NOT EXISTS origin TEXT;
