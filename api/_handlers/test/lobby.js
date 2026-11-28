/**
 * api/test.js — лобби (код выдан, экзамен ещё не начат): отмена учителем и тихое авто-закрытие.
 *
 * Раньше открытое лобби нельзя было закрыть: finish работает только у идущего теста, и экзамен
 * без учеников вечно висел в «Идут сейчас». Теперь:
 * - POST ?action=cancel { sessionId } — учитель закрывает лобби сам;
 * - лобби, в которое LOBBY_IDLE_SEC никто не зашёл, закрывается само при следующем обращении
 *   (monitor, список экзаменов, «идущие» тесты, черновик) — без cron, как autoFinishIfStale.
 *
 * Закрыть = экзамен (engine 2) возвращается в черновик: вопросы целы, его можно открыть снова
 * с новым кодом. Быстрый тест (engine 1) черновика не имеет — строку удаляем (участники и ответы
 * удаляются каскадом). Ученикам в ожидании уходит test_finished — их экран возвращает на главную.
 */
import { broadcastTestFinished } from './_shared.js';
import { log } from '../../_log.js';

/** Сколько лобби ждёт первого ученика, прежде чем закрыться само */
export const LOBBY_IDLE_SEC = 10 * 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Закрыть одно лобби. onlyEmpty — только если никто не зашёл (авто-закрытие: ученик мог войти
 * в ту же секунду). true — закрыли; false — уже не лобби или кто-то зашёл.
 */
export async function closeLobby(sql, sessionId, engine, { onlyEmpty = false } = {}) {
  let closed;
  if (engine === 2) {
    closed = onlyEmpty
      ? await sql`
          UPDATE test_sessions SET status = 'draft', code = '0000', opened_at = NULL
          WHERE id = ${sessionId}::uuid AND status = 'waiting'
            AND NOT EXISTS (SELECT 1 FROM test_participants tp WHERE tp.session_id = ${sessionId}::uuid)
          RETURNING id
        `
      : await sql`
          UPDATE test_sessions SET status = 'draft', code = '0000', opened_at = NULL
          WHERE id = ${sessionId}::uuid AND status = 'waiting'
          RETURNING id
        `;
    // Зашедшие в лобби ученики черновику не нужны: при новом открытии лобби начнётся с нуля
    if (closed.length > 0 && !onlyEmpty) {
      await sql`DELETE FROM test_participants WHERE session_id = ${sessionId}::uuid`;
    }
  } else {
    closed = onlyEmpty
      ? await sql`
          DELETE FROM test_sessions
          WHERE id = ${sessionId}::uuid AND status = 'waiting'
            AND NOT EXISTS (SELECT 1 FROM test_participants tp WHERE tp.session_id = ${sessionId}::uuid)
          RETURNING id
        `
      : await sql`
          DELETE FROM test_sessions WHERE id = ${sessionId}::uuid AND status = 'waiting'
          RETURNING id
        `;
  }
  if (closed.length === 0) return false;
  await broadcastTestFinished(sessionId);
  return true;
}

/**
 * Закрыть пустые лобби учителя старше LOBBY_IDLE_SEC (или одно, если передан sessionId).
 * Сбой не ломает основной запрос: в худшем случае лобби закроется при следующем обращении.
 */
export async function closeIdleLobbies(sql, { teacherId = null, sessionId = null }) {
  if (!teacherId && !sessionId) return 0;
  try {
    const rows = await sql`
      SELECT ts.id, ts.engine FROM test_sessions ts
      WHERE ts.status = 'waiting'
        AND (${teacherId}::uuid IS NULL OR ts.teacher_id = ${teacherId}::uuid)
        AND (${sessionId}::uuid IS NULL OR ts.id = ${sessionId}::uuid)
        AND COALESCE(ts.opened_at, ts.created_at) < NOW() - make_interval(secs => ${LOBBY_IDLE_SEC})
        AND NOT EXISTS (SELECT 1 FROM test_participants tp WHERE tp.session_id = ts.id)
      LIMIT 20
    `;
    let n = 0;
    for (const r of rows) {
      if (await closeLobby(sql, r.id, r.engine || 1, { onlyEmpty: true })) n++;
    }
    return n;
  } catch (error) {
    log.warn('test-lobby', 'idle close failed', error?.message || error);
    return 0;
  }
}

/**
 * POST ?action=cancel  Body: { sessionId }
 * Учитель закрывает лобби. Уже закрытое (черновик / удалено) — тоже ok: результат достигнут.
 * Идущий или завершённый тест так не отменить — для него есть finish.
 * → { ok: true, status: 'draft' | 'deleted' }
 */
export async function cancelTest(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { sessionId } = req.body || {};
  if (typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) {
    return res.status(400).json({ error: 'sessionId is required' });
  }
  const rows = await sql`
    SELECT status, engine, teacher_id FROM test_sessions WHERE id = ${sessionId}::uuid
  `;
  if (rows.length === 0) return res.status(200).json({ ok: true, status: 'deleted' });
  const s = rows[0];
  if (s.teacher_id !== userId) return res.status(403).json({ error: 'Not authorized' });
  const engine = s.engine || 1;
  if (s.status === 'draft') return res.status(200).json({ ok: true, status: 'draft' });
  if (s.status !== 'waiting')
    return res.status(409).json({ error: 'not_waiting', status: s.status });

  await closeLobby(sql, sessionId, engine);
  return res.status(200).json({ ok: true, status: engine === 2 ? 'draft' : 'deleted' });
}
