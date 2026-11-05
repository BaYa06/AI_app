/**
 * api/teacher.js — приглашения: код и ссылка, вход в курс, выход, удаление ученика (Clean 10 — перенесено без изменений).
 */
import crypto from 'crypto';

/** Срок действия нового инвайта — курс/приглашение не должны быть открыты навсегда. */
export const INVITE_TTL_SQL = '90 days';

/** 6-значный код курса — криптографически случайный (не Math.random). */
export function generateJoinCode() {
  return String(crypto.randomInt(100000, 1000000));
}

export async function createInvite(req, res, sql, userId) {
  const { courseId } = req.body || {};
  if (!courseId) return res.status(400).json({ error: 'courseId required' });

  const course = await sql`
    SELECT id FROM courses WHERE id = ${courseId}::uuid AND user_id = ${userId}::uuid
  `;
  if (course.length === 0) return res.status(403).json({ error: 'Not the owner' });

  const token = crypto.randomBytes(32).toString('hex');
  const joinCode = generateJoinCode();

  // Один атомарный запрос вместо "SELECT есть ли инвайт -> если нет, INSERT": при гонке
  // двух одновременных вызовов (двойной тап, повторный рендер эффекта) UNIQUE(course_id)
  // (миграция 013) гарантирует единственную строку на курс. CASE внутри DO UPDATE нужен
  // потому что `DO UPDATE ... WHERE <false>` в Postgres не возвращает строку через
  // RETURNING вообще — а нам нужно всегда получить актуальный token/join_code одним запросом:
  // если инвайт ещё не истёк, оставляем как есть и возвращаем его; если истёк или его не
  // было — записываем свежий.
  const result = await sql`
    INSERT INTO course_invites (course_id, token, created_by, join_code, expires_at)
    VALUES (${courseId}::uuid, ${token}, ${userId}::uuid, ${joinCode}, NOW() + ${INVITE_TTL_SQL}::interval)
    ON CONFLICT (course_id) DO UPDATE SET
      token = CASE WHEN course_invites.expires_at IS NOT NULL AND course_invites.expires_at <= NOW()
                   THEN EXCLUDED.token ELSE course_invites.token END,
      join_code = CASE WHEN course_invites.expires_at IS NOT NULL AND course_invites.expires_at <= NOW()
                   THEN EXCLUDED.join_code ELSE course_invites.join_code END,
      created_by = CASE WHEN course_invites.expires_at IS NOT NULL AND course_invites.expires_at <= NOW()
                   THEN EXCLUDED.created_by ELSE course_invites.created_by END,
      expires_at = CASE WHEN course_invites.expires_at IS NOT NULL AND course_invites.expires_at <= NOW()
                   THEN EXCLUDED.expires_at ELSE course_invites.expires_at END
    RETURNING token, join_code
  `;
  return res.status(200).json({ ok: true, token: result[0].token, joinCode: result[0].join_code });
}

/** Пересоздать инвайт — старые ссылка/код сразу перестают работать (принудительно, без условия по сроку). */
export async function regenerateInvite(req, res, sql, userId) {
  const { courseId } = req.body || {};
  if (!courseId) return res.status(400).json({ error: 'courseId required' });

  const course = await sql`
    SELECT id FROM courses WHERE id = ${courseId}::uuid AND user_id = ${userId}::uuid
  `;
  if (course.length === 0) return res.status(403).json({ error: 'Not the owner' });

  const token = crypto.randomBytes(32).toString('hex');
  const joinCode = generateJoinCode();

  const result = await sql`
    INSERT INTO course_invites (course_id, token, created_by, join_code, expires_at)
    VALUES (${courseId}::uuid, ${token}, ${userId}::uuid, ${joinCode}, NOW() + ${INVITE_TTL_SQL}::interval)
    ON CONFLICT (course_id) DO UPDATE SET
      token = EXCLUDED.token,
      join_code = EXCLUDED.join_code,
      created_by = EXCLUDED.created_by,
      expires_at = EXCLUDED.expires_at
    RETURNING token, join_code
  `;
  return res.status(200).json({ ok: true, token: result[0].token, joinCode: result[0].join_code });
}

/**
 * Rate-limit на угадывание 6-значного кода курса: не больше `maxAttempts` попыток от одного
 * пользователя за `windowSeconds`. Считается в БД (не в памяти процесса), поэтому работает
 * надёжно между отдельными вызовами serverless-функции. Таблица создаётся лениво при первом
 * обращении, как и другие вспомогательные индексы/таблицы в этом файле.
 */
export async function checkRateLimit(sql, userId, action, maxAttempts, windowSeconds) {
  await sql`
    CREATE TABLE IF NOT EXISTS api_rate_limits (
      user_id UUID NOT NULL,
      action VARCHAR(50) NOT NULL,
      window_start TIMESTAMPTZ NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, action, window_start)
    )
  `;
  const windowStartMs = Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000;
  const windowStart = new Date(windowStartMs).toISOString();
  const result = await sql`
    INSERT INTO api_rate_limits (user_id, action, window_start, attempts)
    VALUES (${userId}::uuid, ${action}, ${windowStart}::timestamptz, 1)
    ON CONFLICT (user_id, action, window_start) DO UPDATE SET
      attempts = api_rate_limits.attempts + 1
    RETURNING attempts
  `;
  return result[0].attempts <= maxAttempts;
}

/**
 * Общий разбор результата поиска инвайта — различает "не существует" от "истёк", вместо
 * того чтобы сворачивать оба случая в один и тот же ответ (см. план, пункт 13). Оба вызывающих
 * запроса ниже намеренно НЕ фильтруют по expires_at в SQL, чтобы отличить эти случаи.
 */
export function resolveInviteLookup(rows) {
  if (rows.length === 0) return { reason: 'not_found' };
  const row = rows[0];
  if (row.expires_at && new Date(row.expires_at) <= new Date()) return { reason: 'expired' };
  return {
    reason: 'ok',
    courseId: row.course_id,
    courseTitle: row.course_title,
    ownerId: row.owner_id,
    teacherName: row.teacher_name,
  };
}

export async function lookupInviteByCode(sql, code) {
  const rows = await sql`
    SELECT ci.course_id, c.title AS course_title, c.user_id AS owner_id,
           COALESCE(u.display_name, u.user_name, u.email) AS teacher_name,
           ci.expires_at
    FROM course_invites ci
    JOIN courses c ON c.id = ci.course_id
    JOIN users u ON u.id = ci.created_by
    WHERE ci.join_code = ${code}
  `;
  return resolveInviteLookup(rows);
}

export async function lookupInviteByToken(sql, token) {
  const rows = await sql`
    SELECT ci.course_id, c.title AS course_title, c.user_id AS owner_id,
           COALESCE(u.display_name, u.user_name, u.email) AS teacher_name,
           ci.expires_at
    FROM course_invites ci
    JOIN courses c ON c.id = ci.course_id
    JOIN users u ON u.id = ci.created_by
    WHERE ci.token = ${token}
  `;
  return resolveInviteLookup(rows);
}

export async function inviteInfoByCode(req, res, sql, userId) {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'code required', reason: 'bad_request' });

  if (!(await checkRateLimit(sql, userId, 'invite-code-guess', 10, 60))) {
    return res
      .status(429)
      .json({ error: 'Too many attempts, try again in a minute', reason: 'rate_limited' });
  }

  const lookup = await lookupInviteByCode(sql, code);
  if (lookup.reason === 'not_found')
    return res.status(404).json({ error: 'Invite not found', reason: 'not_found' });
  if (lookup.reason === 'expired')
    return res.status(410).json({ error: 'Invite expired', reason: 'expired' });
  return res.status(200).json({
    ok: true,
    courseId: lookup.courseId,
    courseTitle: lookup.courseTitle,
    teacherName: lookup.teacherName,
  });
}

export async function inviteInfoByToken(req, res, sql) {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'token required', reason: 'bad_request' });

  const lookup = await lookupInviteByToken(sql, token);
  if (lookup.reason === 'not_found')
    return res.status(404).json({ error: 'Invite not found', reason: 'not_found' });
  if (lookup.reason === 'expired')
    return res.status(410).json({ error: 'Invite expired', reason: 'expired' });
  return res.status(200).json({
    ok: true,
    courseId: lookup.courseId,
    courseTitle: lookup.courseTitle,
    teacherName: lookup.teacherName,
  });
}

export async function joinByCode(req, res, sql, userId) {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'code required', reason: 'bad_request' });

  if (!(await checkRateLimit(sql, userId, 'invite-code-guess', 10, 60))) {
    return res
      .status(429)
      .json({ error: 'Too many attempts, try again in a minute', reason: 'rate_limited' });
  }

  const lookup = await lookupInviteByCode(sql, code);
  if (lookup.reason === 'not_found')
    return res.status(404).json({ error: 'Invite not found', reason: 'not_found' });
  if (lookup.reason === 'expired')
    return res.status(410).json({ error: 'Invite expired', reason: 'expired' });
  if (lookup.ownerId === userId)
    return res.status(400).json({ error: 'Cannot join your own course', reason: 'own_course' });

  await sql`
    INSERT INTO course_members (course_id, user_id, role)
    VALUES (${lookup.courseId}::uuid, ${userId}::uuid, 'student')
    ON CONFLICT (course_id, user_id) DO NOTHING
  `;
  return res
    .status(200)
    .json({ ok: true, courseId: lookup.courseId, courseTitle: lookup.courseTitle });
}

export async function joinByToken(req, res, sql, userId) {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token required', reason: 'bad_request' });

  const lookup = await lookupInviteByToken(sql, token);
  if (lookup.reason === 'not_found')
    return res.status(404).json({ error: 'Invite not found', reason: 'not_found' });
  if (lookup.reason === 'expired')
    return res.status(410).json({ error: 'Invite expired', reason: 'expired' });
  if (lookup.ownerId === userId)
    return res.status(400).json({ error: 'Cannot join your own course', reason: 'own_course' });

  await sql`
    INSERT INTO course_members (course_id, user_id, role)
    VALUES (${lookup.courseId}::uuid, ${userId}::uuid, 'student')
    ON CONFLICT (course_id, user_id) DO NOTHING
  `;
  return res
    .status(200)
    .json({ ok: true, courseId: lookup.courseId, courseTitle: lookup.courseTitle });
}

export async function leaveCourse(req, res, sql, userId) {
  const { courseId } = req.body || {};
  if (!courseId) return res.status(400).json({ error: 'courseId required' });

  const owner = await sql`
    SELECT id FROM courses WHERE id = ${courseId}::uuid AND user_id = ${userId}::uuid
  `;
  if (owner.length > 0) return res.status(400).json({ error: 'Owner cannot leave own course' });

  await sql`
    DELETE FROM course_members
    WHERE course_id = ${courseId}::uuid AND user_id = ${userId}::uuid AND role = 'student'
  `;
  return res.status(200).json({ ok: true });
}

export async function removeStudent(req, res, sql, userId) {
  const { courseId, studentUserId } = req.body || {};
  if (!courseId || !studentUserId)
    return res.status(400).json({ error: 'courseId and studentUserId required' });

  const course = await sql`
    SELECT id FROM courses WHERE id = ${courseId}::uuid AND user_id = ${userId}::uuid
  `;
  if (course.length === 0) return res.status(403).json({ error: 'Not the owner' });

  await sql`
    DELETE FROM course_members
    WHERE course_id = ${courseId}::uuid AND user_id = ${studentUserId}::uuid
  `;
  return res.status(200).json({ ok: true });
}

// ─── Ростер и статистика ────────────────────────────────────
