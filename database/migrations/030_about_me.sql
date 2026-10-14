-- Migration 030: ответы «о себе» для напоминаний (plan/push_notifications.md, шаг 2.7).
-- Всё необязательно, можно изменить или стереть в «Профиль → Мои данные».
-- age_range: under13 | 13-17 | 18-24 | 25-34 | 35+ — точную дату рождения не спрашиваем.
-- class_days / class_hour — «хожу на курсы» в центре, которого нет в Flashly (пуш «повтори перед занятием», 2.8).
-- notif_use_habits — подстраивать время напоминаний под привычки (2.9); выключил — только время из настроек.
ALTER TABLE users ADD COLUMN IF NOT EXISTS age_range TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS class_days TEXT[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS class_hour SMALLINT;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS notif_use_habits BOOLEAN NOT NULL DEFAULT true;
