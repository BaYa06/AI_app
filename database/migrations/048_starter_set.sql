-- Migration 048: стартовый набор нового ученика выдаётся один раз в жизни аккаунта
-- (plan/new/new_user_activation.md, Start 1.3).
-- Применяется автоматически в api/_db-init.js; файл — для истории и ручного применения.
--
-- Только новые nullable-колонки (Release 2): старые клиенты их не читают.
-- starter_set_id — id выданного набора (без внешнего ключа: набор можно удалить, отметка остаётся).
ALTER TABLE users ADD COLUMN IF NOT EXISTS starter_set_id UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS starter_set_issued_at TIMESTAMPTZ;
