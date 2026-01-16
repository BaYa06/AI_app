-- ==============================================
-- Создание таблиц для DeutschCards
-- ==============================================

-- Таблица пользователей
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE,
  display_name VARCHAR(255),
  is_anonymous BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  settings JSONB DEFAULT '{
    "dailyGoal": 20,
    "notifications": false,
    "theme": "light"
  }'::jsonb
);

-- Таблица наборов карточек
CREATE TABLE IF NOT EXISTS card_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  language_from VARCHAR(10) DEFAULT 'de',
  language_to VARCHAR(10) DEFAULT 'ru',
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  total_cards INTEGER DEFAULT 0,
  mastered_cards INTEGER DEFAULT 0,
  studying_cards INTEGER DEFAULT 0
);

-- Таблица карточек
CREATE TABLE IF NOT EXISTS cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id UUID REFERENCES card_sets(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  example TEXT,
  image_url TEXT,
  audio_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Spaced Repetition System данные (новая система как Flashcards World)
  interval INTEGER DEFAULT 0,
  ease_factor DECIMAL(3,2) DEFAULT 2.5,
  repetitions INTEGER DEFAULT 0,
  learning_step INTEGER DEFAULT 0,
  next_review TIMESTAMP DEFAULT NOW(),
  last_reviewed TIMESTAMP,
  status VARCHAR(20) DEFAULT 'new' -- new, learning, relearning, young, mature
);

-- Таблица истории повторений
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID REFERENCES cards(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  quality INTEGER NOT NULL,
  reviewed_at TIMESTAMP DEFAULT NOW(),
  time_spent INTEGER
);

-- Создание индексов для оптимизации
CREATE INDEX IF NOT EXISTS idx_cards_set_id ON cards(set_id);
CREATE INDEX IF NOT EXISTS idx_cards_next_review ON cards(next_review);
CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);
CREATE INDEX IF NOT EXISTS idx_cards_learning_step ON cards(learning_step);
CREATE INDEX IF NOT EXISTS idx_card_sets_user_id ON card_sets(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_card_id ON reviews(card_id);

-- ==============================================
-- Тестовые данные
-- ==============================================

-- Создать тестового пользователя
INSERT INTO users (id, email, display_name, is_anonymous)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'test@example.com', 'Тестовый пользователь', false)
ON CONFLICT (id) DO NOTHING;

-- Создать наборы карточек
INSERT INTO card_sets (id, user_id, title, description, category, language_from, language_to, is_public, total_cards)
VALUES 
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Путешествия (A1)', 'Основные фразы для путешествий', 'Путешествия', 'de', 'ru', true, 10),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Еда и напитки (A1)', 'Слова по теме еда', 'Еда', 'de', 'ru', true, 10),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Приветствия (A1)', 'Базовые приветствия', 'Общие', 'de', 'ru', true, 8)
ON CONFLICT (id) DO NOTHING;

-- Набор 1: Путешествия
INSERT INTO cards (set_id, front, back, example, status)
VALUES 
  ('10000000-0000-0000-0000-000000000001', 'Guten Tag', 'Добрый день', 'Guten Tag! Wie geht es Ihnen?', 'new'),
  ('10000000-0000-0000-0000-000000000001', 'die Fahrkarte', 'билет', 'Ich brauche eine Fahrkarte nach Berlin.', 'new'),
  ('10000000-0000-0000-0000-000000000001', 'der Bahnhof', 'вокзал', 'Wo ist der Bahnhof?', 'new'),
  ('10000000-0000-0000-0000-000000000001', 'der Flughafen', 'аэропорт', 'Der Flughafen ist groß.', 'new'),
  ('10000000-0000-0000-0000-000000000001', 'das Hotel', 'отель', 'Ich suche ein Hotel.', 'new'),
  ('10000000-0000-0000-0000-000000000001', 'das Zimmer', 'номер (комната)', 'Ich möchte ein Zimmer reservieren.', 'new'),
  ('10000000-0000-0000-0000-000000000001', 'der Koffer', 'чемодан', 'Mein Koffer ist schwer.', 'new'),
  ('10000000-0000-0000-0000-000000000001', 'die Straße', 'улица', 'Welche Straße ist das?', 'new'),
  ('10000000-0000-0000-0000-000000000001', 'die Karte', 'карта', 'Haben Sie eine Karte?', 'new'),
  ('10000000-0000-0000-0000-000000000001', 'Entschuldigung', 'Извините', 'Entschuldigung, wo ist die Toilette?', 'new');

-- Набор 2: Еда и напитки
INSERT INTO cards (set_id, front, back, example, status)
VALUES 
  ('10000000-0000-0000-0000-000000000002', 'das Wasser', 'вода', 'Ich möchte ein Glas Wasser.', 'new'),
  ('10000000-0000-0000-0000-000000000002', 'der Kaffee', 'кофе', 'Einen Kaffee, bitte.', 'new'),
  ('10000000-0000-0000-0000-000000000002', 'das Brot', 'хлеб', 'Das Brot ist frisch.', 'new'),
  ('10000000-0000-0000-0000-000000000002', 'die Butter', 'масло', 'Ich nehme Butter zum Brot.', 'new'),
  ('10000000-0000-0000-0000-000000000002', 'der Käse', 'сыр', 'Der Käse schmeckt gut.', 'new'),
  ('10000000-0000-0000-0000-000000000002', 'das Fleisch', 'мясо', 'Ich esse kein Fleisch.', 'new'),
  ('10000000-0000-0000-0000-000000000002', 'der Apfel', 'яблоко', 'Der Apfel ist süß.', 'new'),
  ('10000000-0000-0000-0000-000000000002', 'die Milch', 'молоко', 'Milch mit Zucker, bitte.', 'new'),
  ('10000000-0000-0000-0000-000000000002', 'der Zucker', 'сахар', 'Ohne Zucker, bitte.', 'new'),
  ('10000000-0000-0000-0000-000000000002', 'das Restaurant', 'ресторан', 'Das Restaurant ist teuer.', 'new');

-- Набор 3: Приветствия
INSERT INTO cards (set_id, front, back, example, status)
VALUES 
  ('10000000-0000-0000-0000-000000000003', 'Hallo', 'Привет', 'Hallo! Wie heißt du?', 'new'),
  ('10000000-0000-0000-0000-000000000003', 'Tschüss', 'Пока', 'Tschüss! Bis bald!', 'new'),
  ('10000000-0000-0000-0000-000000000003', 'Danke', 'Спасибо', 'Danke schön!', 'new'),
  ('10000000-0000-0000-0000-000000000003', 'Bitte', 'Пожалуйста', 'Bitte sehr!', 'new'),
  ('10000000-0000-0000-0000-000000000003', 'Ja', 'Да', 'Ja, das stimmt.', 'new'),
  ('10000000-0000-0000-0000-000000000003', 'Nein', 'Нет', 'Nein, danke.', 'new'),
  ('10000000-0000-0000-0000-000000000003', 'Gute Nacht', 'Спокойной ночи', 'Gute Nacht! Schlaf gut!', 'new'),
  ('10000000-0000-0000-0000-000000000003', 'Guten Morgen', 'Доброе утро', 'Guten Morgen! Wie geht''s?', 'new');

-- Вывести статистику
SELECT 
  'Пользователей:' as info, COUNT(*) as count FROM users
UNION ALL
SELECT 
  'Наборов:', COUNT(*) FROM card_sets
UNION ALL
SELECT 
  'Карточек:', COUNT(*) FROM cards;
