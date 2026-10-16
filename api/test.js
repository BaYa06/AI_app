import { neon } from '@neondatabase/serverless';
import { createClient } from '@supabase/supabase-js';
import { ensureDatabaseInitialized } from './_db-init.js';

/**
 * API для Live-тестов
 *
 * Каждый запрос требует Supabase JWT (Authorization: Bearer <access_token>) — сервер сам
 * определяет вызывающего из токена (supabase.auth.getUser), тело/query запроса на
 * userId/teacherId не полагается. Тот же паттерн, что и в api/teacher.js.
 * См. plan/teacher_access_fix_plan.md, пп. 17, 35, 36, 38, 39.
 *
 * POST /api/test?action=create        — учитель создаёт тест
 * POST /api/test?action=join          — ученик подключается по коду
 * POST /api/test?action=start         — учитель запускает тест
 * POST /api/test?action=answer        — ученик отправляет ответ
 * GET  /api/test?action=monitor       — учитель или участник получает прогресс
 * POST /api/test?action=finish        — учитель завершает тест
 * GET  /api/test?action=results       — итоговые результаты (только учитель — владелец сессии)
 * POST /api/test?action=get-question  — ученик запрашивает вопрос с вариантами
 * GET  /api/test?action=history       — учитель получает историю тестов курса
 * POST /api/test?action=away          — ученик ушёл в фон (контроль выхода, plan/done/exam_lockdown.md)
 * POST /api/test?action=back          — ученик вернулся: продолжить или завершить попытку
 * POST /api/test?action=leave         — ученик сам завершил тест досрочно
 * POST /api/test?action=reinstate     — учитель разрешает вышедшему ученику продолжить
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yiwsmjbeirgomkrckoju.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

/** Достаёт userId из Supabase JWT в заголовке Authorization. Возвращает null, если токен отсутствует/невалиден. */
async function getAuthedUserId(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || !SUPABASE_ANON_KEY) return null;
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const userId = await getAuthedUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sql = neon(process.env.POSTGRES_URL);
  await ensureDatabaseInitialized(sql);

  const { action } = req.query;

  try {
    if (action === 'create')       return await createTest(req, res, sql, userId);
    if (action === 'join')         return await joinTest(req, res, sql, userId);
    if (action === 'start')        return await startTest(req, res, sql, userId);
    if (action === 'answer')       return await answerQuestion(req, res, sql, userId);
    if (action === 'monitor')      return await monitorTest(req, res, sql, userId);
    if (action === 'finish')       return await finishTest(req, res, sql, userId);
    if (action === 'results')      return await getResults(req, res, sql, userId);
    if (action === 'get-question') return await getQuestion(req, res, sql, userId);
    if (action === 'history')      return await getHistory(req, res, sql, userId);
    if (action === 'away')         return await markAway(req, res, sql, userId);
    if (action === 'back')         return await markBack(req, res, sql, userId);
    if (action === 'leave')        return await leaveTest(req, res, sql, userId);
    if (action === 'reinstate')    return await reinstateParticipant(req, res, sql, userId);

    return res.status(400).json({ error: 'Unknown action. Use: create, join, start, answer, monitor, finish, results, get-question, history, away, back, leave, reinstate' });
  } catch (error) {
    console.error('Test API error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// ─── Helpers ────────────────────────────────────────────

/**
 * Rate-limit на угадывание 4-значного кода live-теста: не больше `maxAttempts` попыток от
 * одного userId за `windowSeconds`. Считается в БД (переживает холодный старт serverless-
 * функции), таблица общая с api/teacher.js — создаётся лениво при первом обращении.
 */
async function checkJoinRateLimit(sql, userId) {
  await sql`
    CREATE TABLE IF NOT EXISTS api_rate_limits (
      user_id UUID NOT NULL,
      action VARCHAR(50) NOT NULL,
      window_start TIMESTAMPTZ NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, action, window_start)
    )
  `;
  const windowSeconds = 60;
  const maxAttempts = 10;
  const windowStart = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000).toISOString();
  const result = await sql`
    INSERT INTO api_rate_limits (user_id, action, window_start, attempts)
    VALUES (${userId}::uuid, 'live-test-code-guess', ${windowStart}::timestamptz, 1)
    ON CONFLICT (user_id, action, window_start) DO UPDATE SET
      attempts = api_rate_limits.attempts + 1
    RETURNING attempts
  `;
  return result[0].attempts <= maxAttempts;
}

/** Генерация уникального 4-значного кода */
async function generateUniqueCode(sql) {
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
 * Отправить broadcast-событие в Supabase Realtime. topicSuffix — для канала экрана теста
 * ученика (`:exam`, см. broadcastTestFinished).
 */
async function broadcast(sessionId, event, payload, topicSuffix = '') {
  return new Promise((resolve) => {
    try {
      const supabase = getSupabase();
      const channel = supabase.channel(`test:${sessionId}${topicSuffix}`);

      const timeout = setTimeout(() => {
        console.error(`Broadcast ${event} timed out`);
        supabase.removeChannel(channel).catch(() => {});
        resolve();
      }, 5000);

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          try {
            await channel.send({ type: 'broadcast', event, payload });
          } catch (e) {
            console.error(`Broadcast send ${event} failed:`, e);
          }
          await supabase.removeChannel(channel).catch(() => {});
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          console.error(`Broadcast channel error for ${event}: ${status}`);
          await supabase.removeChannel(channel).catch(() => {});
          resolve();
        }
      });
    } catch (e) {
      console.error(`Broadcast ${event} failed:`, e);
      resolve();
    }
  });
}

/**
 * Автоматически завершить сессию, которая "зависла" в active дольше расчётного времени —
 * например, если приложение учителя закрылось и finishTest никогда не был вызван. Ленивая
 * проверка при любом обращении к сессии (monitor), без отдельного cron. См. план, пункт 41.
 */
const AUTO_FINISH_MARGIN_SEC = 120;
const NO_TIME_LIMIT_SEC_PER_QUESTION = 60; // консервативная оценка для тестов без лимита времени

async function autoFinishIfStale(sql, sessionId, session) {
  if (session.status !== 'active' || !session.started_at) return session;

  const perQuestion = session.time_per_question > 0 ? session.time_per_question : NO_TIME_LIMIT_SEC_PER_QUESTION;
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
 * test_finished — и в общий канал (учитель, экран ожидания), и в `test:${id}:exam`, который
 * слушает экран теста ученика. Экран теста не может подписаться на общий канал: supabase-js
 * отдаёт на одно имя один объект, и отписка экрана ожидания при переходе сняла бы подписку
 * экрана теста. Раньше событие в `:exam` не отправлялось вовсе, и ученик не узнавал, что
 * учитель завершил тест (plan/done/exam_lockdown.md, Exam 3).
 */
async function broadcastTestFinished(sessionId) {
  const payload = { finishedAt: new Date().toISOString() };
  await Promise.all([
    broadcast(sessionId, 'test_finished', payload),
    broadcast(sessionId, 'test_finished', payload, ':exam'),
  ]);
}

/** Перемешать массив (Fisher-Yates) */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Actions ────────────────────────────────────────────

/**
 * POST ?action=create
 * Body: { setId, courseId, testMode, questionCount, timePerQuestion, exitControl? }
 * exitControl — контроль выхода из приложения (plan/done/exam_lockdown.md). Необязательный: старые
 * версии приложения учителя его не шлют, и их тесты работают как раньше.
 */
async function createTest(req, res, sql, userId) {
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
 * POST ?action=join
 * Body: { code, exitControl? }
 * exitControl — клиент ученика умеет контроль выхода (plan/done/exam_lockdown.md). Старые версии
 * его не шлют: их пускаем как раньше, учитель видит метку «Старая версия».
 */
async function joinTest(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { code, exitControl } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'code is required' });
  }
  const clientExitControl = exitControl === true;

  if (!(await checkJoinRateLimit(sql, userId))) {
    return res.status(429).json({ error: 'Too many attempts, try again in a minute' });
  }

  // Найти активную сессию по коду
  const sessions = await sql`
    SELECT ts.id, ts.course_id, ts.set_id, ts.test_mode, ts.question_count, ts.time_per_question, ts.status,
           ts.exit_control,
           cs.title AS set_title,
           COALESCE(u.display_name, u.email) AS teacher_name
    FROM test_sessions ts
    JOIN card_sets cs ON cs.id = ts.set_id
    JOIN users u ON u.id = ts.teacher_id
    WHERE ts.code = ${code} AND ts.status IN ('waiting', 'active')
  `;

  if (sessions.length === 0) {
    return res.status(404).json({ error: 'Test not found or already finished' });
  }

  const session = sessions[0];

  // Проверить что ученик в курсе
  const membership = await sql`
    SELECT id FROM course_members
    WHERE course_id = ${session.course_id}::uuid AND user_id = ${userId}::uuid
  `;
  if (membership.length === 0) {
    return res.status(403).json({ error: 'You are not a member of this course' });
  }

  // Проверить что ученик ещё не в сессии
  const existing = await sql`
    SELECT id, answer_count, correct_count, question_order, score, finished_at, left_reason,
           rejoin_allowed
    FROM test_participants
    WHERE session_id = ${session.id}::uuid AND user_id = ${userId}::uuid
  `;
  if (existing.length > 0) {
    let ex = existing[0];

    // Контроль выхода: повторный вход в уже идущий тест с незавершённой попыткой значит, что
    // приложение закрывали (иначе ученик остался бы на экране теста). Это выход — попытка
    // завершается с причиной relaunch. Исключение — учитель разрешил продолжить
    // (rejoin_allowed, флаг одноразовый). Старых клиентов не трогаем: они не умеют показать
    // «Тест завершён» и открыли бы пустой экран вопроса.
    if (session.exit_control && clientExitControl && session.status === 'active' && !ex.finished_at) {
      if (ex.rejoin_allowed) {
        await sql`
          UPDATE test_participants SET rejoin_allowed = false, client_exit_control = true
          WHERE id = ${ex.id}::uuid
        `;
      } else {
        const finished = await finishParticipantEarly(sql, ex.id, 'relaunch');
        if (finished) ex = { ...ex, ...finished, finished_at: new Date() };
      }
    }

    return res.status(200).json({
      sessionId: session.id,
      participantId: existing[0].id,
      teacherName: session.teacher_name,
      setTitle: session.set_title,
      testMode: session.test_mode,
      questionCount: session.question_count,
      timePerQuestion: session.time_per_question,
      alreadyJoined: true,
      // Статус сессии и уже отвеченное кол-во — чтобы клиент мог восстановить прогресс вместо
      // того чтобы всегда открывать вопрос с индексом 0 (см. план, пункт 40).
      status: session.status,
      answerCount: ex.answer_count,
      exitControl: session.exit_control,
      // Попытка уже завершена (досрочно или полностью) — клиент показывает итог, а не вопрос.
      finished: Boolean(ex.finished_at),
      ...(ex.left_reason ? attemptSummary(ex) : {}),
    });
  }

  // Получить карточки набора
  const cards = await sql`
    SELECT id FROM cards WHERE set_id = ${session.set_id}::uuid
  `;
  if (cards.length === 0) {
    return res.status(400).json({ error: 'No cards in this set' });
  }

  // Перемешать и выбрать нужное кол-во
  const shuffled = shuffle(cards.map(c => c.id));
  const questionOrder = shuffled.slice(0, Math.min(session.question_count, shuffled.length));

  // Получить имя ученика
  const user = await sql`
    SELECT COALESCE(display_name, email, 'Student') AS name FROM users WHERE id = ${userId}::uuid
  `;
  const displayName = user[0]?.name || 'Student';

  // Создать участника
  const participant = await sql`
    INSERT INTO test_participants (session_id, user_id, display_name, question_order, client_exit_control)
    VALUES (${session.id}::uuid, ${userId}::uuid, ${displayName}, ${JSON.stringify(questionOrder)}::jsonb, ${clientExitControl})
    RETURNING id
  `;

  // Отправить событие учителю. participantId НЕ включаем — канал `test:${sessionId}` публичный
  // (broadcast без контроля доступа), рассылка чужого participantId в открытом виде позволяла бы
  // слать ответы от чужого имени (см. план, пункт 36). participantId возвращается только в этом
  // прямом HTTP-ответе — только вызывающему ученику.
  const initials = displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  await broadcast(session.id, 'student_joined', {
    userId,
    displayName,
    initials,
    // false у старых версий приложения — учитель видит, что контроль выхода у ученика не работает
    clientExitControl,
  });

  return res.status(200).json({
    sessionId: session.id,
    participantId: participant[0].id,
    teacherName: session.teacher_name,
    setTitle: session.set_title,
    testMode: session.test_mode,
    questionCount: questionOrder.length,
    timePerQuestion: session.time_per_question,
    exitControl: session.exit_control,
  });
}

/**
 * POST ?action=start
 * Body: { sessionId }
 */
async function startTest(req, res, sql, userId) {
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
 * POST ?action=answer
 * Body: { participantId, cardId, chosenAnswer, timeSpentSec }
 */
async function answerQuestion(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { participantId, cardId, chosenAnswer, timeSpentSec } = req.body;
  if (!participantId || !cardId) {
    return res.status(400).json({ error: 'participantId and cardId are required' });
  }

  // participantId владелец — иначе кто угодно с валидным токеном мог бы слать ответы за
  // чужого участника (см. план, пункт 36 — раньше participantId вообще утекал всем в сессии).
  const participantRow = await sql`
    SELECT p.session_id, p.user_id, p.display_name, p.question_order, p.answer_count,
           p.correct_count, p.score, p.left_reason, p.away_at, s.exit_control
    FROM test_participants p
    JOIN test_sessions s ON s.id = p.session_id
    WHERE p.id = ${participantId}::uuid
  `;
  if (participantRow.length === 0) {
    return res.status(404).json({ error: 'Participant not found' });
  }
  const p0 = participantRow[0];
  if (p0.user_id !== userId) {
    return res.status(403).json({ error: 'Not authorized for this participant' });
  }
  if (await rejectIfLeft(sql, res, participantId, p0)) return;

  // cardId должен реально быть в вопросах, выданных этому участнику при join — иначе можно
  // было бы отвечать на произвольные карточки чужих наборов.
  if (!p0.question_order.includes(cardId)) {
    return res.status(400).json({ error: 'Card is not part of this test session' });
  }

  // Получить правильный ответ
  const card = await sql`
    SELECT back FROM cards WHERE id = ${cardId}::uuid
  `;
  if (card.length === 0) {
    return res.status(404).json({ error: 'Card not found' });
  }

  const correctAnswer = card[0].back;
  const isCorrect = (chosenAnswer || '').trim().toLowerCase() === correctAnswer.trim().toLowerCase();

  // UNIQUE(participant_id, card_id) + ON CONFLICT DO NOTHING: повторная отправка того же
  // вопроса (например, retry после обрыва связи, см. план пункт 37) не создаёт вторую строку
  // и не может задвоить счётчики/накрутить score повторными попытками, пока не угадает ответ —
  // раньше каждый ответ возвращал correctAnswer в теле, что было оракулом для такой накрутки.
  const inserted = await sql`
    INSERT INTO test_answers (participant_id, card_id, chosen_answer, correct_answer, is_correct, time_spent_sec)
    VALUES (${participantId}::uuid, ${cardId}::uuid, ${chosenAnswer || ''}, ${correctAnswer}, ${isCorrect}, ${timeSpentSec || 0})
    ON CONFLICT (participant_id, card_id) DO NOTHING
    RETURNING is_correct, correct_answer
  `;
  const isFirstSubmission = inserted.length > 0;

  if (isFirstSubmission) {
    await sql`
      UPDATE test_participants
      SET answer_count = answer_count + 1,
          correct_count = correct_count + ${isCorrect ? 1 : 0},
          rejoin_allowed = false
      WHERE id = ${participantId}::uuid
    `;
  }

  // Получить обновлённого участника
  const participant = await sql`
    SELECT p.session_id, p.user_id, p.answer_count, p.question_order, p.display_name
    FROM test_participants p
    WHERE p.id = ${participantId}::uuid
  `;
  const p = participant[0];
  const totalQuestions = p.question_order.length;
  const done = p.answer_count >= totalQuestions;

  // Broadcast/финиш — только на реальном новом ответе, не на повторе.
  if (isFirstSubmission) {
    // Если все вопросы отвечены — пометить финиш и посчитать score.
    if (done) {
      await sql`
        UPDATE test_participants
        SET finished_at = NOW(),
            score = CASE WHEN jsonb_array_length(question_order) > 0
                         THEN ROUND((correct_count::numeric / jsonb_array_length(question_order)) * 100)
                         ELSE 0 END
        WHERE id = ${participantId}::uuid
      `;
    }
    await broadcast(p.session_id, 'progress_update', {
      userId: p.user_id,
      displayName: p.display_name,
      answered: p.answer_count,
      total: totalQuestions,
      done,
    });
  }

  // На повторной отправке возвращаем уже сохранённый на первой попытке результат (не
  // пересчитываем из нового chosenAnswer) — так это не даёт новой информации по сравнению с
  // тем, что клиент уже получил, и не может быть использовано, чтобы задним числом изменить счёт.
  const resultRow = isFirstSubmission
    ? { is_correct: isCorrect, correct_answer: correctAnswer }
    : (await sql`
        SELECT is_correct, correct_answer FROM test_answers
        WHERE participant_id = ${participantId}::uuid AND card_id = ${cardId}::uuid
      `)[0];

  return res.status(200).json({
    isCorrect: resultRow.is_correct,
    correctAnswer: resultRow.correct_answer,
    answered: p.answer_count,
    total: totalQuestions,
    done,
  });
}

/**
 * GET ?action=monitor&sessionId=...
 */
async function monitorTest(req, res, sql, userId) {
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
    participants: participants.map(p => {
      const initials = (p.display_name || 'S').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
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
        ...(isTeacher ? {
          leftReason: p.left_reason || null,
          awayCount: p.away_count || 0,
          away: p.away,
          clientExitControl: p.client_exit_control,
        } : {}),
      };
    }),
  });
}

/**
 * POST ?action=finish
 * Body: { sessionId }
 */
async function finishTest(req, res, sql, userId) {
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
async function getResults(req, res, sql, userId) {
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
  const avgScore = participants.length > 0
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
    participants: participants.map(p => ({
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
    hardestCards: hardestCards.map(c => ({
      word: c.word,
      hint: c.hint,
      missed: Number(c.missed),
      total: Number(c.total),
    })),
  });
}

/**
 * POST ?action=get-question
 * Body: { participantId, questionIndex }
 */
async function getQuestion(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { participantId, questionIndex } = req.body;
  if (!participantId || questionIndex === undefined) {
    return res.status(400).json({ error: 'participantId and questionIndex are required' });
  }

  // Получить участника
  const participant = await sql`
    SELECT p.question_order, p.session_id, p.user_id, p.answer_count, p.correct_count, p.score,
           p.left_reason, p.away_at, s.exit_control
    FROM test_participants p
    JOIN test_sessions s ON s.id = p.session_id
    WHERE p.id = ${participantId}::uuid
  `;
  if (participant.length === 0) {
    return res.status(404).json({ error: 'Participant not found' });
  }
  if (participant[0].user_id !== userId) {
    return res.status(403).json({ error: 'Not authorized for this participant' });
  }
  if (await rejectIfLeft(sql, res, participantId, participant[0])) return;

  const questionOrder = participant[0].question_order;
  if (questionIndex < 0 || questionIndex >= questionOrder.length) {
    return res.status(400).json({ error: 'Invalid question index' });
  }

  const cardId = questionOrder[questionIndex];

  // Получить карточку
  const card = await sql`
    SELECT id, front, back, set_id FROM cards WHERE id = ${cardId}::uuid
  `;
  if (card.length === 0) {
    return res.status(404).json({ error: 'Card not found' });
  }

  // Получить 3 неправильных варианта из того же набора
  const wrongOptions = await sql`
    SELECT back FROM cards
    WHERE set_id = ${card[0].set_id}::uuid AND id != ${cardId}::uuid
    ORDER BY RANDOM()
    LIMIT 3
  `;

  // Составить варианты: 1 правильный + до 3 неправильных
  const options = shuffle([
    card[0].back,
    ...wrongOptions.map(w => w.back),
  ]);

  return res.status(200).json({
    cardId: card[0].id,
    front: card[0].front,
    options,
    questionIndex,
    totalQuestions: questionOrder.length,
  });
}

async function getHistory(req, res, sql, userId) {
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

/** Сколько секунд в фоне прощается (случайный жест «домой»). Время считает сервер, не клиент. */
const AWAY_GRACE_SEC = 3;

/**
 * Участник вызывающего + его сессия. Возвращает null и уже отправленный ответ при ошибке —
 * participantId должен принадлежать вызывающему (как в answerQuestion).
 */
async function loadOwnParticipant(req, res, sql, userId) {
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

/** Итог попытки для клиента ученика (экран «Тест завершён»). */
function attemptSummary(p) {
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
async function finishParticipantEarly(sql, participantId, reason) {
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

/**
 * Не выдавать вопросы и не принимать ответы после выхода из приложения — даже от
 * модифицированного клиента. Две ситуации:
 * - попытка уже завершена досрочно (left_reason);
 * - клиент сообщил `away`, но вместо `back` сразу шлёт вопрос/ответ, а льгота уже прошла —
 *   засчитываем выход здесь же.
 * Отправляет 409 { left: true, ... } и возвращает true, если запрос надо прервать.
 * p — строка участника с left_reason, away_at, exit_control, answer_count, correct_count,
 * question_order, score.
 */
async function rejectIfLeft(sql, res, participantId, p) {
  let left = p.left_reason ? p : null;

  if (!left && p.exit_control && p.away_at) {
    const awaySec = (Date.now() - new Date(p.away_at).getTime()) / 1000;
    if (awaySec > AWAY_GRACE_SEC) {
      left = await finishParticipantEarly(sql, participantId, 'background');
    }
  }
  if (!left) return false;

  res.status(409).json({ error: 'Attempt finished: left the app', ...attemptSummary(left) });
  return true;
}

/**
 * POST ?action=away
 * Body: { participantId, reason? }  — reason: 'background' (по умолчанию) | 'split'
 * Приложение ученика ушло в фон или открыто рядом с другим (iPad Split View). Отметка времени
 * ставится один раз (повтор её не сдвигает). reason только для учителя, на правила не влияет.
 */
async function markAway(req, res, sql, userId) {
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
    await broadcast(p.session_id, 'student_away', { userId: p.user_id, displayName: p.display_name, reason });
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
async function markBack(req, res, sql, userId) {
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
async function leaveTest(req, res, sql, userId) {
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

/**
 * POST ?action=reinstate
 * Body: { sessionId, userId }  — userId ученика (как в monitor/progress_update)
 * Учитель разрешает продолжить ученику, чья попытка завершилась из-за выхода (ложное
 * срабатывание: звонок, блокировка телефона, сбой). Ученик продолжит с answer_count.
 */
async function reinstateParticipant(req, res, sql, userId) {
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
