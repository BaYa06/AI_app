/**
 * api/teacher.js — ростер, статистика ученика, владелец, видимость набора, напоминание (Clean 10 — перенесено без изменений).
 */
import { courseSetIdsSql } from '../../_course.js';
import { sendNotification } from '../../push.js';
import { notifyCoursesChanged } from '../../_realtime.js';
import { log } from '../../_log.js';

export async function listMembers(req, res, sql, userId) {
  const { courseId, limit, offset } = req.query;
  if (!courseId) return res.status(400).json({ error: 'courseId required' });

  const course = await sql`
    SELECT id FROM courses WHERE id = ${courseId}::uuid AND user_id = ${userId}::uuid
  `;
  if (course.length === 0) return res.status(403).json({ error: 'Not the owner' });

  // limit/offset — опционально. Без них отдаём весь ростер как раньше (полный список нужен
  // экранам агрегатов курса, которые считают средние/активных по всем ученикам сразу; клиент
  // с постраничным UI — TeacherStudentsScreen.tsx — пока не подключён, курсы сейчас небольшие,
  // см. план, пункт 26). Когда лимит передан — отдаём на 1 строку больше запрошенного, чтобы
  // клиент мог понять, есть ли следующая страница, не делая отдельный COUNT(*).
  const limitInt = limit ? Math.max(1, Math.min(200, parseInt(limit, 10) || 50)) : null;
  const offsetInt = Math.max(0, parseInt(offset, 10) || 0);

  const rows = await sql`
    SELECT
      u.id,
      COALESCE(u.display_name, u.user_name, u.email) AS display_name,
      u.email,
      cm.joined_at,
      cr.last_active_date,
      COALESCE(cr.today_cards, 0) AS today_cards,
      GREATEST(
        COALESCE(us.current_streak, 0),
        COALESCE((
          SELECT COUNT(*)::int
          FROM (
            SELECT
              local_date,
              (CURRENT_DATE - local_date)::int - (ROW_NUMBER() OVER (ORDER BY local_date DESC))::int AS grp
            FROM daily_activity da2
            WHERE da2.user_id = cm.user_id AND da2.local_date >= CURRENT_DATE - 365
          ) t
          WHERE grp = 0
        ), 0)
      ) AS current_streak,
      (
        SELECT COUNT(*)::int FROM card_progress cp JOIN cards c ON c.id = cp.card_id
        WHERE cp.user_id = cm.user_id AND cp.learning_step >= 1 AND cp.next_review <= NOW()
          AND c.set_id IN (${courseSetIdsSql(sql, courseId)})
      ) AS waiting_reviews
    FROM course_members cm
    JOIN users u ON u.id = cm.user_id
    LEFT JOIN user_stats us ON us.user_id = cm.user_id
    LEFT JOIN (
      SELECT
        r.user_id,
        MAX(r.reviewed_at)::date AS last_active_date,
        COUNT(DISTINCT CASE WHEN r.reviewed_at::date = CURRENT_DATE THEN r.card_id END) AS today_cards
      FROM review_log r
      JOIN cards c ON c.id = r.card_id
      WHERE c.set_id IN (${courseSetIdsSql(sql, courseId)})
      GROUP BY r.user_id
    ) cr ON cr.user_id = cm.user_id
    WHERE cm.course_id = ${courseId}::uuid
    ORDER BY cm.joined_at ASC
    LIMIT ${limitInt ? limitInt + 1 : null} OFFSET ${offsetInt}
  `;

  const hasMore = limitInt !== null && rows.length > limitInt;
  const page = limitInt !== null ? rows.slice(0, limitInt) : rows;

  const members = page.map((row) => ({
    id: row.id,
    displayName: row.display_name || 'Ученик',
    email: row.email || null,
    streak: row.current_streak || 0,
    lastActiveDate: row.last_active_date,
    todayCards: Number(row.today_cards) || 0,
    joinedAt: row.joined_at,
    // Слова курса, которым пришло время повторения (план §3.8)
    waitingReviews: Number(row.waiting_reviews) || 0,
  }));
  return res.status(200).json({ ok: true, members, hasMore });
}

export async function studentStats(req, res, sql, userId) {
  const { courseId, studentId } = req.query;
  if (!courseId || !studentId)
    return res.status(400).json({ error: 'courseId and studentId required' });

  const course = await sql`
    SELECT id FROM courses WHERE id = ${courseId}::uuid AND user_id = ${userId}::uuid
  `;
  if (course.length === 0) return res.status(403).json({ error: 'Not the owner' });

  const membership = await sql`
    SELECT 1 FROM course_members WHERE course_id = ${courseId}::uuid AND user_id = ${studentId}::uuid
  `;
  if (membership.length === 0) return res.status(404).json({ error: 'Student not in this course' });

  const rows = await sql`
    WITH course_sets AS (
      SELECT id, title, created_at FROM card_sets WHERE id IN (${courseSetIdsSql(sql, courseId)})
    ),
    student_progress AS (
      SELECT
        c.set_id,
        COUNT(DISTINCT r.card_id) AS cards_seen,
        COUNT(DISTINCT cp.card_id) FILTER (WHERE cp.learning_step >= 3) AS cards_learned
      FROM cards c
      INNER JOIN course_sets cs ON cs.id = c.set_id
      LEFT JOIN review_log r ON r.card_id = c.id AND r.user_id = ${studentId}::uuid
      LEFT JOIN card_progress cp ON cp.card_id = c.id AND cp.user_id = ${studentId}::uuid
      GROUP BY c.set_id
    )
    SELECT
      cs.id AS set_id, cs.title,
      (SELECT COUNT(*) FROM cards WHERE set_id = cs.id) AS total_cards,
      COALESCE(sp.cards_seen, 0) AS cards_seen,
      COALESCE(sp.cards_learned, 0) AS cards_learned
    FROM course_sets cs
    LEFT JOIN student_progress sp ON sp.set_id = cs.id
    ORDER BY cs.created_at ASC
  `;

  const sets = rows.map((row) => ({
    setId: row.set_id,
    title: row.title,
    totalCards: Number(row.total_cards) || 0,
    learnedCards: Number(row.cards_learned) || 0,
    seenCards: Number(row.cards_seen) || 0,
  }));
  const totalCards = sets.reduce((s, r) => s + r.totalCards, 0);
  const seenCards = sets.reduce((s, r) => s + r.seenCards, 0);
  const learnedCards = sets.reduce((s, r) => s + r.learnedCards, 0);

  // Свежие streak/last_active — раньше StudentDetailScreen только наследовал их из
  // route.params (снимок со списка учеников на момент навигации). Тот же расчёт streak, что
  // и в listMembers, просто без course_members в качестве анкера (studentId уже проверен
  // выше). См. план, пункт 34.
  const activity = await sql`
    SELECT
      GREATEST(
        COALESCE((SELECT current_streak FROM user_stats WHERE user_id = ${studentId}::uuid), 0),
        COALESCE((
          SELECT COUNT(*)::int
          FROM (
            SELECT
              local_date,
              (CURRENT_DATE - local_date)::int - (ROW_NUMBER() OVER (ORDER BY local_date DESC))::int AS grp
            FROM daily_activity
            WHERE user_id = ${studentId}::uuid AND local_date >= CURRENT_DATE - 365
          ) t
          WHERE grp = 0
        ), 0)
      ) AS current_streak,
      (SELECT MAX(reviewed_at)::date FROM review_log WHERE user_id = ${studentId}::uuid) AS last_active_date
  `;

  // Экран ученика 13 (plan/new/teacher_cabinet.md, Teacher 51) — только новые поля; их сбой
  // не должен ломать старый экран, поэтому отдельно и под try.
  let detail = null;
  try {
    detail = await studentDetail(sql, courseId, studentId);
  } catch (e) {
    log.error('teacher', 'student-stats detail failed', e);
  }

  return res.status(200).json({
    ok: true,
    seenCards,
    learnedCards,
    unlearnedCards: Math.max(0, totalCards - seenCards),
    sets: detail ? sets.map((s) => ({ ...s, ...(detail.bySet.get(s.setId) || {}) })) : sets,
    streak: activity[0]?.current_streak || 0,
    lastActiveDate: activity[0]?.last_active_date || null,
    ...(detail ? detail.fields : {}),
  });
}

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null);

/** Строка ответов по набору → % верных ученика и группы (null — ответов нет) */
export function setAccuracy(row) {
  return {
    answers: Number(row.answers) || 0,
    correctPct: pct(Number(row.correct) || 0, Number(row.answers) || 0),
    groupCorrectPct: pct(Number(row.group_correct) || 0, Number(row.group_answers) || 0),
  };
}

/** Статус задания у ученика — как в homework-status */
export function studentHomeworkStatus(row) {
  if (row.submitted_at) return 'submitted';
  return row.credited > 0 ? 'in_progress' : 'not_started';
}

/**
 * Новые поля student-stats: имя и дата вступления, дни занятий за 28 дней, % верных по наборам
 * (ученик и группа), живые тесты в курсе, текущее задание.
 */
async function studentDetail(sql, courseId, studentId) {
  const [who] = await sql`
    SELECT COALESCE(u.display_name, u.user_name, 'Ученик') AS name, cm.joined_at,
      COALESCE(c.timezone, ts.timezone, 'Asia/Bishkek') AS tz,
      (SELECT COUNT(*)::int FROM answers a
        WHERE a.user_id = cm.user_id AND a.rejected_reason IS NULL) AS total_answers
    FROM course_members cm
    JOIN users u ON u.id = cm.user_id
    JOIN courses c ON c.id = cm.course_id
    LEFT JOIN user_stats ts ON ts.user_id = c.user_id
    WHERE cm.course_id = ${courseId}::uuid AND cm.user_id = ${studentId}::uuid
  `;
  const tz = who?.tz || 'Asia/Bishkek';
  const [days, accuracy, tests, homework] = await Promise.all([
    sql`
      SELECT (a.answered_at AT TIME ZONE ${tz})::date::text AS date, COUNT(*)::int AS answers
      FROM answers a
      WHERE a.user_id = ${studentId}::uuid AND a.rejected_reason IS NULL
        AND a.answered_at > NOW() - INTERVAL '28 days'
      GROUP BY 1 ORDER BY 1
    `,
    sql`
      SELECT c.set_id,
        (COUNT(*) FILTER (WHERE a.user_id = ${studentId}::uuid))::int AS answers,
        (COUNT(*) FILTER (WHERE a.user_id = ${studentId}::uuid AND a.correct))::int AS correct,
        COUNT(*)::int AS group_answers,
        (COUNT(*) FILTER (WHERE a.correct))::int AS group_correct
      FROM answers a
      JOIN cards c ON c.id = a.card_id
      WHERE c.set_id IN (${courseSetIdsSql(sql, courseId)}) AND a.rejected_reason IS NULL
        AND a.user_id IN (
          SELECT user_id FROM course_members WHERE course_id = ${courseId}::uuid AND role = 'student'
        )
      GROUP BY c.set_id
    `,
    sql`
      SELECT ts.id AS session_id, cs.title, ts.finished_at, ts.purpose, tp.score,
        tp.correct_count, COALESCE(jsonb_array_length(tp.question_order), 0) AS total
      FROM test_participants tp
      JOIN test_sessions ts ON ts.id = tp.session_id
      LEFT JOIN card_sets cs ON cs.id = ts.set_id
      WHERE ts.course_id = ${courseId}::uuid AND tp.user_id = ${studentId}::uuid
        AND ts.status = 'finished'
      ORDER BY ts.finished_at DESC
      LIMIT 5
    `,
    sql`
      SELECT h.id, h.title, h.min_score, h.due_at, h.kind, r.submitted_at, r.score AS result_score,
        (SELECT COUNT(*)::int FROM homework_credits hc
          WHERE hc.homework_id = h.id AND hc.user_id = ${studentId}::uuid) AS credited,
        (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE hc.first_try_correct) / NULLIF(COUNT(*), 0))::int
          FROM homework_credits hc
          WHERE hc.homework_id = h.id AND hc.user_id = ${studentId}::uuid) AS score
      FROM homework h
      LEFT JOIN homework_results r ON r.homework_id = h.id AND r.user_id = ${studentId}::uuid
      WHERE h.course_id = ${courseId}::uuid AND h.canceled_at IS NULL
        AND h.due_at > NOW() - INTERVAL '2 days'
        AND (h.assign_all OR EXISTS (
          SELECT 1 FROM homework_assignees ha
          WHERE ha.homework_id = h.id AND ha.user_id = ${studentId}::uuid))
      ORDER BY h.due_at ASC
      LIMIT 1
    `,
  ]);
  const hw = homework[0];
  return {
    bySet: new Map(accuracy.map((r) => [r.set_id, setAccuracy(r)])),
    fields: {
      name: who?.name || 'Ученик',
      joinedAt: who?.joined_at || null,
      timezone: tz,
      totalAnswers: who?.total_answers || 0,
      days: days.map((d) => ({ date: d.date, answers: d.answers })),
      tests: tests.map((t) => ({
        sessionId: t.session_id,
        title: t.title || 'Тест',
        finishedAt: t.finished_at,
        purpose: t.purpose || null,
        score: t.score || 0,
        correct: t.correct_count || 0,
        total: Number(t.total) || 0,
      })),
      homework: hw
        ? {
            id: hw.id,
            title: hw.title,
            kind: hw.kind || 'learn',
            minScore: hw.min_score,
            dueAt: hw.due_at,
            status: studentHomeworkStatus(hw),
            score: hw.submitted_at ? hw.result_score : hw.score,
          }
        : null,
    },
  };
}

export async function checkOwner(req, res, sql, userId) {
  const { courseId } = req.query;
  if (!courseId) return res.status(400).json({ error: 'courseId required' });

  const course = await sql`
    SELECT id FROM courses WHERE id = ${courseId}::uuid AND user_id = ${userId}::uuid
  `;
  return res.status(200).json({ ok: true, isOwner: course.length > 0 });
}

// ─── Видимость набора ───────────────────────────────────────

export async function toggleSetHidden(req, res, sql, userId) {
  const { setId, hidden } = req.body || {};
  if (!setId || typeof hidden !== 'boolean') {
    return res.status(400).json({ error: 'setId and boolean hidden required' });
  }

  const updated = await sql`
    UPDATE card_sets SET is_hidden_from_students = ${hidden}, updated_at = NOW()
    WHERE id = ${setId}::uuid AND user_id = ${userId}::uuid
    RETURNING id, course_id
  `;
  if (updated.length === 0) return res.status(403).json({ error: 'Not found or not the owner' });
  await notifyCoursesChanged([updated[0].course_id]);
  return res.status(200).json({ ok: true });
}

// ─── Агрегаты курса/наборов (учитель) ────────────────────────
// Раньше эти четыре функции жили в NeonService.ts и шли напрямую в Neon с клиента без
// какой-либо проверки, что вызывающий преподаёт этот курс — любой мог передать чужой
// courseId/setId и получить реальную статистику чужого курса. См. план, пункт 23.

/**
 * Учитель просит повторить слова (план §3.8): пуш ученикам курса, у которых есть слова курса
 * к повторению. Всему классу — не чаще раза в сутки; одному ученику — в любой момент.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** studentIds из тела: нет поля — null (старое поведение), кривое — 'invalid' */
export function parseStudentIds(value) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) return 'invalid';
  if (!value.every((id) => typeof id === 'string' && UUID_RE.test(id))) return 'invalid';
  return [...new Set(value)];
}

/**
 * «Напомнить» выбранным ученикам (plan/new/teacher_cabinet.md, Teacher 36): каждому не чаще раза
 * в 20 часов (review_reminders), лимит курса не трогаем. Пуш уходит и тем, у кого слов на
 * повторении нет (ученик ещё не открывал набор) — текст для них свой.
 */
async function remindSelected(res, sql, courseId, teacher, studentIds) {
  const targets = await sql`
    SELECT cm.user_id,
      (SELECT COUNT(*)::int FROM card_progress cp
        JOIN cards c ON c.id = cp.card_id AND c.set_id IN (${courseSetIdsSql(sql, courseId)})
        WHERE cp.user_id = cm.user_id AND cp.learning_step >= 1 AND cp.next_review <= NOW()) AS waiting
    FROM course_members cm
    WHERE cm.course_id = ${courseId}::uuid AND cm.role = 'student'
      AND cm.user_id = ANY(${studentIds}::uuid[])
      AND NOT EXISTS (SELECT 1 FROM review_reminders rr
        WHERE rr.course_id = ${courseId}::uuid AND rr.user_id = cm.user_id
          AND rr.sent_at > NOW() - INTERVAL '20 hours')
  `;
  let sent = 0;
  for (const t of targets) {
    const result = await sendNotification(sql, t.user_id, 'teacher_review', {
      teacher,
      count: t.waiting,
    });
    if (result.ok) sent++;
    await sql`
      INSERT INTO review_reminders (course_id, user_id, sent_at)
      VALUES (${courseId}::uuid, ${t.user_id}::uuid, NOW())
      ON CONFLICT (course_id, user_id) DO UPDATE SET sent_at = NOW()
    `;
  }
  return res.status(200).json({
    ok: true,
    students: targets.length,
    sent,
    skipped: studentIds.length - targets.length,
  });
}

export async function remindReview(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { courseId, studentId = null } = req.body || {};
  if (!courseId) return res.status(400).json({ error: 'courseId required' });
  const studentIds = parseStudentIds((req.body || {}).studentIds);
  if (studentIds === 'invalid') return res.status(400).json({ error: 'studentIds is invalid' });

  const course = await sql`
    SELECT c.id, COALESCE(u.display_name, u.user_name) AS teacher, c.last_review_reminder_at > NOW() - INTERVAL '20 hours' AS recent
    FROM courses c JOIN users u ON u.id = c.user_id
    WHERE c.id = ${courseId}::uuid AND c.user_id = ${userId}::uuid
  `;
  if (course.length === 0) return res.status(403).json({ error: 'Not the owner' });
  if (studentIds) return remindSelected(res, sql, courseId, course[0].teacher, studentIds);
  if (!studentId && course[0].recent) {
    return res.status(429).json({ error: 'Already reminded today', reason: 'rate_limited' });
  }

  const students = await sql`
    SELECT cm.user_id, COUNT(cp.card_id)::int AS waiting
    FROM course_members cm
    JOIN card_progress cp ON cp.user_id = cm.user_id AND cp.learning_step >= 1 AND cp.next_review <= NOW()
    JOIN cards c ON c.id = cp.card_id AND c.set_id IN (${courseSetIdsSql(sql, courseId)})
    WHERE cm.course_id = ${courseId}::uuid AND cm.role = 'student'
      AND (${studentId}::uuid IS NULL OR cm.user_id = ${studentId}::uuid)
    GROUP BY cm.user_id
  `;
  let sent = 0;
  for (const s of students) {
    const result = await sendNotification(sql, s.user_id, 'teacher_review', {
      teacher: course[0].teacher,
      count: s.waiting,
    });
    if (result.ok) sent++;
  }
  if (!studentId) {
    await sql`UPDATE courses SET last_review_reminder_at = NOW() WHERE id = ${courseId}::uuid`;
  }
  return res.status(200).json({ ok: true, students: students.length, sent });
}
