/**
 * api/test.js — живой тест — сторона учителя: создать, начать, монитор, завершить, результаты, история, восстановить (Clean 10 — перенесено без изменений).
 */
import { broadcast, broadcastTestFinished, AWAY_GRACE_SEC } from './_shared.js';

/** Генерация уникального 4-значного кода */
export async function generateUniqueCode(sql) {
  for (let i = 0; i < 20; i++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const existing = await sql`
      SELECT id FROM test_sessions
      WHERE code = ${code} AND status IN ('waiting', 'active')
    `;
    if (existing.length === 0) return code;
  }
  throw new Error('Could not generate unique code');
}

/**
 * Автоматически завершить сессию, которая "зависла" в active дольше расчётного времени —
 * например, если приложение учителя закрылось и finishTest никогда не был вызван. Ленивая
 * проверка при любом обращении к сессии (monitor), без отдельного cron. См. план, пункт 41.
 */
export const AUTO_FINISH_MARGIN_SEC = 120;

export const NO_TIME_LIMIT_SEC_PER_QUESTION = 60; // консервативная оценка для тестов без лимита времени

export async function autoFinishIfStale(sql, sessionId, session) {
  if (session.status !== 'active' || !session.started_at) return session;

  const perQuestion =
    session.time_per_question > 0 ? session.time_per_question : NO_TIME_LIMIT_SEC_PER_QUESTION;
  const maxDurationSec = perQuestion * session.question_count + AUTO_FINISH_MARGIN_SEC;
  const elapsedSec = (Date.now() - new Date(session.started_at).getTime()) / 1000;
  if (elapsedSec <= maxDurationSec) return session;

  await sql`
    UPDATE test_participants
    SET finished_at = NOW(),
        score = CASE
          WHEN question_order IS NOT NULL AND jsonb_array_length(question_order) > 0
          THEN ROUND((correct_count::numeric / jsonb_array_length(question_order)) * 100)
          ELSE 0
        END
    WHERE session_id = ${sessionId}::uuid AND finished_at IS NULL
  `;
  const updated = await sql`
    UPDATE test_sessions
    SET status = 'finished', finished_at = NOW()
    WHERE id = ${sessionId}::uuid AND status = 'active'
    RETURNING status, started_at, time_per_question, question_count, teacher_id
  `;
  if (updated.length > 0) {
    await broadcastTestFinished(sessionId);
    return updated[0];
  }
  return session;
}

/**
 * POST ?action=create
 * Body: { setId, courseId, testMode, questionCount, timePerQuestion, exitControl? }
 * exitControl — контроль выхода из приложения (plan/done/exam_lockdown.md). Необязательный: старые
 * версии приложения учителя его не шлют, и их тесты работают как раньше.
 */
export async function createTest(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { setId, courseId, testMode, questionCount, timePerQuestion, exitControl } = req.body;
  if (!setId || !courseId || !questionCount) {
    return res.status(400).json({ error: 'setId, courseId, questionCount are required' });
  }

  // Проверить что вызывающий — владелец курса
  const course = await sql`
    SELECT id FROM courses
    WHERE id = ${courseId}::uuid AND user_id = ${userId}::uuid
  `;
  if (course.length === 0) {
    return res.status(403).json({ error: 'Access denied: not course owner' });
  }

  const code = await generateUniqueCode(sql);

  const result = await sql`
    INSERT INTO test_sessions (teacher_id, set_id, course_id, code, test_mode, question_count, time_per_question, exit_control)
    VALUES (${userId}::uuid, ${setId}::uuid, ${courseId}::uuid, ${code}, ${testMode || 'multiple'}, ${questionCount}, ${timePerQuestion || 0}, ${exitControl === true})
    RETURNING id
  `;

  return res.status(201).json({
    sessionId: result[0].id,
    code,
    exitControl: exitControl === true,
  });
}

/**
 * POST ?action=start
 * Body: { sessionId }
 */
export async function startTest(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  // Проверить владельца
  const session = await sql`
    SELECT id FROM test_sessions
    WHERE id = ${sessionId}::uuid AND teacher_id = ${userId}::uuid AND status = 'waiting'
  `;
  if (session.length === 0) {
    return res.status(403).json({ error: 'Not authorized or test already started' });
  }

  const now = new Date().toISOString();
  await sql`
    UPDATE test_sessions
    SET status = 'active', started_at = ${now}
    WHERE id = ${sessionId}::uuid
  `;

  await broadcast(sessionId, 'test_started', { startedAt: now });

  return res.status(200).json({ ok: true, startedAt: now });
}

/**
 * GET ?action=monitor&sessionId=...
 */
export async function monitorTest(req, res, sql, userId) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { sessionId } = req.query;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  const session = await sql`
    SELECT status, started_at, time_per_question, question_count, teacher_id, exit_control
    FROM test_sessions
    WHERE id = ${sessionId}::uuid
  `;
  if (session.length === 0) {
    return res.status(404).json({ error: 'Session not found' });
  }
  const isTeacher = session[0].teacher_id === userId;
  const exitControl = session[0].exit_control;

  // Разрешено учителю — владельцу сессии, либо ученику, который уже подключился к ней
  // (раньше monitor был доступен вообще без проверки личности, см. план, пункт 39).
  if (session[0].teacher_id !== userId) {
    const membership = await sql`
      SELECT id FROM test_participants WHERE session_id = ${sessionId}::uuid AND user_id = ${userId}::uuid
    `;
    if (membership.length === 0) {
      return res.status(403).json({ error: 'Not authorized for this session' });
    }
  }

  session[0] = await autoFinishIfStale(sql, sessionId, session[0]);

  // Контроль выхода: ученик ушёл в фон и не возвращается — закрыть попытку по истечении льготы,
  // не дожидаясь его `back`, чтобы учитель сразу видел «Вышел» и мог разрешить продолжить.
  // Без broadcast: учитель получает это этим же ответом (опрос раз в 4 с).
  if (exitControl && session[0].status === 'active') {
    await sql`
      UPDATE test_participants
      SET finished_at = NOW(),
          left_reason = 'background',
          away_at = NULL,
          score = CASE
            WHEN question_order IS NOT NULL AND jsonb_array_length(question_order) > 0
            THEN ROUND((correct_count::numeric / jsonb_array_length(question_order)) * 100)
            ELSE 0
          END
      WHERE session_id = ${sessionId}::uuid AND finished_at IS NULL
        AND away_at IS NOT NULL AND away_at < NOW() - make_interval(secs => ${AWAY_GRACE_SEC})
    `;
  }

  const participants = await sql`
    SELECT user_id, display_name, answer_count, question_order, finished_at IS NOT NULL AS done,
           left_reason, away_count, away_at IS NOT NULL AS away, client_exit_control
    FROM test_participants
    WHERE session_id = ${sessionId}::uuid
    ORDER BY joined_at ASC
  `;

  return res.status(200).json({
    status: session[0].status,
    startedAt: session[0].started_at,
    timePerQuestion: session[0].time_per_question,
    questionCount: session[0].question_count,
    exitControl,
    participants: participants.map((p) => {
      const initials = (p.display_name || 'S')
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
      return {
        userId: p.user_id,
        name: p.display_name,
        initials,
        initial: (p.display_name || '?')[0].toUpperCase(),
        answered: p.answer_count,
        total: p.question_order?.length || 0,
        done: p.done,
        // Контроль выхода (plan/done/exam_lockdown.md) — только учителю: monitor доступен и
        // ученикам, а кто выходил из приложения, одноклассникам видеть незачем.
        ...(isTeacher
          ? {
              leftReason: p.left_reason || null,
              awayCount: p.away_count || 0,
              away: p.away,
              clientExitControl: p.client_exit_control,
            }
          : {}),
      };
    }),
  });
}

/**
 * POST ?action=finish
 * Body: { sessionId }
 */
export async function finishTest(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  // Проверить владельца
  const session = await sql`
    SELECT id, status FROM test_sessions
    WHERE id = ${sessionId}::uuid AND teacher_id = ${userId}::uuid
  `;
  if (session.length === 0) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  // Сессия уже могла автоматически завершиться как "зависшая" при следующем monitor-опросе
  // (см. план, пункт 41) — не считаем это ошибкой, раз результат (тест завершён) уже достигнут.
  if (session[0].status === 'finished') {
    return res.status(200).json({ ok: true });
  }
  if (session[0].status !== 'active') {
    return res.status(403).json({ error: 'Test not active' });
  }

  // Пометить незавершивших
  await sql`
    UPDATE test_participants
    SET finished_at = NOW(),
        score = CASE
          WHEN question_order IS NOT NULL AND jsonb_array_length(question_order) > 0
          THEN ROUND((correct_count::numeric / jsonb_array_length(question_order)) * 100)
          ELSE 0
        END
    WHERE session_id = ${sessionId}::uuid AND finished_at IS NULL
  `;

  // Завершить сессию
  await sql`
    UPDATE test_sessions
    SET status = 'finished', finished_at = NOW()
    WHERE id = ${sessionId}::uuid
  `;

  await broadcastTestFinished(sessionId);

  return res.status(200).json({ ok: true });
}

/**
 * GET ?action=results&sessionId=...
 */
export async function getResults(req, res, sql, userId) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { sessionId } = req.query;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  // Данные сессии
  const session = await sql`
    SELECT ts.question_count, ts.created_at, ts.teacher_id,
           cs.title AS set_title
    FROM test_sessions ts
    JOIN card_sets cs ON cs.id = ts.set_id
    WHERE ts.id = ${sessionId}::uuid
  `;
  if (session.length === 0) {
    return res.status(404).json({ error: 'Session not found' });
  }
  // Только учитель — владелец сессии (раньше результаты были доступны вообще без проверки
  // личности запрашивающего, см. план, пункт 39).
  if (session[0].teacher_id !== userId) {
    return res.status(403).json({ error: 'Not authorized for this session' });
  }

  // Участники отсортированы по score
  const participants = await sql`
    SELECT user_id, display_name, score, correct_count, question_order, finished_at IS NOT NULL AS finished,
           left_reason, away_count, client_exit_control
    FROM test_participants
    WHERE session_id = ${sessionId}::uuid
    ORDER BY score DESC, correct_count DESC
  `;

  // Средний score
  const avgScore =
    participants.length > 0
      ? Math.round(participants.reduce((sum, p) => sum + (p.score || 0), 0) / participants.length)
      : 0;

  // Самые сложные карточки
  const hardestCards = await sql`
    SELECT c.front AS word, c.back AS hint,
           COUNT(*) FILTER (WHERE NOT ta.is_correct) AS missed,
           COUNT(*) AS total
    FROM test_answers ta
    JOIN test_participants tp ON tp.id = ta.participant_id
    JOIN cards c ON c.id = ta.card_id
    WHERE tp.session_id = ${sessionId}::uuid
    GROUP BY c.id, c.front, c.back
    HAVING COUNT(*) FILTER (WHERE NOT ta.is_correct) > 0
    ORDER BY COUNT(*) FILTER (WHERE NOT ta.is_correct) DESC
    LIMIT 5
  `;

  return res.status(200).json({
    setTitle: session[0].set_title,
    date: session[0].created_at,
    totalQuestions: session[0].question_count,
    avgScore,
    participants: participants.map((p) => ({
      name: p.display_name,
      initial: (p.display_name || '?')[0].toUpperCase(),
      score: p.score || 0,
      correct: p.correct_count,
      total: p.question_order?.length || 0,
      finished: p.finished,
      // Контроль выхода (plan/done/exam_lockdown.md)
      userId: p.user_id,
      leftReason: p.left_reason || null,
      awayCount: p.away_count || 0,
      clientExitControl: p.client_exit_control,
    })),
    hardestCards: hardestCards.map((c) => ({
      word: c.word,
      hint: c.hint,
      missed: Number(c.missed),
      total: Number(c.total),
    })),
  });
}

export async function getHistory(req, res, sql, userId) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { courseId } = req.query;
  if (!courseId) {
    return res.status(400).json({ error: 'courseId is required' });
  }

  const rows = await sql`
    SELECT
      ts.id            AS "sessionId",
      cs.title         AS "setTitle",
      ts.finished_at   AS "finishedAt",
      ts.question_count AS "questionCount",
      ts.test_mode     AS "testMode",
      COUNT(tp.id)::int                                   AS "participantCount",
      COALESCE(ROUND(AVG(tp.score))::int, 0)              AS "avgScore"
    FROM test_sessions ts
    LEFT JOIN card_sets cs ON cs.id = ts.set_id
    LEFT JOIN test_participants tp ON tp.session_id = ts.id
    WHERE ts.course_id  = ${courseId}::uuid
      AND ts.teacher_id = ${userId}::uuid
      AND ts.status     = 'finished'
    GROUP BY ts.id, cs.title
    ORDER BY ts.finished_at DESC
  `;

  return res.status(200).json(rows);
}

// ─── Контроль выхода из приложения (plan/done/exam_lockdown.md) ───

/**
 * POST ?action=reinstate
 * Body: { sessionId, userId }  — userId ученика (как в monitor/progress_update)
 * Учитель разрешает продолжить ученику, чья попытка завершилась из-за выхода (ложное
 * срабатывание: звонок, блокировка телефона, сбой). Ученик продолжит с answer_count.
 */
export async function reinstateParticipant(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sessionId, userId: studentId } = req.body || {};
  if (!sessionId || !studentId) {
    return res.status(400).json({ error: 'sessionId and userId are required' });
  }

  const session = await sql`
    SELECT status FROM test_sessions
    WHERE id = ${sessionId}::uuid AND teacher_id = ${userId}::uuid
  `;
  if (session.length === 0) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  if (session[0].status !== 'active') {
    return res.status(409).json({ error: 'Test not active' });
  }

  // Только досрочно вышедших (left_reason задан) — обычное завершение (все ответы даны)
  // этим не откатить. rejoin_allowed — если ученик закрыл приложение, ему нужно снова ввести
  // код, и join не должен тут же завершить попытку как «перезапуск»; сбрасывается на
  // следующем ответе.
  const rows = await sql`
    UPDATE test_participants
    SET finished_at = NULL, score = 0, left_reason = NULL, away_at = NULL, rejoin_allowed = true
    WHERE session_id = ${sessionId}::uuid AND user_id = ${studentId}::uuid
      AND left_reason IS NOT NULL
    RETURNING user_id, display_name, answer_count, question_order
  `;
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Participant has not left the test' });
  }
  const p = rows[0];
  const total = p.question_order?.length || 0;

  await broadcast(sessionId, 'reinstated', { userId: p.user_id, answered: p.answer_count });
  await broadcast(sessionId, 'progress_update', {
    userId: p.user_id,
    displayName: p.display_name,
    answered: p.answer_count,
    total,
    done: false,
    left: false,
  });

  return res.status(200).json({ ok: true, answered: p.answer_count, total });
}
