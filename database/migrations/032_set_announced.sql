-- Migration 032: «в курсе новый набор» (plan/push_notifications.md, шаг 3.5).
-- announced_at — когда ученикам сообщили о наборе; NULL — ещё не сообщали.
-- Разово: всем существующим наборам ставится created_at, чтобы после выкладки не разослать старые.
ALTER TABLE card_sets ADD COLUMN IF NOT EXISTS announced_at TIMESTAMPTZ;
UPDATE card_sets SET announced_at = COALESCE(created_at, NOW()) WHERE announced_at IS NULL;
