-- Книга учебного центра = личный курс ученика (plan/new/center_books.md, этап 7, Center 16).
-- Ученик по коду добавляет книгу — сервер создаёт его курс с source_book_id. Все юниты книги в таком
-- курсе открыты по правилу (official-sets), строки course_books / course_units не пишутся.
-- organization_id такому курсу не ставится: это не группа центра (места, кабинет «Учителя и группы»).
-- Одна книга — один курс у человека: повторное «Добавить» вернёт тот же курс.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS source_book_id UUID REFERENCES books(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_user_source_book
  ON courses(user_id, source_book_id) WHERE source_book_id IS NOT NULL;
