import { neon } from '@neondatabase/serverless';
import { getAuthedUserId } from './_auth.js';
import crypto from 'crypto';

/**
 * API для учительских мутаций (курсы, приглашения, ростер, видимость наборов)
 *
 * В отличие от остального приложения (которое подключается к Neon напрямую с клиента),
 * этот эндпоинт — единственный путь для перечисленных ниже операций. Он проверяет
 * подлинность вызывающего по Supabase JWT (Authorization: Bearer <access_token>) и сам
 * определяет userId из токена — тело/query запроса на userId/teacherId не полагается.
 *
 * POST /api/teacher?action=delete-course        { courseId }
 * POST /api/teacher?action=rename-course         { courseId, title }
 * POST /api/teacher?action=create-invite         { courseId }
 * POST /api/teacher?action=regenerate-invite      { courseId }  — старые token/join_code перестают работать
 * GET  /api/teacher?action=check-owner           ?courseId=
 * GET  /api/teacher?action=invite-info-by-code   ?code=
 * GET  /api/teacher?action=invite-info-by-token  ?token=
 * POST /api/teacher?action=join-by-code          { code }
 * POST /api/teacher?action=join-by-token         { token }
 * POST /api/teacher?action=leave-course          { courseId }
 * POST /api/teacher?action=remove-student        { courseId, studentUserId }
 * GET  /api/teacher?action=list-members          ?courseId=
 * GET  /api/teacher?action=student-stats         ?courseId=&studentId=
 * POST /api/teacher?action=toggle-set-hidden     { setId, hidden }
 * GET  /api/teacher?action=course-activity-chart ?courseId=&days=
 * GET  /api/teacher?action=course-set-stats      ?courseId=
 * GET  /api/teacher?action=set-hard-cards        ?setId=&courseId=
 * GET  /api/teacher?action=course-sets-by-membership ?courseId= (ученик — курс, в котором состоит)
 */

/**
 * id наборов курса для статистики: собственные наборы курса (card_sets.course_id) + официальные
 * наборы юнитов книг (каталог книг), которые учитель хоть раз открывал в этом курсе. Закрытый
 * после прохождения юнит остаётся в статистике. Вкладывается в другие запросы (композиция
 * шаблонов @neondatabase/serverless 1.x).
 */
function courseSetIdsSql(sql, courseId) {
  return sql`
    SELECT id FROM card_sets WHERE course_id = ${courseId}::uuid
    UNION
    SELECT ocs.id
    FROM course_units cu
    JOIN book_units u ON u.id = cu.unit_id
    JOIN course_books cb ON cb.course_id = cu.course_id AND cb.book_id = u.book_id
    JOIN card_sets ocs ON ocs.unit_id = u.id AND ocs.is_official = true
    WHERE cu.course_id = ${courseId}::uuid AND cu.opened_at IS NOT NULL
  `;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const userId = await getAuthedUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized', reason: 'unauthorized' });
  }

  const sql = neon(process.env.POSTGRES_URL);
  const { action } = req.query;

  try {
    if (action === 'delete-course')       return await deleteCourse(req, res, sql, userId);
    if (action === 'rename-course')       return await renameCourse(req, res, sql, userId);
    if (action === 'create-invite')       return await createInvite(req, res, sql, userId);
    if (action === 'regenerate-invite')   return await regenerateInvite(req, res, sql, userId);
    if (action === 'invite-info-by-code') return await inviteInfoByCode(req, res, sql, userId);
    if (action === 'invite-info-by-token')return await inviteInfoByToken(req, res, sql);
    if (action === 'join-by-code')        return await joinByCode(req, res, sql, userId);
    if (action === 'join-by-token')       return await joinByToken(req, res, sql, userId);
    if (action === 'leave-course')        return await leaveCourse(req, res, sql, userId);
    if (action === 'remove-student')      return await removeStudent(req, res, sql, userId);
    if (action === 'list-members')        return await listMembers(req, res, sql, userId);
    if (action === 'student-stats')       return await studentStats(req, res, sql, userId);
    if (action === 'toggle-set-hidden')   return await toggleSetHidden(req, res, sql, userId);
    if (action === 'check-owner')         return await checkOwner(req, res, sql, userId);
    if (action === 'course-activity-chart')      return await courseActivityChart(req, res, sql, userId);
    if (action === 'course-set-stats')           return await courseSetStats(req, res, sql, userId);
    if (action === 'set-hard-cards')             return await setHardCards(req, res, sql, userId);
    if (action === 'course-sets-by-membership')  return await courseSetsByMembership(req, res, sql, userId);

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.error('Teacher API error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// ─── Курс: удалить / переименовать ─────────────────────────

async function deleteCourse(req, res, sql, userId) {
  const { courseId } = req.body || {};
  if (!courseId) return res.status(400).json({ error: 'courseId required' });

  const deleted = await sql`
    DELETE FROM courses WHERE id = ${courseId}::uuid AND user_id = ${userId}::uuid
    RETURNING id
  `;
  if (deleted.length === 0) {
    return res.status(403).json({ error: 'Not found or not the owner' });
  }
  return res.status(200).json({ ok: true });
}

async function renameCourse(req, res, sql, userId) {
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

// ─── Приглашения ────────────────────────────────────────────

/** Срок действия нового инвайта — курс/приглашение не должны быть открыты навсегда. */
const INVITE_TTL_SQL = '90 days';

/** 6-значный код курса — криптографически случайный (не Math.random). */
function generateJoinCode() {
  return String(crypto.randomInt(100000, 1000000));
}

async function createInvite(req, res, sql, userId) {
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
async function regenerateInvite(req, res, sql, userId) {
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
async function checkRateLimit(sql, userId, action, maxAttempts, windowSeconds) {
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
function resolveInviteLookup(rows) {
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

async function lookupInviteByCode(sql, code) {
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

async function lookupInviteByToken(sql, token) {
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

async function inviteInfoByCode(req, res, sql, userId) {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'code required', reason: 'bad_request' });

  if (!(await checkRateLimit(sql, userId, 'invite-code-guess', 10, 60))) {
    return res.status(429).json({ error: 'Too many attempts, try again in a minute', reason: 'rate_limited' });
  }

  const lookup = await lookupInviteByCode(sql, code);
  if (lookup.reason === 'not_found') return res.status(404).json({ error: 'Invite not found', reason: 'not_found' });
  if (lookup.reason === 'expired') return res.status(410).json({ error: 'Invite expired', reason: 'expired' });
  return res.status(200).json({
    ok: true,
    courseId: lookup.courseId,
    courseTitle: lookup.courseTitle,
    teacherName: lookup.teacherName,
  });
}

async function inviteInfoByToken(req, res, sql) {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'token required', reason: 'bad_request' });

  const lookup = await lookupInviteByToken(sql, token);
  if (lookup.reason === 'not_found') return res.status(404).json({ error: 'Invite not found', reason: 'not_found' });
  if (lookup.reason === 'expired') return res.status(410).json({ error: 'Invite expired', reason: 'expired' });
  return res.status(200).json({
    ok: true,
    courseId: lookup.courseId,
    courseTitle: lookup.courseTitle,
    teacherName: lookup.teacherName,
  });
}

async function joinByCode(req, res, sql, userId) {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'code required', reason: 'bad_request' });

  if (!(await checkRateLimit(sql, userId, 'invite-code-guess', 10, 60))) {
    return res.status(429).json({ error: 'Too many attempts, try again in a minute', reason: 'rate_limited' });
  }

  const lookup = await lookupInviteByCode(sql, code);
  if (lookup.reason === 'not_found') return res.status(404).json({ error: 'Invite not found', reason: 'not_found' });
  if (lookup.reason === 'expired') return res.status(410).json({ error: 'Invite expired', reason: 'expired' });
  if (lookup.ownerId === userId) return res.status(400).json({ error: 'Cannot join your own course', reason: 'own_course' });

  await sql`
    INSERT INTO course_members (course_id, user_id, role)
    VALUES (${lookup.courseId}::uuid, ${userId}::uuid, 'student')
    ON CONFLICT (course_id, user_id) DO NOTHING
  `;
  return res.status(200).json({ ok: true, courseId: lookup.courseId, courseTitle: lookup.courseTitle });
}

async function joinByToken(req, res, sql, userId) {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token required', reason: 'bad_request' });

  const lookup = await lookupInviteByToken(sql, token);
  if (lookup.reason === 'not_found') return res.status(404).json({ error: 'Invite not found', reason: 'not_found' });
  if (lookup.reason === 'expired') return res.status(410).json({ error: 'Invite expired', reason: 'expired' });
  if (lookup.ownerId === userId) return res.status(400).json({ error: 'Cannot join your own course', reason: 'own_course' });

  await sql`
    INSERT INTO course_members (course_id, user_id, role)
    VALUES (${lookup.courseId}::uuid, ${userId}::uuid, 'student')
    ON CONFLICT (course_id, user_id) DO NOTHING
  `;
  return res.status(200).json({ ok: true, courseId: lookup.courseId, courseTitle: lookup.courseTitle });
}

async function leaveCourse(req, res, sql, userId) {
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

async function removeStudent(req, res, sql, userId) {
  const { courseId, studentUserId } = req.body || {};
  if (!courseId || !studentUserId) return res.status(400).json({ error: 'courseId and studentUserId required' });

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

async function listMembers(req, res, sql, userId) {
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
      ) AS current_streak
    FROM course_members cm
    JOIN users u ON u.id = cm.user_id
    LEFT JOIN user_stats us ON us.user_id = cm.user_id
    LEFT JOIN (
      SELECT
        r.user_id,
        MAX(r.reviewed_at)::date AS last_active_date,
        COUNT(DISTINCT CASE WHEN r.reviewed_at::date = CURRENT_DATE THEN r.card_id END) AS today_cards
      FROM reviews r
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
  }));
  return res.status(200).json({ ok: true, members, hasMore });
}

async function studentStats(req, res, sql, userId) {
  const { courseId, studentId } = req.query;
  if (!courseId || !studentId) return res.status(400).json({ error: 'courseId and studentId required' });

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
      LEFT JOIN reviews r ON r.card_id = c.id AND r.user_id = ${studentId}::uuid
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
      (SELECT MAX(reviewed_at)::date FROM reviews WHERE user_id = ${studentId}::uuid) AS last_active_date
  `;

  return res.status(200).json({
    ok: true,
    seenCards,
    learnedCards,
    unlearnedCards: Math.max(0, totalCards - seenCards),
    sets,
    streak: activity[0]?.current_streak || 0,
    lastActiveDate: activity[0]?.last_active_date || null,
  });
}

async function checkOwner(req, res, sql, userId) {
  const { courseId } = req.query;
  if (!courseId) return res.status(400).json({ error: 'courseId required' });

  const course = await sql`
    SELECT id FROM courses WHERE id = ${courseId}::uuid AND user_id = ${userId}::uuid
  `;
  return res.status(200).json({ ok: true, isOwner: course.length > 0 });
}

// ─── Видимость набора ───────────────────────────────────────

async function toggleSetHidden(req, res, sql, userId) {
  const { setId, hidden } = req.body || {};
  if (!setId || typeof hidden !== 'boolean') {
    return res.status(400).json({ error: 'setId and boolean hidden required' });
  }

  const updated = await sql`
    UPDATE card_sets SET is_hidden_from_students = ${hidden}, updated_at = NOW()
    WHERE id = ${setId}::uuid AND user_id = ${userId}::uuid
    RETURNING id
  `;
  if (updated.length === 0) return res.status(403).json({ error: 'Not found or not the owner' });
  return res.status(200).json({ ok: true });
}

// ─── Агрегаты курса/наборов (учитель) ────────────────────────
// Раньше эти четыре функции жили в NeonService.ts и шли напрямую в Neon с клиента без
// какой-либо проверки, что вызывающий преподаёт этот курс — любой мог передать чужой
// courseId/setId и получить реальную статистику чужого курса. См. план, пункт 23.

async function courseActivityChart(req, res, sql, userId) {
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
    FROM reviews r
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

async function courseSetStats(req, res, sql, userId) {
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
      FROM reviews r
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

async function setHardCards(req, res, sql, userId) {
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
    JOIN reviews r ON r.card_id = c.id
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

async function courseSetsByMembership(req, res, sql, userId) {
  const { courseId } = req.query;
  if (!courseId) return res.status(400).json({ error: 'courseId required' });

  const membership = await sql`
    SELECT id FROM course_members WHERE course_id = ${courseId}::uuid AND user_id = ${userId}::uuid
  `;
  if (membership.length === 0) return res.status(403).json({ error: 'Not a member of this course' });

  const rows = await sql`
    SELECT
      cs.*,
      (SELECT COUNT(*) FROM cards WHERE set_id = cs.id) AS total_cards
    FROM card_sets cs
    WHERE cs.course_id = ${courseId}::uuid
      AND cs.is_hidden_from_students = false
    ORDER BY cs.created_at DESC
  `;

  // Официальные наборы книг курса (каталог книг): только открытые учителем юниты опубликованных книг.
  // У таких наборов course_id = NULL — к курсу они привязаны через course_books/course_units.
  const officialRows = await sql`
    SELECT cs.*, b.id AS book_id, b.title AS book_title, u.number AS unit_number,
      (SELECT COUNT(*) FROM cards WHERE set_id = cs.id) AS total_cards
    FROM course_units cu
    JOIN book_units u ON u.id = cu.unit_id
    JOIN books b ON b.id = u.book_id AND b.is_published = true
    JOIN course_books cb ON cb.course_id = cu.course_id AND cb.book_id = b.id
    JOIN card_sets cs ON cs.unit_id = u.id AND cs.is_official = true
    WHERE cu.course_id = ${courseId}::uuid AND cu.is_open = true
    ORDER BY b.title, u.sort_order, u.number, cs.created_at
  `;

  return res.status(200).json({
    ok: true,
    sets: [...rows, ...officialRows].map((row) => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      description: row.description || '',
      category: row.category || '',
      icon: row.icon || null,
      languageFrom: row.language_from || 'de',
      languageTo: row.language_to || 'ru',
      totalCards: parseInt(row.total_cards, 10) || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at || null,
      // Официальный набор в курс попадает через план юнитов — отдаём его под этим курсом.
      courseId: row.is_official ? courseId : row.course_id,
      isOfficial: row.is_official === true,
      unitId: row.unit_id || null,
      bookId: row.book_id || null,
      bookTitle: row.book_title || null,
      unitNumber: row.unit_number ?? null,
    })),
  });
}
