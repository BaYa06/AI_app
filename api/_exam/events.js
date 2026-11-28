/**
 * Журнал событий экзамена (plan/new/web_cabinet.md, Web 22; таблица exam_events, миграция 056).
 *
 * Зачем: учитель в вебе должен видеть, что происходило с учениками, — «не смог войти: старая версия
 * приложения» (426 раньше ничего не писал), «вышел из приложения», пауза, +время, возврат.
 * Запись — «с оглядкой»: любая ошибка только в лог, экзамен из-за журнала ломаться не должен.
 */
import { log } from '../_log.js';

export const EVENT_KINDS = [
  'old_version', // ученик пытался войти со старой версией приложения (ответ 426)
  'away', // ушёл в фон
  'back', // вернулся
  'paused', // учитель поставил паузу
  'resumed', // учитель снял паузу
  'extra_time', // учитель добавил время ученику
  'reinstated', // учитель разрешил вышедшему продолжить
];

/**
 * Записать событие. dedupeSec — не писать второй раз то же событие того же ученика, если
 * такое уже было за последние N секунд (ученик нажимает «войти» снова и снова).
 * Не бросает исключений.
 */
export async function logExamEvent(
  sql,
  { sessionId, userId = null, kind, detail = {}, dedupeSec = 0 }
) {
  if (!sessionId || !EVENT_KINDS.includes(kind)) return false;
  try {
    const json = JSON.stringify(detail || {});
    if (dedupeSec > 0) {
      await sql`
        INSERT INTO exam_events (session_id, user_id, kind, detail)
        SELECT ${sessionId}::uuid, ${userId}::uuid, ${kind}, ${json}::jsonb
        WHERE NOT EXISTS (
          SELECT 1 FROM exam_events
          WHERE session_id = ${sessionId}::uuid AND kind = ${kind}
            AND user_id IS NOT DISTINCT FROM ${userId}::uuid
            AND created_at > NOW() - make_interval(secs => ${dedupeSec})
        )
      `;
    } else {
      await sql`
        INSERT INTO exam_events (session_id, user_id, kind, detail)
        VALUES (${sessionId}::uuid, ${userId}::uuid, ${kind}, ${json}::jsonb)
      `;
    }
    return true;
  } catch (error) {
    log.warn('exam-events', 'write failed', error?.message || error);
    return false;
  }
}

/**
 * Вход со старой версией: пишем только участника курса — чужой человек с подобранным кодом
 * в журнал учителя попадать не должен.
 */
export async function logOldVersionAttempt(sql, session, userId) {
  if (!session?.id || !session?.course_id || !userId) return false;
  try {
    await sql`
      INSERT INTO exam_events (session_id, user_id, kind, detail)
      SELECT ${session.id}::uuid, ${userId}::uuid, 'old_version', '{}'::jsonb
      WHERE EXISTS (
        SELECT 1 FROM course_members
        WHERE course_id = ${session.course_id}::uuid AND user_id = ${userId}::uuid
      )
      AND NOT EXISTS (
        SELECT 1 FROM exam_events
        WHERE session_id = ${session.id}::uuid AND user_id = ${userId}::uuid
          AND kind = 'old_version' AND created_at > NOW() - INTERVAL '2 minutes'
      )
    `;
    return true;
  } catch (error) {
    log.warn('exam-events', 'old_version write failed', error?.message || error);
    return false;
  }
}
