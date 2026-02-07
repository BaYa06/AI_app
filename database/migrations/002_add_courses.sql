-- Миграция: Добавление таблицы courses и связи с наборами
-- Дата: 2026-02-04
-- Описание: Создание курсов как контейнеров для организации наборов карточек

-- ==============================================
-- Создание таблицы courses
-- ==============================================

CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Индекс для поиска курсов пользователя
CREATE INDEX IF NOT EXISTS idx_courses_user_id ON courses(user_id);

-- Комментарии для документации
COMMENT ON TABLE courses IS 'Курсы - контейнеры для организации наборов карточек (например, German A1, English B2)';
COMMENT ON COLUMN courses.user_id IS 'ID пользователя-владельца курса';
COMMENT ON COLUMN courses.title IS 'Название курса';

-- ==============================================
-- Добавление course_id в card_sets
-- ==============================================

-- Добавляем колонку course_id (nullable, т.к. старые наборы могут быть без курса)
ALTER TABLE card_sets 
ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE SET NULL;

-- Индекс для фильтрации наборов по курсу
CREATE INDEX IF NOT EXISTS idx_card_sets_course_id ON card_sets(course_id);

-- Комментарии
COMMENT ON COLUMN card_sets.course_id IS 'ID курса, к которому принадлежит набор (NULL = глобальный/без курса)';

-- ==============================================
-- Пример: Создание тестового курса
-- ==============================================

-- Создаем тестовый курс для демонстрации
INSERT INTO courses (id, user_id, title)
VALUES 
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'German A1')
ON CONFLICT (id) DO NOTHING;

-- Привязываем существующие наборы к курсу (опционально)
-- UPDATE card_sets 
-- SET course_id = '20000000-0000-0000-0000-000000000001'
-- WHERE language_from = 'de';
