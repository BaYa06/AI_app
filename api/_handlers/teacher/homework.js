/**
 * api/teacher.js — задания учителя (plan/new/teacher_cabinet.md, Teacher 15).
 * Права: только учитель — владелец курса (courses.user_id). Ученики — api/progress.js (Teacher 16).
 */
import { UUID_RE } from '../../_access.js';
import { courseSetIdsSql } from '../../_course.js';
import { sendNotification } from '../../push.js';
import {
  assignedStudentsSql,
  settleHomework,
  validateHomeworkInput,
  KNOWN_STEP,
  FIXED_AFTER_DAYS,
} from '../../_homework.js';
import { buildHomeworkWorkbook, DEFAULT_TIMEZONE, formatInZone } from '../../_homeworkExcel.js';

const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

/** Задание, если текущий пользователь — учитель его курса. */
async function ownedHomework(sql, homeworkId, userId) {
  const rows = await sql`
    SELECT h.*, COALESCE(u.display_name, u.user_name) AS teacher,
      c.title AS course_title, c.timezone AS course_timezone
    FROM homework h
    JOIN courses c ON c.id = h.course_id AND c.user_id = ${userId}::uuid
    JOIN users u ON u.id = c.user_id
    WHERE h.id = ${homeworkId}::uuid
  `;
  return rows[0] || null;
}

/** POST { courseId, title, cardIds, dueAt, minScore?, userIds? } → { homework: { id } } */
export async function homeworkCreate(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { courseId, title, cardIds, dueAt, minScore = null, userIds = null } = req.body || {};
  if (!isUuid(courseId)) return res.status(400).json({ error: 'courseId required' });
  const bad = validateHomeworkInput({ title, cardIds, dueAt, minScore });
  if (bad) return res.status(400).json({ error: `invalid ${bad}`, reason: bad });
  const ids = [...new Set(cardIds)];
  if (!ids.every(isUuid)) {
    return res.status(400).json({ error: 'invalid cardIds', reason: 'cardIds' });
  }
  const pick = userIds === null ? null : Array.isArray(userIds) ? [...new Set(userIds)] : [];
  if (pick !== null && (pick.length === 0 || !pick.every(isUuid))) {
    return res.status(400).json({ error: 'invalid userIds', reason: 'userIds' });
  }

  const course = await sql`
    SELECT c.id, c.timezone, COALESCE(u.display_name, u.user_name) AS teacher
    FROM courses c JOIN users u ON u.id = c.user_id
    WHERE c.id = ${courseId}::uuid AND c.user_id = ${userId}::uuid
  `;
  if (course.length === 0) return res.status(403).json({ error: 'Not the owner' });

  // Слова — только из наборов курса (свои наборы + открытые юниты учебника)
  const ok = await sql`
    SELECT COUNT(*)::int AS n FROM cards
    WHERE id = ANY(${ids}::uuid[]) AND set_id IN (${courseSetIdsSql(sql, courseId)})
  `;
  if (ok[0].n !== ids.length) {
    return res.status(400).json({ error: 'cards not in course', reason: 'cardIds' });
  }
  if (pick !== null) {
    const members = await sql`
      SELECT COUNT(*)::int AS n FROM course_members
      WHERE course_id = ${courseId}::uuid AND role = 'student' AND user_id = ANY(${pick}::uuid[])
    `;
    if (members[0].n !== pick.length) {
      return res.status(400).json({ error: 'students not in course', reason: 'userIds' });
    }
  }

  const created = await sql`
    INSERT INTO homework (course_id, created_by, title, card_ids, due_at, min_score, assign_all)
    VALUES (${courseId}::uuid, ${userId}::uuid, ${title.trim()}, ${ids}::uuid[],
      ${new Date(dueAt).toISOString()}::timestamptz, ${minScore}, ${pick === null})
    RETURNING id, due_at, created_at
  `;
  const homeworkId = created[0].id;
  if (pick !== null) {
    await sql`
      INSERT INTO homework_assignees (homework_id, user_id)
      SELECT ${homeworkId}::uuid, unnest(${pick}::uuid[])
      ON CONFLICT DO NOTHING
    `;
  }
  // Слова, которые ученик уже знает («Знаю», шаг ≥ 3), засчитаны сразу (решение 1)
  await sql`
    INSERT INTO homework_credits (homework_id, user_id, card_id, first_try_correct)
    SELECT ${homeworkId}::uuid, cp.user_id, cp.card_id, true
    FROM card_progress cp
    WHERE cp.card_id = ANY(${ids}::uuid[]) AND cp.learning_step >= ${KNOWN_STEP}
      AND cp.user_id IN (${assignedStudentsSql(sql, homeworkId)})
    ON CONFLICT DO NOTHING
  `;
  await settleHomework(sql, homeworkId, null, false);

  // Пуш «Новое задание» каждому ученику (Teacher 29); тихие часы и выключенные уведомления — в sendNotification
  const students = await sql`SELECT user_id FROM (${assignedStudentsSql(sql, homeworkId)}) a`;
  const data = {
    teacher: course[0].teacher,
    title: title.trim(),
    count: ids.length,
    dueText: formatInZone(created[0].due_at, course[0].timezone || DEFAULT_TIMEZONE),
    homeworkId,
  };
  await Promise.allSettled(
    students.map((s) => sendNotification(sql, s.user_id, 'homework_assigned', data))
  );

  return res.status(200).json({ homework: { id: homeworkId, dueAt: created[0].due_at } });
}

/** GET ?courseId= → { homework: [...] } — активные задания курса, ближайшие по сроку первыми. */
export async function homeworkList(req, res, sql, userId) {
  const { courseId } = req.query;
  if (!isUuid(courseId)) return res.status(400).json({ error: 'courseId required' });
  const course = await sql`
    SELECT id FROM courses WHERE id = ${courseId}::uuid AND user_id = ${userId}::uuid
  `;
  if (course.length === 0) return res.status(403).json({ error: 'Not the owner' });

  const rows = await sql`
    SELECT h.id, h.title, h.due_at, h.min_score, h.assign_all, h.created_at,
      (SELECT COUNT(*)::int FROM cards WHERE id = ANY(h.card_ids)) AS words,
      CASE WHEN h.assign_all
        THEN (SELECT COUNT(*)::int FROM course_members cm
              WHERE cm.course_id = h.course_id AND cm.role = 'student')
        ELSE (SELECT COUNT(*)::int FROM homework_assignees ha
              JOIN course_members cm ON cm.user_id = ha.user_id
                AND cm.course_id = h.course_id AND cm.role = 'student'
              WHERE ha.homework_id = h.id)
      END AS assigned,
      (SELECT COUNT(*)::int FROM homework_results r WHERE r.homework_id = h.id) AS submitted,
      (SELECT COUNT(DISTINCT hc.user_id)::int FROM homework_credits hc
        WHERE hc.homework_id = h.id) AS started
    FROM homework h
    WHERE h.course_id = ${courseId}::uuid AND h.canceled_at IS NULL
    ORDER BY h.due_at ASC
    LIMIT 50
  `;
  return res.status(200).json({
    homework: rows.map((r) => ({
      id: r.id,
      title: r.title,
      words: r.words,
      dueAt: r.due_at,
      minScore: r.min_score,
      assignAll: r.assign_all,
      createdAt: r.created_at,
      assigned: r.assigned,
      submitted: Math.min(r.submitted, r.assigned),
      started: Math.max(0, Math.min(r.started, r.assigned) - Math.min(r.submitted, r.assigned)),
    })),
  });
}

/**
 * GET ?homeworkId= → задание + статусы учеников: сдал / в процессе (засчитано N) / не начал,
 * «с опозданием», оценка, последний заход; «закреплено» — через 7 дней после выдачи.
 */
export async function homeworkStatus(req, res, sql, userId) {
  const { homeworkId } = req.query;
  if (!isUuid(homeworkId)) return res.status(400).json({ error: 'homeworkId required' });
  const hw = await ownedHomework(sql, homeworkId, userId);
  if (!hw) return res.status(403).json({ error: 'Not the owner' });
  return res.status(200).json(await loadHomeworkStatus(sql, hw));
}

/** Статусы учеников по заданию — для экрана сдачи и выгрузки в Excel. Права проверяет вызывающий. */
async function loadHomeworkStatus(sql, hw) {
  const homeworkId = hw.id;
  const showFixed = Date.now() - new Date(hw.created_at).getTime() >= FIXED_AFTER_DAYS * 86400000;
  const rows = await sql`
    WITH words AS (SELECT id FROM cards WHERE id = ANY(${hw.card_ids}::uuid[]))
    SELECT u.id, COALESCE(u.display_name, u.user_name, u.email) AS display_name,
      (SELECT MAX(r.reviewed_at)::date FROM review_log r WHERE r.user_id = u.id) AS last_active_date,
      (SELECT COUNT(*)::int FROM homework_credits hc
        WHERE hc.homework_id = ${homeworkId}::uuid AND hc.user_id = u.id
          AND hc.card_id IN (SELECT id FROM words)) AS credited,
      (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE hc.first_try_correct) / NULLIF(COUNT(*), 0))::int
        FROM homework_credits hc
        WHERE hc.homework_id = ${homeworkId}::uuid AND hc.user_id = u.id
          AND hc.card_id IN (SELECT id FROM words)) AS score,
      res.submitted_at, res.late, res.score AS result_score,
      rem.sent_at AS reminded_at,
      CASE WHEN ${showFixed} THEN (
        SELECT COUNT(*)::int FROM card_progress cp
        WHERE cp.user_id = u.id AND cp.card_id IN (SELECT id FROM words)
          AND cp.learning_step >= ${KNOWN_STEP}
      ) END AS fixed
    FROM (${assignedStudentsSql(sql, homeworkId)}) a
    JOIN users u ON u.id = a.user_id
    LEFT JOIN homework_results res ON res.homework_id = ${homeworkId}::uuid AND res.user_id = u.id
    LEFT JOIN homework_reminders rem ON rem.homework_id = ${homeworkId}::uuid AND rem.user_id = u.id
  `;
  const words =
    await sql`SELECT COUNT(*)::int AS n FROM cards WHERE id = ANY(${hw.card_ids}::uuid[])`;

  return {
    homework: {
      id: hw.id,
      courseId: hw.course_id,
      title: hw.title,
      words: words[0].n,
      dueAt: hw.due_at,
      minScore: hw.min_score,
      createdAt: hw.created_at,
      canceled: !!hw.canceled_at,
    },
    students: rows.map((r) => ({
      id: r.id,
      displayName: r.display_name || 'Ученик',
      lastActiveDate: r.last_active_date,
      status: r.submitted_at ? 'submitted' : r.credited > 0 ? 'in_progress' : 'not_started',
      credited: r.credited,
      score: r.submitted_at ? r.result_score : r.score,
      submittedAt: r.submitted_at,
      late: !!r.late,
      remindedAt: r.reminded_at,
      fixed: r.fixed,
    })),
  };
}

/**
 * GET ?homeworkId= → { filename, base64 } — «Оценки в Excel» (Teacher 22). Файл собирает сервер
 * (exceljs), даты — в поясе курса. Приложение сохраняет файл и открывает «Поделиться».
 */
export async function homeworkExport(req, res, sql, userId) {
  const { homeworkId } = req.query;
  if (!isUuid(homeworkId)) return res.status(400).json({ error: 'homeworkId required' });
  const hw = await ownedHomework(sql, homeworkId, userId);
  if (!hw) return res.status(403).json({ error: 'Not the owner' });
  const data = await loadHomeworkStatus(sql, hw);
  const file = await buildHomeworkWorkbook(data, {
    courseTitle: hw.course_title,
    timeZone: hw.course_timezone || DEFAULT_TIMEZONE,
  });
  return res.status(200).json(file);
}

/** POST { homeworkId } — отменить задание (ученики его больше не видят, сданные снимки остаются). */
export async function homeworkCancel(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { homeworkId } = req.body || {};
  if (!isUuid(homeworkId)) return res.status(400).json({ error: 'homeworkId required' });
  const hw = await ownedHomework(sql, homeworkId, userId);
  if (!hw) return res.status(403).json({ error: 'Not the owner' });
  await sql`
    UPDATE homework SET canceled_at = NOW()
    WHERE id = ${homeworkId}::uuid AND canceled_at IS NULL
  `;
  return res.status(200).json({ ok: true });
}

/**
 * POST { homeworkId, userIds } — «Напомнить»: только тем, кому выдано и кто не сдал; каждому
 * не чаще раза в 20 часов (homework_reminders). Ответ: сколько напомнили и кого пропустили.
 */
export async function homeworkRemind(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { homeworkId, userIds } = req.body || {};
  if (!isUuid(homeworkId)) return res.status(400).json({ error: 'homeworkId required' });
  if (!Array.isArray(userIds) || userIds.length === 0 || !userIds.every(isUuid)) {
    return res.status(400).json({ error: 'userIds required' });
  }
  const hw = await ownedHomework(sql, homeworkId, userId);
  if (!hw) return res.status(403).json({ error: 'Not the owner' });
  if (hw.canceled_at) return res.status(409).json({ error: 'Canceled', reason: 'canceled' });

  const targets = await sql`
    SELECT a.user_id,
      (SELECT COUNT(*)::int FROM cards WHERE id = ANY(${hw.card_ids}::uuid[])) -
      (SELECT COUNT(*)::int FROM homework_credits hc
        WHERE hc.homework_id = ${homeworkId}::uuid AND hc.user_id = a.user_id
          AND hc.card_id IN (SELECT id FROM cards WHERE id = ANY(${hw.card_ids}::uuid[]))) AS left_words
    FROM (${assignedStudentsSql(sql, homeworkId)}) a
    WHERE a.user_id = ANY(${[...new Set(userIds)]}::uuid[])
      AND NOT EXISTS (SELECT 1 FROM homework_results r
        WHERE r.homework_id = ${homeworkId}::uuid AND r.user_id = a.user_id)
      AND NOT EXISTS (SELECT 1 FROM homework_reminders rm
        WHERE rm.homework_id = ${homeworkId}::uuid AND rm.user_id = a.user_id
          AND rm.sent_at > NOW() - INTERVAL '20 hours')
  `;
  let sent = 0;
  for (const t of targets) {
    const result = await sendNotification(sql, t.user_id, 'homework_reminder', {
      teacher: hw.teacher,
      title: hw.title,
      count: Math.max(0, t.left_words),
      homeworkId,
    });
    if (result.ok) sent++;
    await sql`
      INSERT INTO homework_reminders (homework_id, user_id, sent_at)
      VALUES (${homeworkId}::uuid, ${t.user_id}::uuid, NOW())
      ON CONFLICT (homework_id, user_id) DO UPDATE SET sent_at = NOW()
    `;
  }
  return res.status(200).json({
    ok: true,
    reminded: targets.length,
    sent,
    skipped: new Set(userIds).size - targets.length,
  });
}
