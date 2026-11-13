-- Migration 045: колокольчик учителя (plan/new/teacher_cabinet.md, Teacher 48).
-- Применяется автоматически в api/_db-init.js; файл — для истории и ручного применения.
--
-- seen_at — учитель видел запись в списке уведомлений. Только новая колонка (Release 2).
ALTER TABLE push_log ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ;
