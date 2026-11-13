-- Migration 044: «Напомнить» выбранным ученикам (plan/new/teacher_cabinet.md, Teacher 36).
-- Применяется автоматически в api/_db-init.js; файл — для истории и ручного применения.
--
-- Лимит «раз в 20 часов» на каждого ученика курса (как homework_reminders), а не на курс.
-- Напоминание всему классу (без studentIds) работает как раньше: courses.last_review_reminder_at.
CREATE TABLE IF NOT EXISTS review_reminders (
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (course_id, user_id)
);
