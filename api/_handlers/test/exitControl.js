/**
 * api/test.js — контроль выхода из приложения во время теста (plan/done/exam_lockdown.md) (Clean 10 — перенесено без изменений).
 */
import { broadcast, AWAY_GRACE_SEC, attemptSummary, finishParticipantEarly } from './_shared.js';

/**
 * Участник вызывающего + его сессия. Возвращает null и уже отправленный ответ при ошибке —
 * participantId должен принадлежать вызывающему (как в answerQuestion).
 */
export async function loadOwnParticipant(req, res, sql, userId) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return null;
  }
  const { participantId } = req.body || {};
  if (!participantId) {
    res.status(400).json({ error: 'participantId is required' });
    return null;
  }
  const rows = await sql`
    SELECT p.id, p.session_id, p.user_id, p.display_name, p.answer_count, p.correct_count,
           p.question_order, p.finished_at, p.left_reason, p.away_at, p.score,
           s.status AS session_status, s.exit_control
    FROM test_participants p
    JOIN test_sessions s ON s.id = p.session_id
    WHERE p.id = ${participantId}::uuid
  `;
  if (rows.length === 0) {
    res.status(404).json({ error: 'Participant not found' });
    return null;
  }
  if (rows[0].user_id !== userId) {
    res.status(403).json({ error: 'Not authorized for this participant' });
    return null;
  }
  return rows[0];
}

/**
 * POST ?action=away
 * Body: { participantId, reason? }  — reason: 'background' (по умолчанию) | 'split'
 * Приложение ученика ушло в фон или открыто рядом с другим (iPad Split View). Отметка времени
 * ставится один раз (повтор её не сдвигает). reason только для учителя, на правила не влияет.
 */
export async function markAway(req, res, sql, userId) {
  const p = await loadOwnParticipant(req, res, sql, userId);
  if (!p) return;
  if (!p.exit_control || p.session_status !== 'active' || p.finished_at) {
    return res.status(200).json({ ok: true, tracked: false });
  }

  const rows = await sql`
    UPDATE test_participants
    SET away_at = NOW()
    WHERE id = ${p.id}::uuid AND finished_at IS NULL AND away_at IS NULL
    RETURNING id
  `;
  if (rows.length > 0) {
    const reason = req.body.reason === 'split' ? 'split' : 'background';
    await broadcast(p.session_id, 'student_away', {
      userId: p.user_id,
      displayName: p.display_name,
      reason,
    });
  }
  return res.status(200).json({ ok: true, tracked: true });
}

/**
 * POST ?action=back
 * Body: { participantId }
 * Приложение ученика вернулось из фона. Сервер сам считает, сколько ученик отсутствовал:
 * ≤ AWAY_GRACE_SEC — продолжает (away_count + 1), дольше — попытка завершается. Если `away`
 * не дошёл (нет сети, JS усыпили), а клиент сообщает о возврате из фона — это тоже выход.
 */
export async function markBack(req, res, sql, userId) {
  const p = await loadOwnParticipant(req, res, sql, userId);
  if (!p) return;

  if (p.finished_at) {
    return res.status(200).json({ continue: false, ...attemptSummary(p) });
  }
  if (!p.exit_control || p.session_status !== 'active') {
    return res.status(200).json({ continue: true });
  }

  // Возврат в пределах льготы: условие по времени — в самом UPDATE, без гонки с повторным away.
  // Время отсутствия — по часам БД (old.away_at — значение до UPDATE).
  const forgiven = await sql`
    WITH old AS (SELECT away_at FROM test_participants WHERE id = ${p.id}::uuid)
    UPDATE test_participants
    SET away_count = away_count + 1, away_at = NULL
    WHERE id = ${p.id}::uuid AND finished_at IS NULL AND away_at IS NOT NULL
      AND away_at >= NOW() - make_interval(secs => ${AWAY_GRACE_SEC})
    RETURNING away_count, ROUND(EXTRACT(EPOCH FROM (NOW() - (SELECT away_at FROM old))))::int AS away_sec
  `;
  if (forgiven.length > 0) {
    await broadcast(p.session_id, 'student_back', {
      userId: p.user_id,
      awaySec: forgiven[0].away_sec,
      awayCount: forgiven[0].away_count,
    });
    return res.status(200).json({ continue: true, awayCount: forgiven[0].away_count });
  }

  const finished = await finishParticipantEarly(sql, p.id, 'background');
  if (!finished) {
    // Параллельно завершился другим запросом (учитель, автозавершение) — вернуть итог как есть.
    const [row] = await sql`
      SELECT answer_count, correct_count, question_order, score, left_reason
      FROM test_participants WHERE id = ${p.id}::uuid
    `;
    return res.status(200).json({ continue: false, ...attemptSummary(row) });
  }
  return res.status(200).json({ continue: false, ...attemptSummary(finished) });
}

/**
 * POST ?action=leave
 * Body: { participantId }
 * Ученик подтвердил «Завершить тест» — результат сразу уходит учителю. Работает и без
 * exit_control: кнопка завершения есть в любом тесте.
 */
export async function leaveTest(req, res, sql, userId) {
  const p = await loadOwnParticipant(req, res, sql, userId);
  if (!p) return;

  if (p.finished_at) {
    return res.status(200).json(attemptSummary(p));
  }
  if (p.session_status !== 'active') {
    return res.status(409).json({ error: 'Test not active' });
  }

  const finished = await finishParticipantEarly(sql, p.id, 'manual');
  if (!finished) {
    const [row] = await sql`
      SELECT answer_count, correct_count, question_order, score, left_reason
      FROM test_participants WHERE id = ${p.id}::uuid
    `;
    return res.status(200).json(attemptSummary(row));
  }
  return res.status(200).json(attemptSummary(finished));
}
