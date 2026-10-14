/**
 * Отправка push-уведомлений и журнал push_log (plan/push_notifications.md, этапы 0 и 2).
 * Файл начинается с «_», поэтому Vercel не публикует его как отдельный роут.
 *
 * sendNotification — один пуш одному человеку (учитель, data.js, notify, отложенные из тихих часов).
 * Массовая ежедневная рассылка — арбитр (_arbiter.js), он шлёт пачками и пишет журнал сам.
 */
import { randomUUID } from 'node:crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { PUSH_TYPES, pushType, buildPush } from './_registry.js';
import { disabledCategories, isHoldout } from './_decide.js';

export const DEFAULT_TZ = 'Asia/Bishkek';
/** Тихие часы (принцип 2): с 22:00 до 8:00 по поясу пользователя ничего не шлём, даже от учителя */
export const QUIET_FROM_HOUR = 22;
export const QUIET_TO_HOUR = 8;
/** Младше 18 (возраст из «о себе», 2.7) — тихие часы с 21:00 */
export const MINOR_QUIET_FROM_HOUR = 21;

export function isQuietHour(localHour, minor = false) {
  return localHour >= (minor ? MINOR_QUIET_FROM_HOUR : QUIET_FROM_HOUR) || localHour < QUIET_TO_HOUR;
}

export function initFirebase() {
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  }
  return getMessaging();
}

/** Аварийный выключатель: PUSH_PAUSED=1 в переменных Vercel останавливает маркетинговые пуши без правки кода. */
export function isPushPaused() {
  return process.env.PUSH_PAUSED === '1';
}

/** Мёртвый токен: приложение удалено или разрешение отозвано — удаляем из push_tokens */
export function isDeadTokenError(code) {
  return code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token';
}

/** Выключенные переключатели (2.4) с учётом старого флага notif_streak («Напоминания о серии») */
export function groupsOff(categoriesOff, notifStreak) {
  const off = new Set(categoriesOff || []);
  if (notifStreak === false) off.add('streak');
  return [...off];
}

/**
 * Строка push_log на каждое решение (шаг 0.3). Журнал не должен ронять отправку: ошибку
 * только логируем. local_date — по поясу пользователя, как у остальных дневных отметок.
 */
export async function logPush(sql, { id, userId, type, status, tokens = 0, delivered = 0, data, variant = null }) {
  try {
    await sql`
      INSERT INTO push_log (id, user_id, type, category, variant, local_date, status, tokens, delivered, payload)
      VALUES (
        ${id}, ${userId}, ${type}, ${pushType(type)?.category || 'other'}, ${variant},
        (NOW() AT TIME ZONE COALESCE((SELECT timezone FROM user_stats WHERE user_id = ${userId}), ${DEFAULT_TZ}))::date,
        ${status}, ${tokens}, ${delivered}, ${JSON.stringify(data || {})}::jsonb
      )
    `;
  } catch (e) {
    console.error('[push] push_log insert failed:', e);
  }
}

/**
 * Отправить пуш пользователю на все его устройства. Каждое решение (и отказ) пишется в push_log;
 * id строки уходит в пуш как data.push_id. Порядок проверок: токены → выключено всё → категория →
 * текст → контрольная группа → пауза → тихие часы (отложить до 8:00) → dryRun → отправка.
 * dryRun — пройти все проверки и собрать текст, но не отправлять (status = 'dry_run').
 * → { ok, push_id?, sent?, failed?, reason?, message?, error? }
 */
export async function sendNotification(sql, userId, type, data = {}, { dryRun = false } = {}) {
  const def = pushType(type);
  if (!def) return { ok: false, error: `Unknown type: ${type}` };
  const pushId = randomUUID();
  const log = (status, extra = {}) => logPush(sql, { id: pushId, userId, type, status, data, ...extra });

  const allTokens = await sql`SELECT token, permission FROM push_tokens WHERE user_id = ${userId}`;
  if (allTokens.length === 0) {
    await log('no_token');
    return { ok: false, push_id: pushId, reason: 'no token' };
  }
  // Выключил уведомления в iOS (шаг 1.4) — на это устройство не шлём
  const tokenRows = allTokens.filter((r) => r.permission !== 'denied');
  if (tokenRows.length === 0) {
    await log('denied');
    return { ok: false, push_id: pushId, reason: 'permission denied' };
  }

  const [user] = await sql`
    SELECT u.display_name, us.current_streak, us.longest_streak, us.notif_enabled, us.notif_streak,
           us.notif_categories_off, u.age_range IN ('under13', '13-17') AS minor, h.sec_per_answer,
           EXTRACT(HOUR FROM NOW() AT TIME ZONE COALESCE(us.timezone, ${DEFAULT_TZ}))::int AS local_hour
    FROM user_stats us JOIN users u ON u.id = us.user_id
    LEFT JOIN user_habits h ON h.user_id = us.user_id
    WHERE us.user_id = ${userId}
  `;
  if (!user?.notif_enabled) {
    await log('disabled');
    return { ok: false, push_id: pushId, reason: 'notifications disabled' };
  }
  if (disabledCategories(groupsOff(user.notif_categories_off, user.notif_streak)).has(def.category)) {
    await log('category_off');
    return { ok: false, push_id: pushId, reason: 'category off' };
  }

  const built = buildPush(type, {
    userId,
    name: user.display_name || 'Привет',
    displayName: user.display_name || null,
    streak: user.current_streak,
    longest: user.longest_streak,
    secPerAnswer: user.sec_per_answer,
    data,
  });
  // Текст без числа и имени (не пришли данные) не отправляем — принцип 3 плана
  if (!built) {
    await log('no_specifics');
    return { ok: false, push_id: pushId, reason: 'no specifics' };
  }
  const message = { title: built.title, body: built.body };
  const logBuilt = (status, extra = {}) => log(status, { variant: built.variant, ...extra });

  if (!def.transactional && isHoldout(userId)) {
    await logBuilt('holdout');
    return { ok: false, push_id: pushId, reason: 'holdout', message };
  }
  if (isPushPaused() && !def.transactional) {
    await logBuilt('paused');
    return { ok: false, push_id: pushId, reason: 'paused', message };
  }
  // Ночью не будим: строку с данными подхватит арбитр, когда у человека наступит 8:00
  if (!dryRun && isQuietHour(user.local_hour, user.minor === true)) {
    await logBuilt('quiet_hours');
    return { ok: false, push_id: pushId, reason: 'quiet_hours', message };
  }
  if (dryRun) {
    await logBuilt('dry_run', { tokens: tokenRows.length });
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
      data: { type, url: '/', push_id: pushId, link: built.link },
      apns: { payload: { aps: { sound: 'default' } } },
    });
  } catch (e) {
    await logBuilt('failed', { tokens: tokens.length });
    throw e;
  }
  const dead = tokens.filter((_, i) => isDeadTokenError(result.responses[i].error?.code));
  if (dead.length) await sql`DELETE FROM push_tokens WHERE token = ANY(${dead})`;
  await logBuilt(result.successCount > 0 ? 'sent' : 'failed', { tokens: tokens.length, delivered: result.successCount });
  return { ok: result.successCount > 0, push_id: pushId, sent: result.successCount, failed: result.failureCount };
}

export { PUSH_TYPES };
