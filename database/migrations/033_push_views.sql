-- Migration 033: дашборд пушей (plan/new/push_notifications.md, шаг 5.1).
-- push_channel_events — отток канала: человек выключил категорию или всё, отозвал разрешение в iOS,
-- удалил приложение (FCM вернул «токен не зарегистрирован»).
CREATE TABLE IF NOT EXISTS push_channel_events (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL,
  event      TEXT NOT NULL,   -- category_disabled | disabled_all | permission_revoked | token_unregistered
  detail     TEXT,            -- категория для category_disabled
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS push_channel_events_created ON push_channel_events (created_at);

-- Воронка по дню, типу и варианту: кандидаты → отправлено → доставлено → открыто → урок начат → урок завершён
CREATE OR REPLACE VIEW push_funnel_daily AS
SELECT local_date, type, variant,
       COUNT(*) FILTER (WHERE status NOT IN ('dry_run', 'requeued')) AS eligible,
       COUNT(*) FILTER (WHERE status = 'sent') AS sent,
       COUNT(*) FILTER (WHERE delivered > 0) AS delivered,
       COUNT(opened_at) AS opened,
       COUNT(lesson_started_at) AS lesson_started,
       COUNT(lesson_completed_at) AS lesson_completed,
       ROUND(100.0 * COUNT(opened_at) / NULLIF(COUNT(*) FILTER (WHERE status = 'sent'), 0), 1) AS open_pct,
       ROUND(100.0 * COUNT(lesson_completed_at) / NULLIF(COUNT(opened_at), 0), 1) AS opened_to_lesson_pct
FROM push_log
GROUP BY local_date, type, variant;

-- Отток канала по неделям на 1000 получателей пушей этой недели
CREATE OR REPLACE VIEW push_churn_weekly AS
WITH recipients AS (
  SELECT date_trunc('week', created_at)::date AS week, COUNT(DISTINCT user_id) AS n
  FROM push_log WHERE status = 'sent' GROUP BY 1
),
ev AS (
  SELECT date_trunc('week', created_at)::date AS week, event, detail, COUNT(DISTINCT user_id) AS n
  FROM push_channel_events GROUP BY 1, 2, 3
)
SELECT ev.week, ev.event, ev.detail, ev.n AS users, r.n AS recipients,
       ROUND(1000.0 * ev.n / NULLIF(r.n, 0), 1) AS per_1000
FROM ev LEFT JOIN recipients r ON r.week = ev.week;

-- Удержание: группа с пушами против контрольной (10 %, та же формула, что isHoldout) по неделе регистрации.
-- D1 — занимался на следующий день; D7 — в дни 7–13; D30 — в дни 30–36. Процент — среди тех, у кого окно уже прошло.
CREATE OR REPLACE VIEW push_holdout_retention AS
WITH u AS (
  SELECT u.id, date_trunc('week', u.created_at)::date AS cohort_week, u.created_at::date AS reg_day,
         CASE WHEN (('x' || right(replace(u.id::text, '-', ''), 7))::bit(28)::int % 100) < 10
              THEN 'holdout' ELSE 'push' END AS push_group
  FROM users u
  WHERE NOT COALESCE(u.teacher, false) AND NOT COALESCE(u.is_anonymous, false)
),
r AS (
  SELECT u.*,
         EXISTS (SELECT 1 FROM answers a WHERE a.user_id = u.id AND a.answered_at::date = u.reg_day + 1) AS d1,
         EXISTS (SELECT 1 FROM answers a WHERE a.user_id = u.id AND a.answered_at::date BETWEEN u.reg_day + 7 AND u.reg_day + 13) AS d7,
         EXISTS (SELECT 1 FROM answers a WHERE a.user_id = u.id AND a.answered_at::date BETWEEN u.reg_day + 30 AND u.reg_day + 36) AS d30
  FROM u
)
SELECT cohort_week, push_group, COUNT(*) AS users,
       ROUND(100.0 * COUNT(*) FILTER (WHERE d1) / NULLIF(COUNT(*) FILTER (WHERE reg_day <= CURRENT_DATE - 2), 0), 1) AS d1_pct,
       ROUND(100.0 * COUNT(*) FILTER (WHERE d7) / NULLIF(COUNT(*) FILTER (WHERE reg_day <= CURRENT_DATE - 14), 0), 1) AS d7_pct,
       ROUND(100.0 * COUNT(*) FILTER (WHERE d30) / NULLIF(COUNT(*) FILTER (WHERE reg_day <= CURRENT_DATE - 37), 0), 1) AS d30_pct
FROM r
GROUP BY cohort_week, push_group;
