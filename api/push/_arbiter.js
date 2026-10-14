/**
 * Арбитр ежедневных пушей (plan/push_notifications.md, шаг 2.2) — вызывается из cron-reminders
 * (cron-job.org, каждые 15 минут). Файл начинается с «_», поэтому Vercel не публикует его как роут.
 *
 * Один запуск:
 *  1. Отложенные ночью пуши (тихие часы) — отправить тем, у кого наступило утро.
 *  2. Одним SQL — кандидаты этого слота со всем, что нужно для решения (счётчики слов, серия,
 *     итоги недели, режим игнора, выключенные категории).
 *  3. Решение по каждому — _decide.js (приоритет, категории, контрольная группа, игнор).
 *  4. Отправка пачками до 500 сообщений (sendEach), журнал и отметки дня — пачками.
 * Повторный запуск в тот же день не пришлёт второй пуш: строка push_log со slot = 'daily'
 * резервируется до отправки под уникальным индексом (user_id, category, local_date, slot).
 */
import { randomUUID } from 'node:crypto';
import { computeStandings } from '../progress.js';
import { courseSetIdsSql } from '../_course.js';
import { PUSH_TYPES, buildPush } from './_registry.js';
import { decide } from './_decide.js';
import {
  DEFAULT_TZ, QUIET_TO_HOUR, QUIET_FROM_HOUR, MINOR_QUIET_FROM_HOUR, groupsOff, initFirebase, isDeadTokenError, isPushPaused, sendNotification,
} from './_send.js';

const FCM_BATCH = 500;
const DAILY_SLOT = 'daily';
/** Отложенные из тихих часов пуши старше этого не отправляем — неактуальны */
const DEFERRED_MAX_HOURS = 20;

/** Пуши, отложенные ночью (sendNotification → quiet_hours): у человека наступило утро — отправить */
async function sendDeferred(sql) {
  const rows = await sql`
    UPDATE push_log pl SET status = 'requeued'
    FROM user_stats us JOIN users u ON u.id = us.user_id
    WHERE pl.status = 'quiet_hours' AND pl.user_id = us.user_id
      AND pl.created_at > NOW() - make_interval(hours => ${DEFERRED_MAX_HOURS})
      AND EXTRACT(HOUR FROM NOW() AT TIME ZONE COALESCE(us.timezone, ${DEFAULT_TZ}))::int >= ${QUIET_TO_HOUR}
      AND EXTRACT(HOUR FROM NOW() AT TIME ZONE COALESCE(us.timezone, ${DEFAULT_TZ}))::int
          < CASE WHEN u.age_range IN ('under13', '13-17') THEN ${MINOR_QUIET_FROM_HOUR}::int ELSE ${QUIET_FROM_HOUR}::int END
    RETURNING pl.user_id, pl.type, pl.payload
  `;
  let sent = 0;
  for (const r of rows) {
    try {
      const result = await sendNotification(sql, r.user_id, r.type, r.payload || {});
      if (result.ok) sent++;
    } catch (e) {
      console.error(`[arbiter] deferred ${r.type} for ${r.user_id} failed:`, e);
    }
  }
  return { deferred: rows.length, deferredSent: sent };
}

/**
 * «Скоро занятие» (2.8): за 1–2 часа до занятия по расписанию курса (учитель) или по своим занятиям
 * из «о себе». Один раз в день; только с 8:00 до 21:45 по поясу; число слов, которые к занятию
 * придёт время повторить (для курса — только слова курса). Нечего повторять — не шлём.
 */
async function sendClassPrep(sql, { dryRun }) {
  const rows = await sql`
    WITH slots AS (
      SELECT cm.user_id, c.id AS course_id, c.title AS course, s.time::time AS class_time,
             COALESCE(c.timezone, ts.timezone, ${DEFAULT_TZ}) AS tz
      FROM courses c
      LEFT JOIN user_stats ts ON ts.user_id = c.user_id
      CROSS JOIN LATERAL jsonb_to_recordset(c.schedule) AS s(day text, time text)
      JOIN course_members cm ON cm.course_id = c.id AND cm.role = 'student'
      WHERE c.schedule IS NOT NULL
        AND s.day = trim(to_char(NOW() AT TIME ZONE COALESCE(c.timezone, ts.timezone, ${DEFAULT_TZ}), 'dy'))
      UNION ALL
      SELECT u.id, NULL, NULL, make_time(u.class_hour, 0, 0), COALESCE(us.timezone, ${DEFAULT_TZ})
      FROM users u JOIN user_stats us ON us.user_id = u.id
      WHERE u.class_days IS NOT NULL AND u.class_hour IS NOT NULL
        AND trim(to_char(NOW() AT TIME ZONE COALESCE(us.timezone, ${DEFAULT_TZ}), 'dy')) = ANY(u.class_days)
    ),
    timed AS (
      SELECT sl.*, (NOW() AT TIME ZONE sl.tz)::time AS local_time,
             (SELECT u.age_range IN ('under13', '13-17') FROM users u WHERE u.id = sl.user_id) AS minor
      FROM slots sl
    )
    SELECT DISTINCT ON (t.user_id) t.user_id, t.course_id, t.course,
           EXTRACT(EPOCH FROM (t.class_time - t.local_time))::int / 60 AS minutes_left
    FROM timed t
    JOIN user_stats us ON us.user_id = t.user_id AND us.notif_enabled = true
    WHERE t.local_time >= t.class_time - INTERVAL '2 hours'
      AND t.local_time < t.class_time - INTERVAL '1 hour'
      AND t.local_time >= make_time(${QUIET_TO_HOUR}, 0, 0)
      AND t.local_time < make_time(CASE WHEN t.minor THEN ${MINOR_QUIET_FROM_HOUR}::int ELSE ${QUIET_FROM_HOUR}::int END, 0, 0)
      AND EXISTS (SELECT 1 FROM push_tokens pt WHERE pt.user_id = t.user_id AND pt.permission IS DISTINCT FROM 'denied')
      AND NOT EXISTS (
        SELECT 1 FROM push_log p
        WHERE p.user_id = t.user_id AND p.type = 'class_prep'
          AND p.local_date = (NOW() AT TIME ZONE COALESCE(us.timezone, ${DEFAULT_TZ}))::date
          AND p.status NOT IN ('dry_run', 'paused', 'failed')
      )
    ORDER BY t.user_id, t.course_id NULLS LAST
  `;
  let sent = 0;
  const report = [];
  for (const r of rows) {
    try {
      const [{ n }] = r.course_id
        ? await sql`
            SELECT COUNT(*)::int AS n FROM card_progress cp JOIN cards ca ON ca.id = cp.card_id
            WHERE cp.user_id = ${r.user_id} AND cp.learning_step >= 1 AND cp.next_review <= NOW() + INTERVAL '2 hours'
              AND ca.set_id IN (${courseSetIdsSql(sql, r.course_id)})
          `
        : await sql`
            SELECT COUNT(*)::int AS n FROM card_progress
            WHERE user_id = ${r.user_id} AND learning_step >= 1 AND next_review <= NOW() + INTERVAL '2 hours'
          `;
      if (n === 0) {
        if (dryRun) report.push({ user_id: r.user_id, type: 'class_prep', status: 'skip', reason: 'nothing_to_review' });
        continue;
      }
      const data = { count: Math.min(n, 30), course: r.course || undefined, inHours: r.minutes_left >= 90 ? 2 : 1 };
      const result = await sendNotification(sql, r.user_id, 'class_prep', data, { dryRun });
      if (result.ok) sent++;
      if (dryRun) report.push({ user_id: r.user_id, type: 'class_prep', status: result.reason || 'send', data, message: result.message || null });
    } catch (e) {
      console.error(`[arbiter] class_prep for ${r.user_id} failed:`, e);
    }
  }
  return { classCandidates: rows.length, classSent: sent, ...(dryRun ? { classReport: report } : null) };
}

/** Новые слова урока в день (DEFAULT_NEW_PER_DAY в LessonService): квота хранится на телефоне, сервер берёт обычную */
const DEFAULT_NEW_PER_DAY = 10;

/** Пуш дня уже ушёл (онбординг, вечерний и т. п.) — обычный арбитр сегодня этого человека не трогает */
async function markRemindedToday(sql, userIds) {
  if (userIds.length === 0) return;
  await sql`
    UPDATE user_stats SET last_reminder_date = (NOW() AT TIME ZONE COALESCE(timezone, ${DEFAULT_TZ}))::date
    WHERE user_id = ANY(${userIds}::uuid[])
  `;
}

/** Отправить по списку через sendNotification; успешным — отметка дня. → { sent, report } */
async function sendEach(sql, items, { dryRun, markDay = true }) {
  let sent = 0;
  const report = [];
  const reminded = [];
  for (const { userId, type, data } of items) {
    try {
      const result = await sendNotification(sql, userId, type, data, { dryRun });
      if (result.ok) {
        sent++;
        reminded.push(userId);
      }
      if (dryRun) report.push({ user_id: userId, type, status: result.reason || 'send', data, message: result.message || null });
    } catch (e) {
      console.error(`[arbiter] ${type} for ${userId} failed:`, e);
    }
  }
  if (!dryRun && markDay) await markRemindedToday(sql, reminded);
  return { sent, report };
}

/**
 * Онбординг (3.1). Первый урок: зарегистрировался, ответов нет — через 3 часа после регистрации;
 * если это ночь — в 19:00 (до 8:00 — того же дня, после 22:00 — следующего). Второй день: первый урок
 * был вчера, сегодня занятий нет — в час вчерашнего урока. Каждый — один раз в жизни.
 */
async function sendOnboarding(sql, { dryRun }) {
  const firstLesson = await sql`
    WITH fresh AS (
      SELECT u.id AS user_id, COALESCE(us.timezone, ${DEFAULT_TZ}) AS tz,
             u.age_range IN ('under13', '13-17') AS minor,
             (u.created_at + INTERVAL '3 hours') AS at3h,
             ((u.created_at + INTERVAL '3 hours') AT TIME ZONE COALESCE(us.timezone, ${DEFAULT_TZ})) AS at3h_local
      FROM users u JOIN user_stats us ON us.user_id = u.id
      WHERE us.notif_enabled = true AND COALESCE(u.teacher, false) = false
        AND u.created_at > NOW() - INTERVAL '3 days'
        AND (us.last_reminder_date IS NULL OR us.last_reminder_date < (NOW() AT TIME ZONE COALESCE(us.timezone, ${DEFAULT_TZ}))::date)
        AND NOT EXISTS (SELECT 1 FROM answers a WHERE a.user_id = u.id)
        AND EXISTS (SELECT 1 FROM push_tokens pt WHERE pt.user_id = u.id AND pt.permission IS DISTINCT FROM 'denied')
        AND NOT EXISTS (
          SELECT 1 FROM push_log p WHERE p.user_id = u.id AND p.type = 'onboarding_first_lesson'
            AND p.status NOT IN ('dry_run', 'paused', 'failed')
        )
    ),
    due AS (
      SELECT f.*,
             CASE
               WHEN EXTRACT(HOUR FROM f.at3h_local)::int >= ${QUIET_TO_HOUR}
                AND EXTRACT(HOUR FROM f.at3h_local)::int < CASE WHEN f.minor THEN ${MINOR_QUIET_FROM_HOUR}::int ELSE ${QUIET_FROM_HOUR}::int END
                 THEN f.at3h
               WHEN EXTRACT(HOUR FROM f.at3h_local)::int < ${QUIET_TO_HOUR}
                 THEN (f.at3h_local::date + TIME '19:00') AT TIME ZONE f.tz
               ELSE (f.at3h_local::date + 1 + TIME '19:00') AT TIME ZONE f.tz
             END AS due_at
      FROM fresh f
    )
    SELECT d.user_id, fs.title AS set_title, LEAST(fs.cards, ${DEFAULT_NEW_PER_DAY}) AS count
    FROM due d
    JOIN LATERAL (
      -- Набор для первого урока: свой (последний созданный), иначе набор курса
      SELECT s.title, (SELECT COUNT(*) FROM cards c WHERE c.set_id = s.id)::int AS cards
      FROM card_sets s
      WHERE s.user_id = d.user_id
         OR s.course_id IN (SELECT cm.course_id FROM course_members cm WHERE cm.user_id = d.user_id AND cm.role = 'student')
      ORDER BY (s.user_id = d.user_id) DESC, s.created_at DESC
      LIMIT 1
    ) fs ON fs.cards > 0
    WHERE NOW() >= d.due_at AND NOW() < d.due_at + INTERVAL '6 hours'
  `;
  const day2 = await sql`
    WITH firsts AS (
      SELECT a.user_id, MIN(a.answered_at) AS first_at FROM answers a
      GROUP BY a.user_id HAVING MIN(a.answered_at) > NOW() - INTERVAL '3 days'
    ),
    ctx AS (
      SELECT f.user_id, f.first_at, COALESCE(us.timezone, ${DEFAULT_TZ}) AS tz,
             u.age_range IN ('under13', '13-17') AS minor,
             (NOW() AT TIME ZONE COALESCE(us.timezone, ${DEFAULT_TZ})) AS local_now,
             (f.first_at AT TIME ZONE COALESCE(us.timezone, ${DEFAULT_TZ})) AS first_local
      FROM firsts f JOIN user_stats us ON us.user_id = f.user_id JOIN users u ON u.id = f.user_id
      WHERE us.notif_enabled = true
        AND (us.last_reminder_date IS NULL OR us.last_reminder_date < (NOW() AT TIME ZONE COALESCE(us.timezone, ${DEFAULT_TZ}))::date)
    )
    SELECT c.user_id,
           (SELECT COUNT(DISTINCT a.card_id)::int FROM answers a
            WHERE a.user_id = c.user_id AND (a.answered_at AT TIME ZONE c.tz)::date = c.first_local::date) AS count
    FROM ctx c
    WHERE c.first_local::date = c.local_now::date - 1
      AND EXTRACT(HOUR FROM c.local_now)::int = EXTRACT(HOUR FROM c.first_local)::int
      AND EXTRACT(HOUR FROM c.local_now)::int >= ${QUIET_TO_HOUR}
      AND EXTRACT(HOUR FROM c.local_now)::int < CASE WHEN c.minor THEN ${MINOR_QUIET_FROM_HOUR}::int ELSE ${QUIET_FROM_HOUR}::int END
      AND NOT EXISTS (SELECT 1 FROM answers a WHERE a.user_id = c.user_id AND (a.answered_at AT TIME ZONE c.tz)::date = c.local_now::date)
      AND EXISTS (SELECT 1 FROM push_tokens pt WHERE pt.user_id = c.user_id AND pt.permission IS DISTINCT FROM 'denied')
      AND NOT EXISTS (
        SELECT 1 FROM push_log p WHERE p.user_id = c.user_id AND p.type = 'onboarding_day2'
          AND p.status NOT IN ('dry_run', 'paused', 'failed')
      )
  `;
  const items = [
    ...firstLesson.map((r) => ({ userId: r.user_id, type: 'onboarding_first_lesson', data: { count: r.count, set: r.set_title } })),
    ...day2.filter((r) => r.count > 0).map((r) => ({ userId: r.user_id, type: 'onboarding_day2', data: { count: r.count } })),
  ];
  const { sent, report } = await sendEach(sql, items, { dryRun });
  return { onboardingCandidates: items.length, onboardingSent: sent, ...(dryRun ? { onboardingReport: report } : null) };
}

/**
 * «Серия сгорит в полночь» (3.3): 21:00–21:45 по поясу (младше 18 — 20:15–20:45), серия ≥ 3, урок
 * сегодня не засчитан, заморозок нет (иначе серия не сгорит — честность, принцип 5), утром не было
 * пуша про серию, за 7 дней — меньше 2 таких пушей. Это второй пуш дня: день не отмечаем.
 */
async function sendStreakRisk(sql, { dryRun }) {
  const rows = await sql`
    WITH ctx AS (
      SELECT us.user_id, us.current_streak,
             (NOW() AT TIME ZONE COALESCE(us.timezone, ${DEFAULT_TZ})) AS local_now,
             u.age_range IN ('under13', '13-17') AS minor
      FROM user_stats us JOIN users u ON u.id = us.user_id
      WHERE us.notif_enabled = true AND us.current_streak >= 3 AND COALESCE(u.streak_freezes, 0) = 0
        AND (us.last_active_date IS NULL
             OR us.last_active_date < (NOW() AT TIME ZONE COALESCE(us.timezone, ${DEFAULT_TZ}))::date)
        AND EXISTS (SELECT 1 FROM push_tokens pt WHERE pt.user_id = us.user_id AND pt.permission IS DISTINCT FROM 'denied')
    )
    SELECT c.user_id, c.current_streak
    FROM ctx c
    WHERE c.local_now::time >= CASE WHEN c.minor THEN TIME '20:15' ELSE TIME '21:00' END
      AND c.local_now::time < CASE WHEN c.minor THEN TIME '20:45' ELSE TIME '21:45' END
      AND NOT EXISTS (
        SELECT 1 FROM push_log p
        WHERE p.user_id = c.user_id AND p.local_date = c.local_now::date
          AND p.type IN ('streak_risk', 'streak_reminder') AND p.status NOT IN ('dry_run', 'paused', 'failed')
      )
      -- Только что пришло обычное напоминание (например, на 21:00) — второй пуш подряд не шлём
      AND NOT EXISTS (
        SELECT 1 FROM push_log p
        WHERE p.user_id = c.user_id AND p.status IN ('sent', 'sending') AND p.category <> 'course'
          AND p.created_at > NOW() - INTERVAL '3 hours'
      )
      AND (
        SELECT COUNT(*) FROM push_log p
        WHERE p.user_id = c.user_id AND p.type = 'streak_risk' AND p.status = 'sent'
          AND p.local_date > c.local_now::date - 7
      ) < 2
  `;
  const items = rows.map((r) => ({ userId: r.user_id, type: 'streak_risk', data: { streak: r.current_streak } }));
  const { sent, report } = await sendEach(sql, items, { dryRun, markDay: false });
  return { streakRiskCandidates: items.length, streakRiskSent: sent, ...(dryRun ? { streakRiskReport: report } : null) };
}

/** Кандидаты этого 15-минутного слота — одним запросом вместо 2–4 на человека */
async function loadCandidates(sql) {
  return sql`
    WITH people AS (
      SELECT us.*, u.display_name, u.class_days,
             u.age_range IN ('under13', '13-17') AS minor,
             h.usual_time, h.usual_days, h.sec_per_answer,
             (NOW() AT TIME ZONE COALESCE(us.timezone, ${DEFAULT_TZ})) AS local_now,
             -- Профиль (2.9): время из настроек, если человек выбрал его сам, иначе за 30 минут до привычного
             (us.notif_time_custom OR NOT us.notif_use_habits OR h.usual_time IS NULL) AS time_from_settings
      FROM user_stats us JOIN users u ON u.id = us.user_id
      LEFT JOIN user_habits h ON h.user_id = us.user_id
      WHERE us.notif_enabled = true
        AND EXISTS (SELECT 1 FROM push_tokens pt WHERE pt.user_id = us.user_id AND pt.permission IS DISTINCT FROM 'denied')
    ),
    base AS (
      -- Не раньше 8:00 и не позже 21:45 (младше 18 — 20:45: тихие часы с 21:00)
      SELECT p.*,
             LEAST(
               GREATEST(
                 CASE WHEN p.time_from_settings THEN make_time(p.notif_hour, COALESCE(p.notif_minute, 0), 0)
                      ELSE p.usual_time - INTERVAL '30 minutes' END,
                 make_time(${QUIET_TO_HOUR}, 0, 0)
               ),
               CASE WHEN p.minor THEN make_time(${MINOR_QUIET_FROM_HOUR - 1}, 45, 0) ELSE make_time(${QUIET_FROM_HOUR - 1}, 45, 0) END
             ) AS eff_time
      FROM people p
    )
    SELECT b.user_id, b.display_name, b.current_streak, b.longest_streak, b.notif_streak, b.notif_categories_off,
           b.time_from_settings, b.eff_time::text AS eff_time, b.minor, b.sec_per_answer,
           -- Привычные дни + дни занятий (2.9): только если дни в настройках не выбраны сами и подстройка включена
           CASE WHEN NOT b.notif_days_custom AND b.notif_use_habits AND cardinality(COALESCE(b.usual_days, '{}')) >= 2
                THEN COALESCE(b.usual_days, '{}') || COALESCE(b.class_days, '{}') END AS habit_days,
           b.local_now::date::text AS local_today,
           trim(to_char(b.local_now, 'dy')) AS dow,
           b.last_active_date = b.local_now::date AS done_today,
           -- Дней без занятий (3.4): по последнему засчитанному дню или ответу — что позже
           b.local_now::date - GREATEST(b.last_active_date, la.last_answer_day) AS days_away,
           la.learned, la.sets,
           cp.waiting, cp.fading,
           pl.ignored, pl.last_sent_day,
           (SELECT MAX(p2.local_date)::text FROM push_log p2
            WHERE p2.user_id = b.user_id AND p2.type = 'rating_overtaken' AND p2.status = 'sent') AS last_overtaken_day,
           wr.course_id AS weekly_course_id, wr.place AS weekly_place, wr.reward AS weekly_reward,
           nw.title AS new_set,
           -- LEAST игнорирует NULL: без нового набора было бы «10 слов» — поэтому через CASE
           CASE WHEN nw.fresh IS NULL THEN 0 ELSE LEAST(nw.fresh, ${DEFAULT_NEW_PER_DAY}) END AS new_count
    FROM base b
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE next_review <= NOW())::int AS waiting,
             COUNT(*) FILTER (WHERE NOW() - next_review > make_interval(days =>
               CASE LEAST(learning_step, 6) WHEN 1 THEN 1 WHEN 2 THEN 3 WHEN 3 THEN 7 WHEN 4 THEN 14 WHEN 5 THEN 30 ELSE 60 END
             ))::int AS fading
      FROM card_progress WHERE user_id = b.user_id AND learning_step >= 1
    ) cp ON true
    LEFT JOIN LATERAL (
      -- Режим игнора (2.3): отправленные маркетинговые пуши без открытия за сутки — после последнего
      -- открытия любого пуша и после дня последнего урока
      SELECT MAX(p.local_date)::text AS last_sent_day,
             COUNT(*) FILTER (WHERE p.opened_at IS NULL AND p.created_at < NOW() - INTERVAL '24 hours'
               AND p.created_at > GREATEST(
                 COALESCE((SELECT MAX(o.opened_at) FROM push_log o WHERE o.user_id = b.user_id), 'epoch'::timestamptz),
                 COALESCE((b.last_active_date + 1)::timestamptz, 'epoch'::timestamptz)
               ))::int AS ignored
      FROM push_log p
      WHERE p.user_id = b.user_id AND p.status = 'sent' AND p.category <> 'course'
        AND p.created_at > NOW() - INTERVAL '60 days'
    ) pl ON true
    LEFT JOIN LATERAL (
      SELECT (SELECT (MAX(an.answered_at) AT TIME ZONE COALESCE(b.timezone, ${DEFAULT_TZ}))::date
              FROM answers an WHERE an.user_id = b.user_id) AS last_answer_day,
             (SELECT COUNT(*)::int FROM card_progress cp WHERE cp.user_id = b.user_id AND cp.first_learned_at IS NOT NULL) AS learned,
             (SELECT COUNT(*)::int FROM card_sets s WHERE s.user_id = b.user_id) AS sets
    ) la ON true
    LEFT JOIN LATERAL (
      -- Текущий набор (3.2) — упрощённо, как LessonService: последний изучаемый за 4 недели, где ещё есть новые слова
      SELECT s.title, f.fresh
      FROM (
        SELECT ca.set_id, MAX(an.answered_at) AS last_at
        FROM answers an JOIN cards ca ON ca.id = an.card_id
        WHERE an.user_id = b.user_id AND an.answered_at > NOW() - INTERVAL '28 days'
        GROUP BY ca.set_id
      ) r
      JOIN card_sets s ON s.id = r.set_id
      CROSS JOIN LATERAL (
        SELECT COUNT(*)::int AS fresh FROM cards c
        WHERE c.set_id = r.set_id
          AND NOT EXISTS (SELECT 1 FROM card_progress cp WHERE cp.user_id = b.user_id AND cp.card_id = c.id)
      ) f
      WHERE f.fresh > 0
      ORDER BY r.last_at DESC
      LIMIT 1
    ) nw ON true
    LEFT JOIN LATERAL (
      SELECT course_id, place, reward FROM weekly_results w
      WHERE w.user_id = b.user_id AND w.week_start >= b.local_now::date - 7
      ORDER BY w.week_start DESC, w.place ASC LIMIT 1
    ) wr ON true
    WHERE EXTRACT(HOUR FROM b.local_now)::int = EXTRACT(HOUR FROM b.eff_time)::int
      AND EXTRACT(MINUTE FROM b.local_now)::int >= EXTRACT(MINUTE FROM b.eff_time)::int
      AND (NOT b.notif_days_custom OR string_to_array(b.notif_days, ',') @> ARRAY[trim(to_char(b.local_now, 'dy'))])
      AND (b.last_reminder_date IS NULL OR b.last_reminder_date < b.local_now::date)
  `;
}

/**
 * «Новый набор в курсе» (3.5): набор курса, о котором ещё не сообщали, создан за последние 7 дней,
 * не скрыт от учеников, в нём ≥ 3 слов и учитель 15 минут не добавлял карточки (закончил набор).
 * Сначала отмечаем announced_at (повторный запуск не продублирует), потом шлём всем ученикам —
 * транзакционный: мимо контрольной группы и паузы, ночью — откладывается до 8:00.
 */
const NEW_SET_MIN_CARDS = 3;

async function sendNewCourseSets(sql, { dryRun }) {
  const sets = await sql`
    SELECT s.id, s.title, s.course_id, c.title AS course,
           (SELECT COUNT(*)::int FROM cards ca WHERE ca.set_id = s.id) AS cards,
           (SELECT MAX(ca.created_at) FROM cards ca WHERE ca.set_id = s.id) AS last_card_at
    FROM card_sets s JOIN courses c ON c.id = s.course_id
    WHERE s.announced_at IS NULL AND s.course_id IS NOT NULL
      AND COALESCE(s.is_hidden_from_students, false) = false
      AND s.created_at > NOW() - INTERVAL '7 days'
  `;
  const ready = sets.filter((x) => x.cards >= NEW_SET_MIN_CARDS && x.last_card_at && Date.now() - new Date(x.last_card_at).getTime() > 15 * 60 * 1000);
  const items = [];
  for (const set of ready) {
    if (!dryRun) {
      const claimed = await sql`UPDATE card_sets SET announced_at = NOW() WHERE id = ${set.id} AND announced_at IS NULL RETURNING id`;
      if (claimed.length === 0) continue;
    }
    const students = await sql`SELECT user_id FROM course_members WHERE course_id = ${set.course_id} AND role = 'student'`;
    for (const st of students) {
      items.push({
        userId: st.user_id,
        type: 'course_new_set',
        data: { course: set.course, set: set.title, count: set.cards, setId: set.id, courseId: set.course_id },
      });
    }
  }
  const { sent, report } = await sendEach(sql, items, { dryRun, markDay: false });
  return { newSets: ready.length, newSetPushes: items.length, newSetSent: sent, ...(dryRun ? { newSetReport: report } : null) };
}

const OVERTAKEN_DAYS = ['tue', 'wed', 'thu', 'fri', 'sat'];

/** Только имя без фамилии — на экране блокировки (принцип 7) */
function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || null;
}

/**
 * Рейтинг курса для кандидатов — одним запросом участий, по курсу считаем один раз.
 * Воскресенье: место и отрыв (rating_sunday). Вт–сб (3.5): кто обогнал за вчера — был ниже на конец
 * позавчера, стал выше на конец вчера (строго по очкам, ничьи не считаются); младше 18 — без имени.
 * → { sunday: Map(userId → data), overtaken: Map(userId → data) }
 */
async function loadRatings(sql, candidates) {
  const sunday = new Map();
  const overtaken = new Map();
  const ids = candidates.filter((c) => c.dow === 'sun' || OVERTAKEN_DAYS.includes(c.dow)).map((c) => c.user_id);
  if (ids.length === 0) return { sunday, overtaken };
  const byUser = new Map(candidates.map((c) => [c.user_id, c]));
  const memberships = await sql`
    SELECT cm.user_id, c.id AS course_id, COALESCE(c.timezone, ts.timezone, ${DEFAULT_TZ}) AS tz
    FROM course_members cm JOIN courses c ON c.id = cm.course_id
    LEFT JOIN user_stats ts ON ts.user_id = c.user_id
    WHERE cm.user_id = ANY(${ids}::uuid[]) AND cm.role = 'student' AND c.rating_enabled AND NOT cm.hide_from_rating
  `;
  const cache = new Map(); // course_id → { now, endYesterday, endBefore }
  const standingsOf = async (m) => {
    if (cache.has(m.course_id)) return cache.get(m.course_id);
    const [b] = await sql`
      SELECT (date_trunc('week', NOW() AT TIME ZONE ${m.tz}))::date::text AS week_start,
             (((NOW() AT TIME ZONE ${m.tz})::date)::timestamp AT TIME ZONE ${m.tz}) AS end_yesterday,
             (((NOW() AT TIME ZONE ${m.tz})::date - 1)::timestamp AT TIME ZONE ${m.tz}) AS end_before
    `;
    const visible = (rows) => rows.filter((r) => !r.hide_from_rating);
    const entry = {
      now: visible(await computeStandings(sql, m.course_id, m.tz, b.week_start)),
      endYesterday: null,
      endBefore: null,
      bounds: b,
    };
    cache.set(m.course_id, entry);
    return entry;
  };

  for (const m of memberships) {
    const c = byUser.get(m.user_id);
    const st = await standingsOf(m);
    if (c.dow === 'sun' && !sunday.has(m.user_id)) {
      const idx = st.now.findIndex((r) => r.user_id === m.user_id);
      if (idx >= 0 && st.now[idx].points > 0) {
        sunday.set(m.user_id, { place: idx + 1, gap: idx > 0 ? st.now[idx - 1].points - st.now[idx].points : null, courseId: m.course_id });
      }
    }
    if (OVERTAKEN_DAYS.includes(c.dow) && !overtaken.has(m.user_id)) {
      if (!st.endYesterday) {
        const visible = (rows) => rows.filter((r) => !r.hide_from_rating);
        st.endYesterday = visible(await computeStandings(sql, m.course_id, m.tz, st.bounds.week_start, st.bounds.end_yesterday));
        st.endBefore = visible(await computeStandings(sql, m.course_id, m.tz, st.bounds.week_start, st.bounds.end_before));
      }
      const pts = (rows) => new Map(rows.map((r) => [r.user_id, r.points]));
      const p1 = pts(st.endYesterday);
      const p0 = pts(st.endBefore);
      const mine1 = p1.get(m.user_id) ?? 0;
      const mine0 = p0.get(m.user_id) ?? 0;
      const rivals = st.endYesterday
        .filter((r) => r.user_id !== m.user_id && (p0.get(r.user_id) ?? 0) < mine0 && r.points > mine1)
        .sort((a, b) => a.points - b.points);
      if (rivals.length > 0) {
        overtaken.set(m.user_id, {
          rival: c.minor === true ? null : firstName(rivals[0].name),
          gap: rivals[0].points - mine1,
          courseId: m.course_id,
        });
      }
    }
  }
  return { sunday, overtaken };
}

/** Строки push_log пачкой. reserve — для отправки: занять слот дня, конфликт = уже отправлено сегодня */
async function insertLogRows(sql, rows) {
  if (rows.length === 0) return new Set();
  const inserted = await sql`
    INSERT INTO push_log (id, user_id, type, category, variant, local_date, status, tokens, delivered, payload, slot)
    SELECT x.id, x.user_id, x.type, x.category, x.variant, x.local_date, x.status, x.tokens, x.delivered, x.payload, x.slot
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(
      id uuid, user_id uuid, type text, category text, variant text, local_date date,
      status text, tokens int, delivered int, payload jsonb, slot text
    )
    ON CONFLICT DO NOTHING
    RETURNING id
  `;
  return new Set(inserted.map((r) => r.id));
}

/**
 * Запуск арбитра. dryRun — ничего не отправлять и не отмечать день: в ответе решение по каждому
 * кандидату, в push_log — строки dry_run.
 */
export async function runArbiter(sql, { dryRun = false } = {}) {
  const startedAt = Date.now();
  const deferred = dryRun ? { deferred: 0, deferredSent: 0 } : await sendDeferred(sql);
  const classPrep = await sendClassPrep(sql, { dryRun });
  const newSets = await sendNewCourseSets(sql, { dryRun });
  // Новичков — до основной рассылки: их пуш дня важнее общего напоминания
  const onboarding = await sendOnboarding(sql, { dryRun });
  const candidates = await loadCandidates(sql);
  const ratings = await loadRatings(sql, candidates);
  const paused = isPushPaused();

  const report = [];
  const toSend = []; // { row, candidate, built }
  const logRows = [];
  const markDay = []; // { user_id, d } — решение на сегодня принято, больше не рассматривать

  for (const c of candidates) {
    const decision = decide({
      userId: c.user_id,
      today: c.local_today,
      dow: c.dow,
      doneToday: c.done_today === true,
      daysAway: c.days_away,
      streak: c.current_streak || 0,
      notifStreak: c.notif_streak !== false,
      fading: c.fading || 0,
      waiting: c.waiting || 0,
      rating: ratings.sunday.get(c.user_id) || null,
      overtaken: ratings.overtaken.get(c.user_id) || null,
      weekly: c.weekly_place ? { place: c.weekly_place, reward: c.weekly_reward, courseId: c.weekly_course_id } : null,
      newWords: c.new_count > 0 ? { count: c.new_count, set: c.new_set } : null,
      learned: c.learned || 0,
      sets: c.sets || 0,
      groupsOff: groupsOff(c.notif_categories_off, c.notif_streak),
      ignored: c.ignored || 0,
      lastSentDay: c.last_sent_day,
      lastSentByType: { rating_overtaken: c.last_overtaken_day },
      habitDays: c.habit_days || null,
    });
    // Что из профиля повлияло на решение (2.9) — для dry_run
    const profile = {
      time: c.time_from_settings ? 'settings' : 'habit',
      at: c.eff_time ? c.eff_time.slice(0, 5) : null,
      habitDays: c.habit_days || null,
      minor: c.minor === true,
      secPerAnswer: c.sec_per_answer ? Number(c.sec_per_answer) : null,
    };
    if (decision.status === 'skip') {
      if (dryRun) report.push({ user_id: c.user_id, type: null, status: 'skip', reason: decision.reason, profile });
      continue;
    }

    const built = buildPush(decision.type, {
      userId: c.user_id,
      name: c.display_name || 'Привет',
      displayName: c.display_name || null,
      streak: c.current_streak,
      longest: c.longest_streak,
      secPerAnswer: c.sec_per_answer,
      data: decision.data,
    });
    let status = decision.status;
    if (status === 'send' && !built) status = 'no_specifics';
    if (status === 'send' && paused) status = 'paused';
    if (status === 'send' && dryRun) status = 'dry_run';

    const row = {
      id: randomUUID(),
      user_id: c.user_id,
      type: decision.type,
      category: PUSH_TYPES[decision.type].category,
      variant: built?.variant || null,
      local_date: c.local_today,
      // Пробный запуск не должен попадать в статистику отказов: всё пишется как dry_run, решение — в payload
      status: status === 'send' ? 'sending' : dryRun ? 'dry_run' : status,
      tokens: 0,
      delivered: 0,
      payload: {
        ...decision.data,
        ...(decision.reason ? { reason: decision.reason } : null),
        ...(dryRun ? { decision: status } : null),
      },
      slot: status === 'send' ? DAILY_SLOT : null,
    };
    if (status === 'send') toSend.push({ row, built });
    else logRows.push(row);
    // На паузе день не отмечаем: после снятия паузы напоминание ещё может уйти сегодня
    if (!dryRun && status !== 'paused') markDay.push({ user_id: c.user_id, d: c.local_today });
    if (dryRun) {
      report.push({
        user_id: c.user_id, type: decision.type, status, reason: decision.reason || null, data: decision.data,
        message: built ? { title: built.title, body: built.body } : null, profile,
      });
    }
  }

  // Отказы — в журнал пачкой (кроме пропусков «нечего слать»)
  await insertLogRows(sql, logRows);

  // Отправка: сначала резерв слота дня, потом FCM пачками
  let sent = 0;
  if (toSend.length > 0) {
    const reserved = await insertLogRows(sql, toSend.map((s) => s.row));
    const ready = toSend.filter((s) => reserved.has(s.row.id));
    const userIds = ready.map((s) => s.row.user_id);
    const tokenRows = userIds.length
      ? await sql`
          SELECT user_id, token FROM push_tokens
          WHERE user_id = ANY(${userIds}::uuid[]) AND permission IS DISTINCT FROM 'denied'
        `
      : [];
    const tokensByUser = new Map();
    for (const t of tokenRows) {
      if (!tokensByUser.has(t.user_id)) tokensByUser.set(t.user_id, []);
      tokensByUser.get(t.user_id).push(t.token);
    }

    const messages = []; // { pushId, token, message }
    for (const s of ready) {
      for (const token of tokensByUser.get(s.row.user_id) || []) {
        messages.push({
          pushId: s.row.id,
          token,
          message: {
            token,
            notification: { title: s.built.title, body: s.built.body },
            data: { type: s.row.type, url: '/', push_id: s.row.id, link: s.built.link },
            apns: { payload: { aps: { sound: 'default' } } },
          },
        });
      }
    }

    const stats = new Map(ready.map((s) => [s.row.id, { tokens: 0, delivered: 0 }]));
    const dead = [];
    if (messages.length > 0) {
      const messaging = initFirebase();
      for (let i = 0; i < messages.length; i += FCM_BATCH) {
        const chunk = messages.slice(i, i + FCM_BATCH);
        try {
          const result = await messaging.sendEach(chunk.map((m) => m.message));
          result.responses.forEach((r, j) => {
            const st = stats.get(chunk[j].pushId);
            st.tokens++;
            if (r.success) st.delivered++;
            else if (isDeadTokenError(r.error?.code)) dead.push(chunk[j].token);
          });
        } catch (e) {
          console.error('[arbiter] FCM batch failed:', e);
          for (const m of chunk) stats.get(m.pushId).tokens++;
        }
      }
    }
    if (dead.length) await sql`DELETE FROM push_tokens WHERE token = ANY(${dead})`;

    const updates = [...stats].map(([id, st]) => ({ id, status: st.delivered > 0 ? 'sent' : 'failed', tokens: st.tokens, delivered: st.delivered }));
    sent = updates.filter((u) => u.status === 'sent').length;
    if (updates.length > 0) {
      await sql`
        UPDATE push_log p SET status = x.status, tokens = x.tokens, delivered = x.delivered
        FROM jsonb_to_recordset(${JSON.stringify(updates)}::jsonb) AS x(id uuid, status text, tokens int, delivered int)
        WHERE p.id = x.id
      `;
    }
  }

  // Вечернее «серия сгорит» — после основной рассылки, чтобы не прийти вторым пушем в ту же минуту
  const streakRisk = await sendStreakRisk(sql, { dryRun });

  if (markDay.length > 0) {
    await sql`
      UPDATE user_stats us SET last_reminder_date = x.d
      FROM jsonb_to_recordset(${JSON.stringify(markDay)}::jsonb) AS x(user_id uuid, d date)
      WHERE us.user_id = x.user_id
    `;
  }

  const summary = {
    ok: true,
    candidates: candidates.length,
    sent,
    skipped: logRows.length,
    ...deferred,
    ...classPrep,
    ...newSets,
    ...onboarding,
    ...streakRisk,
    ms: Date.now() - startedAt,
  };
  return dryRun ? { ...summary, dry_run: true, paused, report } : summary;
}
