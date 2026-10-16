-- Migration 030: ответы «о себе» для напоминаний (plan/new/push_notifications.md, шаг 2.7).
-- Всё необязательно, можно изменить или стереть в «Профиль → Мои данные».
-- age_range: under13 | 13-17 | 18-24 | 25-34 | 35+ — точную дату рождения не спрашиваем.
-- class_days / class_hour — «хожу на курсы» в центре, которого нет в Flashly (пуш «повтори перед занятием», 2.8).
-- notif_use_habits — подстраивать время напоминаний под привычки (2.9); выключил — только время из настроек.
ALTER TABLE users ADD COLUMN IF NOT EXISTS age_range TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS class_days TEXT[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS class_hour SMALLINT;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS notif_use_habits BOOLEAN NOT NULL DEFAULT true;
-- notif_time_custom — время напоминания человек выбрал сам (настройки, лист после урока): оно важнее привычек (2.9).
-- Разово: у кого время не по умолчанию (19:00), тот выбирал сам.
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS notif_time_custom BOOLEAN NOT NULL DEFAULT false;
UPDATE user_stats SET notif_time_custom = true WHERE notif_hour <> 19 OR COALESCE(notif_minute, 0) <> 0;
