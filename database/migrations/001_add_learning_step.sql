-- Миграция: Добавление поля learning_step для новой SRS системы
-- Дата: 2026-01-15

-- Добавляем колонку learning_step
ALTER TABLE cards 
ADD COLUMN IF NOT EXISTS learning_step INTEGER DEFAULT 0;

-- Обновляем старые статусы на новые
-- review → young
-- mastered → mature (если interval >= 21) или young
UPDATE cards 
SET status = CASE
  WHEN status = 'review' THEN 'young'
  WHEN status = 'mastered' AND interval >= 21 THEN 'mature'
  WHEN status = 'mastered' AND interval < 21 THEN 'young'
  ELSE status
END
WHERE status IN ('review', 'mastered');

-- Создаем индекс для learning_step
CREATE INDEX IF NOT EXISTS idx_cards_learning_step ON cards(learning_step);

-- Комментарии для документации
COMMENT ON COLUMN cards.learning_step IS 'Текущий шаг обучения (0, 1, 2...) для learning/relearning статусов';
