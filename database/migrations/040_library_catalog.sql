-- Migration 040: библиотека-каталог — предмет → (язык/раздел) → (уровень) → подборка → набор
-- (plan/new/library_catalog.md, Catalog 1).
-- Применяется автоматически в api/_db-init.js; файл — для истории и ручного применения.
--
-- Всё добавляющее: новые таблицы и nullable-колонки. Старые версии приложения их не замечают:
-- список библиотеки и импорт работают как раньше (Release 2).

-- L1. Предметы: плитки на экране «Библиотека». track_label / level_scale задают, какие ряды выбора рисовать.
CREATE TABLE IF NOT EXISTS library_subjects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  subtitle     TEXT,
  icon         TEXT,
  track_label  TEXT,
  level_scale  TEXT CHECK (level_scale IN ('cefr', 'stages')),
  set_kind     TEXT NOT NULL DEFAULT 'subject' CHECK (set_kind IN ('language', 'subject')),
  position     INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- L2 для неязыковых предметов: названия разделов («Математика» для math). Для языков названия
-- берутся из списка языков приложения, строк здесь нет.
CREATE TABLE IF NOT EXISTS library_tracks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES library_subjects(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  title      TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (subject_id, key)
);

-- L4. Подборки. Уровень у подборки, а не у набора: «Путешествия A2» и «Путешествия B1» — разные подборки.
CREATE TABLE IF NOT EXISTS library_collections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id  UUID NOT NULL REFERENCES library_subjects(id) ON DELETE CASCADE,
  track       TEXT,
  level       TEXT,
  title       VARCHAR(100) NOT NULL,
  description TEXT,
  icon        TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  status      VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Ключ повторного импорта: subject + track + level + title. COALESCE — чтобы NULL-уровни тоже не дублировались.
CREATE UNIQUE INDEX IF NOT EXISTS idx_library_collections_key
  ON library_collections (subject_id, COALESCE(track, ''), COALESCE(level, ''), title);
CREATE INDEX IF NOT EXISTS idx_library_collections_subject_status ON library_collections (subject_id, status);

-- L5. Набор в подборке и его номер. NULL — набор вне каталога (виден в поиске и старых версиях).
ALTER TABLE library_sets ADD COLUMN IF NOT EXISTS collection_id UUID REFERENCES library_collections(id) ON DELETE SET NULL;
ALTER TABLE library_sets ADD COLUMN IF NOT EXISTS position INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_library_sets_collection_position
  ON library_sets (collection_id, position) WHERE collection_id IS NOT NULL;

-- library_imports: курс (учитель кладёт набор себе и в несколько курсов) и копия (удалил копию —
-- строка удаляется каскадом, набор снова «не добавлен»). У старых строк card_set_id = NULL.
ALTER TABLE library_imports ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE library_imports ADD COLUMN IF NOT EXISTS card_set_id UUID REFERENCES card_sets(id) ON DELETE CASCADE;
-- Новая уникальность создаётся раньше, чем снимается старая: защита от двойного импорта не пропадает ни на миг.
CREATE UNIQUE INDEX IF NOT EXISTS idx_library_imports_user_set_course
  ON library_imports (user_id, library_set_id, COALESCE(course_id, '00000000-0000-0000-0000-000000000000'::uuid));
ALTER TABLE library_imports DROP CONSTRAINT IF EXISTS library_imports_user_id_library_set_id_key;

-- Юниты учебника, добавленные учеником себе без курса. Отметка на юнит, а не на официальный набор:
-- перезаливка книги её не сбивает. Удалил копию — строка удаляется каскадом.
CREATE TABLE IF NOT EXISTS book_unit_imports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  unit_id     UUID NOT NULL REFERENCES book_units(id) ON DELETE CASCADE,
  card_set_id UUID REFERENCES card_sets(id) ON DELETE CASCADE,
  imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, unit_id)
);

-- Начальные предметы и разделы (решения 04.11.2026). Повторный прогон ничего не меняет.
INSERT INTO library_subjects (slug, title, subtitle, icon, track_label, level_scale, set_kind, position) VALUES
  ('languages', 'Языки',     'Английский, немецкий, турецкий', 'globe',    'Язык',   'cefr',   'language', 1),
  ('history',   'История',   'Кыргызстан и мир',               'landmark', 'Раздел', 'stages', 'subject',  2),
  ('geography', 'География', 'Столицы, флаги, природа',        'map-pin',  NULL,     NULL,     'subject',  3),
  ('ort',       'ОРТ и НЦТ', 'Подготовка к тестам',            'clipboard-check', 'Раздел', NULL, 'subject', 4),
  ('science',   'Наука',     'Физика и химия',                 'flask-conical', NULL, NULL,   'subject',  5)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO library_tracks (subject_id, key, title, position)
SELECT s.id, t.key, t.title, t.position
FROM library_subjects s
JOIN (VALUES
  ('history', 'kg',        'Кыргызстан', 1),
  ('history', 'world',     'Всемирная',  2),
  ('ort',     'math',      'Математика', 1),
  ('ort',     'analogies', 'Аналогии',   2),
  ('ort',     'reading',   'Чтение',     3),
  ('ort',     'grammar',   'Грамматика', 4)
) AS t(subject, key, title, position) ON t.subject = s.slug
ON CONFLICT (subject_id, key) DO NOTHING;
