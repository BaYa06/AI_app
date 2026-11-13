/**
 * api/teacher.js — журнал уведомлений учителя, «колокольчик» (plan/new/teacher_cabinet.md,
 * Teacher 48). Записи — строки push_log категорий учителя: и ушедшие пушем, и оставшиеся только
 * в журнале (лимит, тихие часы, выключено, bell_only). Текст и ссылка лежат в payload.
 */
import { TEACHER_CATEGORIES, TEACHER_FEED_DAYS } from '../../push/_teacher.js';

/** Строка журнала → запись колокольчика; без текста (старая или чужая строка) — null */
export function notificationRow(r) {
  const p = r.payload || {};
  if (typeof p.title !== 'string' || !p.title) return null;
  return {
    id: r.id,
    type: r.type,
    title: p.title,
    body: typeof p.body === 'string' ? p.body : '',
    link: typeof p.link === 'string' ? p.link : null,
    createdAt: r.created_at,
    seen: !!(r.seen_at || r.opened_at),
    /** Ушло пушем (иначе запись только в колокольчике) */
    pushed: r.status === 'sent',
  };
}

/** GET → { notifications: [...], unseen } — за 30 дней, новые сверху */
export async function teacherNotifications(req, res, sql, userId) {
  const rows = await sql`
    SELECT id, type, status, payload, created_at, seen_at, opened_at
    FROM push_log
    WHERE user_id = ${userId}::uuid
      AND category = ANY(${TEACHER_CATEGORIES}::text[])
      AND created_at > NOW() - make_interval(days => ${TEACHER_FEED_DAYS})
    ORDER BY created_at DESC
    LIMIT 100
  `;
  const notifications = rows.map(notificationRow).filter(Boolean);
  return res.status(200).json({
    ok: true,
    notifications,
    unseen: notifications.filter((n) => !n.seen).length,
  });
}

/** POST → отметить все записи просмотренными (открыли список колокольчика) */
export async function teacherNotificationsSeen(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const rows = await sql`
    UPDATE push_log SET seen_at = NOW()
    WHERE user_id = ${userId}::uuid
      AND category = ANY(${TEACHER_CATEGORIES}::text[])
      AND seen_at IS NULL
      AND created_at > NOW() - make_interval(days => ${TEACHER_FEED_DAYS})
    RETURNING id
  `;
  return res.status(200).json({ ok: true, seen: rows.length });
}
