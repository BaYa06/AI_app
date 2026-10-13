-- Migration 025: контроль выхода из приложения во время живого теста (plan/exam_lockdown.md).
-- Применяется автоматически в api/_db-init.js; файл — для истории и ручного применения.
-- exit_control        — учитель включил контроль выхода при создании теста (старые клиенты не шлют → false);
-- away_at             — когда ученик ушёл в фон (сбрасывается при возврате);
-- away_count          — сколько раз выходил и вернулся в пределах льготы;
-- left_reason         — почему попытка завершена досрочно: manual | background | relaunch | NULL;
-- client_exit_control — клиент ученика умеет контроль выхода (старые версии — false);
-- rejoin_allowed      — учитель разрешил продолжить: следующий join не считается перезапуском.

ALTER TABLE test_sessions ADD COLUMN IF NOT EXISTS exit_control BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE test_participants ADD COLUMN IF NOT EXISTS away_at TIMESTAMPTZ;
ALTER TABLE test_participants ADD COLUMN IF NOT EXISTS away_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE test_participants ADD COLUMN IF NOT EXISTS left_reason VARCHAR(20);
ALTER TABLE test_participants ADD COLUMN IF NOT EXISTS client_exit_control BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE test_participants ADD COLUMN IF NOT EXISTS rejoin_allowed BOOLEAN NOT NULL DEFAULT false;
