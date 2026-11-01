-- Миграция 038: защита наборов книг — триггер 018 на любой базе + наборы книг без владельца
-- Дата: 2026-11-01
-- Применяется автоматически в api/_db-init.js; файл — для истории и ручного применения.
--
-- Что случилось: триггер из 018 ставился вручную и на проде его не было. Наборы книг были
-- записаны на аккаунт админа (user_id = ADMIN_USER_ID), поэтому SQL «удалить мои наборы без
-- курса» у админа удалил все 128 наборов книг, а каскадом — их карточки, card_progress, answers и
-- score_events учеников. Книги восстановлены повторным импортом, прогресс — нет (не было бэкапа).
--
-- Теперь:
--  1) триггеры trg_guard_official_sets / trg_guard_official_cards (тексты — как в 018);
--  2) у наборов книг нет владельца: запросы вида «наборы пользователя X» (user_id = me) их не видят,
--     удаление любого аккаунта их не задевает. Ученикам и учителям наборы отдаются через
--     книгу → юнит → курс (api/books.js, api/_course.js), владелец для этого не нужен.
--
-- Применять через psql:
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f database/migrations/018_protect_official_sets.sql
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f database/migrations/038_official_sets_guard.sql

BEGIN;

SET LOCAL flashly.official_write = 'on';
UPDATE card_sets SET user_id = NULL WHERE is_official AND user_id IS NOT NULL;

COMMIT;
