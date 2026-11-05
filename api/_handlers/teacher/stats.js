/**
 * api/teacher.js — агрегаты курса и наборов, наборы курса для ученика (Clean 10 — перенесено без изменений).
 */
import { courseSetIdsSql, courseSetsForStudent } from '../../_course.js';

export async function courseActivityChart(req, res, sql, userId) {
  const { courseId, days } = req.query;
  if (!courseId || !days) return res.status(400).json({ error: 'courseId and days required' });

  const course = await sql`
    SELECT id FROM courses WHERE id = ${courseId}::uuid AND user_id = ${userId}::uuid
  `;
  if (course.length === 0) return res.status(403).json({ error: 'Not the owner' });

  const daysInt = Math.max(1, Math.min(365, parseInt(days, 10) || 7));

  const rows = await sql`
    SELECT
      r.reviewed_at::date::text AS date,
      COUNT(DISTINCT r.user_id) AS count
    FROM review_log r
    JOIN cards c ON c.id = r.card_id
    WHERE c.set_id IN (${courseSetIdsSql(sql, courseId)})
      AND r.user_id IN (
      SELECT user_id FROM course_members WHERE course_id = ${courseId}::uuid
    )
    AND r.reviewed_at::date >= CURRENT_DATE - ${daysInt}::int
      AND r.reviewed_at::date <= CURRENT_DATE
    GROUP BY r.reviewed_at::date
    ORDER BY date ASC
  `;

  return res.status(200).json({
    ok: true,
    rows: rows.map((row) => ({ date: row.date, count: Number(row.count) })),
  });
}

export async function courseSetStats(req, res, sql, userId) {
  const { courseId } = req.query;
  if (!courseId) return res.status(400).json({ error: 'courseId required' });

  const course = await sql`
    SELECT id FROM courses WHERE id = ${courseId}::uuid AND user_id = ${userId}::uuid
  `;
  if (course.length === 0) return res.status(403).json({ error: 'Not the owner' });

  const rows = await sql`
    WITH course_student_ids AS (
      SELECT user_id FROM course_members WHERE course_id = ${courseId}::uuid
    ),
    total_members AS (
      SELECT COUNT(*) AS cnt FROM course_student_ids
    ),
    -- Свои наборы курса + официальные наборы юнитов, которые учитель хоть раз открывал (каталог книг).
    course_sets AS (
      SELECT cs.id, cs.title, cs.total_cards, 0 AS kind, cs.created_at,
             NULL::text AS book_title, NULL::int AS unit_number, NULL::int AS unit_sort, NULL::boolean AS unit_open
      FROM card_sets cs
      WHERE cs.course_id = ${courseId}::uuid AND cs.is_hidden_from_students = false
      UNION ALL
      SELECT ocs.id, ocs.title, ocs.total_cards, 1 AS kind, cb.created_at,
             b.title, u.number, u.sort_order, cu.is_open
      FROM course_units cu
      JOIN book_units u ON u.id = cu.unit_id
      JOIN books b ON b.id = u.book_id
      JOIN course_books cb ON cb.course_id = cu.course_id AND cb.book_id = b.id
      JOIN card_sets ocs ON ocs.unit_id = u.id AND ocs.is_official = true
      WHERE cu.course_id = ${courseId}::uuid AND cu.opened_at IS NOT NULL
    ),
    set_started AS (
      SELECT c.set_id, COUNT(DISTINCT r.user_id) AS started
      FROM review_log r
      JOIN cards c ON c.id = r.card_id
      WHERE r.user_id IN (SELECT user_id FROM course_student_ids)
        AND c.set_id IN (SELECT id FROM course_sets)
      GROUP BY c.set_id
    ),
    student_set_progress AS (
      SELECT c.set_id, cp.user_id, COUNT(DISTINCT cp.card_id) AS cards_seen
      FROM card_progress cp
      JOIN cards c ON c.id = cp.card_id
      WHERE cp.user_id IN (SELECT user_id FROM course_student_ids)
        AND c.set_id IN (SELECT id FROM course_sets)
      GROUP BY c.set_id, cp.user_id
    )
    SELECT
      cs.id AS set_id,
      cs.title,
      cs.total_cards,
      cs.kind,
      cs.book_title,
      cs.unit_number,
      cs.unit_open,
      COALESCE(ss.started, 0) AS students_started,
      COALESCE(
        (SELECT COUNT(*) FROM student_set_progress ssp
         WHERE ssp.set_id = cs.id AND ssp.cards_seen >= cs.total_cards AND cs.total_cards > 0),
        0
      ) AS students_completed,
      CASE
        WHEN cs.total_cards = 0 OR (SELECT cnt FROM total_members) = 0 THEN 0
        ELSE ROUND(
          COALESCE(
            (SELECT SUM(ssp.cards_seen) FROM student_set_progress ssp WHERE ssp.set_id = cs.id),
            0
          )::numeric
          / (cs.total_cards * (SELECT cnt FROM total_members)) * 100
        )
      END AS progress_pct
    FROM course_sets cs
    LEFT JOIN set_started ss ON ss.set_id = cs.id
    ORDER BY cs.kind, cs.created_at, cs.unit_sort, cs.unit_number
  `;

  return res.status(200).json({
    ok: true,
    sets: rows.map((row) => ({
      setId: row.set_id,
      title: row.title,
      totalCards: Number(row.total_cards) || 0,
      studentsStarted: Number(row.students_started) || 0,
      studentsCompleted: Number(row.students_completed) || 0,
      progressPct: Number(row.progress_pct) || 0,
      isOfficial: row.kind === 1,
      bookTitle: row.book_title || null,
      unitNumber: row.unit_number ?? null,
      unitOpen: row.unit_open ?? null,
    })),
  });
}

export async function setHardCards(req, res, sql, userId) {
  const { setId, courseId } = req.query;
  if (!setId || !courseId) return res.status(400).json({ error: 'setId and courseId required' });

  const course = await sql`
    SELECT id FROM courses WHERE id = ${courseId}::uuid AND user_id = ${userId}::uuid
  `;
  if (course.length === 0) return res.status(403).json({ error: 'Not the owner' });

  // Раньше не проверялось даже, что setId реально принадлежит courseId — учитель мог
  // передать произвольный чужой setId и увидеть пересечение с ним по своим ученикам.
  const set = await sql`
    SELECT 1 WHERE ${setId}::uuid IN (${courseSetIdsSql(sql, courseId)})
  `;
  if (set.length === 0) return res.status(404).json({ error: 'Set not found in this course' });

  const rows = await sql`
    SELECT
      c.id AS card_id,
      c.front,
      c.back,
      COUNT(r.id) AS attempts
    FROM cards c
    JOIN review_log r ON r.card_id = c.id
    WHERE c.set_id = ${setId}::uuid
      AND r.user_id IN (
        SELECT user_id FROM course_members WHERE course_id = ${courseId}::uuid
      )
    GROUP BY c.id, c.front, c.back
    ORDER BY attempts DESC
    LIMIT 5
  `;

  return res.status(200).json({
    ok: true,
    cards: rows.map((row) => ({
      cardId: row.card_id,
      front: row.front,
      back: row.back,
      attempts: Number(row.attempts) || 0,
    })),
  });
}

// ─── Наборы курса (ученик) ────────────────────────────────────

export async function courseSetsByMembership(req, res, sql, userId) {
  const { courseId } = req.query;
  if (!courseId) return res.status(400).json({ error: 'courseId required' });

  const membership = await sql`
    SELECT id FROM course_members WHERE course_id = ${courseId}::uuid AND user_id = ${userId}::uuid
  `;
  if (membership.length === 0)
    return res.status(403).json({ error: 'Not a member of this course' });

  return res.status(200).json({ ok: true, sets: await courseSetsForStudent(sql, courseId) });
}
