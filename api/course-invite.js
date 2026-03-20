import { neon } from '@neondatabase/serverless';
import { ensureDatabaseInitialized } from './_db-init.js';
import crypto from 'crypto';

/**
 * API для приглашений в курс
 *
 * POST /api/course-invite?action=create   — создать/получить инвайт-ссылку
 * GET  /api/course-invite?action=info      — информация о курсе по токену
 * POST /api/course-invite?action=join      — принять приглашение
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const sql = neon(process.env.POSTGRES_URL);
  await ensureDatabaseInitialized(sql);

  const { action } = req.query;

  try {
    if (action === 'create') return await createInvite(req, res, sql);
    if (action === 'info')   return await getInviteInfo(req, res, sql);
    if (action === 'join')   return await joinCourse(req, res, sql);

    return res.status(400).json({ error: 'Unknown action. Use: create, info, join' });
  } catch (error) {
    console.error('Course invite API error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * POST ?action=create
 * Body: { courseId, userId }
 * Создать или вернуть существующий токен приглашения
 */
async function createInvite(req, res, sql) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { courseId, userId } = req.body;
  if (!courseId || !userId) {
    return res.status(400).json({ error: 'courseId and userId are required' });
  }

  // Проверить что пользователь — владелец курса
  const course = await sql`
    SELECT id, title FROM courses
    WHERE id = ${courseId}::uuid AND user_id = ${userId}::uuid
  `;
  if (course.length === 0) {
    return res.status(403).json({ error: 'Access denied: not course owner' });
  }

  // Проверить существующий токен
  const existing = await sql`
    SELECT token FROM course_invites
    WHERE course_id = ${courseId}::uuid
    LIMIT 1
  `;

  if (existing.length > 0) {
    return res.status(200).json({
      token: existing[0].token,
      inviteUrl: `https://ai-app-seven-zeta.vercel.app/join/${existing[0].token}`,
    });
  }

  // Сгенерировать новый токен
  const token = crypto.randomBytes(32).toString('hex');

  await sql`
    INSERT INTO course_invites (course_id, token, created_by)
    VALUES (${courseId}::uuid, ${token}, ${userId}::uuid)
  `;

  return res.status(201).json({
    token,
    inviteUrl: `https://ai-app-seven-zeta.vercel.app/join/${token}`,
  });
}

/**
 * GET ?action=info&token=TOKEN
 * Получить информацию о курсе по токену (для модалки ученика)
 */
async function getInviteInfo(req, res, sql) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ error: 'token is required' });
  }

  const result = await sql`
    SELECT
      c.id AS course_id,
      c.title AS course_title,
      COALESCE(u.display_name, u.user_name, u.email) AS teacher_name
    FROM course_invites ci
    JOIN courses c ON c.id = ci.course_id
    JOIN users u ON u.id = ci.created_by
    WHERE ci.token = ${token}
      AND (ci.expires_at IS NULL OR ci.expires_at > NOW())
  `;

  if (result.length === 0) {
    return res.status(404).json({ error: 'Invite not found or expired' });
  }

  return res.status(200).json(result[0]);
}

/**
 * POST ?action=join
 * Body: { token, userId }
 * Принять приглашение — добавить ученика в course_members
 */
async function joinCourse(req, res, sql) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, userId } = req.body;
  if (!token || !userId) {
    return res.status(400).json({ error: 'token and userId are required' });
  }

  // Найти токен → получить courseId
  const invite = await sql`
    SELECT ci.course_id, c.title AS course_title
    FROM course_invites ci
    JOIN courses c ON c.id = ci.course_id
    WHERE ci.token = ${token}
      AND (ci.expires_at IS NULL OR ci.expires_at > NOW())
  `;

  if (invite.length === 0) {
    return res.status(404).json({ error: 'Invite not found or expired' });
  }

  const { course_id, course_title } = invite[0];

  // Нельзя присоединиться к своему курсу
  const isOwner = await sql`
    SELECT id FROM courses
    WHERE id = ${course_id}::uuid AND user_id = ${userId}::uuid
  `;
  if (isOwner.length > 0) {
    return res.status(400).json({ error: 'Cannot join your own course' });
  }

  // INSERT с ON CONFLICT — защита от двойного нажатия
  await sql`
    INSERT INTO course_members (course_id, user_id, role)
    VALUES (${course_id}::uuid, ${userId}::uuid, 'student')
    ON CONFLICT (course_id, user_id) DO NOTHING
  `;

  return res.status(200).json({
    success: true,
    courseId: course_id,
    courseTitle: course_title,
  });
}
