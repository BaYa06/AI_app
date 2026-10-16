-- Migration 029: профиль привычек для пушей (plan/new/push_notifications.md, шаг 2.6).
-- Только поведение в приложении: считается раз в сутки из журнала ответов answers (занятие —
-- ответы с перерывами не больше 30 минут). Пересчёт — api/push/_habits.js, вызывает cron-reminders.
CREATE TABLE IF NOT EXISTS user_habits (
  user_id           UUID PRIMARY KEY,
  usual_time        TIME,              -- привычное время начала занятий: мода часа за 14 дней + медиана минут, кратно 15
  usual_days        TEXT[] NOT NULL DEFAULT '{}', -- дни недели с занятиями за 4 недели (≥ 2 раз)
  day_type          TEXT,              -- weekday | weekend | both
  median_lesson_sec INT,               -- медиана длины занятия за 14 дней
  sec_per_answer    NUMERIC,           -- медиана секунд на ответ за 14 дней — для «~N мин» в тексте
  favorite_mode     TEXT,              -- самый частый режим (flashcard / test / builder…)
  accuracy_14d      NUMERIC,           -- доля верных ответов за 14 дней
  active_days_7     INT NOT NULL DEFAULT 0,
  segment           TEXT,              -- new | daily | regular | casual | sleeping | lost
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
