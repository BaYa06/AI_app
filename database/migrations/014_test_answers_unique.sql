-- Миграция 014: UNIQUE(participant_id, card_id) на test_answers
--
-- Раньше action=answer в api/test.js ничего не мешало отправить ответ на один и тот же вопрос
-- сколько угодно раз: каждая отправка добавляла новую строку в test_answers и увеличивала
-- answer_count/correct_count у участника заново. Это позволяло:
--   1. Накручивать счёт — слать заведомо неверный ответ, видеть correctAnswer в ответе сервера
--      (он возвращался при каждой отправке), затем отправить уже верный и получить лишний
--      correct_count сверху.
--   2. При обрыве связи между parallel-запросами answer/get-question (см. TestExamScreen.tsx,
--      handleSubmit) повторное нажатие "Подтвердить" задваивало счётчики без злого умысла.
--
-- Ограничение ниже вместе с ON CONFLICT (participant_id, card_id) DO NOTHING в api/test.js
-- (action=answer) делает повторную отправку безопасным no-op: строка не дублируется, счётчики
-- не трогаются повторно, а клиенту возвращается уже сохранённый на первой попытке результат.
--
-- Применяется как обычный UNIQUE INDEX (не именованный CONSTRAINT), т.к. PostgreSQL не
-- поддерживает `ADD CONSTRAINT ... IF NOT EXISTS`, а `CREATE UNIQUE INDEX IF NOT EXISTS`
-- поддерживает и служит тем же арбитром для ON CONFLICT. Тот же индекс создаётся лениво и в
-- api/_db-init.js (idx_test_answers_unique_participant_card), чтобы не требовать ручного
-- применения на новых/локальных окружениях — этот файл документирует изменение и применяется
-- к уже существующей проде вручную, как и предыдущие миграции (см. MIGRATION_GUIDE.md).
--
-- На момент написания миграции дублей (participant_id, card_id) в test_answers не было
-- (проверено запросом к проду), поэтому создание индекса ниже безопасно без отдельного шага
-- дедупликации. Если у вас есть дубликаты — сначала удалите лишние строки вручную.

CREATE UNIQUE INDEX IF NOT EXISTS idx_test_answers_unique_participant_card
  ON test_answers(participant_id, card_id);
