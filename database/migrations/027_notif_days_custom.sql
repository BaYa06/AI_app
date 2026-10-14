-- Migration 027: дни недели для напоминаний (plan/push_notifications.md, шаг 0.6).
-- Раньше дефолт был «пн–пт», и его никто не выбирал сам (14.10.2026: у всех 18 получателей — дефолт).
-- Теперь: дефолт — все 7 дней; фильтр по notif_days работает, только если человек выбрал дни сам.
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS notif_days_custom BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE user_stats ALTER COLUMN notif_days SET DEFAULT 'mon,tue,wed,thu,fri,sat,sun';
-- Выключенные переключатели «что присылать» (шаг 2.4): lesson | streak | course | rating. Пусто — всё включено.
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS notif_categories_off TEXT[] NOT NULL DEFAULT '{}';
