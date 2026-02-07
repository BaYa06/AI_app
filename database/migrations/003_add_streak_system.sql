-- Миграция: Система стриков (Streak System)
-- Дата: 2026-02-05
-- Описание: Добавляет таблицы для отслеживания ежедневной активности и стриков

-- ==============================================
-- Таблица daily_activity (1 строка = 1 день активности)
-- ==============================================

CREATE TABLE IF NOT EXISTS daily_activity (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date DATE NOT NULL,  -- дата в локальном времени пользователя (YYYY-MM-DD)
  words_learned INT NOT NULL DEFAULT 0,
  minutes_learned INT NOT NULL DEFAULT 0,
  cards_studied INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Уникальная пара: один пользователь - одна запись на дату
  CONSTRAINT daily_activity_pkey PRIMARY KEY (user_id, local_date)
);

-- Индекс для быстрого поиска активности пользователя по дате (убывание)
CREATE INDEX IF NOT EXISTS idx_daily_activity_user_date 
ON daily_activity(user_id, local_date DESC);

-- Комментарии
COMMENT ON TABLE daily_activity IS 'Ежедневная активность пользователей - 1 строка на день';
COMMENT ON COLUMN daily_activity.local_date IS 'Дата в локальном времени пользователя (timezone-aware)';
COMMENT ON COLUMN daily_activity.words_learned IS 'Количество выученных слов за день';
COMMENT ON COLUMN daily_activity.minutes_learned IS 'Минут обучения за день';
COMMENT ON COLUMN daily_activity.cards_studied IS 'Карточек изучено за день';

-- ==============================================
-- Таблица user_stats (кеш статистики для быстрого UI)
-- ==============================================

CREATE TABLE IF NOT EXISTS user_stats (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_streak INT NOT NULL DEFAULT 0,
  longest_streak INT NOT NULL DEFAULT 0,
  last_active_date DATE NULL,  -- последняя дата активности
  timezone TEXT NOT NULL DEFAULT 'Asia/Bishkek',
  total_words_learned INT NOT NULL DEFAULT 0,
  total_minutes_learned INT NOT NULL DEFAULT 0,
  total_cards_studied INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Комментарии
COMMENT ON TABLE user_stats IS 'Кеш статистики пользователя для быстрого отображения в UI';
COMMENT ON COLUMN user_stats.current_streak IS 'Текущая серия последовательных дней';
COMMENT ON COLUMN user_stats.longest_streak IS 'Максимальная серия за всё время';
COMMENT ON COLUMN user_stats.last_active_date IS 'Последняя дата активности (для расчёта стрика)';
COMMENT ON COLUMN user_stats.timezone IS 'Часовой пояс пользователя для расчёта локальной даты';

-- ==============================================
-- Триггер для автоматического обновления updated_at
-- ==============================================

-- Функция для обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для daily_activity
DROP TRIGGER IF EXISTS trigger_daily_activity_updated_at ON daily_activity;
CREATE TRIGGER trigger_daily_activity_updated_at
  BEFORE UPDATE ON daily_activity
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Триггер для user_stats
DROP TRIGGER IF EXISTS trigger_user_stats_updated_at ON user_stats;
CREATE TRIGGER trigger_user_stats_updated_at
  BEFORE UPDATE ON user_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- RLS (Row Level Security) политики
-- ==============================================

-- Включаем RLS для daily_activity
ALTER TABLE daily_activity ENABLE ROW LEVEL SECURITY;

-- Политика: пользователь видит только свои записи
DROP POLICY IF EXISTS daily_activity_select_own ON daily_activity;
CREATE POLICY daily_activity_select_own ON daily_activity
  FOR SELECT USING (user_id = auth.uid());

-- Политика: пользователь может добавлять только свои записи
DROP POLICY IF EXISTS daily_activity_insert_own ON daily_activity;
CREATE POLICY daily_activity_insert_own ON daily_activity
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Политика: пользователь может обновлять только свои записи
DROP POLICY IF EXISTS daily_activity_update_own ON daily_activity;
CREATE POLICY daily_activity_update_own ON daily_activity
  FOR UPDATE USING (user_id = auth.uid());

-- Включаем RLS для user_stats
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;

-- Политика: пользователь видит только свою статистику
DROP POLICY IF EXISTS user_stats_select_own ON user_stats;
CREATE POLICY user_stats_select_own ON user_stats
  FOR SELECT USING (user_id = auth.uid());

-- Политика: пользователь может добавлять только свою статистику
DROP POLICY IF EXISTS user_stats_insert_own ON user_stats;
CREATE POLICY user_stats_insert_own ON user_stats
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Политика: пользователь может обновлять только свою статистику
DROP POLICY IF EXISTS user_stats_update_own ON user_stats;
CREATE POLICY user_stats_update_own ON user_stats
  FOR UPDATE USING (user_id = auth.uid());

-- ==============================================
-- Создание тестовых данных (для демонстрации)
-- ==============================================

-- Добавляем user_stats для тестового пользователя
INSERT INTO user_stats (user_id, current_streak, longest_streak, last_active_date, timezone)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  5,
  12,
  CURRENT_DATE - INTERVAL '1 day',
  'Asia/Bishkek'
)
ON CONFLICT (user_id) DO NOTHING;

-- Добавляем тестовую активность за последние 5 дней
INSERT INTO daily_activity (user_id, local_date, words_learned, minutes_learned, cards_studied)
VALUES 
  ('00000000-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '4 days', 15, 20, 30),
  ('00000000-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '3 days', 22, 25, 44),
  ('00000000-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '2 days', 18, 15, 36),
  ('00000000-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '1 day', 25, 30, 50),
  ('00000000-0000-0000-0000-000000000001', CURRENT_DATE, 10, 12, 20)
ON CONFLICT (user_id, local_date) DO NOTHING;
