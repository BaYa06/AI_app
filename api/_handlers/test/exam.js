/**
 * api/test.js — живой экзамен, движок 2 (plan/new/live_exam.md, этапы 2 и 6).
 *
 * Обработчики только загружают данные, вызывают чистый движок api/_exam/ и сохраняют результат.
 * Старый тест (engine = 1) здесь не меняется. Совместимость со старыми частями:
 * - question_order участника — id слов в его порядке, answer_count / correct_count ведутся по
 *   вердиктам. Поэтому монитор учителя, контроль выхода, «Завершить» и история работают как
 *   раньше, а их формула балла (верные / N × 100) совпадает с баллом движка, пока учитель
 *   ничего не аннулировал и не засчитал (после этого баллы пересчитывает recomputeScores);
 * - черновик экзамена — status = 'draft': его не видят ни вход по коду, ни история.
 */
import { broadcast, broadcastTestFinished } from './_shared.js';
import { log } from '../../_log.js';
import { generateUniqueCode, mainSetId } from './teacher.js';
import { rejectIfLeft } from './student.js';
import { finishParticipantEarly, attemptSummary } from './_shared.js';
import { courseSetIdsSql } from '../../_course.js';
import { detectBackKind } from '../../_exam/prepare.js';
import { classifyDifficulty, LEARNED_STEP } from '../../_exam/difficulty.js';
import { buildExam, replaceItem, LIMITS } from '../../_exam/build.js';
import { checkAnswer } from '../../_exam/check.js';
import { logExamEvent, logOldVersionAttempt } from '../../_exam/events.js';
import { isEditable, validateDistractors, validateSentence } from '../../_exam/edit.js';
import { studentScreens } from '../../_exam/deliver.js';
import { scoreParticipant, averageScore } from '../../_exam/score.js';
import { itemStats, isSuspicious, whyHints, simulate } from '../../_exam/analysis.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Возможность клиента, без которой в экзамен движка 2 не пускаем (старые версии → «обновите») */
export const EXAM_FEATURE = 'exam2';
/** Секунды после срока, в которые ответ ещё принимается (задержка сети) */
export const DEADLINE_GRACE_SEC = 5;
/** Через сколько секунд после самого позднего срока сессия завершается сама */
export const SESSION_FINISH_MARGIN_SEC = 60;
const MAX_ANSWER_LEN = 200;

const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

// ─── Загрузка ───────────────────────────────────────────────

/** Сессия экзамена, если вызывающий — её учитель. Иначе отправляет ошибку и возвращает null. */
async function loadOwnExam(res, sql, userId, sessionId) {
  if (!isUuid(sessionId)) {
    res.status(400).json({ error: 'sessionId is required' });
    return null;
  }
  const rows = await sql`
    SELECT * FROM test_sessions WHERE id = ${sessionId}::uuid AND teacher_id = ${userId}::uuid
  `;
  if (rows.length === 0 || rows[0].engine !== 2) {
    res.status(403).json({ error: 'Not authorized' });
    return null;
  }
  return rows[0];
}

/** Вопросы сессии в виде, который понимает движок */
export async function loadItems(sql, sessionId) {
  const rows = await sql`
    SELECT id, card_id, block_no, format, direction, prompt, answer, options, extra, difficulty,
           points, voided, accepted_answers, sort_key
    FROM test_items WHERE session_id = ${sessionId}::uuid
    ORDER BY sort_key
  `;
  return rows.map(toItem);
}

function toItem(r) {
  return {
    id: r.id,
    cardId: r.card_id,
    blockNo: r.block_no,
    format: r.format,
    direction: r.direction,
    prompt: r.prompt,
    answer: r.answer,
    options: r.options,
    extra: r.extra || {},
    difficulty: r.difficulty,
    points: Number(r.points) || 0,
    voided: Boolean(r.voided),
    accepted_answers: r.accepted_answers || [],
    sortKey: r.sort_key,
  };
}

/** Срок сдачи участника (мс) или null, если экзамен не начат / без ограничения */
export function deadlineMs(session, participant, now = Date.now()) {
  if (!session.started_at || !session.duration_sec) return null;
  let ms =
    new Date(session.started_at).getTime() +
    (session.duration_sec + (session.paused_total_sec || 0) + (participant?.extra_sec || 0)) * 1000;
  if (session.paused_at) ms += now - new Date(session.paused_at).getTime();
  return ms;
}

/** Карточки наборов курса (только из наборов этого курса) */
async function loadCourseCards(sql, courseId, setIds) {
  return sql`
    SELECT c.id, c.set_id, c.front, c.back, c.example
    FROM cards c
    WHERE c.set_id = ANY(${setIds}::uuid[]) AND c.set_id IN (${courseSetIdsSql(sql, courseId)})
    ORDER BY c.set_id, c.sort_order NULLS LAST, c.created_at
  `;
}

/** Тип оборота по наборам — большинство карточек (у каждого набора свои языки) */
function backKindOf(sets, cards) {
  const bySet = new Map();
  for (const c of cards) {
    if (!bySet.has(c.set_id)) bySet.set(c.set_id, []);
    bySet.get(c.set_id).push(c);
  }
  let def = 0;
  let tr = 0;
  for (const s of sets) {
    const list = bySet.get(s.id) || [];
    if (detectBackKind(s, list) === 'definition') def += list.length;
    else tr += list.length;
  }
  return def > tr ? 'definition' : 'translation';
}

/** Знание класса по словам: сколько учеников выучили / открывали, сколько повторений */
async function loadClassKnowledge(sql, courseId, cardIds) {
  const [students] = await sql`
    SELECT COUNT(*)::int AS n FROM course_members
    WHERE course_id = ${courseId}::uuid AND role = 'student'
  `;
  const rows = await sql`
    WITH st AS (
      SELECT user_id FROM course_members WHERE course_id = ${courseId}::uuid AND role = 'student'
    )
    SELECT c.id AS card_id,
      (SELECT COUNT(*)::int FROM card_progress cp
        WHERE cp.card_id = c.id AND cp.user_id IN (SELECT user_id FROM st)
          AND cp.learning_step >= ${LEARNED_STEP}) AS learned,
      (SELECT COUNT(DISTINCT rl.user_id)::int FROM review_log rl
        WHERE rl.card_id = c.id AND rl.user_id IN (SELECT user_id FROM st)) AS seen,
      (SELECT COUNT(*)::int FROM review_log rl
        WHERE rl.card_id = c.id AND rl.user_id IN (SELECT user_id FROM st)) AS reviews
    FROM cards c WHERE c.id = ANY(${cardIds}::uuid[])
  `;
  const exams = await sql`
    SELECT ta.card_id, COUNT(*)::int AS answers,
           (COUNT(*) FILTER (WHERE ta.is_correct))::int AS correct
    FROM test_answers ta
    JOIN test_participants tp ON tp.id = ta.participant_id
    JOIN test_sessions ts ON ts.id = tp.session_id
    WHERE ts.course_id = ${courseId}::uuid AND ta.card_id = ANY(${cardIds}::uuid[])
    GROUP BY ta.card_id
  `;
  const classStats = new Map(rows.map((r) => [r.card_id, { learned: r.learned, seen: r.seen }]));
  const examStats = new Map(exams.map((r) => [r.card_id, r]));
  const reviews = rows.reduce((a, r) => a + (r.reviews || 0), 0);
  return { students: students?.n || 0, classStats, examStats, reviews };
}

/** Ответ для превью учителя */
function draftView(session, items, extra = {}) {
  return {
    sessionId: session.id,
    status: session.status,
    // Код входа есть только у открытого экзамена; у черновика он ещё не выдан
    code: session.status === 'draft' ? null : session.code,
    config: session.config,
    durationSec: session.duration_sec,
    items: items.map((it) => ({
      itemId: it.id,
      cardId: it.cardId,
      blockNo: it.blockNo,
      format: it.format,
      direction: it.direction,
      prompt: it.prompt,
      answer: it.answer,
      options: it.options,
      difficulty: it.difficulty,
      points: it.points,
      extra: it.extra,
    })),
    ...extra,
  };
}

function parseConfig(body) {
  const mode = ['difficulty', 'random', 'manual'].includes(body.mode) ? body.mode : 'difficulty';
  const formats = {};
  for (const f of ['choice', 'write', 'scramble', 'match', 'gap']) {
    const v = Number(body.formats?.[f]);
    if (Number.isFinite(v) && v >= 0) formats[f] = Math.floor(v);
  }
  return {
    count: Math.max(1, Math.min(LIMITS.maxCount, Number(body.count) || 20)),
    mode,
    cardIds: Array.isArray(body.cardIds) ? body.cardIds.filter(isUuid) : [],
    includeUnstudied: body.includeUnstudied === true,
    formats: Object.keys(formats).length ? formats : null,
    pairSize: Number(body.pairSize) || LIMITS.pairDefault,
  };
}

// ─── Учитель: создание ──────────────────────────────────────

/**
 * POST ?action=exam-build
 * Body: { courseId, setIds[], count, mode, cardIds?, includeUnstudied?, formats?, pairSize?,
 *         durationSec?, exitControl?, revealMode? }
 * Собирает экзамен и сохраняет черновик (status = 'draft'). Ответ — превью: состав, шаги сборки
 * с цифрами, предупреждения, рекомендованное время.
 */
export async function examBuild(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = req.body || {};
  const { courseId } = body;
  const setIds = Array.isArray(body.setIds) ? [...new Set(body.setIds.filter(isUuid))] : [];
  if (!isUuid(courseId) || setIds.length === 0) {
    return res.status(400).json({ error: 'courseId and setIds are required' });
  }
  const course = await sql`
    SELECT id FROM courses WHERE id = ${courseId}::uuid AND user_id = ${userId}::uuid
  `;
  if (course.length === 0)
    return res.status(403).json({ error: 'Access denied: not course owner' });

  const cards = await loadCourseCards(sql, courseId, setIds);
  if (cards.length === 0) return res.status(400).json({ error: 'No cards in this set' });
  const sets = await sql`
    SELECT id, language_from, language_to, back_kind, back_kind_source
    FROM card_sets WHERE id = ANY(${setIds}::uuid[])
  `;
  const backKind = backKindOf(sets, cards);
  const config = parseConfig(body);
  const knowledge = await loadClassKnowledge(
    sql,
    courseId,
    cards.map((c) => c.id)
  );
  const seed = `${courseId}:${Date.now()}`;
  const diff = classifyDifficulty(cards, { ...knowledge, seed });
  const input = {
    cards: cards.map((c) => ({ ...c, setId: c.set_id })),
    backKind,
    levels: diff.levels,
    difficultySource: diff.source,
    classSummary: { students: knowledge.students, reviews: knowledge.reviews },
    config,
    seed,
  };
  const exam = buildExam(input);
  if (exam.items.length === 0) return res.status(400).json({ error: 'No cards in this set' });

  const durationSec =
    Number(body.durationSec) > 0
      ? Math.min(Math.round(Number(body.durationSec)), 3 * 3600)
      : exam.recommended.minutes * 60;
  const revealMode = body.revealMode === 'on_submit' ? 'on_submit' : 'teacher';
  const storedConfig = {
    ...config,
    setIds,
    seed,
    backKind,
    difficultySource: diff.source,
    recommendedMin: exam.recommended.minutes,
  };
  const setId = mainSetId(cards.filter((c) => exam.items.some((i) => i.cardId === c.id)));

  const [session] = await sql`
    INSERT INTO test_sessions (teacher_id, set_id, course_id, code, test_mode, question_count,
      time_per_question, status, exit_control, card_ids, engine, config, duration_sec, reveal_mode)
    VALUES (${userId}::uuid, ${setId}::uuid, ${courseId}::uuid, '0000', 'exam', ${exam.items.length},
      0, 'draft', ${body.exitControl === true}, ${exam.items.map((i) => i.cardId)}::uuid[], 2,
      ${JSON.stringify(storedConfig)}::jsonb, ${durationSec}, ${revealMode})
    RETURNING *
  `;
  await insertItems(sql, session.id, exam.items);
  const items = await loadItems(sql, session.id);

  return res.status(201).json(
    draftView(session, items, {
      steps: exam.steps,
      warnings: exam.warnings,
      counts: exam.counts,
      levels: exam.levels,
      recommended: exam.recommended,
      pointsPerWord: exam.pointsPerWord,
      screens: exam.screens,
      backKind,
      difficultySource: diff.source,
    })
  );
}

async function insertItems(sql, sessionId, items) {
  if (items.length === 0) return;
  await sql`
    INSERT INTO test_items (session_id, card_id, block_no, format, direction, prompt, answer,
      options, extra, difficulty, points, sort_key)
    SELECT ${sessionId}::uuid, x.card_id, x.block_no, x.format, x.direction, x.prompt, x.answer,
      x.options, x.extra, x.difficulty, x.points, x.sort_key
    FROM jsonb_to_recordset(${JSON.stringify(
      items.map((i) => ({
        card_id: i.cardId,
        block_no: i.blockNo,
        format: i.format,
        direction: i.direction || null,
        prompt: i.prompt,
        answer: i.answer,
        options: i.options || null,
        extra: i.extra || {},
        difficulty: i.difficulty || null,
        points: i.points,
        sort_key: i.sortKey,
      }))
    )}::jsonb) AS x(card_id uuid, block_no int, format text, direction text, prompt text,
      answer text, options jsonb, extra jsonb, difficulty text, points numeric, sort_key int)
  `;
}

/**
 * GET ?action=exam-draft&sessionId=… — превью уже собранного экзамена (повторное открытие).
 */
export async function examDraft(req, res, sql, userId) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const session = await loadOwnExam(res, sql, userId, req.query.sessionId);
  if (!session) return;
  const items = await loadItems(sql, session.id);
  return res.status(200).json(draftView(session, items));
}

/**
 * POST ?action=exam-replace-item  Body: { sessionId, itemId }
 * Другое слово той же сложности и того же формата (до старта экзамена).
 */
export async function examReplaceItem(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { sessionId, itemId } = req.body || {};
  const session = await loadOwnExam(res, sql, userId, sessionId);
  if (!session) return;
  if (!['draft', 'waiting'].includes(session.status)) {
    return res.status(409).json({ error: 'Test already started' });
  }
  const items = await loadItems(sql, session.id);
  const old = items.find((i) => i.id === itemId);
  if (!old) return res.status(404).json({ error: 'Item not found' });

  const cfg = session.config || {};
  const cards = await loadCourseCards(sql, session.course_id, cfg.setIds || []);
  const knowledge = await loadClassKnowledge(
    sql,
    session.course_id,
    cards.map((c) => c.id)
  );
  const diff = classifyDifficulty(cards, { ...knowledge, seed: cfg.seed });
  const replaced = replaceItem(
    {
      cards: cards.map((c) => ({ ...c, setId: c.set_id })),
      backKind: cfg.backKind || 'translation',
      levels: diff.levels,
      seed: `${cfg.seed}:${Date.now()}`,
    },
    items,
    old.cardId
  );
  if (!replaced) return res.status(409).json({ error: 'No other words', noWords: true });
  const it = replaced.item;
  await sql`
    UPDATE test_items SET card_id = ${it.cardId}::uuid, direction = ${it.direction || null},
      prompt = ${it.prompt}, answer = ${it.answer},
      options = ${it.options ? JSON.stringify(it.options) : null}::jsonb,
      extra = ${JSON.stringify(it.extra || {})}::jsonb, difficulty = ${it.difficulty}
    WHERE id = ${old.id}::uuid
  `;
  await sql`
    UPDATE test_sessions
    SET card_ids = array_replace(card_ids, ${old.cardId}::uuid, ${it.cardId}::uuid)
    WHERE id = ${session.id}::uuid
  `;
  const fresh = await loadItems(sql, session.id);
  return res.status(200).json({
    ...draftView(session, fresh),
    replacedItemId: old.id,
    sameLevel: replaced.sameLevel,
  });
}

/**
 * POST ?action=exam-edit-item  (веб-кабинет, plan/new/web_cabinet.md, Web 15)
 * Body: { sessionId, itemId, distractors?: string[], sentence?: string, source?: 'ai', doubtful?: boolean }
 * Учитель правит неверные варианты («выбор», «вставь слово») и предложение «вставь слово» в
 * черновике. Правильный ответ и баллы не меняются. Правка живёт только в этом экзамене —
 * карточки набора не трогаем. `source: 'ai'` — предложение пришло от ИИ и принято учителем;
 * `doubtful` — код или ИИ усомнились (экран спросит подтверждение перед открытием экзамена).
 */
export async function examEditItem(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { sessionId, itemId, distractors, sentence, source, doubtful } = req.body || {};
  const session = await loadOwnExam(res, sql, userId, sessionId);
  if (!session) return;
  if (!['draft', 'waiting'].includes(session.status)) {
    return res.status(409).json({ error: 'Test already started' });
  }
  const items = await loadItems(sql, session.id);
  const item = items.find((i) => i.id === itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  if (!isEditable(item)) return res.status(400).json({ error: 'not_editable' });
  if (distractors === undefined && sentence === undefined) {
    return res.status(400).json({ error: 'nothing_to_change' });
  }

  let options = item.options;
  let prompt = item.prompt;
  if (distractors !== undefined) {
    const v = validateDistractors(item, distractors);
    if (!v.ok)
      return res.status(400).json({ error: v.error, index: v.index, expected: v.expected });
    options = v.options;
  }
  if (sentence !== undefined) {
    if (item.format !== 'gap') return res.status(400).json({ error: 'not_editable' });
    const v = validateSentence(item, sentence);
    if (!v.ok) return res.status(400).json({ error: v.error });
    prompt = v.sentence;
  }

  const edit = {
    edited: true,
    ...(source === 'ai' ? { source: 'ai', doubtful: doubtful === true } : { source: 'teacher' }),
  };
  await sql`
    UPDATE test_items SET prompt = ${prompt}, options = ${JSON.stringify(options)}::jsonb,
      extra = COALESCE(extra, '{}'::jsonb) || ${JSON.stringify({ edit })}::jsonb
    WHERE id = ${item.id}::uuid AND session_id = ${session.id}::uuid
  `;
  const fresh = await loadItems(sql, session.id);
  return res.status(200).json({ ...draftView(session, fresh), editedItemId: item.id });
}

/**
 * GET ?action=exam-list[&courseId=…]  (веб-кабинет, Web 12)
 * Экзамены учителя (движок 2) любого статуса: черновики, ожидание, идущие, завершённые — новые
 * первыми, не больше 60. `history` показывает только завершённые, а черновик иначе не найти.
 */
export async function examList(req, res, sql, userId) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const courseId = isUuid(req.query.courseId) ? req.query.courseId : null;
  const rows = await sql`
    SELECT ts.id AS "sessionId", ts.course_id AS "courseId", c.title AS "courseTitle",
           cs.title AS "setTitle", ts.status AS "status", ts.code AS "code",
           ts.question_count AS "questionCount", ts.duration_sec AS "durationSec",
           ts.created_at AS "createdAt", ts.finished_at AS "finishedAt",
           COUNT(tp.id)::int AS "participantCount",
           COALESCE(ROUND(AVG(tp.score))::int, 0) AS "avgScore"
    FROM test_sessions ts
    LEFT JOIN courses c ON c.id = ts.course_id
    LEFT JOIN card_sets cs ON cs.id = ts.set_id
    LEFT JOIN test_participants tp ON tp.session_id = ts.id
    WHERE ts.teacher_id = ${userId}::uuid AND ts.engine = 2
      AND (${courseId}::uuid IS NULL OR ts.course_id = ${courseId}::uuid)
    GROUP BY ts.id, c.title, cs.title
    ORDER BY ts.created_at DESC
    LIMIT 60
  `;
  return res.status(200).json(rows);
}

/**
 * GET ?action=exam-events&sessionId=…  (веб-кабинет, Web 22)
 * Журнал событий экзамена для учителя: новые первыми, не больше 100. Видит только учитель экзамена.
 * → { events: [{ id, kind, userId, name, detail, at }] }
 */
export async function examEvents(req, res, sql, userId) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const session = await loadOwnExam(res, sql, userId, req.query.sessionId);
  if (!session) return;
  let rows = [];
  try {
    rows = await sql`
      SELECT e.id, e.kind, e.user_id AS "userId", e.detail, e.created_at AS "at",
             COALESCE(NULLIF(u.display_name, ''), 'Ученик') AS "name"
      FROM exam_events e
      LEFT JOIN users u ON u.id = e.user_id
      WHERE e.session_id = ${session.id}::uuid
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT 100
    `;
  } catch (error) {
    // Миграция 056 ещё не применилась — журнал пуст, экзамен работает
    log.warn('exam-events', 'read failed', error?.message || error);
  }
  return res.status(200).json({
    events: rows.map((r) => ({ ...r, id: String(r.id), detail: r.detail || {} })),
  });
}

/**
 * POST ?action=exam-create  Body: { sessionId, durationSec?, exitControl? }
 * Открывает черновик: код для входа, status = 'waiting'. Дальше — как обычный тест
 * (TestLobbyScreen → start).
 */
export async function examCreate(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { sessionId } = req.body || {};
  const session = await loadOwnExam(res, sql, userId, sessionId);
  if (!session) return;
  if (session.status !== 'draft') {
    return res.status(200).json({
      sessionId: session.id,
      code: session.code,
      exitControl: session.exit_control,
      questionCount: session.question_count,
      durationSec: session.duration_sec,
    });
  }
  const durationSec =
    Number(req.body.durationSec) > 0
      ? Math.min(Math.round(Number(req.body.durationSec)), 3 * 3600)
      : session.duration_sec;
  const exitControl =
    typeof req.body.exitControl === 'boolean' ? req.body.exitControl : session.exit_control;
  const code = await generateUniqueCode(sql);
  await sql`
    UPDATE test_sessions SET status = 'waiting', code = ${code}, duration_sec = ${durationSec},
      exit_control = ${exitControl}
    WHERE id = ${session.id}::uuid AND status = 'draft'
  `;
  return res.status(201).json({
    sessionId: session.id,
    code,
    exitControl,
    questionCount: session.question_count,
    durationSec,
    purpose: null,
  });
}

// ─── Ученик ─────────────────────────────────────────────────

/**
 * Вход в экзамен движка 2 (вызывается из joinTest, когда у сессии engine = 2).
 * Клиент без возможности EXAM_FEATURE получает 426 { update: true } — старые версии не умеют
 * новые форматы и показали бы пустой экран.
 */
export async function joinExam(req, res, sql, userId, session) {
  const features = Array.isArray(req.body?.features) ? req.body.features : [];
  if (!features.includes(EXAM_FEATURE)) {
    // Учитель увидит в журнале «не смог войти: старая версия» (веб-кабинет, Web 22)
    await logOldVersionAttempt(sql, session, userId);
    // Текст показывает как есть старое приложение (1.8.6 и раньше) — поэтому по-русски
    return res
      .status(426)
      .json({ error: 'Обновите приложение в App Store, чтобы пройти этот экзамен', update: true });
  }
  const clientExitControl = req.body?.exitControl === true;

  const membership = await sql`
    SELECT id FROM course_members
    WHERE course_id = ${session.course_id}::uuid AND user_id = ${userId}::uuid
  `;
  if (membership.length === 0) {
    return res.status(403).json({ error: 'You are not a member of this course' });
  }

  const base = {
    sessionId: session.id,
    teacherName: session.teacher_name,
    setTitle: session.set_title,
    testMode: 'exam',
    engine: 2,
    timePerQuestion: 0,
    durationSec: session.duration_sec,
    exitControl: session.exit_control,
    status: session.status,
  };

  const existing = await sql`
    SELECT id, answer_count, correct_count, question_order, score, finished_at, left_reason,
           rejoin_allowed, submitted_at
    FROM test_participants
    WHERE session_id = ${session.id}::uuid AND user_id = ${userId}::uuid
  `;
  if (existing.length > 0) {
    let ex = existing[0];
    // Повторный вход в идущий экзамен с контролем выхода = приложение закрывали (как в движке 1)
    if (
      session.exit_control &&
      clientExitControl &&
      session.status === 'active' &&
      !ex.finished_at
    ) {
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
      ...base,
      participantId: ex.id,
      questionCount: ex.question_order?.length || session.question_count,
      alreadyJoined: true,
      answerCount: ex.answer_count,
      finished: Boolean(ex.finished_at),
      ...(ex.left_reason ? attemptSummary(ex) : {}),
    });
  }

  const user = await sql`
    SELECT COALESCE(display_name, email, 'Student') AS name FROM users WHERE id = ${userId}::uuid
  `;
  const displayName = user[0]?.name || 'Student';

  const [participant] = await sql`
    INSERT INTO test_participants (session_id, user_id, display_name, question_order, client_exit_control)
    VALUES (${session.id}::uuid, ${userId}::uuid, ${displayName}, '[]'::jsonb, ${clientExitControl})
    ON CONFLICT (session_id, user_id) DO UPDATE SET display_name = EXCLUDED.display_name
    RETURNING id
  `;
  // Порядок — с зерном participant_id: он известен только после вставки
  const items = await loadItems(sql, session.id);
  const view = studentScreens(items, participant.id);
  await sql`
    UPDATE test_participants
    SET question_order = ${JSON.stringify(view.cardOrder)}::jsonb,
        block_order = ${JSON.stringify(view.blockOrder)}::jsonb
    WHERE id = ${participant.id}::uuid
  `;

  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  await broadcast(session.id, 'student_joined', {
    userId,
    displayName,
    initials,
    clientExitControl,
  });

  return res.status(200).json({
    ...base,
    participantId: participant.id,
    questionCount: view.cardOrder.length,
  });
}

/** Участник вызывающего + сессия экзамена. При ошибке отправляет ответ и возвращает null. */
async function loadOwnExamParticipant(res, sql, userId, participantId) {
  if (!isUuid(participantId)) {
    res.status(400).json({ error: 'participantId is required' });
    return null;
  }
  const rows = await sql`
    SELECT p.*, s.status AS session_status, s.exit_control, s.engine, s.started_at,
           s.duration_sec, s.paused_at, s.paused_total_sec, s.reveal_mode,
           s.results_released_at, s.course_id, s.teacher_id
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
  if (rows[0].engine !== 2) {
    res.status(400).json({ error: 'Not an exam' });
    return null;
  }
  return rows[0];
}

function timing(p, now = Date.now()) {
  const session = {
    started_at: p.started_at,
    duration_sec: p.duration_sec,
    paused_total_sec: p.paused_total_sec,
    paused_at: p.paused_at,
  };
  const deadline = deadlineMs(session, p, now);
  return {
    deadline: deadline ? new Date(deadline).toISOString() : null,
    remainingSec: deadline ? Math.max(0, Math.round((deadline - now) / 1000)) : null,
    paused: Boolean(p.paused_at),
    serverNow: new Date(now).toISOString(),
  };
}

/**
 * POST ?action=exam-state  Body: { participantId }
 * Все экраны ученика в его порядке (без правильных ответов), его ответы и срок.
 */
export async function examState(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const p = await loadOwnExamParticipant(res, sql, userId, req.body?.participantId);
  if (!p) return;
  await finishExpired(sql, p.session_id);
  const [fresh] = await sql`
    SELECT finished_at, submitted_at, left_reason, answer_count, correct_count, question_order, score
    FROM test_participants WHERE id = ${p.id}::uuid
  `;
  const items = await loadItems(sql, p.session_id);
  const view = studentScreens(items, p.id, p.block_order);
  const answers = await sql`
    SELECT item_id, chosen_answer FROM test_answers WHERE participant_id = ${p.id}::uuid
  `;
  return res.status(200).json({
    status: p.session_status,
    screens: view.screens,
    total: view.cardOrder.length,
    answers: Object.fromEntries(answers.map((a) => [a.item_id, a.chosen_answer])),
    finished: Boolean(fresh.finished_at),
    submitted: Boolean(fresh.submitted_at),
    left: Boolean(fresh.left_reason),
    leftReason: fresh.left_reason || null,
    ...timing(p),
  });
}

/**
 * POST ?action=exam-answer  Body: { participantId, itemId, response, timeSpentSec? }
 * Сохранить ответ (UPSERT — до сдачи ответ можно менять; пустой ответ — убрать). Правильный
 * ответ и верно/неверно НЕ возвращаются. После срока — 409 { deadline: true }.
 */
export async function examAnswer(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { participantId, itemId } = req.body || {};
  const p = await loadOwnExamParticipant(res, sql, userId, participantId);
  if (!p) return;
  if (await rejectIfLeft(sql, res, p.id, p)) return;
  if (p.session_status !== 'active') return res.status(409).json({ error: 'Test not active' });
  if (p.finished_at || p.submitted_at) {
    return res.status(409).json({ error: 'Already submitted', submitted: true });
  }
  if (p.paused_at) return res.status(409).json({ error: 'Exam paused', paused: true });
  const deadline = deadlineMs(p, p);
  if (deadline && Date.now() > deadline + DEADLINE_GRACE_SEC * 1000) {
    return res.status(409).json({ error: 'Time is up', deadline: true });
  }
  if (!isUuid(itemId)) return res.status(400).json({ error: 'itemId is required' });
  const [row] = await sql`
    SELECT id, card_id, block_no, format, direction, prompt, answer, options, extra, difficulty,
           points, voided, accepted_answers, sort_key
    FROM test_items WHERE id = ${itemId}::uuid AND session_id = ${p.session_id}::uuid
  `;
  if (!row || !row.card_id)
    return res.status(400).json({ error: 'Card is not part of this test session' });
  const item = toItem(row);

  const response = String(req.body.response ?? '').slice(0, MAX_ANSWER_LEN);
  const timeSpent = Math.max(0, Math.min(3600, Math.round(Number(req.body.timeSpentSec) || 0)));
  if (!response.trim()) {
    await sql`DELETE FROM test_answers WHERE participant_id = ${p.id}::uuid AND item_id = ${item.id}::uuid`;
  } else {
    const { verdict } = checkAnswer(item, response);
    const ok = verdict === 'correct';
    await sql`
      INSERT INTO test_answers (participant_id, card_id, item_id, chosen_answer, correct_answer,
        is_correct, verdict, points, time_spent_sec, updated_at)
      VALUES (${p.id}::uuid, ${item.cardId}::uuid, ${item.id}::uuid, ${response}, ${item.answer},
        ${ok}, ${verdict}, ${ok ? item.points : 0}, ${timeSpent}, NOW())
      ON CONFLICT (participant_id, card_id) DO UPDATE SET
        item_id = EXCLUDED.item_id, chosen_answer = EXCLUDED.chosen_answer,
        is_correct = EXCLUDED.is_correct, verdict = EXCLUDED.verdict, points = EXCLUDED.points,
        time_spent_sec = COALESCE(test_answers.time_spent_sec, 0) + EXCLUDED.time_spent_sec,
        updated_at = NOW()
    `;
  }
  const [counts] = await sql`
    UPDATE test_participants SET
      answer_count = (SELECT COUNT(*) FROM test_answers WHERE participant_id = ${p.id}::uuid),
      correct_count = (SELECT COUNT(*) FROM test_answers
                       WHERE participant_id = ${p.id}::uuid AND verdict = 'correct'),
      rejoin_allowed = false
    WHERE id = ${p.id}::uuid
    RETURNING answer_count, question_order
  `;
  const total = counts.question_order?.length || 0;
  await broadcast(p.session_id, 'progress_update', {
    userId: p.user_id,
    displayName: p.display_name,
    answered: counts.answer_count,
    total,
    done: false,
  });
  return res.status(200).json({ ok: true, answered: counts.answer_count, total });
}

/**
 * POST ?action=exam-submit  Body: { participantId }
 * Сдать экзамен. reveal_mode = 'on_submit' — сразу разбор, иначе «результаты откроет учитель».
 */
export async function examSubmit(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const p = await loadOwnExamParticipant(res, sql, userId, req.body?.participantId);
  if (!p) return;
  if (!p.finished_at) {
    const items = await loadItems(sql, p.session_id);
    const answers = await answerMap(sql, p.id);
    const { score } = scoreParticipant(items, answers);
    await sql`
      UPDATE test_participants SET finished_at = NOW(), submitted_at = NOW(), score = ${score}
      WHERE id = ${p.id}::uuid AND finished_at IS NULL
    `;
    await broadcast(p.session_id, 'progress_update', {
      userId: p.user_id,
      displayName: p.display_name,
      answered: p.answer_count,
      total: p.question_order?.length || 0,
      done: true,
    });
  }
  const released = p.reveal_mode === 'on_submit' || Boolean(p.results_released_at);
  return res.status(200).json({
    submitted: true,
    released,
    ...(released ? await studentReview(sql, p.session_id, p.id) : {}),
  });
}

async function answerMap(sql, participantId) {
  const rows = await sql`
    SELECT item_id, chosen_answer FROM test_answers
    WHERE participant_id = ${participantId}::uuid AND item_id IS NOT NULL
  `;
  return new Map(rows.map((r) => [r.item_id, r.chosen_answer]));
}

/**
 * Завершить попытки, у которых истёк срок (лениво — при обращении, без cron), и саму сессию,
 * когда истёк самый поздний срок. Балл — по движку.
 */
export async function finishExpired(sql, sessionId) {
  const [s] = await sql`
    SELECT id, status, started_at, duration_sec, paused_at, paused_total_sec, engine
    FROM test_sessions WHERE id = ${sessionId}::uuid
  `;
  if (
    !s ||
    s.engine !== 2 ||
    s.status !== 'active' ||
    !s.started_at ||
    !s.duration_sec ||
    s.paused_at
  ) {
    return;
  }
  const expired = await sql`
    SELECT id, extra_sec FROM test_participants
    WHERE session_id = ${sessionId}::uuid AND finished_at IS NULL
      AND ${s.started_at}::timestamptz + make_interval(secs => (${s.duration_sec}::int
          + ${s.paused_total_sec || 0}::int + extra_sec + ${DEADLINE_GRACE_SEC}::int)) < NOW()
  `;
  if (expired.length) {
    const items = await loadItems(sql, sessionId);
    for (const e of expired) {
      const { score } = scoreParticipant(items, await answerMap(sql, e.id));
      await sql`
        UPDATE test_participants SET finished_at = NOW(), submitted_at = NOW(), score = ${score}
        WHERE id = ${e.id}::uuid AND finished_at IS NULL
      `;
    }
  }
  const [late] = await sql`
    SELECT COALESCE(MAX(extra_sec), 0)::int AS extra FROM test_participants
    WHERE session_id = ${sessionId}::uuid
  `;
  const end =
    new Date(s.started_at).getTime() +
    (s.duration_sec + (s.paused_total_sec || 0) + (late?.extra || 0) + SESSION_FINISH_MARGIN_SEC) *
      1000;
  if (Date.now() > end) {
    const updated = await sql`
      UPDATE test_sessions SET status = 'finished', finished_at = NOW()
      WHERE id = ${sessionId}::uuid AND status = 'active'
      RETURNING id
    `;
    if (updated.length) await broadcastTestFinished(sessionId);
  }
}

// ─── Учитель: во время экзамена ─────────────────────────────

/** POST ?action=exam-pause  Body: { sessionId, paused: boolean } — пауза для всех */
export async function examPause(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const session = await loadOwnExam(res, sql, userId, req.body?.sessionId);
  if (!session) return;
  if (session.status !== 'active') return res.status(409).json({ error: 'Test not active' });
  const pause = req.body.paused === true;
  const [row] = pause
    ? await sql`
        UPDATE test_sessions SET paused_at = COALESCE(paused_at, NOW())
        WHERE id = ${session.id}::uuid RETURNING *
      `
    : await sql`
        UPDATE test_sessions SET
          paused_total_sec = paused_total_sec +
            COALESCE(ROUND(EXTRACT(EPOCH FROM (NOW() - paused_at)))::int, 0),
          paused_at = NULL
        WHERE id = ${session.id}::uuid RETURNING *
      `;
  const payload = { paused: Boolean(row.paused_at) };
  await logExamEvent(sql, { sessionId: session.id, kind: payload.paused ? 'paused' : 'resumed' });
  await Promise.all([
    broadcast(session.id, 'exam_paused', payload),
    broadcast(session.id, 'exam_paused', payload, ':exam'),
  ]);
  return res.status(200).json({ ok: true, ...payload, pausedTotalSec: row.paused_total_sec });
}

/** POST ?action=exam-extra-time  Body: { sessionId, userId, minutes } — +N минут ученику */
export async function examExtraTime(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { sessionId, userId: studentId } = req.body || {};
  const session = await loadOwnExam(res, sql, userId, sessionId);
  if (!session) return;
  const minutes = Math.max(1, Math.min(30, Math.round(Number(req.body.minutes) || 2)));
  if (!isUuid(studentId)) return res.status(400).json({ error: 'userId is required' });
  const rows = await sql`
    UPDATE test_participants SET extra_sec = extra_sec + ${minutes * 60}
    WHERE session_id = ${session.id}::uuid AND user_id = ${studentId}::uuid AND finished_at IS NULL
    RETURNING extra_sec
  `;
  if (rows.length === 0) return res.status(404).json({ error: 'Participant not found' });
  await logExamEvent(sql, {
    sessionId: session.id,
    userId: studentId,
    kind: 'extra_time',
    detail: { minutes },
  });
  await broadcast(
    session.id,
    'exam_time',
    { userId: studentId, extraSec: rows[0].extra_sec },
    ':exam'
  );
  return res.status(200).json({ ok: true, extraSec: rows[0].extra_sec });
}

// ─── Учитель: итоги и оценки ────────────────────────────────

async function loadParticipants(sql, sessionId) {
  const parts = await sql`
    SELECT id, user_id, display_name, score, score_override, score_comment, finished_at,
           submitted_at, left_reason, away_count, client_exit_control, extra_sec, question_order
    FROM test_participants WHERE session_id = ${sessionId}::uuid
    ORDER BY joined_at
  `;
  const answers = await sql`
    SELECT ta.participant_id, ta.item_id, ta.chosen_answer, ta.time_spent_sec
    FROM test_answers ta
    JOIN test_participants tp ON tp.id = ta.participant_id
    WHERE tp.session_id = ${sessionId}::uuid AND ta.item_id IS NOT NULL
  `;
  const byP = new Map(parts.map((p) => [p.id, new Map()]));
  const times = new Map(parts.map((p) => [p.id, []]));
  for (const a of answers) {
    byP.get(a.participant_id)?.set(a.item_id, a.chosen_answer);
    times.get(a.participant_id)?.push(a.time_spent_sec || 0);
  }
  return parts.map((p) => ({
    ...p,
    name: p.display_name,
    answers: byP.get(p.id),
    override: p.score_override,
    times: times.get(p.id),
  }));
}

/** Пересчитать вердикты ответов и баллы всех участников (после «засчитать» / «аннулировать») */
export async function recomputeScores(sql, sessionId, items, participants) {
  const ansIds = [];
  const verdicts = [];
  const oks = [];
  const pts = [];
  const pIds = [];
  const scores = [];
  const corrects = [];
  const answerRows = await sql`
    SELECT ta.id, ta.participant_id, ta.item_id FROM test_answers ta
    JOIN test_participants tp ON tp.id = ta.participant_id
    WHERE tp.session_id = ${sessionId}::uuid AND ta.item_id IS NOT NULL
  `;
  const results = new Map();
  for (const p of participants) {
    const r = scoreParticipant(items, p.answers, p.override);
    results.set(p.id, r);
    pIds.push(p.id);
    scores.push(r.score);
    corrects.push(r.counts.correct);
  }
  for (const a of answerRows) {
    const r = results.get(a.participant_id)?.perItem.get(a.item_id);
    if (!r) continue;
    ansIds.push(a.id);
    verdicts.push(r.verdict);
    oks.push(r.verdict === 'correct');
    pts.push(r.points);
  }
  if (ansIds.length) {
    await sql`
      UPDATE test_answers ta SET verdict = v.verdict, is_correct = v.ok, points = v.pts
      FROM (SELECT unnest(${ansIds}::uuid[]) AS id, unnest(${verdicts}::text[]) AS verdict,
                   unnest(${oks}::boolean[]) AS ok, unnest(${pts}::numeric[]) AS pts) v
      WHERE ta.id = v.id
    `;
  }
  if (pIds.length) {
    await sql`
      UPDATE test_participants tp SET score = v.score, correct_count = v.correct
      FROM (SELECT unnest(${pIds}::uuid[]) AS id, unnest(${scores}::int[]) AS score,
                   unnest(${corrects}::int[]) AS correct) v
      WHERE tp.id = v.id
    `;
  }
  return results;
}

function initialsOf(name) {
  return (name || 'S')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/** Точность класса на повторениях и доля повторявших — для подсказок разбора вопроса */
async function reviewKnowledge(sql, courseId, cardIds) {
  if (!cardIds.length) return new Map();
  const rows = await sql`
    WITH st AS (
      SELECT user_id FROM course_members WHERE course_id = ${courseId}::uuid AND role = 'student'
    )
    SELECT c.id AS card_id,
      (SELECT COUNT(*)::int FROM st) AS students,
      (SELECT COUNT(DISTINCT a.user_id)::int FROM answers a
        WHERE a.card_id = c.id AND a.user_id IN (SELECT user_id FROM st) AND a.rejected_reason IS NULL) AS studied,
      (SELECT COUNT(*)::int FROM answers a
        WHERE a.card_id = c.id AND a.user_id IN (SELECT user_id FROM st) AND a.rejected_reason IS NULL) AS total,
      (SELECT COUNT(*)::int FROM answers a
        WHERE a.card_id = c.id AND a.user_id IN (SELECT user_id FROM st)
          AND a.rejected_reason IS NULL AND a.correct) AS correct
    FROM cards c WHERE c.id = ANY(${cardIds}::uuid[])
  `;
  return new Map(
    rows.map((r) => [
      r.card_id,
      {
        rate: r.total > 0 ? r.correct / r.total : null,
        studiedShare: r.students > 0 ? r.studied / r.students : null,
      },
    ])
  );
}

/**
 * GET ?action=exam-results&sessionId=…
 * Итоги: карточки учеников со счётчиками вердиктов, слова, подозрительные вопросы.
 */
export async function examResults(req, res, sql, userId) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const session = await loadOwnExam(res, sql, userId, req.query.sessionId);
  if (!session) return;
  await finishExpired(sql, session.id);
  const [fresh] = await sql`
    SELECT ts.status, ts.results_released_at, ts.started_at, ts.finished_at, ts.created_at,
           cs.title AS set_title
    FROM test_sessions ts JOIN card_sets cs ON cs.id = ts.set_id WHERE ts.id = ${session.id}::uuid
  `;
  const items = await loadItems(sql, session.id);
  const participants = await loadParticipants(sql, session.id);

  const students = participants.map((p) => {
    const r = scoreParticipant(items, p.answers, p.override);
    const fast = p.times.length >= 5 && p.times.every((t) => t > 0 && t < 2);
    return {
      participantId: p.id,
      userId: p.user_id,
      name: p.name,
      initials: initialsOf(p.name),
      score: r.score,
      computedScore: r.computed,
      overridden: p.override !== null && p.override !== undefined,
      comment: p.score_comment || null,
      counts: r.counts,
      finished: Boolean(p.finished_at),
      leftReason: p.left_reason || null,
      awayCount: p.away_count || 0,
      flags: fast ? ['fast'] : [],
    };
  });
  students.sort((a, b) => b.score - a.score);

  const kept = new Set(items.filter((i) => i.extra?.kept).map((i) => i.id));
  const words = items.map((it) => {
    const st = itemStats(it, participants);
    return {
      itemId: it.id,
      cardId: it.cardId,
      format: it.format,
      prompt: it.prompt,
      answer: it.answer,
      voided: it.voided,
      accepted: it.accepted_answers,
      answered: st.answered,
      correct: st.correct,
      wrong: st.wrong,
      suspicious: !it.voided && !kept.has(it.id) && isSuspicious(st),
    };
  });

  const absent = await sql`
    SELECT cm.user_id, COALESCE(u.display_name, u.user_name, 'Ученик') AS name
    FROM course_members cm JOIN users u ON u.id = cm.user_id
    WHERE cm.course_id = ${session.course_id}::uuid AND cm.role = 'student'
      AND cm.user_id NOT IN (SELECT user_id FROM test_participants WHERE session_id = ${session.id}::uuid)
    ORDER BY name
  `;
  const scores = students.map((s) => s.score);
  return res.status(200).json({
    sessionId: session.id,
    status: fresh.status,
    setTitle: fresh.set_title,
    date: fresh.created_at,
    startedAt: fresh.started_at,
    finishedAt: fresh.finished_at,
    released: Boolean(fresh.results_released_at),
    releasedAt: fresh.results_released_at,
    durationSec: session.duration_sec,
    totalQuestions: items.length,
    avgScore: averageScore(scores),
    distribution: [
      { label: '90–100', n: scores.filter((s) => s >= 90).length },
      { label: '75–89', n: scores.filter((s) => s >= 75 && s < 90).length },
      { label: '50–74', n: scores.filter((s) => s >= 50 && s < 75).length },
      { label: '0–49', n: scores.filter((s) => s < 50).length },
    ],
    students,
    words,
    absent: absent.map((a) => ({ userId: a.user_id, name: a.name })),
  });
}

/**
 * GET ?action=exam-question&sessionId=…&itemId=…
 * Разбор одного вопроса: ответы по вариантам с именами, подсказки, «как изменятся баллы».
 */
export async function examQuestion(req, res, sql, userId) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const session = await loadOwnExam(res, sql, userId, req.query.sessionId);
  if (!session) return;
  const items = await loadItems(sql, session.id);
  const item = items.find((i) => i.id === req.query.itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const participants = await loadParticipants(sql, session.id);
  const st = itemStats(item, participants);
  const review = (
    await reviewKnowledge(sql, session.course_id, item.cardId ? [item.cardId] : [])
  ).get(item.cardId);
  const hints = whyHints(item, st, review || {});
  const acceptAnswer =
    hints.find((h) => h.suggest === 'accept')?.answer ||
    st.groups.find((g) => g.verdict !== 'correct' && g.count > 0)?.text ||
    null;
  const actions = {
    void: item.voided ? null : simulate(items, participants, { type: 'void', itemId: item.id }),
    accept: acceptAnswer
      ? {
          answer: acceptAnswer,
          ...simulate(items, participants, {
            type: 'accept',
            itemId: item.id,
            answer: acceptAnswer,
          }),
        }
      : null,
  };
  const log = await sql`
    SELECT id, action, payload, created_at FROM test_score_log
    WHERE session_id = ${session.id}::uuid AND item_id = ${item.id}::uuid AND undone_at IS NULL
    ORDER BY created_at DESC
  `;
  return res.status(200).json({
    item: {
      itemId: item.id,
      format: item.format,
      direction: item.direction,
      prompt: item.prompt,
      answer: item.answer,
      options: item.options,
      voided: item.voided,
      accepted: item.accepted_answers,
      kept: Boolean(item.extra?.kept),
      number: items.indexOf(item) + 1,
    },
    stats: { answered: st.answered, correct: st.correct, wrong: st.wrong },
    groups: st.groups,
    hints,
    review: review || null,
    actions,
    decisions: log.map((l) => ({
      logId: l.id,
      action: l.action,
      payload: l.payload,
      at: l.created_at,
    })),
  });
}

async function logDecision(
  sql,
  session,
  userId,
  action,
  { itemId = null, participantId = null, payload = {} }
) {
  const [row] = await sql`
    INSERT INTO test_score_log (session_id, teacher_id, action, item_id, participant_id, payload)
    VALUES (${session.id}::uuid, ${userId}::uuid, ${action}, ${itemId}, ${participantId},
            ${JSON.stringify(payload)}::jsonb)
    RETURNING id
  `;
  return row.id;
}

async function afterChange(sql, session) {
  const items = await loadItems(sql, session.id);
  const participants = await loadParticipants(sql, session.id);
  await recomputeScores(sql, session.id, items, participants);
  if (session.results_released_at) {
    await broadcast(session.id, 'exam_results_updated', { at: new Date().toISOString() }, ':exam');
  }
}

/**
 * POST ?action=exam-decide
 * Body: { sessionId, itemId, decision: 'void' | 'accept' | 'keep', answer? }
 * Решение по вопросу после разбора. Пересчёт баллов, запись в журнал.
 */
export async function examDecide(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { sessionId, itemId, decision } = req.body || {};
  const session = await loadOwnExam(res, sql, userId, sessionId);
  if (!session) return;
  if (!isUuid(itemId)) return res.status(400).json({ error: 'itemId is required' });
  const [item] = await sql`
    SELECT id, accepted_answers, voided FROM test_items
    WHERE id = ${itemId}::uuid AND session_id = ${session.id}::uuid
  `;
  if (!item) return res.status(404).json({ error: 'Item not found' });

  let logId;
  if (decision === 'void') {
    await sql`UPDATE test_items SET voided = true WHERE id = ${item.id}::uuid`;
    logId = await logDecision(sql, session, userId, 'void', { itemId: item.id });
  } else if (decision === 'accept') {
    const answer = String(req.body.answer || '')
      .trim()
      .slice(0, MAX_ANSWER_LEN);
    if (!answer) return res.status(400).json({ error: 'answer is required' });
    await sql`
      UPDATE test_items SET accepted_answers = accepted_answers || ${JSON.stringify([answer])}::jsonb
      WHERE id = ${item.id}::uuid
    `;
    logId = await logDecision(sql, session, userId, 'accept', {
      itemId: item.id,
      payload: { answer },
    });
  } else if (decision === 'keep') {
    await sql`
      UPDATE test_items SET extra = COALESCE(extra, '{}'::jsonb) || '{"kept": true}'::jsonb
      WHERE id = ${item.id}::uuid
    `;
    logId = await logDecision(sql, session, userId, 'keep', { itemId: item.id });
  } else {
    return res.status(400).json({ error: 'decision must be void, accept or keep' });
  }
  await afterChange(sql, session);
  return res.status(200).json({ ok: true, logId });
}

/**
 * POST ?action=exam-override  Body: { sessionId, participantId, score: 0..100 | null, comment? }
 * Изменить балл ученика вручную (null — вернуть посчитанный).
 */
export async function examOverride(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { sessionId, participantId } = req.body || {};
  const session = await loadOwnExam(res, sql, userId, sessionId);
  if (!session) return;
  if (!isUuid(participantId)) return res.status(400).json({ error: 'participantId is required' });
  const raw = req.body.score;
  const score = raw === null || raw === undefined || raw === '' ? null : Math.round(Number(raw));
  if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) {
    return res.status(400).json({ error: 'score must be 0..100' });
  }
  const comment = req.body.comment ? String(req.body.comment).slice(0, 500) : null;
  const [prev] = await sql`
    SELECT score_override, score_comment FROM test_participants
    WHERE id = ${participantId}::uuid AND session_id = ${session.id}::uuid
  `;
  if (!prev) return res.status(404).json({ error: 'Participant not found' });
  await sql`
    UPDATE test_participants SET score_override = ${score}, score_comment = ${comment}
    WHERE id = ${participantId}::uuid
  `;
  const logId = await logDecision(sql, session, userId, 'override', {
    participantId,
    payload: { score, comment, prevScore: prev.score_override, prevComment: prev.score_comment },
  });
  await afterChange(sql, session);
  return res.status(200).json({ ok: true, logId });
}

/** POST ?action=exam-undo  Body: { sessionId, logId } — отменить решение из журнала */
export async function examUndo(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { sessionId, logId } = req.body || {};
  const session = await loadOwnExam(res, sql, userId, sessionId);
  if (!session) return;
  if (!isUuid(logId)) return res.status(400).json({ error: 'logId is required' });
  const [entry] = await sql`
    UPDATE test_score_log SET undone_at = NOW()
    WHERE id = ${logId}::uuid AND session_id = ${session.id}::uuid AND undone_at IS NULL
    RETURNING action, item_id, participant_id, payload
  `;
  if (!entry) return res.status(404).json({ error: 'Decision not found' });
  if (entry.action === 'void') {
    // Вопрос остаётся аннулированным, если есть другое неотменённое аннулирование
    await sql`
      UPDATE test_items SET voided = EXISTS (
        SELECT 1 FROM test_score_log WHERE item_id = ${entry.item_id}::uuid AND action = 'void'
          AND undone_at IS NULL)
      WHERE id = ${entry.item_id}::uuid
    `;
  } else if (entry.action === 'accept') {
    const answers = await sql`
      SELECT payload->>'answer' AS answer FROM test_score_log
      WHERE item_id = ${entry.item_id}::uuid AND action = 'accept' AND undone_at IS NULL
    `;
    await sql`
      UPDATE test_items SET accepted_answers = ${JSON.stringify(answers.map((a) => a.answer))}::jsonb
      WHERE id = ${entry.item_id}::uuid
    `;
  } else if (entry.action === 'keep') {
    await sql`UPDATE test_items SET extra = extra - 'kept' WHERE id = ${entry.item_id}::uuid`;
  } else if (entry.action === 'override') {
    await sql`
      UPDATE test_participants SET score_override = ${entry.payload?.prevScore ?? null},
        score_comment = ${entry.payload?.prevComment ?? null}
      WHERE id = ${entry.participant_id}::uuid
    `;
  }
  await afterChange(sql, session);
  return res.status(200).json({ ok: true });
}

/**
 * POST ?action=exam-release  Body: { sessionId }
 * Открыть результаты ученикам.
 */
export async function examRelease(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const session = await loadOwnExam(res, sql, userId, req.body?.sessionId);
  if (!session) return;
  if (session.status !== 'finished') return res.status(409).json({ error: 'Test not finished' });
  const first = !session.results_released_at;
  const [row] = await sql`
    UPDATE test_sessions SET results_released_at = COALESCE(results_released_at, NOW())
    WHERE id = ${session.id}::uuid RETURNING results_released_at
  `;
  if (first) {
    await mistakesToReview(sql, session.id);
    await notifyResults(sql, session);
  }
  await broadcast(session.id, 'exam_results_released', { at: row.results_released_at }, ':exam');
  return res.status(200).json({ ok: true, releasedAt: row.results_released_at });
}

/**
 * Ошибки возвращаются в обучение (LiveExam 20): слова, на которые ученик ответил неверно или не
 * ответил, — по правилу неверного ответа в повторении (api/progress.js, applyAnswer): шаг −1, не
 * ниже 0, сразу к повторению. Только у слов, которые ученик уже учил (строка card_progress есть).
 */
export async function mistakesToReview(sql, sessionId) {
  const rows = await sql`
    WITH m AS (
      SELECT DISTINCT tp.user_id, ti.card_id
      FROM test_items ti
      JOIN test_participants tp ON tp.session_id = ti.session_id
      LEFT JOIN test_answers ta ON ta.participant_id = tp.id AND ta.item_id = ti.id
      WHERE ti.session_id = ${sessionId}::uuid AND NOT ti.voided AND ti.card_id IS NOT NULL
        AND COALESCE(ta.verdict, 'none') <> 'correct'
    )
    UPDATE card_progress cp SET
      learning_step = GREATEST(0, COALESCE(cp.learning_step, 0) - 1),
      status = CASE
        WHEN GREATEST(0, COALESCE(cp.learning_step, 0) - 1) = 0 THEN 'new'
        WHEN GREATEST(0, COALESCE(cp.learning_step, 0) - 1) <= 2 THEN 'learning'
        WHEN GREATEST(0, COALESCE(cp.learning_step, 0) - 1) <= 4 THEN 'young'
        ELSE 'mature' END,
      next_review = NOW(),
      review_scheduled = false,
      updated_at = NOW()
    FROM m
    WHERE cp.user_id = m.user_id AND cp.card_id = m.card_id
    RETURNING cp.card_id
  `;
  return rows.length;
}

/** Пуш «Результат экзамена: N из 100» каждому сдававшему (тихие часы — в sendNotification) */
async function notifyResults(sql, session) {
  try {
    const { sendNotification } = await import('../../push.js');
    const items = await loadItems(sql, session.id);
    const participants = await loadParticipants(sql, session.id);
    const [meta] = await sql`
      SELECT cs.title FROM card_sets cs WHERE cs.id = ${session.set_id}::uuid
    `;
    await Promise.allSettled(
      participants.map((p) =>
        sendNotification(sql, p.user_id, 'exam_results', {
          sessionId: session.id,
          score: scoreParticipant(items, p.answers, p.override).score,
          title: meta?.title || '',
        })
      )
    );
  } catch (e) {
    log.error('test', 'exam results push failed', e);
  }
}

/** Подготовка учеников: повторения слов экзамена и дни с повторениями за 14 дней до начала */
export const PREP_DAYS = 14;

async function preparation(sql, session) {
  const cardIds = (session.card_ids || []).filter(Boolean);
  const since = session.started_at || session.created_at;
  if (!cardIds.length || !since) return new Map();
  const rows = await sql`
    SELECT rl.user_id, COUNT(*)::int AS reviews,
           COUNT(DISTINCT date_trunc('day', rl.reviewed_at))::int AS days
    FROM review_log rl
    WHERE rl.card_id = ANY(${cardIds}::uuid[])
      AND rl.reviewed_at <= ${since}::timestamptz
      AND rl.reviewed_at > ${since}::timestamptz - make_interval(days => ${PREP_DAYS})
      AND rl.user_id IN (SELECT user_id FROM test_participants WHERE session_id = ${session.id}::uuid)
    GROUP BY rl.user_id
  `;
  return new Map(rows.map((r) => [r.user_id, { reviews: r.reviews, days: r.days }]));
}

/**
 * GET ?action=exam-student&sessionId=…&participantId=…
 * Карточка ученика для учителя: ответы с вердиктами, подготовка против класса, выходы из
 * приложения, ручной балл и комментарий.
 */
export async function examStudent(req, res, sql, userId) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const session = await loadOwnExam(res, sql, userId, req.query.sessionId);
  if (!session) return;
  const { participantId } = req.query;
  if (!isUuid(participantId)) return res.status(400).json({ error: 'participantId is required' });
  const [p] = await sql`
    SELECT id, user_id, display_name, score_override, score_comment, left_reason, away_count,
           finished_at, submitted_at, extra_sec
    FROM test_participants WHERE id = ${participantId}::uuid AND session_id = ${session.id}::uuid
  `;
  if (!p) return res.status(404).json({ error: 'Participant not found' });
  const review = await studentReview(sql, session.id, p.id);
  const prep = await preparation(sql, session);
  const [count] = await sql`
    SELECT COUNT(*)::int AS n FROM test_participants WHERE session_id = ${session.id}::uuid
  `;
  const all = [...prep.values()];
  const n = Math.max(1, count?.n || 1);
  const mine = prep.get(p.user_id) || { reviews: 0, days: 0 };
  const [computed] = [review.score];
  return res.status(200).json({
    participantId: p.id,
    userId: p.user_id,
    name: p.display_name,
    override: p.score_override,
    comment: p.score_comment,
    leftReason: p.left_reason,
    awayCount: p.away_count || 0,
    finished: Boolean(p.finished_at),
    extraSec: p.extra_sec || 0,
    preparation: {
      days: PREP_DAYS,
      reviews: mine.reviews,
      reviewDays: mine.days,
      classReviews: Math.round(all.reduce((a, x) => a + x.reviews, 0) / n),
      classReviewDays: Math.round((all.reduce((a, x) => a + x.days, 0) / n) * 10) / 10,
    },
    ...review,
    score: computed,
  });
}

/** Вызвать обработчик api/teacher.js изнутри (те же проверки, зачёт выученного, пуш) */
function callHandler(fn, body, sql, userId) {
  return new Promise((resolve) => {
    let code = 200;
    const res = {
      status(c) {
        code = c;
        return res;
      },
      json(b) {
        resolve({ status: code, body: b });
        return res;
      },
      setHeader: () => res,
    };
    Promise.resolve(fn({ method: 'POST', body, query: {} }, res, sql, userId)).catch((e) =>
      resolve({ status: 500, body: { error: e.message } })
    );
  });
}

/**
 * POST ?action=exam-homework  Body: { sessionId, dueAt, title? }
 * Домашка по ошибкам (LiveExam 23): каждому ученику — задание из его слов с ошибками
 * («повторить»), через обычные задания учителя (api/_handlers/teacher/homework.js).
 */
export async function examHomework(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const session = await loadOwnExam(res, sql, userId, req.body?.sessionId);
  if (!session) return;
  const { dueAt } = req.body;
  const [meta] = await sql`SELECT title FROM card_sets WHERE id = ${session.set_id}::uuid`;
  const title = String(req.body.title || `Ошибки экзамена · ${meta?.title || ''}`)
    .trim()
    .slice(0, 80);
  const items = await loadItems(sql, session.id);
  const participants = await loadParticipants(sql, session.id);
  const { homeworkCreate } = await import('../teacher/homework.js');
  const created = [];
  const failed = [];
  for (const p of participants) {
    const r = scoreParticipant(items, p.answers, null);
    const cardIds = items
      .filter((it) => !it.voided && it.cardId && r.perItem.get(it.id).verdict !== 'correct')
      .map((it) => it.cardId);
    if (cardIds.length === 0) continue;
    const out = await callHandler(
      homeworkCreate,
      { courseId: session.course_id, title, cardIds, dueAt, userIds: [p.user_id], kind: 'review' },
      sql,
      userId
    );
    if (out.status === 200) created.push({ name: p.name, words: cardIds.length });
    else failed.push({ name: p.name, reason: out.body?.reason || out.body?.error });
  }
  if (created.length === 0 && failed.length > 0) {
    return res.status(400).json({ error: 'Homework failed', reason: failed[0].reason, failed });
  }
  return res.status(200).json({ ok: true, created, failed });
}

/**
 * POST ?action=exam-retake  Body: { sessionId }
 * Пересдача: новый черновик с теми же словами и вариантами (порядок у учеников снова свой).
 */
export async function examRetake(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const session = await loadOwnExam(res, sql, userId, req.body?.sessionId);
  if (!session) return;
  const config = { ...(session.config || {}), retakeOf: session.id };
  const [copy] = await sql`
    INSERT INTO test_sessions (teacher_id, set_id, course_id, code, test_mode, question_count,
      time_per_question, status, exit_control, card_ids, engine, config, duration_sec, reveal_mode)
    VALUES (${userId}::uuid, ${session.set_id}::uuid, ${session.course_id}::uuid, '0000', 'exam',
      ${session.question_count}, 0, 'draft', ${session.exit_control}, ${session.card_ids}::uuid[], 2,
      ${JSON.stringify(config)}::jsonb, ${session.duration_sec}, ${session.reveal_mode})
    RETURNING id
  `;
  await sql`
    INSERT INTO test_items (session_id, card_id, block_no, format, direction, prompt, answer,
      options, extra, difficulty, points, sort_key)
    SELECT ${copy.id}::uuid, card_id, block_no, format, direction, prompt, answer, options,
      COALESCE(extra, '{}'::jsonb) - 'kept', difficulty, points, sort_key
    FROM test_items WHERE session_id = ${session.id}::uuid
  `;
  return res.status(201).json({ sessionId: copy.id });
}

// ─── Ученик: результат ──────────────────────────────────────

/** Разбор для ученика: балл, по форматам, ответы с пометками учителя */
async function studentReview(sql, sessionId, participantId) {
  const items = await loadItems(sql, sessionId);
  const [p] = await sql`
    SELECT score_override, score_comment FROM test_participants WHERE id = ${participantId}::uuid
  `;
  const answers = await answerMap(sql, participantId);
  const r = scoreParticipant(items, answers, p?.score_override);
  const byFormat = {};
  for (const it of items) {
    if (it.voided) continue;
    const f = (byFormat[it.format] ||= { total: 0, correct: 0 });
    f.total++;
    if (r.perItem.get(it.id).verdict === 'correct') f.correct++;
  }
  return {
    score: r.score,
    counts: r.counts,
    byFormat,
    comment: p?.score_comment || null,
    items: items.map((it) => {
      const res = r.perItem.get(it.id);
      return {
        itemId: it.id,
        cardId: it.cardId,
        format: it.format,
        prompt: it.prompt,
        answer: it.answer,
        given: answers.get(it.id) ?? null,
        verdict: res.verdict,
        accepted: res.accepted,
        voided: it.voided,
        points: res.points,
      };
    }),
  };
}

/**
 * GET ?action=exam-my                 — мои экзамены (балл, если учитель открыл результаты)
 * GET ?action=exam-my&sessionId=…     — разбор одного экзамена
 */
export async function examMy(req, res, sql, userId) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { sessionId } = req.query;
  if (sessionId) {
    if (!isUuid(sessionId)) return res.status(400).json({ error: 'sessionId is invalid' });
    const [p] = await sql`
      SELECT tp.id, ts.results_released_at, ts.reveal_mode, ts.created_at, ts.engine,
             cs.title AS set_title
      FROM test_participants tp
      JOIN test_sessions ts ON ts.id = tp.session_id
      JOIN card_sets cs ON cs.id = ts.set_id
      WHERE tp.session_id = ${sessionId}::uuid AND tp.user_id = ${userId}::uuid
    `;
    if (!p || p.engine !== 2) return res.status(404).json({ error: 'Session not found' });
    const released = Boolean(p.results_released_at) || p.reveal_mode === 'on_submit';
    if (!released) return res.status(200).json({ released: false, setTitle: p.set_title });
    return res.status(200).json({
      released: true,
      setTitle: p.set_title,
      date: p.created_at,
      ...(await studentReview(sql, sessionId, p.id)),
    });
  }
  const rows = await sql`
    SELECT ts.id AS session_id, cs.title AS set_title, ts.created_at, ts.results_released_at,
           ts.reveal_mode, tp.score, tp.submitted_at, tp.finished_at, c.title AS course_title
    FROM test_participants tp
    JOIN test_sessions ts ON ts.id = tp.session_id
    JOIN card_sets cs ON cs.id = ts.set_id
    LEFT JOIN courses c ON c.id = ts.course_id
    WHERE tp.user_id = ${userId}::uuid AND ts.engine = 2 AND tp.finished_at IS NOT NULL
    ORDER BY ts.created_at DESC
    LIMIT 50
  `;
  return res.status(200).json(
    rows.map((r) => {
      const released = Boolean(r.results_released_at) || r.reveal_mode === 'on_submit';
      return {
        sessionId: r.session_id,
        setTitle: r.set_title,
        courseTitle: r.course_title,
        date: r.created_at,
        released,
        score: released ? r.score : null,
      };
    })
  );
}
