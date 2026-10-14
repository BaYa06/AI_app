/**
 * Consolidated Push & Notifications API
 *
 * POST /api/push?action=subscribe       – store FCM token
 * POST /api/push?action=unsubscribe     – remove FCM token
 * GET  /api/push?action=settings        – get notif settings
 * POST /api/push?action=settings        – save notif settings
 * POST /api/push?action=notify          – send FCM push (server-to-server)
 * POST /api/push?action=cron-streak     – устарела (Push 0.2): ничего не шлёт, логика в cron-reminders
 * POST /api/push?action=cron-reactivation – устарела (Push 0.2): ничего не шлёт, логика в cron-reminders
 * GET|POST /api/push?action=cron-reminders – cron-job.org каждые 15 мин: одно напоминание в день в notif_hour:notif_minute
 *          &dry_run=1 — ничего не шлёт: кому, что и почему (в push_log статус dry_run)
 * Переменная PUSH_PAUSED=1 — аварийная остановка: маркетинговые пуши не уходят, от учителя уходят
 * POST /api/push?action=opened          – тап по пушу / урок после пуша (JWT): { push_id, stage? } → push_log
 * GET  /api/push?action=rewards           – diamond balance + challenges claimed today
 * POST /api/push?action=claim-reward      – claim daily challenge reward (once per day)
 */

import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { ensureDatabaseInitialized } from './_db-init.js';
import { getAuthedUserId, hasBearerSecret } from './_auth.js';
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
      return { title: 'Не теряй серию!', body: `${name}, у тебя ${streak} ${plural(streak, 'день', 'дня', 'дней')} подряд. Позанимайся сегодня!` };
    case 'streak_lost':
      return { title: 'Серия прервана', body: `Серия в ${data.prevStreak} ${plural(data.prevStreak, 'день', 'дня', 'дней')} потеряна. Начни сегодня заново!` };
    case 'streak_milestone':
      return { title: `${data.days} ${plural(data.days, 'день', 'дня', 'дней')} подряд!`, body: `${name}, это твой личный рекорд! Так держать` };
    case 'reactivation_3d':
      return { title: 'Давно не виделись', body: `${name}, прошло 3 дня. Карточки ждут тебя!` };
    case 'reactivation_7d':
      return { title: 'Вернись к учёбе', body: `Твой рекорд был ${longest} ${plural(longest, 'день', 'дня', 'дней')}. Начни новую серию!` };
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
        body: `${data.place}-е место в курсе${data.reward > 0 ? `, +${data.reward} ${plural(data.reward, 'алмаз', 'алмаза', 'алмазов')}` : ''}. Новая неделя началась!`,
      };
    case 'teacher_review':
      return { title: `${data.teacher || 'Учитель'} просит повторить слова`, body: `${data.count} ${plural(data.count, 'слово ждёт', 'слова ждут', 'слов ждут')} повторения · ~${minutesFor(data.count)} мин` };
    default:
      return null;
  }
}

/**
 * Одно напоминание в день во время, выбранное пользователем (notif_hour:notif_minute), только с 8 до 21.
 * cron-job.org вызывает каждые 15 минут. Берём тех, у кого сейчас нужный час и минута уже наступила:
 * пропущенный запуск в :00 подхватит запуск в :15. Второго пуша не будет — last_reminder_date.
 * Приоритет: воскресенье — место в рейтинге; понедельник — итоги недели; иначе, если повторение
 * дня ещё не сделано, — угасающие слова, слова к повторению, возврат (3 и 7 дней), серия.
 */
async function sendDailyReminders(sql, { dryRun = false } = {}) {
  const users = await sql`
    SELECT us.user_id, us.current_streak, us.notif_streak,
           COALESCE(us.timezone, 'Asia/Bishkek') AS tz,
           us.last_active_date = (NOW() AT TIME ZONE COALESCE(us.timezone, 'Asia/Bishkek'))::date AS done_today,
           to_char(NOW() AT TIME ZONE COALESCE(us.timezone, 'Asia/Bishkek'), 'dy') AS dow,
           (NOW() AT TIME ZONE COALESCE(us.timezone, 'Asia/Bishkek'))::date::text AS local_today,
           (NOW() AT TIME ZONE COALESCE(us.timezone, 'Asia/Bishkek'))::date - us.last_active_date AS days_away
    FROM user_stats us
    WHERE us.notif_enabled = true
      AND us.notif_hour BETWEEN 8 AND 21
      AND EXTRACT(HOUR FROM NOW() AT TIME ZONE COALESCE(us.timezone, 'Asia/Bishkek'))::int = us.notif_hour
      AND EXTRACT(MINUTE FROM NOW() AT TIME ZONE COALESCE(us.timezone, 'Asia/Bishkek'))::int >= COALESCE(us.notif_minute, 0)
      AND (us.last_reminder_date IS NULL
           OR us.last_reminder_date < (NOW() AT TIME ZONE COALESCE(us.timezone, 'Asia/Bishkek'))::date)
      AND EXISTS (SELECT 1 FROM push_tokens pt WHERE pt.user_id = us.user_id)
  `;
  let sent = 0;
  const report = []; // для dry_run: решение по каждому кандидату
  const standingsCache = new Map();
  for (const u of users) {
    try {
      const pick = await pickReminder(sql, u, standingsCache);
      if (!pick) {
        if (dryRun) report.push({ user_id: u.user_id, type: null, reason: u.done_today ? 'done_today' : 'nothing_to_send' });
        continue;
      }
      const result = await sendNotification(sql, u.user_id, pick.type, pick.data, { dryRun });
      if (dryRun) {
        report.push({ user_id: u.user_id, type: pick.type, data: pick.data, reason: result.reason || null, message: result.message || null });
        continue;
      }
      // На паузе день не отмечаем: после снятия паузы напоминание ещё может уйти сегодня
      if (result.reason !== 'paused') {
        await sql`UPDATE user_stats SET last_reminder_date = ${u.local_today} WHERE user_id = ${u.user_id}`;
      }
      if (result.ok) sent++;
    } catch (e) {
      console.error(`[cron-reminders] ${u.user_id} failed:`, e);
    }
  }
  return dryRun
    ? { ok: true, dry_run: true, paused: isPushPaused(), candidates: users.length, report }
    : { ok: true, candidates: users.length, sent };
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
        return { type: 'rating_sunday', data: { place: idx + 1, gap: idx > 0 ? rows[idx - 1].points - rows[idx].points : null, courseId: course.id } };
      }
    }
  }
  // Понедельник: итоги прошлой недели (их закрывает progress?action=close-week)
  if (dow === 'mon') {
    const [result] = await sql`
      SELECT course_id, place, reward FROM weekly_results
      WHERE user_id = ${u.user_id} AND week_start >= (${u.local_today}::date - 7)
      ORDER BY week_start DESC, place ASC LIMIT 1
    `;
    if (result) return { type: 'weekly_result', data: { place: result.place, reward: result.reward, courseId: result.course_id } };
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
  // Бывший cron-reactivation: теперь в привычное время и по поясу пользователя, а не по UTC
  if (u.days_away === 3) return { type: 'reactivation_3d', data: {} };
  if (u.days_away === 7) return { type: 'reactivation_7d', data: {} };
  if (u.current_streak > 0 && u.notif_streak) return { type: 'streak_reminder', data: {} };
  return null;
}

/** Категория типа пуша — для push_log и будущих переключателей в настройках (шаг 2.4). */
const PUSH_CATEGORY = {
  teacher_review: 'course',
  review_due: 'lesson',
  words_fading: 'lesson',
  streak_reminder: 'streak',
  streak_lost: 'streak',
  streak_milestone: 'streak',
  rating_sunday: 'rating',
  weekly_result: 'rating',
  reactivation_3d: 'reactivation',
  reactivation_7d: 'reactivation',
};

/** Транзакционные пуши: уходят и на паузе (PUSH_PAUSED), и потом — мимо дневного лимита и контрольной группы. */
const TRANSACTIONAL_TYPES = new Set(['teacher_review']);

/** Аварийный выключатель: PUSH_PAUSED=1 в переменных Vercel останавливает маркетинговые пуши без деплоя. */
function isPushPaused() {
  return process.env.PUSH_PAUSED === '1';
}

/**
 * Куда ведёт тап (план, принцип 4): урок дня или рейтинг курса. from=push — главная запускает урок,
 * как по ссылке виджета. Старые сборки поля link не знают и открывают главную, как раньше.
 */
function pushLink(type, data) {
  if (data?.courseId && (type === 'rating_sunday' || type === 'weekly_result')) {
    const week = type === 'weekly_result' ? '&week=previous' : '';
    return `flashly://rating/${encodeURIComponent(data.courseId)}?from=push${week}`;
  }
  return 'flashly://lesson?from=push';
}

/**
 * Строка push_log на каждое решение (план, шаг 0.3). Журнал не должен ронять отправку: ошибку
 * только логируем. local_date — по поясу пользователя, как у остальных дневных отметок.
 */
async function logPush(sql, { id, userId, type, status, tokens = 0, delivered = 0, data }) {
  try {
    await sql`
      INSERT INTO push_log (id, user_id, type, category, local_date, status, tokens, delivered, payload)
      VALUES (
        ${id}, ${userId}, ${type}, ${PUSH_CATEGORY[type] || 'other'},
        (NOW() AT TIME ZONE COALESCE((SELECT timezone FROM user_stats WHERE user_id = ${userId}), 'Asia/Bishkek'))::date,
        ${status}, ${tokens}, ${delivered}, ${JSON.stringify(data || {})}::jsonb
      )
    `;
  } catch (e) {
    console.error('[push] push_log insert failed:', e);
  }
}

/**
 * Отправить пуш пользователю на все его устройства. Учитывает notif_enabled; мёртвые токены удаляет.
 * Каждое решение (и отказ) пишется в push_log; id строки уходит в пуш как data.push_id.
 * dryRun — пройти все проверки и собрать текст, но не отправлять (status = 'dry_run').
 * → { ok, push_id?, sent?, failed?, reason?, message?, error? }
 */
export async function sendNotification(sql, userId, type, data = {}, { dryRun = false } = {}) {
  const pushId = randomUUID();
  const log = (status, extra = {}) => logPush(sql, { id: pushId, userId, type, status, data, ...extra });

  const tokenRows = await sql`SELECT token FROM push_tokens WHERE user_id = ${userId}`;
  if (tokenRows.length === 0) {
    await log('no_token');
    return { ok: false, push_id: pushId, reason: 'no token' };
  }

  const [user] = await sql`
    SELECT u.display_name, us.current_streak, us.longest_streak, us.notif_enabled, us.notif_streak
    FROM user_stats us JOIN users u ON u.id = us.user_id WHERE us.user_id = ${userId}
  `;
  if (!user?.notif_enabled) {
    await log('disabled');
    return { ok: false, push_id: pushId, reason: 'notifications disabled' };
  }

  const message = buildMessage(type, user.display_name || 'Привет', user.current_streak, user.longest_streak, data);
  if (!message) return { ok: false, error: `Unknown type: ${type}` };

  if (isPushPaused() && !TRANSACTIONAL_TYPES.has(type)) {
    await log('paused');
    return { ok: false, push_id: pushId, reason: 'paused', message };
  }
  if (dryRun) {
    await log('dry_run', { tokens: tokenRows.length });
    return { ok: false, push_id: pushId, reason: 'dry_run', message };
  }

  const messaging = initFirebase();
  // На все устройства пользователя (телефон + веб), а не на первое попавшееся
  const tokens = tokenRows.map((r) => r.token);
  let result;
  try {
    result = await messaging.sendEachForMulticast({
      tokens,
      notification: message,
      data: { type, url: '/', push_id: pushId, link: pushLink(type, data) },
      apns: { payload: { aps: { sound: 'default' } } },
    });
  } catch (e) {
    await log('failed', { tokens: tokens.length });
    throw e;
  }
  // Удалённое приложение / отозванное разрешение — токен больше не нужен
  const dead = tokens.filter((_, i) => {
    const code = result.responses[i].error?.code;
    return code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token';
  });
  if (dead.length) await sql`DELETE FROM push_tokens WHERE token = ANY(${dead})`;
  await log(result.successCount > 0 ? 'sent' : 'failed', { tokens: tokens.length, delivered: result.successCount });
  return { ok: result.successCount > 0, push_id: pushId, sent: result.successCount, failed: result.failureCount };
}

/**
 * Чьи настройки уведомлений читать или менять. С JWT — только свои, userId из запроса игнорируется.
 * Без JWT — переходный режим для сборок до Push 0.1 (1.5.7 и старше), которые шлют userId без входа:
 * по правилу Release 2 их нельзя ломать. Убрать вместе с minVersion (Release 5), когда старых
 * сборок почти не останется — до этого ручка всё ещё открыта для того, кто знает чужой UUID.
 */
async function settingsUserId(req, legacyUserId) {
  if (req.headers.authorization) return getAuthedUserId(req); // невалидный JWT → null → 401
  if (typeof legacyUserId !== 'string' || !legacyUserId) return null;
  console.warn('[push] settings без JWT (старая сборка)');
  return legacyUserId;
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
      // userId только из JWT: иначе можно привязать свой токен к чужому userId и получать его пуши.
      // Без входа токен сохраняется ничьим (user_id = NULL) и привяжется при следующей подписке с JWT.
      // Нативный клиент шлёт JWT с первой версии, веб — с Push 0.1 (выкатывается вместе с сервером).
      const userId = await getAuthedUserId(req);
      if (req.headers.authorization && !userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (!userId && bodyUserId) console.warn('[push] subscribe: userId без JWT проигнорирован');
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
      // Удалить можно только свой токен или ничей — чужому нельзя выключить пуши, зная его токен
      const userId = await getAuthedUserId(req);
      await sql`
        DELETE FROM push_tokens
        WHERE token = ${token} AND (user_id IS NULL OR user_id = ${userId})
      `;
      return res.status(200).json({ ok: true });
    }

    // ── settings GET ───────────────────────────────────────────
    if (action === 'settings' && req.method === 'GET') {
      const userId = await settingsUserId(req, req.query.userId);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
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
      const { notifEnabled, notifHour, notifMinute, notifDays, notifStreak } = req.body || {};
      const userId = await settingsUserId(req, req.body?.userId);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
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
      if (!hasBearerSecret(req, process.env.NOTIFY_SECRET)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { userId, type, data = {} } = req.body || {};
      if (!userId || !type) return res.status(400).json({ error: 'Missing userId or type' });
      const result = await sendNotification(sql, userId, type, data);
      if (result.error) return res.status(400).json({ error: result.error });
      return res.status(200).json(result);
    }

    // ── cron-streak, cron-reactivation: устарели (Push 0.2) ──
    // Считали день по UTC и могли прислать второй пуш в тот же день. Их логика теперь в cron-reminders.
    // Action не удаляем (Release 2): старый планировщик получит 200 и ничего не разошлёт.
    if ((action === 'cron-streak' || action === 'cron-reactivation') && req.method === 'POST') {
      if (!hasBearerSecret(req, process.env.CRON_SECRET)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      return res.status(200).json({ ok: true, deprecated: true, sent: 0 });
    }

    // ── cron-reminders: cron-job.org каждые 15 мин, пуш в выбранное пользователем время ──
    if (action === 'cron-reminders' && (req.method === 'POST' || req.method === 'GET')) {
      if (!hasBearerSecret(req, process.env.CRON_SECRET)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const dryRun = req.query.dry_run === '1';
      const result = await sendDailyReminders(sql, { dryRun });
      // Раз в сутки (первый запуск после полуночи UTC): журнал храним 180 дней
      const now = new Date();
      if (!dryRun && now.getUTCHours() === 0 && now.getUTCMinutes() < 15) {
        await sql`DELETE FROM push_log WHERE created_at < NOW() - INTERVAL '180 days'`;
      }
      return res.status(200).json(result);
    }

    // ── opened: тап по пушу и урок после него (план, шаг 0.5) ──
    // Только своя строка журнала. Первая отметка не перезаписывается.
    if (action === 'opened' && req.method === 'POST') {
      const userId = await getAuthedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const { push_id: pushId, stage = 'opened' } = req.body || {};
      if (typeof pushId !== 'string' || !/^[0-9a-f-]{36}$/i.test(pushId)) {
        return res.status(400).json({ error: 'Invalid push_id' });
      }
      let rows;
      if (stage === 'opened') {
        rows = await sql`
          UPDATE push_log SET opened_at = COALESCE(opened_at, NOW())
          WHERE id = ${pushId}::uuid AND user_id = ${userId}::uuid RETURNING id
        `;
      } else if (stage === 'lesson_started') {
        rows = await sql`
          UPDATE push_log SET lesson_started_at = COALESCE(lesson_started_at, NOW()),
                              opened_at = COALESCE(opened_at, NOW())
          WHERE id = ${pushId}::uuid AND user_id = ${userId}::uuid RETURNING id
        `;
      } else if (stage === 'lesson_completed') {
        rows = await sql`
          UPDATE push_log SET lesson_completed_at = COALESCE(lesson_completed_at, NOW())
          WHERE id = ${pushId}::uuid AND user_id = ${userId}::uuid RETURNING id
        `;
      } else {
        return res.status(400).json({ error: 'Invalid stage' });
      }
      return res.status(200).json({ ok: rows.length > 0 });
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
