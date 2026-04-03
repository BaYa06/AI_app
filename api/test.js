import { neon } from '@neondatabase/serverless';
import { createClient } from '@supabase/supabase-js';
import { ensureDatabaseInitialized } from './_db-init.js';

/**
 * API для Live-тестов
 *
 * POST /api/test?action=create        — учитель создаёт тест
 * POST /api/test?action=join          — ученик подключается по коду
 * POST /api/test?action=start         — учитель запускает тест
 * POST /api/test?action=answer        — ученик отправляет ответ
 * GET  /api/test?action=monitor       — учитель получает прогресс
 * POST /api/test?action=finish        — учитель завершает тест
 * GET  /api/test?action=results       — итоговые результаты
 * POST /api/test?action=get-question  — ученик запрашивает вопрос с вариантами
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yiwsmjbeirgomkrckoju.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const sql = neon(process.env.POSTGRES_URL);
  await ensureDatabaseInitialized(sql);

  const { action } = req.query;

  try {
    if (action === 'create')       return await createTest(req, res, sql);
    if (action === 'join')         return await joinTest(req, res, sql);
    if (action === 'start')        return await startTest(req, res, sql);
    if (action === 'answer')       return await answerQuestion(req, res, sql);
    if (action === 'monitor')      return await monitorTest(req, res, sql);
    if (action === 'finish')       return await finishTest(req, res, sql);
    if (action === 'results')      return await getResults(req, res, sql);
    if (action === 'get-question') return await getQuestion(req, res, sql);
    if (action === 'history')      return await getHistory(req, res, sql);

    return res.status(400).json({ error: 'Unknown action. Use: create, join, start, answer, monitor, finish, results, get-question, history' });
  } catch (error) {
    console.error('Test API error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// ─── Helpers ────────────────────────────────────────────

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

/** Отправить broadcast-событие в Supabase Realtime */
async function broadcast(sessionId, event, payload) {
  return new Promise((resolve) => {
    try {
      const supabase = getSupabase();
      const channel = supabase.channel(`test:${sessionId}`);

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
 * Body: { setId, courseId, testMode, questionCount, timePerQuestion, teacherId }
 */
async function createTest(req, res, sql) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { setId, courseId, testMode, questionCount, timePerQuestion, teacherId } = req.body;
  if (!setId || !courseId || !teacherId || !questionCount) {
    return res.status(400).json({ error: 'setId, courseId, teacherId, questionCount are required' });
  }

  // Проверить что учитель — владелец курса
  const course = await sql`
    SELECT id FROM courses
    WHERE id = ${courseId}::uuid AND user_id = ${teacherId}::uuid
  `;
  if (course.length === 0) {
    return res.status(403).json({ error: 'Access denied: not course owner' });
  }

  const code = await generateUniqueCode(sql);

  const result = await sql`
    INSERT INTO test_sessions (teacher_id, set_id, course_id, code, test_mode, question_count, time_per_question)
    VALUES (${teacherId}::uuid, ${setId}::uuid, ${courseId}::uuid, ${code}, ${testMode || 'multiple'}, ${questionCount}, ${timePerQuestion || 0})
    RETURNING id
  `;

  return res.status(201).json({
    sessionId: result[0].id,
    code,
  });
}

/**
 * POST ?action=join
 * Body: { code, userId }
 */
async function joinTest(req, res, sql) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { code, userId } = req.body;
  if (!code || !userId) {
    return res.status(400).json({ error: 'code and userId are required' });
  }

  // Найти активную сессию по коду
  const sessions = await sql`
    SELECT ts.id, ts.course_id, ts.set_id, ts.test_mode, ts.question_count, ts.time_per_question, ts.status,
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
    SELECT id FROM test_participants
    WHERE session_id = ${session.id}::uuid AND user_id = ${userId}::uuid
  `;
  if (existing.length > 0) {
    return res.status(200).json({
      sessionId: session.id,
      participantId: existing[0].id,
      teacherName: session.teacher_name,
      setTitle: session.set_title,
      testMode: session.test_mode,
      questionCount: session.question_count,
      timePerQuestion: session.time_per_question,
      alreadyJoined: true,
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
    INSERT INTO test_participants (session_id, user_id, display_name, question_order)
    VALUES (${session.id}::uuid, ${userId}::uuid, ${displayName}, ${JSON.stringify(questionOrder)}::jsonb)
    RETURNING id
  `;

  // Отправить событие учителю
  const initials = displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  await broadcast(session.id, 'student_joined', {
    userId,
    displayName,
    initials,
    participantId: participant[0].id,
  });

  return res.status(200).json({
    sessionId: session.id,
    participantId: participant[0].id,
    teacherName: session.teacher_name,
    setTitle: session.set_title,
    testMode: session.test_mode,
    questionCount: questionOrder.length,
    timePerQuestion: session.time_per_question,
  });
}

/**
 * POST ?action=start
 * Body: { sessionId, teacherId }
 */
async function startTest(req, res, sql) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sessionId, teacherId } = req.body;
  if (!sessionId || !teacherId) {
    return res.status(400).json({ error: 'sessionId and teacherId are required' });
  }

  // Проверить владельца
  const session = await sql`
    SELECT id FROM test_sessions
    WHERE id = ${sessionId}::uuid AND teacher_id = ${teacherId}::uuid AND status = 'waiting'
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
async function answerQuestion(req, res, sql) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { participantId, cardId, chosenAnswer, timeSpentSec } = req.body;
  if (!participantId || !cardId) {
    return res.status(400).json({ error: 'participantId and cardId are required' });
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

  // Сохранить ответ
  await sql`
    INSERT INTO test_answers (participant_id, card_id, chosen_answer, correct_answer, is_correct, time_spent_sec)
    VALUES (${participantId}::uuid, ${cardId}::uuid, ${chosenAnswer || ''}, ${correctAnswer}, ${isCorrect}, ${timeSpentSec || 0})
  `;

  // Обновить счётчики
  await sql`
    UPDATE test_participants
    SET answer_count = answer_count + 1,
        correct_count = correct_count + ${isCorrect ? 1 : 0}
    WHERE id = ${participantId}::uuid
  `;

  // Получить обновлённого участника
  const participant = await sql`
    SELECT p.session_id, p.user_id, p.answer_count, p.question_order, p.display_name
    FROM test_participants p
    WHERE p.id = ${participantId}::uuid
  `;
  const p = participant[0];
  const totalQuestions = p.question_order.length;
  const done = p.answer_count >= totalQuestions;

  // Если все вопросы отвечены — пометить финиш и посчитать score
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

  // Broadcast прогресс учителю
  await broadcast(p.session_id, 'progress_update', {
    userId: p.user_id,
    displayName: p.display_name,
    answered: p.answer_count,
    total: totalQuestions,
    done,
  });

  return res.status(200).json({
    isCorrect,
    correctAnswer,
    answered: p.answer_count,
    total: totalQuestions,
    done,
  });
}

/**
 * GET ?action=monitor&sessionId=...
 */
async function monitorTest(req, res, sql) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { sessionId } = req.query;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  const session = await sql`
    SELECT status, started_at, time_per_question, question_count
    FROM test_sessions
    WHERE id = ${sessionId}::uuid
  `;
  if (session.length === 0) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const participants = await sql`
    SELECT display_name, answer_count, question_order, finished_at IS NOT NULL AS done
    FROM test_participants
    WHERE session_id = ${sessionId}::uuid
    ORDER BY joined_at ASC
  `;

  return res.status(200).json({
    status: session[0].status,
    startedAt: session[0].started_at,
    timePerQuestion: session[0].time_per_question,
    questionCount: session[0].question_count,
    participants: participants.map(p => ({
      name: p.display_name,
      initial: (p.display_name || '?')[0].toUpperCase(),
      answered: p.answer_count,
      total: p.question_order?.length || 0,
      done: p.done,
    })),
  });
}

/**
 * POST ?action=finish
 * Body: { sessionId, teacherId }
 */
async function finishTest(req, res, sql) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sessionId, teacherId } = req.body;
  if (!sessionId || !teacherId) {
    return res.status(400).json({ error: 'sessionId and teacherId are required' });
  }

  // Проверить владельца
  const session = await sql`
    SELECT id FROM test_sessions
    WHERE id = ${sessionId}::uuid AND teacher_id = ${teacherId}::uuid AND status = 'active'
  `;
  if (session.length === 0) {
    return res.status(403).json({ error: 'Not authorized or test not active' });
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

  await broadcast(sessionId, 'test_finished', { finishedAt: new Date().toISOString() });

  return res.status(200).json({ ok: true });
}

/**
 * GET ?action=results&sessionId=...
 */
async function getResults(req, res, sql) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { sessionId } = req.query;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  // Данные сессии
  const session = await sql`
    SELECT ts.question_count, ts.created_at,
           cs.title AS set_title
    FROM test_sessions ts
    JOIN card_sets cs ON cs.id = ts.set_id
    WHERE ts.id = ${sessionId}::uuid
  `;
  if (session.length === 0) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Участники отсортированы по score
  const participants = await sql`
    SELECT display_name, score, correct_count, question_order, finished_at IS NOT NULL AS finished
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
async function getQuestion(req, res, sql) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { participantId, questionIndex } = req.body;
  if (!participantId || questionIndex === undefined) {
    return res.status(400).json({ error: 'participantId and questionIndex are required' });
  }

  // Получить участника
  const participant = await sql`
    SELECT question_order, session_id
    FROM test_participants
    WHERE id = ${participantId}::uuid
  `;
  if (participant.length === 0) {
    return res.status(404).json({ error: 'Participant not found' });
  }

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

async function getHistory(req, res, sql) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { courseId, teacherId } = req.query;
  if (!courseId || !teacherId) {
    return res.status(400).json({ error: 'courseId and teacherId are required' });
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
      AND ts.teacher_id = ${teacherId}::uuid
      AND ts.status     = 'finished'
    GROUP BY ts.id, cs.title
    ORDER BY ts.finished_at DESC
  `;

  return res.status(200).json(rows);
}
