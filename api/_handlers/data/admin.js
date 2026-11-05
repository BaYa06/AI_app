/**
 * api/data.js — админка обращений (Clean 10 — перенесено без изменений).
 */
import { HttpError, uuid } from '../../_access.js';
import {
  getAdminStats,
  getAdminFeedback,
  markAdminFeedbackRead,
  getAdminFeedbackThread,
  replyAdminFeedback,
  closeAdminFeedback,
} from '../../_admin.js';
import { log } from '../../_log.js';
import { optString } from './_shared.js';

/** Только для users.is_admin — тот же признак, что у каталога книг (api/books.js). */
export async function assertAdmin(sql, me) {
  const rows = await sql`SELECT is_admin FROM users WHERE id = ${me}::uuid`;
  if (rows[0]?.is_admin !== true) throw new HttpError(403, 'Admins only');
}

export async function adminDashboard(sql, me) {
  await assertAdmin(sql, me);
  const [stats, feedback] = await Promise.all([getAdminStats(sql), getAdminFeedback(sql)]);
  return { stats, feedback };
}

export async function adminMarkFeedbackRead(sql, me, p) {
  await assertAdmin(sql, me);
  return markAdminFeedbackRead(sql, uuid(p.id, 'id'));
}

export async function adminFeedbackThread(sql, me, p) {
  await assertAdmin(sql, me);
  const thread = await getAdminFeedbackThread(sql, uuid(p.id, 'id'));
  if (!thread) throw new HttpError(404, 'Not found');
  return thread;
}

export async function adminReplyFeedback(sql, me, p) {
  await assertAdmin(sql, me);
  const message = optString(p.message, 4000)?.trim();
  if (!message) throw new HttpError(400, 'Message required');
  const reply = await replyAdminFeedback(sql, me, uuid(p.id, 'id'), message, {
    close: p.close === true,
  });
  if (!reply) throw new HttpError(404, 'Not found');
  // Пуш — по галочке в админке; результат показываем рядом с ответом (ночью уйдёт утром, старой версии — нет)
  let push = null;
  if (p.push !== false && reply.user_id) {
    try {
      const { sendNotification } = await import('./push.js');
      const r = await sendNotification(sql, reply.user_id, 'support_reply', {
        feedbackId: p.id,
        text: message,
      });
      push = { ok: r.ok === true, reason: r.reason || r.error || null };
    } catch (e) {
      log.error('data', 'support_reply push failed', e);
      push = { ok: false, reason: 'error' };
    }
  }
  return { ...reply, push };
}

export async function adminCloseFeedback(sql, me, p) {
  await assertAdmin(sql, me);
  return closeAdminFeedback(sql, uuid(p.id, 'id'));
}

// ==================== УДАЛЕНИЕ АККАУНТА ====================
