-- Migration 047: какой день засчитан в серию и какой спасён заморозкой
-- (plan/new/streak_freeze_display.md, Freeze 1).
-- Применяется автоматически в api/_db-init.js; файл — для истории и ручного применения.
--
-- Только новые колонки с DEFAULT (Release 2): старые клиенты их не читают.
ALTER TABLE daily_activity ADD COLUMN IF NOT EXISTS streak_counted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE daily_activity ADD COLUMN IF NOT EXISTS frozen BOOLEAN NOT NULL DEFAULT false;

-- Заполнение прошлого — один раз (в api/_db-init.js под отдельной отметкой в app_migrations).
-- Точное правило уже не восстановить (сколько слов «ждало» в тот день), поэтому приблизительно:
-- дни текущей серии с активностью; остальное прошлое — по старому правилу cards_studied >= 10.
-- Замороженные дни в прошлом неизвестны — не заполняем.
UPDATE daily_activity da SET streak_counted = true
FROM user_stats us
WHERE us.user_id = da.user_id
  AND da.streak_counted = false
  AND us.last_active_date IS NOT NULL
  AND da.local_date <= us.last_active_date
  AND (
    da.cards_studied >= 10
    OR (us.current_streak > 0 AND da.cards_studied > 0
        AND da.local_date > us.last_active_date - us.current_streak)
  );
