-- Когда экзамен или быстрый тест открыли (выдали код). Только добавляющее изменение: nullable-колонка.
-- По ней сервер закрывает лобби, в которое 10 минут никто не зашёл (api/_handlers/test/lobby.js).
-- У старых строк значения нет — берётся created_at.
ALTER TABLE test_sessions ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
