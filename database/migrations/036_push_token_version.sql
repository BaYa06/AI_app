-- Migration 036: версия приложения у push-токена (plan/done/support_threads.md, Support 3).
-- Применяется автоматически в api/_db-init.js; файл — для истории и ручного применения.
--
-- Пуш, который открывает новый экран, не шлём старым версиям приложения.
-- Старые версии версию не присылают — остаётся NULL (колонка nullable, Release 2).

ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS app_version VARCHAR(20);
