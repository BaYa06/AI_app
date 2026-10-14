/**
 * Consolidated Push & Notifications API
 *
 * POST /api/push?action=subscribe       – store FCM token
 * POST /api/push?action=unsubscribe     – remove FCM token
 * GET  /api/push?action=settings        – get notif settings
 * POST /api/push?action=settings        – save notif settings
 * POST /api/push?action=notify          – send FCM push (server-to-server). Нужен NOTIFY_SECRET; не задан — ручка закрыта.
 *        Внутри сервера пуши шлются напрямую через sendNotification (teacher.js, data.js).
 * POST /api/push?action=cron-streak     – устарела (Push 0.2): ничего не шлёт, логика в cron-reminders
 * POST /api/push?action=cron-reactivation – устарела (Push 0.2): ничего не шлёт, логика в cron-reminders
 * GET|POST /api/push?action=cron-reminders – cron-job.org каждые 15 мин: одно напоминание в день в notif_hour:notif_minute
 *          &dry_run=1 — ничего не шлёт: кому, что и почему (в push_log статус dry_run)
 *          &habits=1 — пересчитать профиль привычек сейчас (иначе раз в сутки, первый запуск после 00:00 UTC)
 * Переменная PUSH_PAUSED=1 — аварийная остановка: маркетинговые пуши не уходят, от учителя уходят
 * POST /api/push?action=opened          – тап по пушу / урок после пуша (JWT): { push_id, stage? } → push_log
 * GET  /api/push?action=rewards           – diamond balance + challenges claimed today
 * POST /api/push?action=claim-reward      – claim daily challenge reward (once per day)
 */

import { neon } from '@neondatabase/serverless';
import { ensureDatabaseInitialized } from './_db-init.js';
import { getAuthedUserId, hasBearerSecret } from './_auth.js';
import { sendNotification, groupsOff, logChannelEvents } from './push/_send.js';
import { runArbiter } from './push/_arbiter.js';
import { recomputeHabits } from './push/_habits.js';
import { SETTING_GROUPS, isHoldout } from './push/_decide.js';

// teacher.js и data.js импортируют отправку отсюда
export { sendNotification };

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

const ALL_DAYS = 'mon,tue,wed,thu,fri,sat,sun';
/** Дефолт до Push 0.6 — его ставили всем, сами его не выбирали */
const LEGACY_DEFAULT_DAYS = 'mon,tue,wed,thu,fri';

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
      // Разрешение на устройстве (шаг 1.4). Старые сборки не шлют — оставляем прежнее значение.
      const permission = ['granted', 'provisional', 'denied'].includes(req.body?.permission) ? req.body.permission : null;
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
      // Разрешение отозвали в настройках iOS (5.1, отток канала): было granted/provisional, стало denied
      if (permission === 'denied' && userId) {
        const [prev] = await sql`SELECT permission FROM push_tokens WHERE token = ${token}`;
        if (prev && (prev.permission === 'granted' || prev.permission === 'provisional')) {
          await logChannelEvents(sql, [{ userId, event: 'permission_revoked' }]);
        }
      }
      await sql`
        INSERT INTO push_tokens (token, user_id, platform, permission, updated_at)
        VALUES (${token}, ${userId || null}, ${platform || 'web'}, ${permission}, NOW())
        ON CONFLICT (token) DO UPDATE SET
          user_id    = EXCLUDED.user_id,
          platform   = EXCLUDED.platform,
          permission = COALESCE(EXCLUDED.permission, push_tokens.permission),
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
        SELECT notif_enabled, notif_hour, notif_minute, notif_days, notif_days_custom, notif_streak, notif_categories_off
        FROM user_stats WHERE user_id = ${userId}
      `;
      // Контрольная группа (2.5) — для свойства GA4 push_group
      const pushGroup = isHoldout(userId) ? 'holdout' : 'push';
      if (!rows.length) {
        return res.status(200).json({
          notifEnabled: true, notifHour: 19, notifMinute: 0, notifDays: ALL_DAYS, notifStreak: true, notifCategoriesOff: [], pushGroup,
        });
      }
      const r = rows[0];
      return res.status(200).json({
        notifEnabled: r.notif_enabled,
        notifHour: r.notif_hour,
        notifMinute: r.notif_minute,
        // Дни, которые человек не выбирал сам, не фильтруют — показываем все
        notifDays: r.notif_days_custom ? r.notif_days : ALL_DAYS,
        notifStreak: r.notif_streak,
        notifCategoriesOff: groupsOff(r.notif_categories_off, r.notif_streak),
        pushGroup,
      });
    }

    // ── settings POST ──────────────────────────────────────────
    if (action === 'settings' && req.method === 'POST') {
      const { notifEnabled, notifHour, notifMinute, notifDays, notifStreak, notifDaysExplicit, notifTimeExplicit } = req.body || {};
      const userId = await settingsUserId(req, req.body?.userId);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      // cron-reminders запускается каждые 15 минут — минуты кратны 15
      const minute = Math.min(45, Math.max(0, Math.floor((Number(notifMinute) || 0) / 15) * 15));
      const days = typeof notifDays === 'string' ? notifDays : ALL_DAYS;
      // Старые сборки не шлют notifDaysExplicit и сохраняют показанный дефолт «пн–пт» — его выбором не считаем
      const daysCustom = days !== ALL_DAYS && (notifDaysExplicit === true || days !== LEGACY_DEFAULT_DAYS);
      // Переключатели «что присылать» (2.4). Старые сборки шлют только notifStreak — остальные
      // выключенные категории сохраняем, «Серию» берём из notifStreak.
      let categoriesOff;
      if (Array.isArray(req.body?.notifCategoriesOff)) {
        categoriesOff = [...new Set(req.body.notifCategoriesOff.filter((g) => Object.hasOwn(SETTING_GROUPS, g)))];
      } else {
        const [prev] = await sql`SELECT notif_categories_off FROM user_stats WHERE user_id = ${userId}`;
        categoriesOff = (prev?.notif_categories_off || []).filter((g) => g !== 'streak');
        if (notifStreak === false) categoriesOff.push('streak');
      }
      const streakOn = !categoriesOff.includes('streak');
      // Отток канала (5.1): какие переключатели выключены сейчас и выключено ли всё
      const [before] = await sql`SELECT notif_enabled, notif_categories_off, notif_streak FROM user_stats WHERE user_id = ${userId}`;
      if (before) {
        const offBefore = new Set(groupsOff(before.notif_categories_off, before.notif_streak));
        const events = categoriesOff.filter((g) => !offBefore.has(g)).map((g) => ({ userId, event: 'category_disabled', detail: g }));
        if (before.notif_enabled && notifEnabled === false) events.push({ userId, event: 'disabled_all' });
        await logChannelEvents(sql, events);
      }
      // Время выбрано самим человеком (2.9): новый клиент шлёт notifTimeExplicit; у старых — если не 19:00
      const hour = notifHour ?? 19;
      const timeCustom = notifTimeExplicit === true || (notifTimeExplicit === undefined && (hour !== 19 || minute !== 0));
      await sql`
        INSERT INTO user_stats (user_id, notif_enabled, notif_hour, notif_minute, notif_days, notif_days_custom, notif_streak, notif_categories_off, notif_time_custom)
        VALUES (${userId}, ${notifEnabled ?? true}, ${hour}, ${minute}, ${days}, ${daysCustom}, ${streakOn}, ${categoriesOff}::text[], ${timeCustom})
        ON CONFLICT (user_id) DO UPDATE SET
          notif_enabled = EXCLUDED.notif_enabled,
          notif_hour    = EXCLUDED.notif_hour,
          notif_minute  = EXCLUDED.notif_minute,
          notif_days    = EXCLUDED.notif_days,
          notif_days_custom = EXCLUDED.notif_days_custom,
          notif_streak  = EXCLUDED.notif_streak,
          notif_categories_off = EXCLUDED.notif_categories_off,
          -- Выбранное однажды время остаётся выбором; вернуть подстройку — «Мои данные» (saveAboutMe)
          notif_time_custom = user_stats.notif_time_custom OR EXCLUDED.notif_time_custom,
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
      // Раз в сутки (первый запуск после полуночи UTC): профиль привычек (2.6) — до арбитра, чтобы
      // он сразу работал со свежим; журнал храним 180 дней
      const now = new Date();
      const daily = !dryRun && now.getUTCHours() === 0 && now.getUTCMinutes() < 15;
      const habits = daily || req.query.habits === '1' ? await recomputeHabits(sql) : undefined;
      const result = await runArbiter(sql, { dryRun });
      if (daily) {
        await sql`DELETE FROM push_log WHERE created_at < NOW() - INTERVAL '180 days'`;
      }
      return res.status(200).json(habits ? { ...result, habits } : result);
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
