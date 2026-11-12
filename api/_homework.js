/**
 * Общие запросы заданий (plan/new/teacher_cabinet.md, этап 2) для api/teacher.js и api/progress.js.
 * Файл начинается с "_", поэтому Vercel не публикует его как отдельный роут.
 *
 * «Сдано» — вариант Б: слово засчитано, когда ученик прошёл его в законченной сессии
 * «Изучить» / «Повторить» (строка в homework_credits). Задание сдано, когда засчитаны все слова,
 * которые ещё существуют, и оценка ≥ порога → снимок в homework_results (после вставки не меняется).
 */

/** Алмазы за задание, сданное в срок (решение 6 этапа 2). С опозданием — 0. */
export const HOMEWORK_DIAMONDS = 20;
/** Шаг «Знаю»: такие слова засчитываются сразу при выдаче (SRSService.LEARNED_STEP). */
export const KNOWN_STEP = 3;
/** Через сколько дней после выдачи учитель видит «закреплено». */
export const FIXED_AFTER_DAYS = 7;
export const MAX_HOMEWORK_WORDS = 1000;

/** Ученики, которым выдано задание: вся группа (сейчас в курсе) или выбранные (и всё ещё в курсе). */
export function assignedStudentsSql(sql, homeworkId) {
  return sql`
    SELECT cm.user_id
    FROM homework h
    JOIN course_members cm ON cm.course_id = h.course_id AND cm.role = 'student'
    WHERE h.id = ${homeworkId}::uuid
      AND (h.assign_all OR cm.user_id IN (
        SELECT ha.user_id FROM homework_assignees ha WHERE ha.homework_id = ${homeworkId}::uuid
      ))
  `;
}

/**
 * Снимок сдачи для тех, у кого засчитаны все слова и оценка ≥ порога. Алмазы — в том же запросе
 * (одна SQL-команда атомарна), только при первой вставке снимка и только если в срок.
 * userIds = null — все ученики задания. reward = false — без алмазов (задание сдано уже при выдаче).
 * @returns {Promise<Array<{ user_id: string, late: boolean, score: number, diamonds: number }>>}
 */
export async function settleHomework(sql, homeworkId, userIds = null, reward = true) {
  const diamonds = reward ? HOMEWORK_DIAMONDS : 0;
  return sql`
    WITH hw AS (
      SELECT id, due_at, min_score,
        (SELECT COUNT(*)::int FROM cards WHERE id = ANY(h.card_ids)) AS words
      FROM homework h
      WHERE h.id = ${homeworkId}::uuid AND h.canceled_at IS NULL
    ),
    agg AS (
      SELECT hc.user_id,
        COUNT(*)::int AS credited,
        ROUND(100.0 * COUNT(*) FILTER (WHERE hc.first_try_correct) / COUNT(*))::int AS score
      FROM homework_credits hc
      JOIN homework h ON h.id = hc.homework_id
      WHERE hc.homework_id = ${homeworkId}::uuid
        AND hc.card_id IN (SELECT id FROM cards WHERE id = ANY(h.card_ids))
        AND (${userIds}::uuid[] IS NULL OR hc.user_id = ANY(${userIds}::uuid[]))
        AND hc.user_id IN (${assignedStudentsSql(sql, homeworkId)})
      GROUP BY hc.user_id
    ),
    ready AS (
      SELECT agg.user_id, agg.score, NOW() > hw.due_at AS late
      FROM agg, hw
      WHERE hw.words > 0 AND agg.credited >= hw.words
        AND (hw.min_score IS NULL OR agg.score >= hw.min_score)
    ),
    ins AS (
      INSERT INTO homework_results (homework_id, user_id, late, score, diamonds)
      SELECT ${homeworkId}::uuid, ready.user_id, ready.late, ready.score,
        CASE WHEN ready.late THEN 0 ELSE ${diamonds}::int END
      FROM ready
      ON CONFLICT (homework_id, user_id) DO NOTHING
      RETURNING user_id, late, score, diamonds
    ),
    upd AS (
      UPDATE users u SET diamond = COALESCE(u.diamond, 0) + ins.diamonds
      FROM ins WHERE u.id = ins.user_id AND ins.diamonds > 0
      RETURNING u.id
    )
    SELECT user_id, late, score, diamonds FROM ins
  `;
}

/** Проверка входных данных задания. Возвращает строку-ошибку или null. */
export function validateHomeworkInput({ title, cardIds, dueAt, minScore }, now = Date.now()) {
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 80) return 'title';
  if (!Array.isArray(cardIds) || cardIds.length === 0 || cardIds.length > MAX_HOMEWORK_WORDS) {
    return 'cardIds';
  }
  const due = Date.parse(dueAt);
  if (!Number.isFinite(due) || due <= now || due > now + 180 * 24 * 3600 * 1000) return 'dueAt';
  if (minScore !== null && minScore !== undefined) {
    if (!Number.isInteger(minScore) || minScore < 50 || minScore > 100) return 'minScore';
  }
  return null;
}
