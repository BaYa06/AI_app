/**
 * api/test.js — Общие проверки и помощники (Clean 10 — перенесено без изменений).
 */
import { log } from '../../_log.js';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yiwsmjbeirgomkrckoju.supabase.co';
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

/**
 * Отправить broadcast-событие в Supabase Realtime. topicSuffix — для канала экрана теста
 * ученика (`:exam`, см. broadcastTestFinished).
 */
export async function broadcast(sessionId, event, payload, topicSuffix = '') {
  return new Promise((resolve) => {
    try {
      const supabase = getSupabase();
      const channel = supabase.channel(`test:${sessionId}${topicSuffix}`);

      const timeout = setTimeout(() => {
        log.error('test', `Broadcast ${event} timed out`);
        supabase.removeChannel(channel).catch(() => {});
        resolve();
      }, 5000);

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          try {
            await channel.send({ type: 'broadcast', event, payload });
          } catch (e) {
            log.error('test', `Broadcast send ${event} failed`, e);
          }
          await supabase.removeChannel(channel).catch(() => {});
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          log.error('test', `Broadcast channel error for ${event}: ${status}`);
          await supabase.removeChannel(channel).catch(() => {});
          resolve();
        }
      });
    } catch (e) {
      log.error('test', `Broadcast ${event} failed`, e);
      resolve();
    }
  });
}

/**
 * test_finished — и в общий канал (учитель, экран ожидания), и в `test:${id}:exam`, который
 * слушает экран теста ученика. Экран теста не может подписаться на общий канал: supabase-js
 * отдаёт на одно имя один объект, и отписка экрана ожидания при переходе сняла бы подписку
 * экрана теста. Раньше событие в `:exam` не отправлялось вовсе, и ученик не узнавал, что
 * учитель завершил тест (plan/done/exam_lockdown.md, Exam 3).
 */
export async function broadcastTestFinished(sessionId) {
  const payload = { finishedAt: new Date().toISOString() };
  await Promise.all([
    broadcast(sessionId, 'test_finished', payload),
    broadcast(sessionId, 'test_finished', payload, ':exam'),
  ]);
}

/** Сколько секунд в фоне прощается (случайный жест «домой»). Время считает сервер, не клиент. */
export const AWAY_GRACE_SEC = 3;

/** Итог попытки для клиента ученика (экран «Тест завершён»). */
export function attemptSummary(p) {
  const total = p.question_order?.length || 0;
  return {
    left: Boolean(p.left_reason),
    leftReason: p.left_reason || null,
    answered: p.answer_count,
    correct: p.correct_count,
    total,
    score: p.score ?? (total > 0 ? Math.round((p.correct_count / total) * 100) : 0),
  };
}

/**
 * Досрочно завершить попытку участника с причиной (manual | background | relaunch).
 * Неотвеченные вопросы засчитываются как неверные — та же формула score, что в finishTest.
 * Возвращает обновлённую строку или null, если попытка уже была завершена.
 */
export async function finishParticipantEarly(sql, participantId, reason) {
  const rows = await sql`
    UPDATE test_participants
    SET finished_at = NOW(),
        left_reason = ${reason},
        away_at = NULL,
        score = CASE
          WHEN question_order IS NOT NULL AND jsonb_array_length(question_order) > 0
          THEN ROUND((correct_count::numeric / jsonb_array_length(question_order)) * 100)
          ELSE 0
        END
    WHERE id = ${participantId}::uuid AND finished_at IS NULL
    RETURNING session_id, user_id, display_name, answer_count, correct_count, question_order,
              score, left_reason
  `;
  if (rows.length === 0) return null;
  const p = rows[0];
  // Тот же progress_update, что после ответа: LiveTestScreen уже умеет done, left — новое поле.
  await broadcast(p.session_id, 'progress_update', {
    userId: p.user_id,
    displayName: p.display_name,
    answered: p.answer_count,
    total: p.question_order?.length || 0,
    done: true,
    left: true,
    leftReason: reason,
  });
  return p;
}
