/**
 * Пуши учителю (plan/new/teacher_cabinet.md, этап 4, Teacher 45). Отдельная категория: свой лимит
 * (не больше 2 в день), тихие часы — по поясу курса, серверный выключатель TEACHER_PUSH_ENABLED.
 * Файл начинается с «_», поэтому Vercel не публикует его как отдельный роут.
 *
 * Каждое уведомление — одна строка push_log с текстом и ссылкой в payload: она остаётся и когда
 * пуш не ушёл (лимит, тихие часы, выключено, только колокольчик) — это журнал колокольчика.
 * Ученические пуши (арбитр, sendNotification) учителю как и раньше не идут, а его пуши не
 * считаются в ученическом дневном лимите.
 */
import { randomUUID } from 'node:crypto';
import { buildPush, pushType, versionAtLeast } from './_registry.js';
import { disabledCategories } from './_decide.js';
import {
  DEFAULT_TZ,
  groupsOff,
  initFirebase,
  isAllowedRecipient,
  isDeadTokenError,
  isQuietHour,
  logPush,
} from './_send.js';
import { log as logger } from '../_log.js';

/** Не больше стольких пушей учителю в день (решение 1 этапа 4) */
export const TEACHER_PUSH_DAILY_LIMIT = 2;
/** Сколько дней колокольчик хранит записи */
export const TEACHER_FEED_DAYS = 30;

/** Серверный выключатель: на staging — включён, прод — по команде */
export function teacherPushEnabled() {
  const v = process.env.TEACHER_PUSH_ENABLED;
  return v === '1' || v === 'true';
}

/** Категории пушей учителя — они же переключатели в настройках (Teacher 50) */
export const TEACHER_CATEGORIES = ['teacher_lesson', 'teacher_week', 'teacher_students'];
export function isTeacherCategory(category) {
  return TEACHER_CATEGORIES.includes(category);
}

/**
 * Кому можно отправить. База тестового сервера — копия рабочей с настоящими токенами, поэтому вне
 * прода без белого списка PUSH_ALLOWLIST не шлём никому (запись в колокольчике остаётся).
 */
export function teacherRecipientAllowed(userId, env = process.env) {
  if (env.VERCEL_ENV && env.VERCEL_ENV !== 'production' && !env.PUSH_ALLOWLIST) return false;
  return isAllowedRecipient(userId);
}

/**
 * Что делать с уведомлением — чистая функция. 'send' — отправить пуш; остальное — причина,
 * по которой запись остаётся только в колокольчике (она же статус строки push_log).
 * c: { bellOnly, enabled, notifEnabled, categoryOff, sentToday, localHour, tokens, freshTokens }
 */
export function teacherPushDecision(c) {
  if (c.bellOnly) return 'bell_only';
  if (!c.enabled) return 'teacher_off';
  if (!c.notifEnabled) return 'disabled';
  if (c.categoryOff) return 'category_off';
  if (c.tokens === 0) return 'no_token';
  if (c.freshTokens === 0) return 'old_app';
  if (c.sentToday >= TEACHER_PUSH_DAILY_LIMIT) return 'teacher_limit';
  if (isQuietHour(c.localHour)) return 'teacher_quiet';
  return 'send';
}

/**
 * Уведомление учителю: запись в журнал + пуш, если можно. dedupe — ключ «не чаще одного раза»
 * (урок, неделя, задание): вторая запись с тем же ключом не создаётся.
 * timezone — пояс курса (тихие часы и «сегодня» для лимита).
 * → { status, pushId? } ; status: sent | failed | duplicate | no_specifics | причина из teacherPushDecision
 */
export async function notifyTeacher(sql, teacherId, type, data = {}, { dedupe, timezone } = {}) {
  const def = pushType(type);
  if (!def || !isTeacherCategory(def.category)) return { status: 'unknown_type' };

  if (dedupe) {
    const seen = await sql`
      SELECT 1 FROM push_log
      WHERE user_id = ${teacherId}::uuid AND type = ${type} AND payload->>'dedupe' = ${dedupe}
      LIMIT 1
    `;
    if (seen.length > 0) return { status: 'duplicate' };
  }

  const [user] = await sql`
    SELECT u.display_name, us.notif_enabled, us.notif_streak, us.notif_categories_off,
      EXTRACT(HOUR FROM NOW() AT TIME ZONE COALESCE(${timezone || null}, us.timezone, ${DEFAULT_TZ}))::int AS local_hour,
      (SELECT COUNT(*)::int FROM push_log p
        WHERE p.user_id = u.id AND p.status = 'sent' AND p.category = ANY(${TEACHER_CATEGORIES}::text[])
          AND p.local_date = (NOW() AT TIME ZONE COALESCE(us.timezone, ${DEFAULT_TZ}))::date) AS sent_today
    FROM users u LEFT JOIN user_stats us ON us.user_id = u.id
    WHERE u.id = ${teacherId}::uuid
  `;
  if (!user) return { status: 'unknown_user' };

  const built = buildPush(type, {
    userId: teacherId,
    name: user.display_name || '',
    displayName: user.display_name || null,
    data,
  });
  // Правило реестра: без числа или имени текст не собирается — нет и записи в колокольчике
  if (!built) return { status: 'no_specifics' };

  const tokens =
    await sql`SELECT token, permission, app_version FROM push_tokens WHERE user_id = ${teacherId}::uuid`;
  const usable = tokens.filter((r) => r.permission !== 'denied');
  const fresh = def.minAppVersion
    ? usable.filter((r) => versionAtLeast(r.app_version, def.minAppVersion))
    : usable;

  const decision = teacherPushDecision({
    bellOnly: def.bellOnly === true,
    enabled: teacherPushEnabled(),
    // Нет строки user_stats — настройки по умолчанию (уведомления включены)
    notifEnabled: user.notif_enabled !== false,
    categoryOff: disabledCategories(groupsOff(user.notif_categories_off, user.notif_streak)).has(
      def.category
    ),
    sentToday: user.sent_today || 0,
    localHour: user.local_hour,
    tokens: usable.length,
    freshTokens: fresh.length,
  });

  const pushId = randomUUID();
  // Текст и ссылка — в payload: колокольчик показывает запись без пересборки (решение 3)
  const payload = {
    ...data,
    title: built.title,
    body: built.body,
    link: built.link,
    ...(dedupe ? { dedupe } : {}),
  };
  const write = (status, extra = {}) =>
    logPush(sql, {
      id: pushId,
      userId: teacherId,
      type,
      status,
      data: payload,
      variant: built.variant,
      ...extra,
    });

  if (decision !== 'send') {
    await write(decision);
    return { status: decision, pushId };
  }
  if (!teacherRecipientAllowed(teacherId)) {
    await write('not_allowlisted');
    return { status: 'not_allowlisted', pushId };
  }

  const list = fresh.map((r) => r.token);
  let result;
  try {
    result = await initFirebase().sendEachForMulticast({
      tokens: list,
      notification: { title: built.title, body: built.body },
      data: { type, url: '/', push_id: pushId, link: built.link },
      apns: { payload: { aps: { sound: 'default' } } },
    });
  } catch (e) {
    logger.error('push', `teacher push ${type} failed`, e);
    await write('failed', { tokens: list.length });
    return { status: 'failed', pushId };
  }
  const dead = list.filter((_, i) => isDeadTokenError(result.responses[i].error?.code));
  if (dead.length) await sql`DELETE FROM push_tokens WHERE token = ANY(${dead})`;
  const status = result.successCount > 0 ? 'sent' : 'failed';
  await write(status, { tokens: list.length, delivered: result.successCount });
  return { status, pushId };
}
