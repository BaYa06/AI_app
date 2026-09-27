/**
 * Общие проверки прав для backend-эндпоинтов (api/data.js, api/progress.js).
 * Файл начинается с "_", поэтому Vercel не публикует его как отдельный роут.
 */

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuid(value, name) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw new HttpError(400, `${name} must be a uuid`);
  return value;
}

/** Набор можно читать: свой, официальный (учебник) или набор курса, где пользователь учитель или ученик. */
export async function assertReadableSet(sql, me, setId) {
  const rows = await sql`
    SELECT 1 FROM card_sets s
    WHERE s.id = ${setId}::uuid
      AND (
        s.user_id = ${me}::uuid
        OR s.is_official
        OR s.course_id IN (
          SELECT id FROM courses WHERE user_id = ${me}::uuid
          UNION
          SELECT course_id FROM course_members WHERE user_id = ${me}::uuid
        )
      )
  `;
  if (rows.length === 0) throw new HttpError(403, 'No access to set');
}

/** Карточку можно читать/учить: она в наборе, доступном пользователю. */
export async function assertReadableCard(sql, me, cardId) {
  const rows = await sql`SELECT set_id FROM cards WHERE id = ${cardId}::uuid`;
  if (rows.length === 0) throw new HttpError(404, 'Card not found');
  await assertReadableSet(sql, me, rows[0].set_id);
}
