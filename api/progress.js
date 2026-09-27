import { neon } from '@neondatabase/serverless';
import { getAuthedUserId } from './_auth.js';
import { ensureDatabaseInitialized } from './_db-init.js';
import { HttpError, UUID_RE, uuid, assertReadableSet } from './_access.js';
import { courseSetIdsSql } from './_course.js';

/**
 * Прогресс по карточкам — единственное место, где меняется уровень карточки.
 *
 * Клиент сообщает только факт ответа; уровень и дату следующего повторения считает сервер.
 * Правила — plan/course_rating_and_review_plan.md, этап 1 (1.2–1.4). Та же логика для
 * мгновенного отклика на устройстве — src/services/SRSService.ts (applyAnswer); при изменении
 * правил менять оба места.
 *
 * POST /api/progress?action=answer  { answers: Answer[] }  (до 50 за раз, для офлайн-очереди)
 *   Answer = { answerId: uuid, cardId: uuid, mode: 'test'|'builder'|'flashcard',
 *              chosen?: string,        // test — id выбранной карточки-варианта; builder — собранное слово
 *              selfRating?: 1..4,      // flashcard — самооценка
 *              answeredAt: ms, timeSpentMs?: number }
 *   → { results: [{ answerId, cardId, status: 'ok'|'duplicate'|'rejected', reason?,
 *                   learningStep, nextReview, lastReviewed, points }] }
 *
 * GET  /api/progress?action=leaderboard&courseId=…&week=current|previous — рейтинг курса (этап 2)
 * POST /api/progress?action=rating-enabled  { courseId, enabled }  — учитель включает/выключает рейтинг
 * POST /api/progress?action=hide-me         { courseId, hidden }   — ученик скрывает себя из рейтинга
 * GET  /api/progress?action=close-week      — Vercel Cron (Authorization: Bearer CRON_SECRET):
 *                                              заморозка итогов прошлой недели и награды топ-3
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Интервал в днях по шагу: 0 — сегодня, 1 — 1 день, 2 — 3, 3 — 7, 4 — 14, 5 — 30, 6+ — 60 */
const INTERVALS = [0, 1, 3, 7, 14, 30, 60];
/** Повторение «вовремя», если до срока осталось не больше 6 часов (повторил вечером накануне). */
const DUE_GRACE_MS = 6 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 5 * 60 * 1000;
const MAX_AGE_MS = 7 * DAY_MS;
const RATE_LIMIT_PER_MINUTE = 60;
const MAX_BATCH = 50;
const MODES = new Set(['test', 'builder', 'flashcard']);

// ── Очки (план §2.1) ──
const POINTS = { new: 1, review: 2, learned: 3, mature: 5 };
/** Ответ быстрее — засчитывается в уровень, но без очков (бот/случайное нажатие) */
const MIN_ANSWER_MS_FOR_POINTS = 600;
/** Потолок очков за день в одном курсе — сверх него очки копятся, но в рейтинг не идут */
const DAILY_POINTS_CAP = 300;
/** Награда топ-3 недели (алмазы) и минимум очков, чтобы её получить */
const WEEKLY_REWARDS = [50, 30, 20];
const MIN_POINTS_FOR_REWARD = 20;
const DEFAULT_TIMEZONE = 'Asia/Bishkek';

function intervalDays(step) {
  return INTERVALS[Math.min(Math.max(step, 0), INTERVALS.length - 1)];
}

function statusForStep(step) {
  if (step === 0) return 'new';
  if (step <= 2) return 'learning';
  if (step <= 4) return 'young';
  return 'mature';
}

const normalize = (value) => String(value ?? '').trim().toLowerCase();

/**
 * Новое состояние карточки после ответа (план §1.2):
 * - «Не знаю» (самооценка 1) → шаг 0, сразу к повторению;
 * - «Сомневаюсь» (самооценка 2) → шаг не меняется, сразу к повторению;
 * - ошибка → шаг −1 (не ниже 0), сразу к повторению;
 * - правильно, но время повторения не пришло → ничего не меняется;
 * - правильно и вовремя (или новая карточка) → шаг +1, следующее повторение по интервалу;
 * - слово просрочено дольше своего интервала («угасает») → сначала шаг −1, потом всё как выше.
 */
export function applyAnswer(state, { correct, selfRating, mode }, answeredAt) {
  const due = state.step === 0 || state.nextReview <= answeredAt + DUE_GRACE_MS;
  // Угасание (план §3.3): слово не повторяли дольше его интервала — оно подзабыто, шаг −1
  // до применения ответа; правильный ответ лишь возвращает прежний уровень
  const fading = isFading(state.step, state.nextReview, answeredAt);
  let step = fading ? state.step - 1 : state.step;
  let nextReview = state.nextReview;
  let reviewScheduled = state.reviewScheduled;

  if (mode === 'flashcard' && selfRating === 1) {
    step = 0;
    nextReview = answeredAt;
    reviewScheduled = false;
  } else if (mode === 'flashcard' && selfRating === 2) {
    nextReview = answeredAt;
    reviewScheduled = false;
  } else if (!correct) {
    step = Math.max(0, step - 1);
    nextReview = answeredAt;
    reviewScheduled = false;
  } else if (due) {
    step = step + 1;
    nextReview = answeredAt + intervalDays(step) * DAY_MS;
    reviewScheduled = true;
  }
  return { step, nextReview, due, reviewScheduled, fading };
}

/** Просрочено дольше интервала текущего шага — слово «угасает» (зеркало SRSService.isCardFading). */
export function isFading(step, nextReview, now) {
  return step >= 1 && now - nextReview > intervalDays(step) * DAY_MS;
}

/**
 * Очки за засчитанный ответ (план §2.1). Только объективные режимы, только правильный ответ.
 * - new: первый правильный ответ по новой карточке (один раз за карточку — уникальный индекс);
 * - review: повторение вовремя, если срок назначил правильный ответ (не ошибка);
 * - learned / mature: первый переход в «знаю» / «выучено надолго» (один раз за карточку).
 */
export function scoreAnswer(a, correct, state, next) {
  if (a.mode === 'flashcard' || !correct) return [];
  if (a.timeSpentMs !== null && a.timeSpentMs < MIN_ANSWER_MS_FOR_POINTS) return [];
  const events = [];
  if (state.step === 0 && next.step === 1) events.push({ kind: 'new', points: POINTS.new });
  else if (next.due && state.reviewScheduled) events.push({ kind: 'review', points: POINTS.review });
  if (next.step >= 3 && !state.firstLearnedAt) events.push({ kind: 'learned', points: POINTS.learned });
  if (next.step >= 5 && !state.firstMatureAt) events.push({ kind: 'mature', points: POINTS.mature });
  return events;
}

/** Проверка ответа сервером — клиент может только сообщить, что выбрал/собрал. */
function judge(answer, card) {
  if (answer.mode === 'test') return answer.chosen === card.id;
  if (answer.mode === 'builder') return normalize(answer.chosen) === normalize(card.front) && normalize(card.front) !== '';
  return answer.selfRating >= 3;
}

function parseAnswer(raw) {
  if (!raw || typeof raw !== 'object') throw new HttpError(400, 'answer must be an object');
  const { answerId, cardId, mode, chosen, selfRating, answeredAt, timeSpentMs } = raw;
  if (!UUID_RE.test(answerId || '') || !UUID_RE.test(cardId || '')) throw new HttpError(400, 'answerId and cardId must be uuids');
  if (!MODES.has(mode)) throw new HttpError(400, 'unknown mode');
  if (mode === 'flashcard' && ![1, 2, 3, 4].includes(selfRating)) throw new HttpError(400, 'selfRating 1..4 required');
  if (mode !== 'flashcard' && typeof chosen !== 'string') throw new HttpError(400, 'chosen required');
  const at = Number(answeredAt);
  if (!Number.isFinite(at)) throw new HttpError(400, 'answeredAt required');
  return {
    answerId, cardId, mode,
    chosen: typeof chosen === 'string' ? chosen.slice(0, 500) : null,
    selfRating: mode === 'flashcard' ? selfRating : null,
    answeredAt: Math.trunc(at),
    timeSpentMs: Number.isFinite(Number(timeSpentMs)) ? Math.max(0, Math.min(3_600_000, Math.trunc(Number(timeSpentMs)))) : null,
  };
}

async function readProgress(sql, me, cardId) {
  const rows = await sql`
    SELECT learning_step,
           (EXTRACT(EPOCH FROM next_review) * 1000)::bigint AS next_ms,
           (EXTRACT(EPOCH FROM last_reviewed) * 1000)::bigint AS last_ms,
           last_answer_id, review_scheduled, first_learned_at, first_mature_at
    FROM card_progress WHERE user_id = ${me}::uuid AND card_id = ${cardId}::uuid
  `;
  const r = rows[0];
  return {
    step: r.learning_step || 0,
    nextReview: r.next_ms != null ? Number(r.next_ms) : 0,
    lastReviewed: r.last_ms != null ? Number(r.last_ms) : 0,
    lastAnswerId: r.last_answer_id,
    reviewScheduled: r.review_scheduled === true,
    firstLearnedAt: r.first_learned_at,
    firstMatureAt: r.first_mature_at,
  };
}

/** Ответ, который не меняет уровень (дубликат не пишем, остальное — в журнал с причиной). */
async function rejectAnswer(sql, me, a, state, reason) {
  await sql`
    INSERT INTO answers (id, user_id, card_id, mode, correct, self_rating, was_due, step_before, step_after,
                         answered_at, time_spent_ms, rejected_reason)
    VALUES (${a.answerId}::uuid, ${me}::uuid, ${a.cardId}::uuid, ${a.mode}, false, ${a.selfRating},
            false, ${state.step}, ${state.step}, ${new Date(Math.max(0, a.answeredAt)).toISOString()},
            ${a.timeSpentMs}, ${reason})
    ON CONFLICT (id) DO NOTHING
  `;
  return { status: 'rejected', reason };
}

async function processAnswer(sql, me, a, now, recentCount) {
  const existing = await sql`SELECT 1 FROM answers WHERE id = ${a.answerId}::uuid`;
  if (existing.length > 0) return { status: 'duplicate' };

  const cardRows = await sql`SELECT id, set_id, front FROM cards WHERE id = ${a.cardId}::uuid`;
  const card = cardRows[0];
  if (!card) return { status: 'rejected', reason: 'card_not_found' };
  try {
    await assertReadableSet(sql, me, card.set_id);
  } catch {
    return { status: 'rejected', reason: 'no_access' };
  }

  // Строка прогресса: для карточки своего набора — со старым прогрессом из cards, иначе с нуля
  await sql`
    INSERT INTO card_progress (user_id, card_id, status, learning_step, next_review, last_reviewed, updated_at)
    SELECT ${me}::uuid, c.id,
           CASE WHEN s.user_id = ${me}::uuid THEN COALESCE(c.status, 'new') ELSE 'new' END,
           CASE WHEN s.user_id = ${me}::uuid THEN COALESCE(c.learning_step, 0) ELSE 0 END,
           CASE WHEN s.user_id = ${me}::uuid THEN COALESCE(c.next_review, NOW()) ELSE NOW() END,
           CASE WHEN s.user_id = ${me}::uuid THEN c.last_reviewed ELSE NULL END,
           NOW()
    FROM cards c JOIN card_sets s ON s.id = c.set_id
    WHERE c.id = ${a.cardId}::uuid
    ON CONFLICT (user_id, card_id) DO NOTHING
  `;

  for (let attempt = 0; attempt < 3; attempt++) {
    const state = await readProgress(sql, me, a.cardId);

    if (a.answeredAt > now + MAX_FUTURE_MS || a.answeredAt < now - MAX_AGE_MS) {
      return rejectAnswer(sql, me, a, state, 'bad_time');
    }
    if (recentCount.value >= RATE_LIMIT_PER_MINUTE) {
      return rejectAnswer(sql, me, a, state, 'rate_limit');
    }
    if (state.lastReviewed && a.answeredAt < state.lastReviewed - 1000) {
      return rejectAnswer(sql, me, a, state, 'out_of_order');
    }

    const correct = judge(a, card);
    const next = applyAnswer(state, { correct, selfRating: a.selfRating, mode: a.mode }, a.answeredAt);
    const events = scoreAnswer(a, correct, state, next);
    // «Выучено» для рейтинга фиксирует только объективная проверка (тест / «Собери слово»)
    const objectiveCorrect = a.mode !== 'flashcard' && correct;
    const answeredIso = new Date(a.answeredAt).toISOString();

    // Одним запросом: прогресс (только если никто не успел раньше — last_answer_id), журнал ответа
    // и очки. PK answers не даст применить один ответ дважды; уникальные индексы score_events —
    // начислить «новое/выучено» по карточке дважды.
    try {
      const rows = await sql`
        WITH upd AS (
          UPDATE card_progress SET
            learning_step = ${next.step},
            status = ${statusForStep(next.step)},
            next_review = ${new Date(next.nextReview).toISOString()}::timestamptz,
            last_reviewed = ${answeredIso}::timestamptz,
            review_scheduled = ${next.reviewScheduled},
            first_learned_at = CASE WHEN ${objectiveCorrect} AND ${next.step} >= 3 AND first_learned_at IS NULL
                                    THEN ${answeredIso}::timestamptz ELSE first_learned_at END,
            first_mature_at = CASE WHEN ${objectiveCorrect} AND ${next.step} >= 5 AND first_mature_at IS NULL
                                   THEN ${answeredIso}::timestamptz ELSE first_mature_at END,
            last_answer_id = ${a.answerId}::uuid,
            updated_at = NOW()
          WHERE user_id = ${me}::uuid AND card_id = ${a.cardId}::uuid
            AND last_answer_id IS NOT DISTINCT FROM ${state.lastAnswerId}::uuid
          RETURNING 1
        ), ans AS (
          INSERT INTO answers (id, user_id, card_id, mode, correct, self_rating, was_due, step_before, step_after,
                               answered_at, time_spent_ms)
          SELECT ${a.answerId}::uuid, ${me}::uuid, ${a.cardId}::uuid, ${a.mode}, ${correct}, ${a.selfRating},
                 ${next.due}, ${state.step}, ${next.step}, ${answeredIso}::timestamptz, ${a.timeSpentMs}
          WHERE EXISTS (SELECT 1 FROM upd)
          RETURNING id
        ), scored AS (
          INSERT INTO score_events (user_id, card_id, answer_id, kind, points, created_at)
          SELECT ${me}::uuid, ${a.cardId}::uuid, ans.id, ev.kind, ev.points, ${answeredIso}::timestamptz
          FROM ans CROSS JOIN json_to_recordset(${JSON.stringify(events)}::json) AS ev(kind text, points int)
          ON CONFLICT DO NOTHING
          RETURNING points
        )
        SELECT (SELECT id FROM ans) AS id, COALESCE((SELECT SUM(points) FROM scored), 0)::int AS points
      `;
      if (rows[0]?.id) {
        recentCount.value += 1;
        return {
          status: 'ok', learningStep: next.step, nextReview: next.nextReview, lastReviewed: a.answeredAt,
          points: rows[0].points,
        };
      }
      // Строку прогресса успел поменять параллельный запрос — перечитать и посчитать заново
    } catch (error) {
      if (error?.code === '23505') return { status: 'duplicate' };
      throw error;
    }
  }
  return { status: 'rejected', reason: 'conflict' };
}

async function submitAnswers(sql, me, body) {
  const list = Array.isArray(body?.answers) ? body.answers : null;
  if (!list || list.length === 0) throw new HttpError(400, 'answers[] required');
  if (list.length > MAX_BATCH) throw new HttpError(400, `max ${MAX_BATCH} answers per request`);
  // Офлайн-пачка — по времени ответа, чтобы уровни считались в том порядке, в каком ученик отвечал
  const answers = list.map(parseAnswer).sort((x, y) => x.answeredAt - y.answeredAt);

  const now = Date.now();
  const recent = await sql`
    SELECT COUNT(*)::int AS n FROM answers
    WHERE user_id = ${me}::uuid AND received_at > NOW() - INTERVAL '1 minute'
  `;
  const recentCount = { value: recent[0].n };

  const results = [];
  for (const a of answers) {
    const outcome = await processAnswer(sql, me, a, now, recentCount);
    const state = outcome.status === 'ok' ? outcome : await currentState(sql, me, a.cardId);
    results.push({
      answerId: a.answerId,
      cardId: a.cardId,
      status: outcome.status,
      ...(outcome.reason ? { reason: outcome.reason } : {}),
      learningStep: state?.learningStep ?? null,
      nextReview: state?.nextReview ?? null,
      lastReviewed: state?.lastReviewed ?? null,
      points: outcome.points ?? 0,
    });
  }
  return { results };
}

/** Текущее серверное состояние карточки (чтобы клиент выровнял своё после отказа/дубликата). */
async function currentState(sql, me, cardId) {
  const rows = await sql`
    SELECT learning_step,
           (EXTRACT(EPOCH FROM next_review) * 1000)::bigint AS next_ms,
           (EXTRACT(EPOCH FROM last_reviewed) * 1000)::bigint AS last_ms
    FROM card_progress WHERE user_id = ${me}::uuid AND card_id = ${cardId}::uuid
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    learningStep: r.learning_step || 0,
    nextReview: r.next_ms != null ? Number(r.next_ms) : null,
    lastReviewed: r.last_ms != null ? Number(r.last_ms) : null,
  };
}

// ─── Рейтинг курса (план, этап 2) ───────────────────────────────────────────

/** Курс, часовой пояс и роль пользователя в нём; нет доступа — 403. */
async function courseContext(sql, me, courseId) {
  const rows = await sql`
    SELECT c.id, c.user_id AS owner_id, c.rating_enabled,
           COALESCE(c.timezone, us.timezone, ${DEFAULT_TIMEZONE}) AS tz,
           cm.role, cm.hide_from_rating
    FROM courses c
    LEFT JOIN user_stats us ON us.user_id = c.user_id
    LEFT JOIN course_members cm ON cm.course_id = c.id AND cm.user_id = ${me}::uuid
    WHERE c.id = ${courseId}::uuid
  `;
  const course = rows[0];
  if (!course) throw new HttpError(404, 'Course not found');
  const isTeacher = course.owner_id === me;
  const isStudent = course.role === 'student';
  if (!isTeacher && !isStudent) throw new HttpError(403, 'Not a member of the course');
  return { ...course, isTeacher, isStudent };
}

/** Понедельник текущей недели (YYYY-MM-DD) по часовому поясу курса. */
async function currentWeekStart(sql, tz) {
  const rows = await sql`SELECT (date_trunc('week', NOW() AT TIME ZONE ${tz}))::date::text AS d`;
  return rows[0].d;
}

function addDays(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Очки учеников курса за неделю: события по картам наборов курса, дневной потолок по дням
 * часового пояса курса. Сортировка: очки ↓, кто набрал раньше — выше.
 */
export async function computeStandings(sql, courseId, tz, weekStart) {
  return sql`
    WITH bounds AS (
      SELECT (${weekStart}::date::timestamp AT TIME ZONE ${tz}) AS s,
             ((${weekStart}::date + 7)::timestamp AT TIME ZONE ${tz}) AS e
    ),
    members AS (
      SELECT user_id, hide_from_rating FROM course_members
      WHERE course_id = ${courseId}::uuid AND role = 'student'
    ),
    daily AS (
      SELECT e.user_id, (e.created_at AT TIME ZONE ${tz})::date AS day,
             LEAST(SUM(e.points), ${DAILY_POINTS_CAP}) AS pts, MAX(e.created_at) AS last_at
      FROM score_events e
      JOIN cards c ON c.id = e.card_id
      CROSS JOIN bounds b
      WHERE e.user_id IN (SELECT user_id FROM members)
        AND c.set_id IN (${courseSetIdsSql(sql, courseId)})
        AND e.created_at >= b.s AND e.created_at < b.e
      GROUP BY e.user_id, day
    )
    SELECT m.user_id, m.hide_from_rating,
           COALESCE(u.display_name, u.user_name, 'Ученик') AS name,
           COALESCE(SUM(d.pts), 0)::int AS points,
           MAX(d.last_at) AS last_at
    FROM members m
    JOIN users u ON u.id = m.user_id
    LEFT JOIN daily d ON d.user_id = m.user_id
    GROUP BY m.user_id, m.hide_from_rating, u.display_name, u.user_name
    ORDER BY points DESC, last_at ASC NULLS LAST, name ASC
  `;
}

/** Места с учётом скрытых: скрытые не занимают место и не видны другим ученикам. */
function rankRows(rows) {
  let place = 0;
  return rows.map((r) => (r.hide_from_rating ? { ...r, place: null } : { ...r, place: ++place }));
}

async function leaderboard(sql, me, q) {
  const courseId = uuid(q.courseId, 'courseId');
  const ctx = await courseContext(sql, me, courseId);
  if (!ctx.rating_enabled && !ctx.isTeacher) return { enabled: false };

  const thisWeek = await currentWeekStart(sql, ctx.tz);
  const previous = q.week === 'previous';
  const weekStart = previous ? addDays(thisWeek, -7) : thisWeek;

  let rows;
  const frozen = previous
    ? await sql`
        SELECT r.user_id, r.place, r.points, r.reward, COALESCE(u.display_name, u.user_name, 'Ученик') AS name
        FROM weekly_results r JOIN users u ON u.id = r.user_id
        WHERE r.course_id = ${courseId}::uuid AND r.week_start = ${weekStart}::date
        ORDER BY r.place
      `
    : [];
  const closed = previous
    ? (await sql`SELECT 1 FROM weekly_closures WHERE course_id = ${courseId}::uuid AND week_start = ${weekStart}::date`).length > 0
    : false;

  if (closed) {
    rows = frozen.map((r) => ({ userId: r.user_id, name: r.name, points: r.points, place: r.place, reward: r.reward, hidden: false }));
  } else {
    rows = rankRows(await computeStandings(sql, courseId, ctx.tz, weekStart)).map((r) => ({
      userId: r.user_id, name: r.name, points: r.points, place: r.place, reward: 0, hidden: r.hide_from_rating,
    }));
  }

  // Ученики не видят скрытых (кроме себя); учитель видит всех
  const visible = ctx.isTeacher ? rows : rows.filter((r) => !r.hidden || r.userId === me);
  const mine = rows.find((r) => r.userId === me) || null;
  const ahead = mine?.place > 1 ? rows.find((r) => r.place === mine.place - 1) : null;

  const learned = ctx.isStudent
    ? await sql`
        SELECT COUNT(*)::int AS n FROM card_progress cp JOIN cards c ON c.id = cp.card_id
        WHERE cp.user_id = ${me}::uuid AND cp.learning_step >= 3
          AND c.set_id IN (${courseSetIdsSql(sql, courseId)})
      `
    : [{ n: null }];
  const ends = await sql`SELECT (EXTRACT(EPOCH FROM ((${addDays(thisWeek, 7)}::date::timestamp AT TIME ZONE ${ctx.tz}))) * 1000)::bigint AS ms`;

  return {
    enabled: ctx.rating_enabled,
    isTeacher: ctx.isTeacher,
    week: previous ? 'previous' : 'current',
    weekStart,
    timezone: ctx.tz,
    frozen: closed,
    endsAt: previous ? null : Number(ends[0].ms),
    rewards: WEEKLY_REWARDS,
    rows: visible.map((r) => ({ ...r, isMe: r.userId === me })),
    me: mine
      ? {
          place: mine.place,
          points: mine.points,
          hidden: mine.hidden,
          gapToNext: ahead ? ahead.points - mine.points : null,
          learnedTotal: learned[0].n,
        }
      : null,
  };
}

async function setRatingEnabled(sql, me, body) {
  const courseId = uuid(body.courseId, 'courseId');
  if (typeof body.enabled !== 'boolean') throw new HttpError(400, 'enabled must be boolean');
  const rows = await sql`
    UPDATE courses SET rating_enabled = ${body.enabled}
    WHERE id = ${courseId}::uuid AND user_id = ${me}::uuid RETURNING id
  `;
  if (rows.length === 0) throw new HttpError(403, 'Not your course');
  return { ok: true };
}

async function hideMe(sql, me, body) {
  const courseId = uuid(body.courseId, 'courseId');
  if (typeof body.hidden !== 'boolean') throw new HttpError(400, 'hidden must be boolean');
  const rows = await sql`
    UPDATE course_members SET hide_from_rating = ${body.hidden}
    WHERE course_id = ${courseId}::uuid AND user_id = ${me}::uuid AND role = 'student' RETURNING id
  `;
  if (rows.length === 0) throw new HttpError(403, 'Not a student of the course');
  return { ok: true };
}

/**
 * Заморозить итоги прошлой недели во всех курсах, где она уже закончилась (по поясу курса),
 * и выдать награды топ-3. Одним запросом на курс: отметка закрытия + итоги + алмазы — повторный
 * запуск ничего не меняет (PK weekly_closures).
 */
export async function closeWeeks(sql, onlyCourseId = null) {
  const courses = await sql`
    SELECT c.id, COALESCE(c.timezone, us.timezone, ${DEFAULT_TIMEZONE}) AS tz, c.rating_enabled
    FROM courses c LEFT JOIN user_stats us ON us.user_id = c.user_id
    WHERE EXISTS (SELECT 1 FROM course_members cm WHERE cm.course_id = c.id AND cm.role = 'student')
      AND (${onlyCourseId}::uuid IS NULL OR c.id = ${onlyCourseId}::uuid)
  `;
  const summary = [];
  for (const course of courses) {
    const weekStart = addDays(await currentWeekStart(sql, course.tz), -7);
    const done = await sql`SELECT 1 FROM weekly_closures WHERE course_id = ${course.id} AND week_start = ${weekStart}::date`;
    if (done.length > 0) continue;

    const ranked = rankRows(await computeStandings(sql, course.id, course.tz, weekStart))
      .filter((r) => r.place !== null && r.points > 0)
      .map((r) => ({
        user_id: r.user_id,
        place: r.place,
        points: r.points,
        reward: course.rating_enabled && r.place <= WEEKLY_REWARDS.length && r.points >= MIN_POINTS_FOR_REWARD
          ? WEEKLY_REWARDS[r.place - 1] : 0,
      }));

    const rows = await sql`
      WITH closure AS (
        INSERT INTO weekly_closures (course_id, week_start) VALUES (${course.id}::uuid, ${weekStart}::date)
        ON CONFLICT DO NOTHING
        RETURNING 1
      ), results AS (
        INSERT INTO weekly_results (course_id, week_start, user_id, place, points, reward)
        SELECT ${course.id}::uuid, ${weekStart}::date, r.user_id, r.place, r.points, r.reward
        FROM json_to_recordset(${JSON.stringify(ranked)}::json) AS r(user_id uuid, place int, points int, reward int)
        WHERE EXISTS (SELECT 1 FROM closure)
        RETURNING user_id, reward
      ), rewarded AS (
        UPDATE users u SET diamond = COALESCE(u.diamond, 0) + r.reward
        FROM results r WHERE u.id = r.user_id AND r.reward > 0
        RETURNING u.id
      )
      SELECT (SELECT COUNT(*) FROM closure)::int AS closed, (SELECT COUNT(*) FROM rewarded)::int AS rewarded
    `;
    summary.push({ courseId: course.id, weekStart, ...rows[0] });
  }
  return { closed: summary };
}

export default async function handler(req, res) {
  const { action } = req.query;
  const sql = neon(process.env.POSTGRES_URL);

  // Vercel Cron: только с CRON_SECRET (Vercel сам добавляет заголовок, если переменная задана)
  if (action === 'close-week') {
    if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    await ensureDatabaseInitialized(sql);
    try {
      return res.status(200).json(await closeWeeks(sql));
    } catch (error) {
      console.error('[progress] close-week failed:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  const routes = {
    answer: { method: 'POST', run: (me) => submitAnswers(sql, me, req.body) },
    leaderboard: { method: 'GET', run: (me) => leaderboard(sql, me, req.query) },
    'rating-enabled': { method: 'POST', run: (me) => setRatingEnabled(sql, me, req.body || {}) },
    'hide-me': { method: 'POST', run: (me) => hideMe(sql, me, req.body || {}) },
  };
  const route = Object.hasOwn(routes, action || '') ? routes[action] : null;
  if (!route) return res.status(400).json({ error: 'Unknown action' });
  if (req.method !== route.method) return res.status(405).json({ error: 'Method not allowed' });

  const me = await getAuthedUserId(req);
  if (!me) return res.status(401).json({ error: 'Unauthorized' });

  await ensureDatabaseInitialized(sql);
  try {
    return res.status(200).json(await route.run(me));
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    console.error(`[progress] ${action} failed:`, error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Для проверки без HTTP (скрипты/тесты)
export const __test = { submitAnswers, applyAnswer, scoreAnswer, leaderboard, closeWeeks, computeStandings, setRatingEnabled, hideMe };
