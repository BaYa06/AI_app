import { neon } from '@neondatabase/serverless';
import { createClient } from '@supabase/supabase-js';
import { ensureDatabaseInitialized } from './_db-init.js';
import { log } from './_log.js';
import { joinTest, answerQuestion, getQuestion } from './_handlers/test/student.js';
import {
  createTest,
  startTest,
  monitorTest,
  finishTest,
  getResults,
  getHistory,
  reinstateParticipant,
} from './_handlers/test/teacher.js';
import { markAway, markBack, leaveTest } from './_handlers/test/exitControl.js';
import {
  examBuild,
  examDraft,
  examReplaceItem,
  examCreate,
  examState,
  examAnswer,
  examSubmit,
  examPause,
  examExtraTime,
  examResults,
  examQuestion,
  examDecide,
  examOverride,
  examUndo,
  examRelease,
  examMy,
  examStudent,
} from './_handlers/test/exam.js';
import { SUPABASE_URL } from './_handlers/test/_shared.js';

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
 *
 * Живой экзамен, движок 2 (plan/new/live_exam.md):
 * POST exam-build — собрать черновик · GET exam-draft — превью · POST exam-replace-item — заменить
 * слово · POST exam-create — открыть черновик (код) · POST exam-state / exam-answer / exam-submit —
 * ученик · POST exam-pause / exam-extra-time — во время экзамена · GET exam-results / exam-question
 * — итоги и разбор · POST exam-decide / exam-override / exam-undo / exam-release — оценки ·
 * GET exam-my — мои экзамены ученика
 */

const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

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
    if (action === 'create') return await createTest(req, res, sql, userId);
    if (action === 'join') return await joinTest(req, res, sql, userId);
    if (action === 'start') return await startTest(req, res, sql, userId);
    if (action === 'answer') return await answerQuestion(req, res, sql, userId);
    if (action === 'monitor') return await monitorTest(req, res, sql, userId);
    if (action === 'finish') return await finishTest(req, res, sql, userId);
    if (action === 'results') return await getResults(req, res, sql, userId);
    if (action === 'get-question') return await getQuestion(req, res, sql, userId);
    if (action === 'history') return await getHistory(req, res, sql, userId);
    if (action === 'away') return await markAway(req, res, sql, userId);
    if (action === 'back') return await markBack(req, res, sql, userId);
    if (action === 'leave') return await leaveTest(req, res, sql, userId);
    if (action === 'reinstate') return await reinstateParticipant(req, res, sql, userId);

    const exam = {
      'exam-build': examBuild,
      'exam-draft': examDraft,
      'exam-replace-item': examReplaceItem,
      'exam-create': examCreate,
      'exam-state': examState,
      'exam-answer': examAnswer,
      'exam-submit': examSubmit,
      'exam-pause': examPause,
      'exam-extra-time': examExtraTime,
      'exam-results': examResults,
      'exam-question': examQuestion,
      'exam-decide': examDecide,
      'exam-override': examOverride,
      'exam-undo': examUndo,
      'exam-release': examRelease,
      'exam-my': examMy,
      'exam-student': examStudent,
    }[action];
    if (exam) return await exam(req, res, sql, userId);

    return res.status(400).json({
      error:
        'Unknown action. Use: create, join, start, answer, monitor, finish, results, get-question, history, away, back, leave, reinstate',
    });
  } catch (error) {
    log.error('test', 'Test API error', error);
    return res.status(500).json({ error: error.message });
  }
}
