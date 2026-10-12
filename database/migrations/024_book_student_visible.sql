-- Migration 024: доступ учеников к книге каталога — переключатель на каждую книгу.
-- Применяется автоматически в api/_db-init.js; файл — для истории и ручного применения.
-- Учителя и админы видят все опубликованные книги; ученик — только с student_visible = true
-- (и юниты, открытые ему учителем в курсе, — независимо от флага).
-- Переключать: npx tsx scripts/publish-book.ts "<title>" "<edition>" --students | --no-students

ALTER TABLE books ADD COLUMN IF NOT EXISTS student_visible BOOLEAN NOT NULL DEFAULT false;
