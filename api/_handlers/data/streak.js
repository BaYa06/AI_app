/**
 * api/data.js — дневная активность, серия, заморозка, статистика.
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
    const { sendNotification } = await import('../../push.js');
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

/**
 * Сколько ещё до зачёта дня (Freeze 6) — по тем же числам, что dayCountsForStreak.
 * need: 'review' — повторить слова, которые ждут; 'any' — ждать нечего, нужны любые ответы.
 * newOnly — учил только новые, ждущие не трогал (случай 04.11 из обращения).
 * Та же формула нужна прогрессу Live Activity («3 из 10») — брать отсюда.
 */
export function dayProgress(day) {
  if (day.counted) return { left: 0, need: null, newOnly: false };
  if (day.waiting === 0 && day.reviewed === 0) {
    return { left: Math.max(1, DAILY_REVIEW_TARGET - day.active), need: 'any', newOnly: false };
  }
  return {
    left: Math.max(1, Math.min(DAILY_REVIEW_TARGET, day.reviewed + day.waiting) - day.reviewed),
    need: 'review',
    newOnly: day.reviewed === 0 && day.active > 0,
  };
}

/**
 * День засчитан в серию — отметка для недели (plan/new/streak_freeze_display.md, Freeze 1).
 * Строки дня может ещё не быть: итоги клиента приходят позже ответов.
 */
export async function markDayCounted(sql, me, day) {
  await sql`
    INSERT INTO daily_activity (user_id, local_date, streak_counted)
    VALUES (${me}::uuid, ${day}::date, true)
    ON CONFLICT (user_id, local_date) DO UPDATE SET streak_counted = true, updated_at = NOW()
    WHERE daily_activity.streak_counted = false
  `;
}

/** Итоги (по ним уровень) — прибавка за вызов. */
async function addTotals(sql, me, d) {
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

/**
 * День засчитан — продвинуть серию (Freeze 2: общий путь для итогов клиента и для ответов).
 * Запись «сравнить и заменить» по last_active_date: если ответы и итоги клиента пришли
 * одновременно, серия прибавится один раз и пуш уйдёт один раз — от того, кто успел первым.
 * prev — строка user_stats до изменения (или undefined, если её ещё нет).
 */
export async function advanceStreak(sql, me, today, yesterday, prev) {
  const prevStreak = prev?.current_streak || 0;
  const lastActive = prev?.last_active_date ?? null;
  await markDayCounted(sql, me, today);
  if (lastActive === today) {
    return {
      increased: false,
      currentStreak: prevStreak,
      longestStreak: prev?.longest_streak || 0,
    };
  }
  const currentStreak = lastActive === yesterday ? prevStreak + 1 : 1;
  const longestStreak = Math.max(prev?.longest_streak || 0, currentStreak);
  const rows = prev
    ? await sql`
        UPDATE user_stats SET current_streak = ${currentStreak}, longest_streak = ${longestStreak},
                              last_active_date = ${today}::date, updated_at = NOW()
        WHERE user_id = ${me}::uuid AND last_active_date IS NOT DISTINCT FROM ${lastActive}::date
        RETURNING current_streak
      `
    : await sql`
        INSERT INTO user_stats (user_id, current_streak, longest_streak, last_active_date)
        VALUES (${me}::uuid, ${currentStreak}, ${longestStreak}, ${today}::date)
        ON CONFLICT (user_id) DO NOTHING
        RETURNING current_streak
      `;
  if (rows.length === 0) {
    // Другой запрос уже засчитал день — берём его результат
    const [now] = await sql`
      SELECT current_streak, longest_streak FROM user_stats WHERE user_id = ${me}::uuid
    `;
    return {
      increased: false,
      currentStreak: now?.current_streak || 0,
      longestStreak: now?.longest_streak || 0,
    };
  }
  if (currentStreak === 1 && prev && prevStreak > 1) {
    await sendPush(sql, me, 'streak_lost', { prevStreak });
  }
  // Раньше этот пуш слал клиент с секретом, которого в сборке не было, — он не работал
  if (STREAK_MILESTONES.includes(currentStreak)) {
    await sendPush(sql, me, 'streak_milestone', { days: currentStreak });
  }
  return { increased: true, currentStreak, longestStreak };
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
  if (!day.counted) {
    // Итоги (по ним уровень) копятся и до того, как день засчитан в серию. Только для клиентов,
    // которые шлют прибавку с прошлой отправки (incremental): старые шлют счётчик за весь день
    // при каждом выходе с экрана — им по-прежнему только в засчитанный день (plan/done/card_rating.md, Cards 6)
    if (p.incremental === true) await addTotals(sql, me, d);
    return {
      ...dayProgress(day),
      counted: false,
      currentStreak: existing[0]?.current_streak || 0,
      longestStreak: existing[0]?.longest_streak || 0,
      ...day,
    };
  }
  // После Freeze 2 день обычно уже засчитан ответами — здесь серия не меняется, только итоги
  const s = await advanceStreak(sql, me, today, yesterday, existing[0]);
  await addTotals(sql, me, d);
  return { counted: true, ...s, ...day, ...dayProgress(day) };
}

/** Сегодня и вчера (YYYY-MM-DD) в часовом поясе пользователя. */
export function localToday(tz) {
  let today;
  try {
    today = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    today = new Date().toISOString().slice(0, 10);
  }
  const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  return { today, yesterday };
}

/**
 * Засчитать день по сохранённым ответам (Freeze 2) — не дожидаясь итогов клиента, которые на вебе
 * теряются при закрытии вкладки. День уже засчитан → один запрос и выход.
 * Перед засчитыванием — та же заморозка, что в getUserStats: иначе разрыв в день сбросил бы серию.
 */
export async function countDayFromAnswers(sql, me) {
  const [row] = await sql`
    SELECT us.user_id IS NOT NULL AS has_stats, us.current_streak, us.longest_streak,
           us.last_active_date::text AS last_active_date, us.timezone, u.streak_freezes
    FROM users u LEFT JOIN user_stats us ON us.user_id = u.id
    WHERE u.id = ${me}::uuid
  `;
  if (!row) return null;
  const { today, yesterday } = localToday(row.timezone || DEFAULT_TIMEZONE);
  if (row.last_active_date === today) return null;
  const day = await dayCountsForStreak(sql, me, today, row.timezone || DEFAULT_TIMEZONE);
  if (!day.counted) return { counted: false };
  if (row.has_stats) await applyFreezeIfNeeded(sql, me, row);
  const s = await advanceStreak(sql, me, today, yesterday, row.has_stats ? row : undefined);
  return { counted: true, freezeUsed: row.freeze_used === true, ...s };
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
    SELECT local_date::text AS local_date, words_learned, minutes_learned, cards_studied,
           streak_counted, frozen
    FROM daily_activity
    WHERE user_id = ${me}::uuid AND local_date >= CURRENT_DATE - ${days}::int
    ORDER BY local_date DESC
  `;
}

/**
 * Пропущено больше дня — серия сброшена; пропущен ровно один и есть заморозка — она тратится,
 * вчерашний день помечается замороженным. Меняет row (строку user_stats + users.streak_freezes).
 * Общая для getUserStats и countDayFromAnswers (Freeze 2).
 */
export async function applyFreezeIfNeeded(sql, me, row) {
  row.freeze_used = false;
  if (row.last_active_date && row.current_streak > 0) {
    const { today: todayKey, yesterday } = localToday(row.timezone);
    const diffDays = Math.round(
      (Date.parse(`${todayKey}T12:00:00Z`) - Date.parse(`${row.last_active_date}T12:00:00Z`)) /
        86_400_000
    );
    if (diffDays === 2 && row.streak_freezes > 0) {
      // Вчера пропущен: заморозка «засчитывает» вчерашний день, серия не прерывается
      // В том же запросе вчерашний день помечается замороженным — для снежинки в неделе (Freeze 1)
      const used = await sql`
        WITH f AS (
          UPDATE users SET streak_freezes = streak_freezes - 1
          WHERE id = ${me}::uuid AND streak_freezes > 0 RETURNING streak_freezes
        ), d AS (
          INSERT INTO daily_activity (user_id, local_date, frozen)
          SELECT ${me}::uuid, ${yesterday}::date, true WHERE EXISTS (SELECT 1 FROM f)
          ON CONFLICT (user_id, local_date) DO UPDATE SET frozen = true, updated_at = NOW()
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
  await applyFreezeIfNeeded(sql, me, row);
  // Засчитан ли сегодня и сколько ещё (Freeze 6). Новые поля — старые клиенты их не читают
  const tz = row.timezone || DEFAULT_TIMEZONE;
  const { today } = localToday(tz);
  row.today_counted = row.last_active_date === today;
  const left = row.today_counted
    ? dayProgress({ counted: true })
    : dayProgress(await dayCountsForStreak(sql, me, today, tz));
  row.today_left = left.left;
  row.today_need = left.need;
  row.today_new_only = left.newOnly;
  return row;
}

export async function getDailyActivity(sql, me, p) {
  const day = localDay(p.localDate);
  const rows = await sql`
    SELECT local_date::text AS local_date, words_learned, minutes_learned, cards_studied,
           streak_counted, frozen
    FROM daily_activity WHERE user_id = ${me}::uuid AND local_date = ${day}::date
  `;
  return rows[0] ?? null;
}

// ─── Запуск приложения одним запросом ───────────────────────────────────────
