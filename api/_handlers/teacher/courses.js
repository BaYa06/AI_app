/**
 * api/teacher.js — курс: удалить, переименовать, расписание занятий (Clean 10 — перенесено без изменений).
 */

export async function deleteCourse(req, res, sql, userId) {
  const { courseId, withSets } = req.body || {};
  if (!courseId) return res.status(400).json({ error: 'courseId required' });

  if (withSets !== true) {
    // Старые версии: наборы остаются, card_sets.course_id обнуляется (ON DELETE SET NULL)
    const deleted = await sql`
      DELETE FROM courses WHERE id = ${courseId}::uuid AND user_id = ${userId}::uuid
      RETURNING id
    `;
    if (deleted.length === 0) {
      return res.status(403).json({ error: 'Not found or not the owner' });
    }
    return res.status(200).json({ ok: true, deletedSets: 0 });
  }

  const owned =
    await sql`SELECT 1 FROM courses WHERE id = ${courseId}::uuid AND user_id = ${userId}::uuid`;
  if (owned.length === 0) {
    return res.status(403).json({ error: 'Not found or not the owner' });
  }
  // Как deleteSet в data.js: сначала карточки, потом наборы — и курс, всё одной транзакцией
  const [, sets] = await sql.transaction([
    sql`
      DELETE FROM cards WHERE set_id IN (
        SELECT id FROM card_sets WHERE course_id = ${courseId}::uuid AND user_id = ${userId}::uuid
      )
    `,
    sql`DELETE FROM card_sets WHERE course_id = ${courseId}::uuid AND user_id = ${userId}::uuid RETURNING id`,
    sql`DELETE FROM courses WHERE id = ${courseId}::uuid AND user_id = ${userId}::uuid`,
  ]);
  return res.status(200).json({ ok: true, deletedSets: sets.length });
}

export async function renameCourse(req, res, sql, userId) {
  const { courseId, title } = req.body || {};
  if (!courseId || !title) return res.status(400).json({ error: 'courseId and title required' });

  const updated = await sql`
    UPDATE courses SET title = ${title}, updated_at = NOW()
    WHERE id = ${courseId}::uuid AND user_id = ${userId}::uuid
    RETURNING id
  `;
  if (updated.length === 0) {
    return res.status(403).json({ error: 'Not found or not the owner' });
  }
  return res.status(200).json({ ok: true });
}

// ─── Расписание занятий (plan/new/push_notifications.md, 2.8) ────

export const SCHEDULE_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** [{ day, time: 'HH:MM' }] — только дни недели и время кратно 15 минутам, не больше одного занятия в день */
export function parseSchedule(value) {
  if (!Array.isArray(value)) return null;
  const byDay = new Map();
  for (const item of value) {
    const day = item?.day;
    const m = typeof item?.time === 'string' ? item.time.match(/^(\d{1,2}):(\d{2})$/) : null;
    if (!SCHEDULE_DAYS.includes(day) || !m) continue;
    const h = Number(m[1]),
      min = Number(m[2]);
    if (h > 23 || min > 59 || min % 15 !== 0) continue;
    byDay.set(day, `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
  }
  const schedule = SCHEDULE_DAYS.filter((d) => byDay.has(d)).map((day) => ({
    day,
    time: byDay.get(day),
  }));
  return schedule.length ? schedule : null;
}

export async function getSchedule(req, res, sql, userId) {
  const courseId = req.query.courseId;
  if (!courseId) return res.status(400).json({ error: 'courseId required' });
  const rows = await sql`
    SELECT schedule FROM courses WHERE id = ${courseId}::uuid AND user_id = ${userId}::uuid
  `;
  if (rows.length === 0) return res.status(403).json({ error: 'Not found or not the owner' });
  return res.status(200).json({ schedule: rows[0].schedule || [] });
}

/** Учитель задаёт расписание один раз — ученики курса получают «Скоро занятие» без вопросов */
export async function setSchedule(req, res, sql, userId) {
  const { courseId } = req.body || {};
  if (!courseId) return res.status(400).json({ error: 'courseId required' });
  const schedule = parseSchedule(req.body?.schedule);
  const updated = await sql`
    UPDATE courses SET schedule = ${schedule ? JSON.stringify(schedule) : null}::jsonb, updated_at = NOW()
    WHERE id = ${courseId}::uuid AND user_id = ${userId}::uuid
    RETURNING id
  `;
  if (updated.length === 0) return res.status(403).json({ error: 'Not found or not the owner' });
  return res.status(200).json({ ok: true, schedule: schedule || [] });
}

// ─── Приглашения ────────────────────────────────────────────
