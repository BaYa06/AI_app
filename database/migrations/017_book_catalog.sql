-- Миграция 017: каталог книг (Книга → Юнит → Набор) и планы юнитов для курсов
-- Дата: 2026-09-24
-- План: plan/book_catalog_plan.md, часть 1
--
-- Применять целиком через psql (одна транзакция, идемпотентно):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f database/migrations/017_book_catalog.sql
-- database/apply-migration.js для этого файла НЕ использовать: он режет файл по точке с запятой
-- и отбрасывает куски, начинающиеся с комментария, то есть молча пропустил бы часть команд.
--
-- Существующие данные не меняются: новые колонки nullable или с DEFAULT, старые наборы
-- остаются с unit_id = NULL и is_official = false.

BEGIN;

-- Книги. edition NOT NULL DEFAULT '' — иначе UNIQUE (title, edition) не ловил бы дубли
-- книг без издания (NULL не равен NULL).
CREATE TABLE IF NOT EXISTS books (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  edition       TEXT NOT NULL DEFAULT '',
  level         TEXT,
  subject       TEXT,
  language_from VARCHAR(10) NOT NULL,
  language_to   VARCHAR(10) NOT NULL,
  publisher     TEXT,
  is_published  BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT books_title_edition_key UNIQUE (title, edition)
);

CREATE INDEX IF NOT EXISTS idx_books_published ON books(is_published);

-- Юниты (главы) книги. number >= 0: в учебниках бывает вводный Unit 0 / Starter.
CREATE TABLE IF NOT EXISTS book_units (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id    UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  number     INT NOT NULL CHECK (number >= 0),
  title      TEXT NOT NULL,
  pages      TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  CONSTRAINT book_units_book_number_key UNIQUE (book_id, number)
);
-- Индекс по book_id покрывается UNIQUE (book_id, number).

-- Какой курс подключил какую книгу.
CREATE TABLE IF NOT EXISTS course_books (
  course_id  UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  book_id    UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (course_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_course_books_book_id ON course_books(book_id);

-- План юнитов конкретной группы. Дедлайнов нет — только открыт/закрыт.
CREATE TABLE IF NOT EXISTS course_units (
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  unit_id   UUID NOT NULL REFERENCES book_units(id) ON DELETE CASCADE,
  is_open   BOOLEAN NOT NULL DEFAULT false,
  opened_at TIMESTAMPTZ,
  PRIMARY KEY (course_id, unit_id)
);

CREATE INDEX IF NOT EXISTS idx_course_units_unit_id ON course_units(unit_id);

-- Официальные наборы: привязка к юниту. ON DELETE SET NULL — удаление книги не удаляет
-- наборы и прогресс учеников по ним, набор просто теряет привязку к юниту.
ALTER TABLE card_sets ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES book_units(id) ON DELETE SET NULL;
ALTER TABLE card_sets ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_card_sets_unit_id ON card_sets(unit_id) WHERE unit_id IS NOT NULL;

-- Порядок карточек из Excel. NULL у всех существующих карточек — старые наборы сортируются как раньше.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS sort_order INT;

-- Админ каталога: видит черновики книг. Отдельный флаг рядом с users.teacher.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Статистика по юнитам ищет прогресс по card_id, а PK card_progress начинается с user_id.
CREATE INDEX IF NOT EXISTS idx_card_progress_card_id ON card_progress(card_id);

COMMIT;
