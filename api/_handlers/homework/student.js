/**
 * api/progress.js — задания глазами ученика (plan/new/teacher_cabinet.md, Teacher 16).
 *
 * GET  my-homework       — задания ученика: несданные (в т.ч. просроченные — сдать можно позже)
 *                          и сданные за последние 3 дня; ближайшие по сроку первыми.
 * POST session-complete  { cards: [{ cardId, firstTry }] } — после ЗАКОНЧЕННОЙ сессии
 *                          «Изучить» / «Повторить» (вариант Б). Засчитывает слова заданий ученика,
 *                          сданное задание фиксирует снимком (+20 алмазов, если в срок).
 *
 * Старый клиент session-complete не шлёт — задания просто не засчитываются, ничего не ломается.
 */
import { HttpError, UUID_RE } from '../../_access.js';
import { settleHomework, MAX_HOMEWORK_WORDS } from '../../_homework.js';

const RECENT_SUBMITTED_DAYS = 3;
const OVERDUE_VISIBLE_DAYS = 30;

/** Задания, выданные ученику me (по курсам, где он ученик), без отменённых. */
function myHomeworkSql(sql, me) {
  return sql`
    SELECT h.id FROM homework h
    JOIN course_members cm ON cm.course_id = h.course_id
      AND cm.user_id = ${me}::uuid AND cm.role = 'student'
    WHERE h.canceled_at IS NULL
      AND (h.assign_all OR EXISTS (
        SELECT 1 FROM homework_assignees ha WHERE ha.homework_id = h.id AND ha.user_id = ${me}::uuid
      ))
  `;
}

export async function myHomework(sql, me) {
  const rows = await sql`
    SELECT h.id, h.course_id, c.title AS course_title, h.title, h.card_ids, h.due_at, h.min_score,
      h.created_at, COALESCE(u.display_name, u.user_name) AS teacher,
      (SELECT COUNT(*)::int FROM cards WHERE id = ANY(h.card_ids)) AS words,
      (SELECT COALESCE(array_agg(DISTINCT set_id), '{}') FROM cards WHERE id = ANY(h.card_ids)) AS set_ids,
      (SELECT COALESCE(array_agg(hc.card_id), '{}') FROM homework_credits hc
        WHERE hc.homework_id = h.id AND hc.user_id = ${me}::uuid) AS credited_ids,
      (SELECT COALESCE(array_agg(hc.card_id), '{}') FROM homework_credits hc
        WHERE hc.homework_id = h.id AND hc.user_id = ${me}::uuid AND NOT hc.first_try_correct) AS wrong_ids,
      r.submitted_at, r.late, r.score AS result_score, r.diamonds,
      CASE WHEN h.assign_all
        THEN (SELECT COUNT(*)::int FROM course_members m
              WHERE m.course_id = h.course_id AND m.role = 'student')
        ELSE (SELECT COUNT(*)::int FROM homework_assignees ha WHERE ha.homework_id = h.id)
      END AS group_assigned,
      (SELECT COUNT(*)::int FROM homework_results gr WHERE gr.homework_id = h.id) AS group_submitted
    FROM homework h
    JOIN courses c ON c.id = h.course_id
    JOIN users u ON u.id = c.user_id
    LEFT JOIN homework_results r ON r.homework_id = h.id AND r.user_id = ${me}::uuid
    WHERE h.id IN (${myHomeworkSql(sql, me)})
      AND h.due_at > NOW() - (${OVERDUE_VISIBLE_DAYS} * INTERVAL '1 day')
      AND (r.submitted_at IS NULL
        OR r.submitted_at > NOW() - (${RECENT_SUBMITTED_DAYS} * INTERVAL '1 day'))
    ORDER BY (r.submitted_at IS NOT NULL), h.due_at ASC
    LIMIT 20
  `;
  return {
    homework: rows.map((r) => {
      const credited = r.credited_ids || [];
      const wrong = r.wrong_ids || [];
      return {
        id: r.id,
        courseId: r.course_id,
        courseTitle: r.course_title,
        title: r.title,
        teacher: r.teacher,
        cardIds: r.card_ids,
        setIds: r.set_ids || [],
        words: r.words,
        creditedCardIds: credited,
        wrongCardIds: wrong,
        score: credited.length
          ? Math.round((100 * (credited.length - wrong.length)) / credited.length)
          : null,
        minScore: r.min_score,
        dueAt: r.due_at,
        createdAt: r.created_at,
        submitted: r.submitted_at
          ? { at: r.submitted_at, late: !!r.late, score: r.result_score, diamonds: r.diamonds }
          : null,
        group: { assigned: r.group_assigned, submitted: r.group_submitted },
      };
    }),
  };
}

/** Входные слова: uuid, без повторов (последний ответ по слову побеждает). */
export function normalizeSessionCards(cards) {
  if (!Array.isArray(cards) || cards.length === 0 || cards.length > MAX_HOMEWORK_WORDS) {
    throw new HttpError(400, 'cards required');
  }
  const byId = new Map();
  for (const c of cards) {
    if (!c || typeof c.cardId !== 'string' || !UUID_RE.test(c.cardId)) {
      throw new HttpError(400, 'cards[].cardId must be a uuid');
    }
    byId.set(c.cardId.toLowerCase(), c.firstTry === true);
  }
  return [...byId].map(([card_id, first_try]) => ({ card_id, first_try }));
}

export async function sessionComplete(sql, me, body) {
  const cards = normalizeSessionCards(body?.cards);
  const touched = await sql`
    WITH input AS (
      SELECT * FROM json_to_recordset(${JSON.stringify(cards)}::json) AS x(card_id uuid, first_try boolean)
    ),
    mine AS (
      SELECT h.id, h.card_ids FROM homework h
      WHERE h.id IN (${myHomeworkSql(sql, me)})
        AND NOT EXISTS (SELECT 1 FROM homework_results r
          WHERE r.homework_id = h.id AND r.user_id = ${me}::uuid)
    )
    INSERT INTO homework_credits (homework_id, user_id, card_id, first_try_correct, credited_at)
    SELECT mine.id, ${me}::uuid, input.card_id, input.first_try, NOW()
    FROM mine JOIN input ON input.card_id = ANY(mine.card_ids)
    ON CONFLICT (homework_id, user_id, card_id)
      DO UPDATE SET first_try_correct = EXCLUDED.first_try_correct, credited_at = NOW()
    RETURNING homework_id
  `;
  const homeworkIds = [...new Set(touched.map((t) => t.homework_id))];
  const submitted = [];
  for (const homeworkId of homeworkIds) {
    const done = await settleHomework(sql, homeworkId, [me]);
    for (const d of done) {
      submitted.push({ homeworkId, late: !!d.late, score: d.score, diamonds: d.diamonds });
    }
  }
  return { credited: touched.length, homework: homeworkIds, submitted };
}
