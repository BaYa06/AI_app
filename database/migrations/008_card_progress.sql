-- Миграция: Персональный прогресс по карточкам
-- Дата: 2026-03-22
--
-- Проблема: SRS-данные (status, learning_step, next_review, last_reviewed)
-- хранились в таблице cards и были общими для всех пользователей.
-- Когда ученик А учил карточку — она становилась "выученной" у всех.
--
-- Решение: отдельная таблица card_progress с персональным прогрессом.

CREATE TABLE IF NOT EXISTS card_progress (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id       UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  status        VARCHAR(20) NOT NULL DEFAULT 'new',
  learning_step INT NOT NULL DEFAULT 0,
  next_review   TIMESTAMP NOT NULL DEFAULT NOW(),
  last_reviewed TIMESTAMP,
  interval      INTEGER NOT NULL DEFAULT 0,
  ease_factor   DECIMAL(3,2) NOT NULL DEFAULT 2.5,
  repetitions   INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_card_progress_user
  ON card_progress(user_id);

CREATE INDEX IF NOT EXISTS idx_card_progress_user_next_review
  ON card_progress(user_id, next_review);
