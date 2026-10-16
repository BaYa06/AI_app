-- Migration 031: расписание занятий курса (plan/new/push_notifications.md, шаг 2.8).
-- [{ "day": "mon", "time": "18:00" }, …] в поясе курса (courses.timezone). NULL — расписания нет.
-- По нему ученикам приходит class_prep «Скоро занятие — повтори N слов курса» за 1–2 часа до начала.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS schedule JSONB;
