/**
 * api/data.js — «Написать нам» и переписка по обращению (Clean 10 — перенесено без изменений).
 */
import { HttpError, uuid } from '../../_access.js';
import { optString } from './_shared.js';

export const FEEDBACK_CATEGORIES = new Set(['problem', 'idea', 'question']);

export const FEEDBACK_TAGS = new Set(['speech', 'cards', 'tests', 'courses', 'sync', 'other']);

export const FEEDBACK_DAILY_LIMIT = 10;

/**
 * «Написать нам» (kind = message) и окно оценки (kind = rating). Смотрится в админке и в «Моих обращениях».
 * Роль берём из БД, а не из запроса; данные устройства — как прислало приложение (только для справки).
 */
export async function submitFeedback(sql, me, p) {
  const kind = p.kind;
  if (kind !== 'message' && kind !== 'rating') throw new HttpError(400, 'Invalid kind');

  const message = optString(p.message, 4000)?.trim() || null;
  let category = null;
  let rating = null;
  let hasProblem = null;
  let tags = null;

  if (kind === 'message') {
    category = FEEDBACK_CATEGORIES.has(p.category) ? p.category : null;
    if (!category) throw new HttpError(400, 'Invalid category');
    if (!message || message.length < 3) throw new HttpError(400, 'Message required');
  } else {
    rating = Number(p.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      throw new HttpError(400, 'Invalid rating');
    hasProblem = typeof p.hasProblem === 'boolean' ? p.hasProblem : null;
    tags = Array.isArray(p.tags) ? [...new Set(p.tags.filter((t) => FEEDBACK_TAGS.has(t)))] : null;
    if (tags && tags.length === 0) tags = null;
  }

  await assertFeedbackLimit(sql, me);

  const roleRows = await sql`SELECT teacher FROM users WHERE id = ${me}::uuid`;
  const role = roleRows[0]?.teacher === true ? 'teacher' : 'student';

  const rows = await sql`
    INSERT INTO app_feedback (user_id, kind, category, rating, has_problem, tags, message,
                              app_version, platform, os_version, user_role)
    VALUES (${me}::uuid, ${kind}, ${category}, ${rating}, ${hasProblem}, ${tags}, ${message},
            ${optString(p.appVersion, 20)}, ${optString(p.platform, 10)}, ${optString(p.osVersion, 40)}, ${role})
    RETURNING id
  `;
  // Старые версии приложения ждут ровно true — id отдаём только тем, кто о нём попросил
  return p.returnId === true ? { id: rows[0].id } : true;
}

/** Общий дневной лимит: новые обращения и дописки в переписку считаются вместе */
export async function assertFeedbackLimit(sql, me) {
  const recent = await sql`
    SELECT
      (SELECT count(*) FROM app_feedback
        WHERE user_id = ${me}::uuid AND created_at > NOW() - INTERVAL '1 day')
      + (SELECT count(*) FROM app_feedback_replies r JOIN app_feedback f ON f.id = r.feedback_id
        WHERE f.user_id = ${me}::uuid AND r.author = 'user' AND r.created_at > NOW() - INTERVAL '1 day')
      AS n
  `;
  if (Number(recent[0].n) >= FEEDBACK_DAILY_LIMIT)
    throw new HttpError(429, 'Too many messages today');
}

// ==================== МОИ ОБРАЩЕНИЯ (plan/new/support_threads.md) ====================

/**
 * Статус для пользователя: answered — есть ответ команды, который он ещё не открыл;
 * sent — мы ещё не открыли (или он дописал после нашего ответа); read — прочитано.
 */
export const FEEDBACK_USER_STATUS = `
  CASE
    WHEN f.last_admin_reply_at IS NOT NULL AND f.last_admin_reply_at > COALESCE(f.user_seen_at, '-infinity'::timestamptz) THEN 'answered'
    WHEN f.status = 'new' THEN 'sent'
    ELSE 'read'
  END`;

/** Свои обращения, новые сверху. preview — последнее сообщение ветки (или само обращение). */
export async function myFeedback(sql, me) {
  const rows = await sql.query(
    `
    SELECT f.id, f.kind, f.category, f.rating, f.has_problem, f.tags, f.created_at, f.last_message_at,
           f.status = 'closed' AS closed,
           ${FEEDBACK_USER_STATUS} AS user_status,
           COALESCE(last.message, f.message) AS preview,
           last.author AS preview_author
    FROM app_feedback f
    LEFT JOIN LATERAL (
      SELECT r.message, r.author FROM app_feedback_replies r
      WHERE r.feedback_id = f.id ORDER BY r.created_at DESC LIMIT 1
    ) last ON true
    WHERE f.user_id = $1::uuid
    ORDER BY f.last_message_at DESC
    LIMIT 100
  `,
    [me]
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    category: r.category,
    rating: r.rating,
    hasProblem: r.has_problem,
    tags: r.tags,
    preview: r.preview,
    previewAuthor: r.preview_author || 'user',
    status: r.user_status,
    closed: r.closed,
    createdAt: r.created_at,
    lastMessageAt: r.last_message_at,
  }));
}

export async function loadOwnFeedback(sql, me, id) {
  const rows = await sql`
    SELECT id, kind, category, rating, has_problem, tags, message, status, read_at, created_at
    FROM app_feedback WHERE id = ${id}::uuid AND user_id = ${me}::uuid
  `;
  // Чужое и несуществующее неотличимы
  if (!rows[0]) throw new HttpError(404, 'Not found');
  return rows[0];
}

/** Одна своя переписка. Открытие считается прочтением ответа команды (бейдж в профиле гаснет). */
export async function feedbackThread(sql, me, p) {
  const f = await loadOwnFeedback(sql, me, uuid(p.id, 'id'));
  const [replies] = await Promise.all([
    sql`SELECT author, message, created_at FROM app_feedback_replies
        WHERE feedback_id = ${f.id}::uuid ORDER BY created_at`,
    sql`UPDATE app_feedback SET user_seen_at = NOW() WHERE id = ${f.id}::uuid`,
  ]);
  const messages = [
    ...(f.message ? [{ author: 'user', message: f.message, createdAt: f.created_at }] : []),
    ...replies.map((r) => ({ author: r.author, message: r.message, createdAt: r.created_at })),
  ];
  return {
    id: f.id,
    kind: f.kind,
    category: f.category,
    rating: f.rating,
    hasProblem: f.has_problem,
    tags: f.tags,
    closed: f.status === 'closed',
    readAt: f.read_at,
    createdAt: f.created_at,
    messages,
  };
}

/** Дописать в своё обращение: оно снова ждёт ответа в админке (в т.ч. закрытое). */
export async function replyFeedback(sql, me, p) {
  const f = await loadOwnFeedback(sql, me, uuid(p.id, 'id'));
  const message = optString(p.message, 4000)?.trim();
  if (!message) throw new HttpError(400, 'Message required');
  await assertFeedbackLimit(sql, me);
  const rows = await sql`
    INSERT INTO app_feedback_replies (feedback_id, author, message)
    VALUES (${f.id}::uuid, 'user', ${message})
    RETURNING created_at
  `;
  await sql`
    UPDATE app_feedback SET status = 'new', last_message_at = ${rows[0].created_at}, user_seen_at = NOW()
    WHERE id = ${f.id}::uuid
  `;
  return { author: 'user', message, createdAt: rows[0].created_at };
}

/** Сколько обращений с непрочитанным ответом команды — бейдж «Мои обращения» в профиле */
export async function feedbackUnreadCount(sql, me) {
  const rows = await sql`
    SELECT count(*)::int AS n FROM app_feedback
    WHERE user_id = ${me}::uuid AND last_admin_reply_at IS NOT NULL
      AND last_admin_reply_at > COALESCE(user_seen_at, '-infinity'::timestamptz)
  `;
  return rows[0].n;
}

// ==================== АДМИНКА (/admin) ====================
