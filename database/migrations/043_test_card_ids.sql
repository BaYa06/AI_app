-- Migration 043: живой тест по списку слов и разминка (plan/new/teacher_cabinet.md, Teacher 34).
-- Применяется автоматически в api/_db-init.js; файл — для истории и ручного применения.
--
-- card_ids NULL — обычный тест по набору (как раньше). Заполнен — вопросы берутся из списка;
-- set_id при этом — набор, в котором больше всего слов (старый клиент видит обычный набор).
-- purpose: 'warmup' — разминка перед уроком (в истории с пометкой, в оценки не идёт), NULL — тест.
ALTER TABLE test_sessions ADD COLUMN IF NOT EXISTS card_ids UUID[];
ALTER TABLE test_sessions ADD COLUMN IF NOT EXISTS purpose VARCHAR(10);
