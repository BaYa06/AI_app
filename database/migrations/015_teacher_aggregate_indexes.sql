-- Миграция 015: индексы для учительских агрегатов — вынесены из горячего пути кода
--
-- Раньше `idx_reviews_user_id`/`idx_reviews_user_card` пересоздавались (CREATE INDEX
-- IF NOT EXISTS) при КАЖДОМ вызове NeonService.saveReview на клиенте — то есть при каждом
-- ответе на карточку в любой учебной сессии, хотя оба индекса уже создаются один раз при
-- первой инициализации БД (api/_db-init.js, initDatabase). Эти строки в saveReview были
-- чистым мёртвым грузом — удалены.
--
-- `idx_reviews_user_reviewed`/`idx_card_sets_course_id` пересоздавались лениво при первом
-- обращении к api/teacher.js в рамках процесса serverless-функции (флаг indexesEnsured в
-- памяти) — что всё ещё означает пересоздание при каждом холодном старте. Оба индекса уже
-- существуют на проде (созданы этим же ленивым механизмом ранее) — эта миграция их
-- документирует и убирает необходимость держать `ensureIndexes()` в api/teacher.js вообще.
--
-- См. план, пункт 28.

CREATE INDEX IF NOT EXISTS idx_reviews_user_reviewed ON reviews(user_id, reviewed_at);
CREATE INDEX IF NOT EXISTS idx_card_sets_course_id ON card_sets(course_id);
