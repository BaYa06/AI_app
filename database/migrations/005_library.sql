-- Migration 005: Library system (public sets sharing)
-- Creates tables for library_sets, library_cards, library_imports, library_likes, library_ratings, library_reports

-- ============================================
-- 1. TABLES
-- ============================================

-- Public library sets
CREATE TABLE IF NOT EXISTS library_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  original_set_id UUID,
  title VARCHAR(100) NOT NULL,
  description TEXT,
  category VARCHAR(50),
  tags TEXT[],
  language_from VARCHAR(10),
  language_to VARCHAR(10),
  cards_count INTEGER DEFAULT 0,
  imports_count INTEGER DEFAULT 0,
  likes_count INTEGER DEFAULT 0,
  rating_sum INTEGER DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'published',
  is_featured BOOLEAN DEFAULT false,
  cover_emoji VARCHAR(10),
  published_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Library cards (copies of original cards)
CREATE TABLE IF NOT EXISTS library_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  library_set_id UUID NOT NULL REFERENCES library_sets(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  hint TEXT,
  order_index INTEGER DEFAULT 0
);

-- Import tracking
CREATE TABLE IF NOT EXISTS library_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  library_set_id UUID NOT NULL REFERENCES library_sets(id) ON DELETE CASCADE,
  imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, library_set_id)
);

-- Likes
CREATE TABLE IF NOT EXISTS library_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  library_set_id UUID NOT NULL REFERENCES library_sets(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, library_set_id)
);

-- Ratings (1-5 stars)
CREATE TABLE IF NOT EXISTS library_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  library_set_id UUID NOT NULL REFERENCES library_sets(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, library_set_id)
);

-- Reports
CREATE TABLE IF NOT EXISTS library_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  library_set_id UUID NOT NULL REFERENCES library_sets(id) ON DELETE CASCADE,
  reason VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 2. INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_library_sets_status ON library_sets(status);
CREATE INDEX IF NOT EXISTS idx_library_sets_category ON library_sets(category);
CREATE INDEX IF NOT EXISTS idx_library_sets_user_id ON library_sets(user_id);
CREATE INDEX IF NOT EXISTS idx_library_sets_is_featured ON library_sets(is_featured);
CREATE INDEX IF NOT EXISTS idx_library_sets_published_at ON library_sets(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_library_sets_imports ON library_sets(imports_count DESC);
CREATE INDEX IF NOT EXISTS idx_library_sets_rating ON library_sets(rating_count DESC, rating_sum DESC);
CREATE INDEX IF NOT EXISTS idx_library_sets_original ON library_sets(original_set_id, status);

CREATE INDEX IF NOT EXISTS idx_library_cards_set ON library_cards(library_set_id);

CREATE INDEX IF NOT EXISTS idx_library_imports_user ON library_imports(user_id);
CREATE INDEX IF NOT EXISTS idx_library_imports_set ON library_imports(library_set_id);

CREATE INDEX IF NOT EXISTS idx_library_likes_user ON library_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_library_likes_set ON library_likes(library_set_id);

CREATE INDEX IF NOT EXISTS idx_library_ratings_set ON library_ratings(library_set_id);

-- ============================================
-- 3. TRIGGER for updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_library_sets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_library_sets_updated_at ON library_sets;
CREATE TRIGGER trg_library_sets_updated_at
  BEFORE UPDATE ON library_sets
  FOR EACH ROW
  EXECUTE FUNCTION update_library_sets_updated_at();

-- ============================================
-- 4. SEED DATA
-- ============================================

-- Fake author UUIDs (will be used as user_id references)
-- In production these would be real user IDs from Supabase auth

DO $$
DECLARE
  author1 UUID := 'a0000000-0000-0000-0000-000000000001';
  author2 UUID := 'a0000000-0000-0000-0000-000000000002';
  author3 UUID := 'a0000000-0000-0000-0000-000000000003';
  author4 UUID := 'a0000000-0000-0000-0000-000000000004';
  author5 UUID := 'a0000000-0000-0000-0000-000000000005';
  set1 UUID; set2 UUID; set3 UUID; set4 UUID; set5 UUID;
  set6 UUID; set7 UUID; set8 UUID; set9 UUID; set10 UUID;
  set11 UUID; set12 UUID; set13 UUID; set14 UUID; set15 UUID;
BEGIN

-- Ensure fake authors exist in users table
INSERT INTO users (id, email, user_name) VALUES
  (author1, 'travel_master@demo.com', '@travel_master'),
  (author2, 'grammarnazi@demo.com', '@grammarnazi'),
  (author3, 'polyglot@demo.com', '@polyglot'),
  (author4, 'pro_lingua@demo.com', '@pro_lingua'),
  (author5, 'doc_mike@demo.com', '@doc_mike')
ON CONFLICT (id) DO NOTHING;

-- Set 1: Путешествие в Берлин
INSERT INTO library_sets (id, user_id, title, description, category, tags, language_from, language_to, cards_count, imports_count, likes_count, rating_sum, rating_count, is_featured, cover_emoji, status)
VALUES (gen_random_uuid(), author1, 'Путешествие в Берлин', 'Основные фразы и слова для путешествия по Берлину. Транспорт, кафе, достопримечательности.', 'travel', ARRAY['берлин','путешествие','туризм'], 'de', 'ru', 42, 1200, 248, 490, 100, true, '✈️', 'published')
RETURNING id INTO set1;

INSERT INTO library_cards (library_set_id, front, back, order_index) VALUES
  (set1, 'der Flughafen', 'аэропорт', 0),
  (set1, 'die U-Bahn', 'метро', 1),
  (set1, 'der Bahnhof', 'вокзал', 2),
  (set1, 'die Fahrkarte', 'билет', 3),
  (set1, 'der Stadtplan', 'карта города', 4),
  (set1, 'die Sehenswürdigkeit', 'достопримечательность', 5),
  (set1, 'das Hotel', 'отель', 6),
  (set1, 'die Rechnung', 'счёт', 7),
  (set1, 'der Kellner', 'официант', 8),
  (set1, 'Entschuldigung', 'извините', 9);

-- Set 2: Неправильные глаголы (English)
INSERT INTO library_sets (id, user_id, title, description, category, tags, language_from, language_to, cards_count, imports_count, likes_count, rating_sum, rating_count, is_featured, cover_emoji, status)
VALUES (gen_random_uuid(), author2, 'Неправильные глаголы', '120 самых употребительных неправильных глаголов английского языка с примерами.', 'grammar', ARRAY['глаголы','irregular','грамматика'], 'en', 'ru', 120, 3500, 812, 960, 200, true, '🧠', 'published')
RETURNING id INTO set2;

INSERT INTO library_cards (library_set_id, front, back, order_index) VALUES
  (set2, 'be — was/were — been', 'быть', 0),
  (set2, 'begin — began — begun', 'начинать', 1),
  (set2, 'break — broke — broken', 'ломать', 2),
  (set2, 'bring — brought — brought', 'приносить', 3),
  (set2, 'buy — bought — bought', 'покупать', 4),
  (set2, 'choose — chose — chosen', 'выбирать', 5),
  (set2, 'come — came — come', 'приходить', 6),
  (set2, 'do — did — done', 'делать', 7),
  (set2, 'drink — drank — drunk', 'пить', 8),
  (set2, 'eat — ate — eaten', 'есть', 9);

-- Set 3: Ресторанная лексика
INSERT INTO library_sets (id, user_id, title, description, category, tags, language_from, language_to, cards_count, imports_count, likes_count, rating_sum, rating_count, is_featured, cover_emoji, status)
VALUES (gen_random_uuid(), author3, 'Ресторанная лексика', 'Всё, что нужно для похода в ресторан: заказ, меню, комплименты шефу.', 'vocab', ARRAY['ресторан','еда','лексика'], 'en', 'ru', 35, 890, 156, 250, 50, false, '🍔', 'published')
RETURNING id INTO set3;

INSERT INTO library_cards (library_set_id, front, back, order_index) VALUES
  (set3, 'appetizer', 'закуска', 0),
  (set3, 'main course', 'основное блюдо', 1),
  (set3, 'dessert', 'десерт', 2),
  (set3, 'bill / check', 'счёт', 3),
  (set3, 'tip', 'чаевые', 4),
  (set3, 'waiter', 'официант', 5),
  (set3, 'menu', 'меню', 6),
  (set3, 'reservation', 'бронирование', 7),
  (set3, 'takeaway', 'на вынос', 8),
  (set3, 'sparkling water', 'газированная вода', 9);

-- Set 4: Деловой немецкий B2
INSERT INTO library_sets (id, user_id, title, description, category, tags, language_from, language_to, cards_count, imports_count, likes_count, rating_sum, rating_count, is_featured, cover_emoji, status)
VALUES (gen_random_uuid(), author4, 'Деловой немецкий B2', 'Лексика для деловых переговоров, презентаций и переписки на уровне B2.', 'business', ARRAY['бизнес','B2','деловой'], 'de', 'ru', 64, 540, 92, 245, 50, true, '💼', 'published')
RETURNING id INTO set4;

INSERT INTO library_cards (library_set_id, front, back, order_index) VALUES
  (set4, 'die Verhandlung', 'переговоры', 0),
  (set4, 'der Vertrag', 'договор', 1),
  (set4, 'die Besprechung', 'совещание', 2),
  (set4, 'der Umsatz', 'оборот', 3),
  (set4, 'die Frist', 'срок', 4),
  (set4, 'der Vorschlag', 'предложение', 5),
  (set4, 'die Zusammenarbeit', 'сотрудничество', 6),
  (set4, 'der Gewinn', 'прибыль', 7),
  (set4, 'die Lieferung', 'доставка', 8),
  (set4, 'der Kunde', 'клиент', 9);

-- Set 5: Медицинские термины
INSERT INTO library_sets (id, user_id, title, description, category, tags, language_from, language_to, cards_count, imports_count, likes_count, rating_sum, rating_count, is_featured, cover_emoji, status)
VALUES (gen_random_uuid(), author5, 'Медицинские термины', 'Базовая медицинская лексика: симптомы, органы, процедуры.', 'medicine', ARRAY['медицина','здоровье','термины'], 'en', 'ru', 48, 320, 78, 180, 40, false, '🏥', 'published')
RETURNING id INTO set5;

INSERT INTO library_cards (library_set_id, front, back, order_index) VALUES
  (set5, 'diagnosis', 'диагноз', 0),
  (set5, 'symptom', 'симптом', 1),
  (set5, 'prescription', 'рецепт', 2),
  (set5, 'surgery', 'операция', 3),
  (set5, 'blood pressure', 'кровяное давление', 4),
  (set5, 'allergy', 'аллергия', 5),
  (set5, 'infection', 'инфекция', 6),
  (set5, 'vaccine', 'вакцина', 7),
  (set5, 'pharmacy', 'аптека', 8),
  (set5, 'emergency', 'скорая помощь', 9);

-- Set 6: Кино и ТВ шоу
INSERT INTO library_sets (id, user_id, title, description, category, tags, language_from, language_to, cards_count, imports_count, likes_count, rating_sum, rating_count, is_featured, cover_emoji, status)
VALUES (gen_random_uuid(), author1, 'Кино и ТВ шоу', 'Лексика из популярных фильмов и сериалов. Разговорные фразы из кино.', 'phrases', ARRAY['кино','сериалы','разговорный'], 'en', 'ru', 55, 670, 189, 420, 90, false, '🍿', 'published')
RETURNING id INTO set6;

INSERT INTO library_cards (library_set_id, front, back, order_index) VALUES
  (set6, 'plot twist', 'неожиданный поворот сюжета', 0),
  (set6, 'spoiler alert', 'осторожно, спойлер', 1),
  (set6, 'binge-watch', 'смотреть запоем', 2),
  (set6, 'cliffhanger', 'интригующий финал серии', 3),
  (set6, 'blockbuster', 'кассовый хит', 4),
  (set6, 'subtitle', 'субтитры', 5),
  (set6, 'sequel', 'продолжение', 6),
  (set6, 'cast', 'актёрский состав', 7),
  (set6, 'director', 'режиссёр', 8),
  (set6, 'soundtrack', 'саундтрек', 9);

-- Set 7: Мода и шоппинг
INSERT INTO library_sets (id, user_id, title, description, category, tags, language_from, language_to, cards_count, imports_count, likes_count, rating_sum, rating_count, is_featured, cover_emoji, status)
VALUES (gen_random_uuid(), author3, 'Мода и шоппинг', 'Всё для удачного шоппинга за границей: размеры, материалы, торговля.', 'vocab', ARRAY['мода','шоппинг','одежда'], 'en', 'ru', 30, 410, 95, 190, 40, false, '👗', 'published')
RETURNING id INTO set7;

INSERT INTO library_cards (library_set_id, front, back, order_index) VALUES
  (set7, 'fitting room', 'примерочная', 0),
  (set7, 'discount', 'скидка', 1),
  (set7, 'receipt', 'чек', 2),
  (set7, 'size chart', 'таблица размеров', 3),
  (set7, 'brand', 'бренд', 4),
  (set7, 'fabric', 'ткань', 5),
  (set7, 'refund', 'возврат', 6),
  (set7, 'bargain', 'выгодная покупка', 7),
  (set7, 'wardrobe', 'гардероб', 8),
  (set7, 'trend', 'тренд', 9);

-- Set 8: Французский для начинающих
INSERT INTO library_sets (id, user_id, title, description, category, tags, language_from, language_to, cards_count, imports_count, likes_count, rating_sum, rating_count, is_featured, cover_emoji, status)
VALUES (gen_random_uuid(), author4, 'Французский для начинающих', 'Первые 100 слов на французском. Идеально для уровня A1.', 'vocab', ARRAY['A1','начинающие','базовый'], 'fr', 'ru', 100, 780, 203, 450, 95, true, '🇫🇷', 'published')
RETURNING id INTO set8;

INSERT INTO library_cards (library_set_id, front, back, order_index) VALUES
  (set8, 'bonjour', 'здравствуйте', 0),
  (set8, 'merci', 'спасибо', 1),
  (set8, 's''il vous plaît', 'пожалуйста', 2),
  (set8, 'au revoir', 'до свидания', 3),
  (set8, 'oui / non', 'да / нет', 4),
  (set8, 'comment', 'как', 5),
  (set8, 'pourquoi', 'почему', 6),
  (set8, 'je m''appelle...', 'меня зовут...', 7),
  (set8, 'l''eau', 'вода', 8),
  (set8, 'le pain', 'хлеб', 9);

-- Set 9: IT термины
INSERT INTO library_sets (id, user_id, title, description, category, tags, language_from, language_to, cards_count, imports_count, likes_count, rating_sum, rating_count, is_featured, cover_emoji, status)
VALUES (gen_random_uuid(), author2, 'IT термины', 'Основные термины из мира программирования и IT на английском.', 'programming', ARRAY['IT','программирование','tech'], 'en', 'ru', 75, 950, 312, 470, 100, false, '💻', 'published')
RETURNING id INTO set9;

INSERT INTO library_cards (library_set_id, front, back, order_index) VALUES
  (set9, 'deploy', 'развернуть / деплой', 0),
  (set9, 'repository', 'репозиторий', 1),
  (set9, 'branch', 'ветка', 2),
  (set9, 'commit', 'коммит / фиксация', 3),
  (set9, 'debugging', 'отладка', 4),
  (set9, 'framework', 'фреймворк', 5),
  (set9, 'API', 'программный интерфейс', 6),
  (set9, 'middleware', 'промежуточное ПО', 7),
  (set9, 'authentication', 'аутентификация', 8),
  (set9, 'scalability', 'масштабируемость', 9);

-- Set 10: Испанский: отпуск
INSERT INTO library_sets (id, user_id, title, description, category, tags, language_from, language_to, cards_count, imports_count, likes_count, rating_sum, rating_count, is_featured, cover_emoji, status)
VALUES (gen_random_uuid(), author1, 'Испанский: отпуск', 'Фразы и слова для отпуска в Испании и Латинской Америке.', 'travel', ARRAY['испанский','отпуск','пляж'], 'es', 'ru', 40, 290, 67, 130, 30, false, '🏖️', 'published')
RETURNING id INTO set10;

INSERT INTO library_cards (library_set_id, front, back, order_index) VALUES
  (set10, 'la playa', 'пляж', 0),
  (set10, 'el hotel', 'отель', 1),
  (set10, 'el billete', 'билет', 2),
  (set10, '¿Cuánto cuesta?', 'Сколько стоит?', 3),
  (set10, 'la habitación', 'комната / номер', 4),
  (set10, 'el restaurante', 'ресторан', 5),
  (set10, 'el aeropuerto', 'аэропорт', 6),
  (set10, 'la maleta', 'чемодан', 7),
  (set10, 'el pasaporte', 'паспорт', 8),
  (set10, 'tomar el sol', 'загорать', 9);

-- Set 11: Фразовые глаголы
INSERT INTO library_sets (id, user_id, title, description, category, tags, language_from, language_to, cards_count, imports_count, likes_count, rating_sum, rating_count, is_featured, cover_emoji, status)
VALUES (gen_random_uuid(), author2, 'Фразовые глаголы', '80 самых частых фразовых глаголов с примерами использования.', 'grammar', ARRAY['phrasal verbs','глаголы','продвинутый'], 'en', 'ru', 80, 1100, 345, 520, 110, true, '🔤', 'published')
RETURNING id INTO set11;

INSERT INTO library_cards (library_set_id, front, back, order_index) VALUES
  (set11, 'give up', 'сдаваться / бросить', 0),
  (set11, 'look after', 'заботиться', 1),
  (set11, 'turn out', 'оказаться', 2),
  (set11, 'come across', 'натолкнуться', 3),
  (set11, 'put off', 'откладывать', 4),
  (set11, 'break down', 'сломаться', 5),
  (set11, 'carry on', 'продолжать', 6),
  (set11, 'figure out', 'разобраться', 7),
  (set11, 'run out of', 'закончиться (запас)', 8),
  (set11, 'set up', 'настроить / основать', 9);

-- Set 12: Немецкий: предлоги
INSERT INTO library_sets (id, user_id, title, description, category, tags, language_from, language_to, cards_count, imports_count, likes_count, rating_sum, rating_count, is_featured, cover_emoji, status)
VALUES (gen_random_uuid(), author4, 'Немецкий: предлоги', 'Предлоги с Dativ, Akkusativ и Wechselpräpositionen. С примерами.', 'grammar', ARRAY['предлоги','падежи','грамматика'], 'de', 'ru', 28, 430, 87, 210, 45, false, '📐', 'published')
RETURNING id INTO set12;

INSERT INTO library_cards (library_set_id, front, back, order_index) VALUES
  (set12, 'mit (+ Dat)', 'с / вместе с', 0),
  (set12, 'für (+ Akk)', 'для / за', 1),
  (set12, 'in (+ Dat/Akk)', 'в', 2),
  (set12, 'auf (+ Dat/Akk)', 'на', 3),
  (set12, 'an (+ Dat/Akk)', 'у / на (вертикальная)', 4),
  (set12, 'nach (+ Dat)', 'после / в (страну)', 5),
  (set12, 'von (+ Dat)', 'от / из', 6),
  (set12, 'zu (+ Dat)', 'к / до', 7),
  (set12, 'über (+ Dat/Akk)', 'над / через / о', 8),
  (set12, 'zwischen (+ Dat/Akk)', 'между', 9);

-- Set 13: IELTS Academic Vocabulary
INSERT INTO library_sets (id, user_id, title, description, category, tags, language_from, language_to, cards_count, imports_count, likes_count, rating_sum, rating_count, is_featured, cover_emoji, status)
VALUES (gen_random_uuid(), author3, 'IELTS Academic Vocabulary', 'Академическая лексика для подготовки к IELTS. Band 7+.', 'study', ARRAY['IELTS','экзамен','академический'], 'en', 'ru', 90, 1500, 420, 680, 145, false, '📚', 'published')
RETURNING id INTO set13;

INSERT INTO library_cards (library_set_id, front, back, order_index) VALUES
  (set13, 'approximately', 'приблизительно', 0),
  (set13, 'consequently', 'следовательно', 1),
  (set13, 'furthermore', 'более того', 2),
  (set13, 'nevertheless', 'тем не менее', 3),
  (set13, 'significant', 'значительный', 4),
  (set13, 'contribute', 'способствовать', 5),
  (set13, 'analysis', 'анализ', 6),
  (set13, 'hypothesis', 'гипотеза', 7),
  (set13, 'sufficient', 'достаточный', 8),
  (set13, 'relevant', 'релевантный / уместный', 9);

-- Set 14: Немецкий: еда и напитки
INSERT INTO library_sets (id, user_id, title, description, category, tags, language_from, language_to, cards_count, imports_count, likes_count, rating_sum, rating_count, is_featured, cover_emoji, status)
VALUES (gen_random_uuid(), author5, 'Немецкий: еда и напитки', 'Названия блюд, продуктов и напитков на немецком языке.', 'vocab', ARRAY['еда','напитки','продукты'], 'de', 'ru', 45, 350, 73, 160, 35, false, '🥨', 'published')
RETURNING id INTO set14;

INSERT INTO library_cards (library_set_id, front, back, order_index) VALUES
  (set14, 'das Brot', 'хлеб', 0),
  (set14, 'die Milch', 'молоко', 1),
  (set14, 'das Ei', 'яйцо', 2),
  (set14, 'der Käse', 'сыр', 3),
  (set14, 'die Wurst', 'колбаса', 4),
  (set14, 'das Bier', 'пиво', 5),
  (set14, 'der Kuchen', 'пирог / торт', 6),
  (set14, 'die Kartoffel', 'картофель', 7),
  (set14, 'der Apfel', 'яблоко', 8),
  (set14, 'das Wasser', 'вода', 9);

-- Set 15: Английские идиомы
INSERT INTO library_sets (id, user_id, title, description, category, tags, language_from, language_to, cards_count, imports_count, likes_count, rating_sum, rating_count, is_featured, cover_emoji, status)
VALUES (gen_random_uuid(), author1, 'Английские идиомы', 'Популярные идиомы для живого разговорного английского.', 'phrases', ARRAY['идиомы','разговорный','сленг'], 'en', 'ru', 60, 820, 198, 390, 80, false, '💬', 'published')
RETURNING id INTO set15;

INSERT INTO library_cards (library_set_id, front, back, order_index) VALUES
  (set15, 'break the ice', 'разрядить обстановку', 0),
  (set15, 'piece of cake', 'пустяковое дело', 1),
  (set15, 'hit the nail on the head', 'попасть в точку', 2),
  (set15, 'once in a blue moon', 'очень редко', 3),
  (set15, 'under the weather', 'нездоровится', 4),
  (set15, 'cost an arm and a leg', 'стоить целое состояние', 5),
  (set15, 'let the cat out of the bag', 'проболтаться', 6),
  (set15, 'beat around the bush', 'ходить вокруг да около', 7),
  (set15, 'a blessing in disguise', 'всё что ни делается — к лучшему', 8),
  (set15, 'the ball is in your court', 'ход за тобой', 9);

END $$;
