/**
 * api/data.js — дневная активность, серия, заморозка, статистика (Clean 10 — перенесено без изменений).
 */
import { HttpError } from '../../_access.js';
import { log } from '../../_log.js';

/** Дата клиента YYYY-MM-DD, не дальше суток от UTC-сегодня (любой часовой пояс). */
export function localDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new HttpError(400, 'Invalid date');
  const today = Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  if (Math.abs(Date.parse(`${value}T00:00:00Z`) - today) > 2 * 24 * 60 * 60 * 1000) {
    throw new HttpError(400, 'Date out of range');
  }
  return value;
}

/** Приращения статистики за один вызов — в разумных пределах. */
export function deltas(value) {
  const clamp = (n, max) => Math.max(0, Math.min(max, Math.trunc(Number(n) || 0)));
  return {
    wordsDelta: clamp(value?.wordsDelta, 500),
    minutesDelta: clamp(value?.minutesDelta, 240),
    cardsDelta: clamp(value?.cardsDelta, 500),
  };
}

// ─── Профиль ────────────────────────────────────────────────────────────────

export async function upsertDailyActivity(sql, me, p) {
  const day = localDay(p.localDate);
  const d = deltas(p.deltas);
  await sql`
    INSERT INTO daily_activity (user_id, local_date, words_learned, minutes_learned, cards_studied)
    VALUES (${me}::uuid, ${day}::date, ${d.wordsDelta}, ${d.minutesDelta}, ${d.cardsDelta})
    ON CONFLICT (user_id, local_date) DO UPDATE SET
      words_learned = daily_activity.words_learned + ${d.wordsDelta},
      minutes_learned = daily_activity.minutes_learned + ${d.minutesDelta},
      cards_studied = daily_activity.cards_studied + ${d.cardsDelta},
      updated_at = NOW()
  `;
  return true;
}

/**
 * Пуш пользователю напрямую через sendNotification (как teacher.js), без HTTP и NOTIFY_SECRET.
 * push.js подгружаем лениво: firebase-admin нужен редко и не должен замедлять холодный старт data.js.
 * Ошибка пуша не должна ломать сохранение прогресса.
 */
export async function sendPush(sql, userId, type, data = {}) {
  try {
    const { sendNotification } = await import('./push.js');
    await sendNotification(sql, userId, type, data);
  } catch (e) {
    log.error('data', `push ${type} failed`, e);
  }
}

export const STREAK_MILESTONES = [7, 14, 30, 60, 100, 365];

/** Повторение дня выполнено, если повторено столько слов, которым пришло время (или всё, что ждало) */
export const DAILY_REVIEW_TARGET = 10;

export const DEFAULT_TIMEZONE = 'Asia/Bishkek';

export const STREAK_FREEZE_PRICE = 50;

export const MAX_STREAK_FREEZES = 2;

/**
 * Засчитывается ли сегодняшний день в серию (план §3.5) — по журналу ответов, а не по словам клиента:
 * повторено ≥ 10 слов, которым пришло время; или повторено всё, что ждало (хотя бы одно);
 * или ждать было нечего и дано ≥ 10 ответов.
 */
export async function dayCountsForStreak(sql, me, today, tz) {
  const rows = await sql`
    SELECT
      (SELECT COUNT(*) FROM answers
        WHERE user_id = ${me}::uuid AND rejected_reason IS NULL
          AND (answered_at AT TIME ZONE ${tz})::date = ${today}::date)::int AS active,
      (SELECT COUNT(*) FROM answers
        WHERE user_id = ${me}::uuid AND rejected_reason IS NULL AND was_due AND step_before >= 1
          AND (answered_at AT TIME ZONE ${tz})::date = ${today}::date)::int AS reviewed,
      (SELECT COUNT(*) FROM card_progress
        WHERE user_id = ${me}::uuid AND learning_step >= 1 AND next_review <= NOW())::int AS waiting
  `;
  const { active, reviewed, waiting } = rows[0];
  return {
    counted:
      reviewed >= DAILY_REVIEW_TARGET ||
      (waiting === 0 && (reviewed >= 1 || active >= DAILY_REVIEW_TARGET)),
    active,
    reviewed,
    waiting,
  };
}

export async function updateUserStatsStreak(sql, me, p) {
  const today = localDay(p.localDate);
  const yesterday = localDay(p.yesterdayDate);
  const d = deltas(p.deltas);
  const existing = await sql`
    SELECT current_streak, longest_streak, last_active_date::text AS last_active_date, timezone
    FROM user_stats WHERE user_id = ${me}::uuid
  `;
  const tz = existing[0]?.timezone || DEFAULT_TIMEZONE;
  const day = await dayCountsForStreak(sql, me, today, tz);
  const prevStreak = existing[0]?.current_streak || 0;
  const lastActive = existing[0]?.last_active_date ?? null;
  if (!day.counted) {
    // Итоги (по ним уровень) копятся и до того, как день засчитан в серию. Только для клиентов,
    // которые шлют прибавку с прошлой отправки (incremental): старые шлют счётчик за весь день
    // при каждом выходе с экрана — им по-прежнему только в засчитанный день (plan/done/card_rating.md, Cards 6)
    if (p.incremental === true) {
      await sql`
        INSERT INTO user_stats (user_id, total_words_learned, total_minutes_learned, total_cards_studied)
        VALUES (${me}::uuid, ${d.wordsDelta}, ${d.minutesDelta}, ${d.cardsDelta})
        ON CONFLICT (user_id) DO UPDATE SET
          total_words_learned = user_stats.total_words_learned + ${d.wordsDelta},
          total_minutes_learned = user_stats.total_minutes_learned + ${d.minutesDelta},
          total_cards_studied = user_stats.total_cards_studied + ${d.cardsDelta},
          updated_at = NOW()
      `;
    }
    return {
      counted: false,
      currentStreak: prevStreak,
      longestStreak: existing[0]?.longest_streak || 0,
      ...day,
    };
  }

  let currentStreak = prevStreak;
  let longestStreak = existing[0]?.longest_streak || 0;
  if (lastActive === today) {
    // уже засчитан сегодня — серия не меняется
  } else if (lastActive === yesterday) {
    currentStreak += 1;
  } else {
    currentStreak = 1;
    if (existing.length > 0 && prevStreak > 1)
      await sendPush(sql, me, 'streak_lost', { prevStreak });
  }
  if (currentStreak > longestStreak) longestStreak = currentStreak;

  await sql`
    INSERT INTO user_stats (user_id, current_streak, longest_streak, last_active_date,
                            total_words_learned, total_minutes_learned, total_cards_studied)
    VALUES (${me}::uuid, ${currentStreak}, ${longestStreak}, ${today}::date,
            ${d.wordsDelta}, ${d.minutesDelta}, ${d.cardsDelta})
    ON CONFLICT (user_id) DO UPDATE SET
      current_streak = ${currentStreak},
      longest_streak = ${longestStreak},
      last_active_date = ${today}::date,
      total_words_learned = user_stats.total_words_learned + ${d.wordsDelta},
      total_minutes_learned = user_stats.total_minutes_learned + ${d.minutesDelta},
      total_cards_studied = user_stats.total_cards_studied + ${d.cardsDelta},
      updated_at = NOW()
  `;
  const increased = lastActive !== today;
  // Раньше этот пуш слал клиент с секретом, которого в сборке не было, — он не работал
  if (increased && STREAK_MILESTONES.includes(currentStreak)) {
    await sendPush(sql, me, 'streak_milestone', { days: currentStreak });
  }
  return { counted: true, increased, currentStreak, longestStreak, ...day };
}

/** Купить заморозку серии за алмазы (не больше двух в запасе). */
export async function buyStreakFreeze(sql, me) {
  const rows = await sql`
    UPDATE users SET diamond = COALESCE(diamond, 0) - ${STREAK_FREEZE_PRICE},
                     streak_freezes = streak_freezes + 1
    WHERE id = ${me}::uuid AND COALESCE(diamond, 0) >= ${STREAK_FREEZE_PRICE} AND streak_freezes < ${MAX_STREAK_FREEZES}
    RETURNING diamond, streak_freezes
  `;
  if (rows.length === 0) {
    const [u] =
      await sql`SELECT COALESCE(diamond, 0) AS diamond, streak_freezes FROM users WHERE id = ${me}::uuid`;
    throw new HttpError(
      409,
      u && u.streak_freezes >= MAX_STREAK_FREEZES ? 'max_freezes' : 'not_enough_diamonds'
    );
  }
  return {
    diamonds: rows[0].diamond,
    streakFreezes: rows[0].streak_freezes,
    price: STREAK_FREEZE_PRICE,
  };
}

export async function logStreakEvent(sql, me, p) {
  const day = Math.max(0, Math.min(100000, Math.trunc(Number(p.streakDay) || 0)));
  await sql`INSERT INTO streak_events (user_id, streak_day) VALUES (${me}::uuid, ${day})`;
  return true;
}

export async function getWeekActivity(sql, me, p) {
  const days = Math.max(1, Math.min(366, Math.trunc(Number(p.days) || 7)));
  return sql`
    SELECT local_date::text AS local_date, words_learned, minutes_learned, cards_studied
    FROM daily_activity
    WHERE user_id = ${me}::uuid AND local_date >= CURRENT_DATE - ${days}::int
    ORDER BY local_date DESC
  `;
}

/**
 * Статистика + сброс серии, если пропущено больше дня (по часовому поясу пользователя).
 * Пропущен ровно один день и есть заморозка — она тратится, серия сохраняется.
 */
export async function getUserStats(sql, me) {
  const rows = await sql`
    SELECT us.current_streak, us.longest_streak, us.last_active_date::text AS last_active_date, us.timezone,
           us.total_words_learned, us.total_minutes_learned, us.total_cards_studied,
           u.streak_freezes, h.segment AS activity_segment
    FROM user_stats us JOIN users u ON u.id = us.user_id
    LEFT JOIN user_habits h ON h.user_id = us.user_id
    WHERE us.user_id = ${me}::uuid
  `;
  const row = rows[0];
  if (!row) return null;
  row.freeze_used = false;
  if (row.last_active_date && row.current_streak > 0) {
    let todayKey;
    try {
      todayKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: row.timezone || 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
    } catch {
      todayKey = new Date().toISOString().slice(0, 10);
    }
    const diffDays = Math.round(
      (Date.parse(`${todayKey}T12:00:00Z`) - Date.parse(`${row.last_active_date}T12:00:00Z`)) /
        86_400_000
    );
    if (diffDays === 2 && row.streak_freezes > 0) {
      // Вчера пропущен: заморозка «засчитывает» вчерашний день, серия не прерывается
      const yesterday = new Date(Date.parse(`${todayKey}T12:00:00Z`) - 86_400_000)
        .toISOString()
        .slice(0, 10);
      const used = await sql`
        WITH f AS (
          UPDATE users SET streak_freezes = streak_freezes - 1
          WHERE id = ${me}::uuid AND streak_freezes > 0 RETURNING streak_freezes
        )
        UPDATE user_stats SET last_active_date = ${yesterday}::date, updated_at = NOW()
        WHERE user_id = ${me}::uuid AND EXISTS (SELECT 1 FROM f)
        RETURNING (SELECT streak_freezes FROM f) AS left
      `;
      if (used.length > 0) {
        row.last_active_date = yesterday;
        row.streak_freezes = used[0].left;
        row.freeze_used = true;
      }
    } else if (diffDays > 1) {
      row.current_streak = 0;
      await sql`UPDATE user_stats SET current_streak = 0, updated_at = NOW() WHERE user_id = ${me}::uuid`;
    }
  }
  return row;
}

export async function getDailyActivity(sql, me, p) {
  const day = localDay(p.localDate);
  const rows = await sql`
    SELECT local_date::text AS local_date, words_learned, minutes_learned, cards_studied
    FROM daily_activity WHERE user_id = ${me}::uuid AND local_date = ${day}::date
  `;
  return rows[0] ?? null;
}

// ─── Запуск приложения одним запросом ───────────────────────────────────────
