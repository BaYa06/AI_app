/**
 * api/data.js — курсы пользователя и курсы ученика (Clean 10 — перенесено без изменений).
 */
import { HttpError, uuid } from '../../_access.js';
import { optString, isoOrNull } from './_shared.js';

export async function loadCourses(sql, me) {
  return sql`
    SELECT id, title, created_at, updated_at FROM courses
    WHERE user_id = ${me}::uuid
    ORDER BY created_at ASC
  `;
}

export async function createCourse(sql, me, p) {
  const id = uuid(p.id, 'id');
  const title = optString(p.title, 255);
  if (!title) throw new HttpError(400, 'title required');
  const createdAt = isoOrNull(p.createdAt) || new Date().toISOString();
  await sql`
    INSERT INTO courses (id, user_id, title, created_at, updated_at)
    VALUES (${id}::uuid, ${me}::uuid, ${title}, ${createdAt}, ${createdAt})
    ON CONFLICT (id) DO NOTHING
  `;
  return true;
}

export async function loadStudentCourses(sql, me) {
  return sql`
    SELECT c.id, c.title, c.user_id AS owner_id, cm.joined_at,
           COALESCE(u.display_name, u.user_name, u.email) AS teacher_name
    FROM course_members cm
    JOIN courses c ON c.id = cm.course_id
    JOIN users u ON u.id = c.user_id
    WHERE cm.user_id = ${me}::uuid AND cm.role = 'student'
    ORDER BY cm.joined_at DESC
  `;
}

// ─── Серия и активность ─────────────────────────────────────────────────────
