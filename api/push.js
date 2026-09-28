/**
 * Consolidated Push & Notifications API
 *
 * POST /api/push?action=subscribe       – store FCM token
 * POST /api/push?action=unsubscribe     – remove FCM token
 * GET  /api/push?action=get-by-user     – get tokens by userId
 * GET  /api/push?action=settings        – get notif settings
 * POST /api/push?action=settings        – save notif settings
 * POST /api/push?action=notify          – send FCM push (server-to-server)
 * POST /api/push?action=cron-streak     – streak reminder cron
 * POST /api/push?action=cron-reactivation – reactivation cron
 * GET|POST /api/push?action=cron-reminders – hourly: one daily reminder per user at their notif_hour
 * GET  /api/push?action=rewards           – diamond balance + challenges claimed today
 * POST /api/push?action=claim-reward      – claim daily challenge reward (once per day)
 */

import { neon } from '@neondatabase/serverless';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { ensureDatabaseInitialized } from './_db-init.js';
import { getAuthedUserId } from './_auth.js';
import { computeStandings } from './progress.js';

function initFirebase() {
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  }
  return getMessaging();
}

/** Награды за ежедневные челленджи — сумму определяет сервер, не клиент. */
const CHALLENGE_REWARDS = { quick_round: 10, sniper: 10, forgotten: 10 };

/**
 * "Сегодня" по локальному времени клиента (YYYY-MM-DD). Допускаем расхождение с UTC не больше
 * суток — этого хватает для любого часового пояса, но не даёт забрать награду за другие дни.
 */
function parseRewardDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const diff = Math.abs(Date.parse(`${value}T00:00:00Z`) - Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z'));
  return diff <= 24 * 60 * 60 * 1000 ? value : null;
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 19) return many;
  if (m10 === 1) return one;
  if (m10 >= 2 && m10 <= 4) return few;
  return many;
}

/** Примерное время повторения: ~15 секунд на слово */
function minutesFor(count) {
  return Math.max(1, Math.round((count || 0) / 4));
}

function buildMessage(type, name, streak, longest, data = {}) {
  switch (type) {
    case 'streak_reminder':
      return { title: 'Не теряй серию!', body: `${name}, у тебя ${streak} дней подряд. Позанимайся сегодня!` };
    case 'streak_lost':
      return { title: 'Серия прервана', body: `Серия в ${data.prevStreak} дней потеряна. Начни сегодня заново!` };
    case 'streak_milestone':
      return { title: `${data.days} дней подряд!`, body: `${name}, это твой личный рекорд! Так держать` };
    case 'reactivation_3d':
      return { title: 'Давно не виделись', body: `${name}, прошло 3 дня. Карточки ждут тебя!` };
    case 'reactivation_7d':
      return { title: 'Вернись к учёбе', body: `Твой рекорд был ${longest} дней. Начни новую серию!` };
    case 'review_due':
      return { title: 'Пора повторить', body: `${data.count} ${plural(data.count, 'слово ждёт', 'слова ждут', 'слов ждут')} повторения · ~${minutesFor(data.count)} мин` };
    case 'words_fading':
      return { title: 'Слова начинают забываться', body: `${data.count} ${plural(data.count, 'слово', 'слова', 'слов')} давно не повторял — спаси их за ${minutesFor(data.count)} мин` };
    case 'rating_sunday':
      return {
        title: 'Последний день недели',
        body: data.gap != null
          ? `Ты на ${data.place}-м месте, до ${data.place - 1}-го — ${data.gap} ${plural(data.gap, 'очко', 'очка', 'очков')}. Рейтинг закроется в полночь`
          : `Ты на ${data.place}-м месте в рейтинге курса. Удержи его до полуночи!`,
      };
    case 'weekly_result':
      return {
        title: 'Итоги недели',
        body: `${data.place}-е место в курсе${data.reward > 0 ? `, +${data.reward} алмазов` : ''}. Новая неделя началась!`,
      };
    case 'teacher_review':
      return { title: `${data.teacher || 'Учитель'} просит повторить слова`, body: `${data.count} ${plural(data.count, 'слово ждёт', 'слова ждут', 'слов ждут')} повторения · ~${minutesFor(data.count)} мин` };
    default:
      return null;
  }
}

/**
 * Одно напоминание в день в час, выбранный пользователем (notif_hour, notif_days), только с 8 до 21.
 * Приоритет: воскресенье — место в рейтинге; понедельник — итоги недели; иначе, если повторение
 * дня ещё не сделано, — угасающие слова, слова к повторению, серия.
 */
async function sendDailyReminders(sql) {
  const users = await sql`
    SELECT us.user_id, us.current_streak, us.notif_streak,
           COALESCE(us.timezone, 'Asia/Bishkek') AS tz,
           us.last_active_date = (NOW() AT TIME ZONE COALESCE(us.timezone, 'Asia/Bishkek'))::date AS done_today,
           to_char(NOW() AT TIME ZONE COALESCE(us.timezone, 'Asia/Bishkek'), 'dy') AS dow,
           (NOW() AT TIME ZONE COALESCE(us.timezone, 'Asia/Bishkek'))::date::text AS local_today
    FROM user_stats us
    WHERE us.notif_enabled = true
      AND us.notif_hour BETWEEN 8 AND 21
      AND EXTRACT(HOUR FROM NOW() AT TIME ZONE COALESCE(us.timezone, 'Asia/Bishkek'))::int = us.notif_hour
      AND (us.last_reminder_date IS NULL
           OR us.last_reminder_date < (NOW() AT TIME ZONE COALESCE(us.timezone, 'Asia/Bishkek'))::date)
      AND EXISTS (SELECT 1 FROM push_tokens pt WHERE pt.user_id = us.user_id)
  `;
  let sent = 0;
  const standingsCache = new Map();
  for (const u of users) {
    try {
      const pick = await pickReminder(sql, u, standingsCache);
      if (!pick) continue;
      const result = await sendNotification(sql, u.user_id, pick.type, pick.data);
      await sql`UPDATE user_stats SET last_reminder_date = ${u.local_today} WHERE user_id = ${u.user_id}`;
      if (result.ok) sent++;
    } catch (e) {
      console.error(`[cron-reminders] ${u.user_id} failed:`, e);
    }
  }
  return { ok: true, candidates: users.length, sent };
}

async function pickReminder(sql, u, standingsCache) {
  const dow = String(u.dow).trim();
  // Воскресенье: место в рейтинге курса (если ученик в курсе с включённым рейтингом)
  if (dow === 'sun') {
    const courses = await sql`
      SELECT c.id, COALESCE(c.timezone, us.timezone, 'Asia/Bishkek') AS tz
      FROM course_members cm JOIN courses c ON c.id = cm.course_id
      LEFT JOIN user_stats us ON us.user_id = c.user_id
      WHERE cm.user_id = ${u.user_id} AND cm.role = 'student' AND c.rating_enabled AND NOT cm.hide_from_rating
    `;
    for (const course of courses) {
      if (!standingsCache.has(course.id)) {
        const [{ d: weekStart }] = await sql`SELECT (date_trunc('week', NOW() AT TIME ZONE ${course.tz}))::date::text AS d`;
        const rows = (await computeStandings(sql, course.id, course.tz, weekStart)).filter((r) => !r.hide_from_rating);
        standingsCache.set(course.id, rows);
      }
      const rows = standingsCache.get(course.id);
      const idx = rows.findIndex((r) => r.user_id === u.user_id);
      if (idx >= 0 && rows[idx].points > 0) {
        return { type: 'rating_sunday', data: { place: idx + 1, gap: idx > 0 ? rows[idx - 1].points - rows[idx].points : null } };
      }
    }
  }
  // Понедельник: итоги прошлой недели (их закрывает progress?action=close-week)
  if (dow === 'mon') {
    const [result] = await sql`
      SELECT place, reward FROM weekly_results
      WHERE user_id = ${u.user_id} AND week_start >= (${u.local_today}::date - 7)
      ORDER BY week_start DESC, place ASC LIMIT 1
    `;
    if (result) return { type: 'weekly_result', data: { place: result.place, reward: result.reward } };
  }
  if (u.done_today) return null; // повторение дня уже сделано — не беспокоим

  const [counts] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE next_review <= NOW())::int AS waiting,
      COUNT(*) FILTER (WHERE NOW() - next_review > make_interval(days =>
        CASE LEAST(learning_step, 6) WHEN 1 THEN 1 WHEN 2 THEN 3 WHEN 3 THEN 7 WHEN 4 THEN 14 WHEN 5 THEN 30 ELSE 60 END
      ))::int AS fading
    FROM card_progress WHERE user_id = ${u.user_id} AND learning_step >= 1
  `;
  if (counts.fading > 0) return { type: 'words_fading', data: { count: counts.fading } };
  if (counts.waiting > 0) return { type: 'review_due', data: { count: Math.min(counts.waiting, 30) } };
  if (u.current_streak > 0 && u.notif_streak) return { type: 'streak_reminder', data: {} };
  return null;
}

/**
 * Отправить пуш пользователю на все его устройства. Учитывает notif_enabled; мёртвые токены удаляет.
 * → { ok, sent?, failed?, reason?, error? }
 */
export async function sendNotification(sql, userId, type, data = {}) {
  const tokenRows = await sql`SELECT token FROM push_tokens WHERE user_id = ${userId}`;
  if (tokenRows.length === 0) return { ok: false, reason: 'no token' };

  const [user] = await sql`
    SELECT u.display_name, us.current_streak, us.longest_streak, us.notif_enabled, us.notif_streak
    FROM user_stats us JOIN users u ON u.id = us.user_id WHERE us.user_id = ${userId}
  `;
  if (!user?.notif_enabled) return { ok: false, reason: 'notifications disabled' };

  const message = buildMessage(type, user.display_name || 'Привет', user.current_streak, user.longest_streak, data);
  if (!message) return { ok: false, error: `Unknown type: ${type}` };

  const messaging = initFirebase();
  // На все устройства пользователя (телефон + веб), а не на первое попавшееся
  const tokens = tokenRows.map((r) => r.token);
  const result = await messaging.sendEachForMulticast({
    tokens,
    notification: message,
    data: { type, url: '/' },
    apns: { payload: { aps: { sound: 'default' } } },
  });
  // Удалённое приложение / отозванное разрешение — токен больше не нужен
  const dead = tokens.filter((_, i) => {
    const code = result.responses[i].error?.code;
    return code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token';
  });
  if (dead.length) await sql`DELETE FROM push_tokens WHERE token = ANY(${dead})`;
  return { ok: result.successCount > 0, sent: result.successCount, failed: result.failureCount };
}

export default async function handler(req, res) {
  const { action } = req.query;
  const sql = neon(process.env.POSTGRES_URL);
  await ensureDatabaseInitialized(sql);

  try {
    // ── subscribe ──────────────────────────────────────────────
    if (action === 'subscribe' && req.method === 'POST') {
      const { token, platform, userId: bodyUserId } = req.body || {};
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid token' });
      }
      // Нативное приложение шлёт JWT — тогда userId только из него. userId из тела
      // остаётся для веб-версии, которая пока подписывается без токена входа.
      const authedUserId = await getAuthedUserId(req);
      if (req.headers.authorization && !authedUserId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const userId = authedUserId || bodyUserId;
      await sql`
        INSERT INTO push_tokens (token, user_id, platform, updated_at)
        VALUES (${token}, ${userId || null}, ${platform || 'web'}, NOW())
        ON CONFLICT (token) DO UPDATE SET
          user_id    = EXCLUDED.user_id,
          platform   = EXCLUDED.platform,
          updated_at = NOW()
      `;
      return res.status(200).json({ ok: true });
    }

    // ── unsubscribe ────────────────────────────────────────────
    if (action === 'unsubscribe' && req.method === 'POST') {
      const { token } = req.body || {};
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid token' });
      }
      await sql`DELETE FROM push_tokens WHERE token = ${token}`;
      return res.status(200).json({ ok: true });
    }

    // ── get-by-user ────────────────────────────────────────────
    if (action === 'get-by-user' && req.method === 'GET') {
      const { userId } = req.query;
      if (!userId) return res.status(400).json({ error: 'Missing userId' });
      const rows = await sql`SELECT token FROM push_tokens WHERE user_id = ${userId}`;
      return res.status(200).json({ tokens: rows.map((r) => r.token) });
    }

    // ── settings GET ───────────────────────────────────────────
    if (action === 'settings' && req.method === 'GET') {
      const { userId } = req.query;
      if (!userId) return res.status(400).json({ error: 'Missing userId' });
      const rows = await sql`
        SELECT notif_enabled, notif_hour, notif_minute, notif_days, notif_streak
        FROM user_stats WHERE user_id = ${userId}
      `;
      if (!rows.length) {
        return res.status(200).json({ notifEnabled: true, notifHour: 19, notifMinute: 0, notifDays: 'mon,tue,wed,thu,fri', notifStreak: true });
      }
      const r = rows[0];
      return res.status(200).json({
        notifEnabled: r.notif_enabled,
        notifHour: r.notif_hour,
        notifMinute: r.notif_minute,
        notifDays: r.notif_days,
        notifStreak: r.notif_streak,
      });
    }

    // ── settings POST ──────────────────────────────────────────
    if (action === 'settings' && req.method === 'POST') {
      const { userId, notifEnabled, notifHour, notifMinute, notifDays, notifStreak } = req.body || {};
      if (!userId) return res.status(400).json({ error: 'Missing userId' });
      await sql`
        INSERT INTO user_stats (user_id, notif_enabled, notif_hour, notif_minute, notif_days, notif_streak)
        VALUES (${userId}, ${notifEnabled ?? true}, ${notifHour ?? 19}, ${notifMinute ?? 0}, ${notifDays ?? 'mon,tue,wed,thu,fri'}, ${notifStreak ?? true})
        ON CONFLICT (user_id) DO UPDATE SET
          notif_enabled = EXCLUDED.notif_enabled,
          notif_hour    = EXCLUDED.notif_hour,
          notif_minute  = EXCLUDED.notif_minute,
          notif_days    = EXCLUDED.notif_days,
          notif_streak  = EXCLUDED.notif_streak,
          updated_at    = NOW()
      `;
      return res.status(200).json({ ok: true });
    }

    // ── notify ─────────────────────────────────────────────────
    if (action === 'notify' && req.method === 'POST') {
      if (req.headers.authorization !== `Bearer ${process.env.NOTIFY_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { userId, type, data = {} } = req.body || {};
      if (!userId || !type) return res.status(400).json({ error: 'Missing userId or type' });
      const result = await sendNotification(sql, userId, type, data);
      if (result.error) return res.status(400).json({ error: result.error });
      return res.status(200).json(result);
    }

    // ── cron-streak ────────────────────────────────────────────
    if (action === 'cron-streak' && req.method === 'POST') {
      if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const users = await sql`
        SELECT DISTINCT us.user_id FROM user_stats us
        JOIN push_tokens pt ON pt.user_id = us.user_id
        WHERE us.notif_enabled = true AND us.notif_streak = true
          AND us.current_streak > 0 AND us.last_active_date < CURRENT_DATE
          AND (us.last_reminder_date IS NULL OR us.last_reminder_date < CURRENT_DATE)
      `;
      const baseUrl = `https://${req.headers.host}`;
      let sent = 0;
      for (const user of users) {
        try {
          await fetch(`${baseUrl}/api/push?action=notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.NOTIFY_SECRET}` },
            body: JSON.stringify({ userId: user.user_id, type: 'streak_reminder' }),
          });
          await sql`UPDATE user_stats SET last_reminder_date = CURRENT_DATE WHERE user_id = ${user.user_id}`;
          sent++;
        } catch (e) {
          console.error(`[cron-streak] Failed for ${user.user_id}:`, e);
        }
      }
      return res.status(200).json({ ok: true, total: users.length, sent });
    }

    // ── cron-reminders: раз в час, пуш в выбранный пользователем час (план §3.6) ──
    if (action === 'cron-reminders' && (req.method === 'POST' || req.method === 'GET')) {
      if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      return res.status(200).json(await sendDailyReminders(sql));
    }

    // ── cron-reactivation ──────────────────────────────────────
    if (action === 'cron-reactivation' && req.method === 'POST') {
      if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const users3d = await sql`
        SELECT DISTINCT us.user_id FROM user_stats us JOIN push_tokens pt ON pt.user_id = us.user_id
        WHERE us.notif_enabled = true AND us.last_active_date = CURRENT_DATE - INTERVAL '3 days'
      `;
      const users7d = await sql`
        SELECT DISTINCT us.user_id FROM user_stats us JOIN push_tokens pt ON pt.user_id = us.user_id
        WHERE us.notif_enabled = true AND us.last_active_date = CURRENT_DATE - INTERVAL '7 days'
      `;
      const baseUrl = `https://${req.headers.host}`;
      let sent = 0;
      for (const user of users3d) {
        try {
          await fetch(`${baseUrl}/api/push?action=notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.NOTIFY_SECRET}` },
            body: JSON.stringify({ userId: user.user_id, type: 'reactivation_3d' }),
          });
          sent++;
        } catch (e) { console.error(`[cron-reactivation] 3d failed:`, e); }
      }
      for (const user of users7d) {
        try {
          await fetch(`${baseUrl}/api/push?action=notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.NOTIFY_SECRET}` },
            body: JSON.stringify({ userId: user.user_id, type: 'reactivation_7d' }),
          });
          sent++;
        } catch (e) { console.error(`[cron-reactivation] 7d failed:`, e); }
      }
      return res.status(200).json({ ok: true, users3d: users3d.length, users7d: users7d.length, sent });
    }

    // ── rewards: баланс алмазов + какие челленджи уже забраны сегодня ──
    if (action === 'rewards' && req.method === 'GET') {
      const userId = await getAuthedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const day = parseRewardDay(req.query.day);
      if (!day) return res.status(400).json({ error: 'Invalid day' });
      const [user] = await sql`SELECT COALESCE(diamond, 0) AS diamond FROM users WHERE id = ${userId}::uuid`;
      const claims = await sql`
        SELECT challenge FROM daily_rewards WHERE user_id = ${userId}::uuid AND day = ${day}::date
      `;
      return res.status(200).json({ diamonds: user?.diamond ?? 0, claimedToday: claims.map((c) => c.challenge) });
    }

    // ── claim-reward: награда за челлендж, не больше одной в день ──
    if (action === 'claim-reward' && req.method === 'POST') {
      const userId = await getAuthedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const { challenge } = req.body || {};
      const amount = Object.hasOwn(CHALLENGE_REWARDS, challenge) ? CHALLENGE_REWARDS[challenge] : null;
      if (!amount) return res.status(400).json({ error: 'Unknown challenge' });
      const day = parseRewardDay(req.body?.day);
      if (!day) return res.status(400).json({ error: 'Invalid day' });

      // PK (user_id, challenge, day) гарантирует одну награду в день даже при гонке запросов
      const [row] = await sql`
        WITH claim AS (
          INSERT INTO daily_rewards (user_id, challenge, day, amount)
          VALUES (${userId}::uuid, ${challenge}, ${day}::date, ${amount})
          ON CONFLICT DO NOTHING
          RETURNING amount
        )
        UPDATE users SET diamond = COALESCE(diamond, 0) + COALESCE((SELECT amount FROM claim), 0)
        WHERE id = ${userId}::uuid
        RETURNING diamond, (SELECT COUNT(*) FROM claim) > 0 AS claimed
      `;
      if (!row) return res.status(404).json({ error: 'User not found' });
      return res.status(200).json({ diamonds: row.diamond, claimed: row.claimed });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.error('[push] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
