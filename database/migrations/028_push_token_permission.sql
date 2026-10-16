-- Migration 028: разрешение на уведомления на устройстве (plan/new/push_notifications.md, шаг 1.4).
-- granted | provisional | denied; NULL — неизвестно (старые сборки не присылают, считаем разрешённым).
-- Клиент обновляет при каждом открытии приложения. denied — пуши на этот токен не шлём.
ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS permission TEXT;
