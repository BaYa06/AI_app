/**
 * Профиль привычек (plan/new/push_notifications.md, шаг 2.6) — когда и как человек учится.
 * Файл начинается с «_», поэтому Vercel не публикует его как отдельный роут.
 *
 * Только поведение в приложении (журнал ответов answers), без данных других приложений.
 * Занятие — ответы с перерывами не больше 30 минут. Пересчёт всех пользователей одним запросом;
 * cron-reminders вызывает его раз в сутки (первый запуск после 00:00 UTC) или по ?habits=1.
 */
import { DEFAULT_TZ } from './_send.js';

export async function recomputeHabits(sql) {
  const startedAt = Date.now();
  const rows = await sql`
    WITH people AS (
      SELECT u.id AS user_id, COALESCE(us.timezone, ${DEFAULT_TZ}) AS tz, u.created_at, us.last_active_date
      FROM users u LEFT JOIN user_stats us ON us.user_id = u.id
    ),
    a AS (
      SELECT an.user_id, an.answered_at, an.mode, an.correct, an.time_spent_ms,
             an.answered_at AT TIME ZONE p.tz AS lt,
             LAG(an.answered_at) OVER (PARTITION BY an.user_id ORDER BY an.answered_at) AS prev
      FROM answers an JOIN people p ON p.user_id = an.user_id
      WHERE an.answered_at > NOW() - INTERVAL '28 days' AND an.rejected_reason IS NULL
    ),
    s AS (
      SELECT a.*, SUM(CASE WHEN prev IS NULL OR answered_at - prev > INTERVAL '30 minutes' THEN 1 ELSE 0 END)
               OVER (PARTITION BY user_id ORDER BY answered_at) AS sid
      FROM a
    ),
    sess AS (
      SELECT user_id, sid, MIN(answered_at) AS started, MIN(lt) AS start_lt,
             EXTRACT(EPOCH FROM MAX(answered_at) - MIN(answered_at))::int AS dur
      FROM s GROUP BY user_id, sid
    ),
    hour_mode AS (
      SELECT user_id, mode() WITHIN GROUP (ORDER BY EXTRACT(HOUR FROM start_lt)::int) AS h
      FROM sess WHERE started > NOW() - INTERVAL '14 days' GROUP BY user_id
    ),
    usual AS (
      -- Привычный час — самый частый за 14 дней; минуты — медиана начала занятий в этот час, кратно 15
      SELECT s.user_id,
             make_time(hm.h, (percentile_disc(0.5) WITHIN GROUP (ORDER BY EXTRACT(MINUTE FROM s.start_lt)::int) / 15) * 15, 0) AS usual_time
      FROM sess s JOIN hour_mode hm ON hm.user_id = s.user_id
      WHERE s.started > NOW() - INTERVAL '14 days' AND EXTRACT(HOUR FROM s.start_lt)::int = hm.h
      GROUP BY s.user_id, hm.h
    ),
    days AS (
      SELECT user_id, array_agg(dow ORDER BY dow_n) AS usual_days
      FROM (
        SELECT user_id, trim(to_char(start_lt, 'dy')) AS dow, EXTRACT(ISODOW FROM start_lt)::int AS dow_n,
               COUNT(DISTINCT start_lt::date) AS d
        FROM sess GROUP BY 1, 2, 3
      ) x
      WHERE d >= 2 GROUP BY user_id
    ),
    lens AS (
      SELECT user_id, percentile_cont(0.5) WITHIN GROUP (ORDER BY dur)::int AS median_lesson_sec
      FROM sess WHERE started > NOW() - INTERVAL '14 days' AND dur > 0 GROUP BY user_id
    ),
    ans AS (
      SELECT user_id,
             mode() WITHIN GROUP (ORDER BY mode) AS favorite_mode,
             ROUND(AVG(correct::int)::numeric, 3) AS accuracy_14d,
             ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY time_spent_ms)
               FILTER (WHERE time_spent_ms BETWEEN 500 AND 120000) / 1000.0)::numeric, 1) AS sec_per_answer
      FROM a WHERE answered_at > NOW() - INTERVAL '14 days' GROUP BY user_id
    ),
    act AS (
      SELECT user_id,
             COUNT(DISTINCT start_lt::date) FILTER (WHERE started > NOW() - INTERVAL '7 days')::int AS active_days_7,
             MAX(start_lt::date) AS last_answer_day
      FROM sess GROUP BY user_id
    )
    INSERT INTO user_habits (user_id, usual_time, usual_days, day_type, median_lesson_sec, sec_per_answer,
                             favorite_mode, accuracy_14d, active_days_7, segment, updated_at)
    SELECT p.user_id, u.usual_time, COALESCE(d.usual_days, '{}'),
           CASE WHEN d.usual_days IS NULL THEN NULL
                WHEN d.usual_days <@ ARRAY['mon', 'tue', 'wed', 'thu', 'fri'] THEN 'weekday'
                WHEN d.usual_days <@ ARRAY['sat', 'sun'] THEN 'weekend'
                ELSE 'both' END,
           l.median_lesson_sec, an.sec_per_answer, an.favorite_mode, an.accuracy_14d, COALESCE(ac.active_days_7, 0),
           CASE
             WHEN (NOW() AT TIME ZONE p.tz)::date - (p.created_at AT TIME ZONE p.tz)::date < 7 THEN 'new'
             WHEN GREATEST(p.last_active_date, ac.last_answer_day) IS NULL
               OR (NOW() AT TIME ZONE p.tz)::date - GREATEST(p.last_active_date, ac.last_answer_day) > 30 THEN 'lost'
             WHEN COALESCE(ac.active_days_7, 0) >= 5 THEN 'daily'
             WHEN ac.active_days_7 >= 2 THEN 'regular'
             WHEN ac.active_days_7 = 1 THEN 'casual'
             ELSE 'sleeping'
           END,
           NOW()
    FROM people p
    LEFT JOIN usual u ON u.user_id = p.user_id
    LEFT JOIN days d ON d.user_id = p.user_id
    LEFT JOIN lens l ON l.user_id = p.user_id
    LEFT JOIN ans an ON an.user_id = p.user_id
    LEFT JOIN act ac ON ac.user_id = p.user_id
    ON CONFLICT (user_id) DO UPDATE SET
      usual_time = EXCLUDED.usual_time,
      usual_days = EXCLUDED.usual_days,
      day_type = EXCLUDED.day_type,
      median_lesson_sec = EXCLUDED.median_lesson_sec,
      sec_per_answer = EXCLUDED.sec_per_answer,
      favorite_mode = EXCLUDED.favorite_mode,
      accuracy_14d = EXCLUDED.accuracy_14d,
      active_days_7 = EXCLUDED.active_days_7,
      segment = EXCLUDED.segment,
      updated_at = NOW()
    RETURNING segment
  `;
  const segments = {};
  for (const r of rows) segments[r.segment] = (segments[r.segment] || 0) + 1;
  return { users: rows.length, segments, ms: Date.now() - startedAt };
}
