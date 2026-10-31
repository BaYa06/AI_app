/**
 * Админка по ссылке (/admin): статистика и обратная связь.
 * Файл начинается с "_", поэтому Vercel не публикует его как отдельный роут — вызывается из
 * api/data.js (adminDashboard, adminFeedbackThread, adminReplyFeedback…) только для users.is_admin = true.
 * Запросы те же, что в локальной админке (admin-server.mjs).
 */

export async function getAdminStats(sql) {
  const [
    usersTotal,
    usersNew7d,
    activeToday,
    activeLast7d,
    registrationsByDay,
    dailyActiveUsers,
    teacherCount,
    anonymousCount,
    retentionD1,
    retentionD7,
    retentionD30,
    heatmap,
    weeklyCards,
    corporateCourses,
    avgStudents,
    courseJoins7d,
    activeTeachers,
    liveTests7d,
    recentEvents,
  ] = await Promise.all([

    sql`SELECT COUNT(*) as count FROM users WHERE is_anonymous = false OR is_anonymous IS NULL`,

    sql`SELECT COUNT(*) as count FROM users
        WHERE created_at >= NOW() - INTERVAL '7 days'
          AND (is_anonymous = false OR is_anonymous IS NULL)`,

    sql`SELECT COUNT(DISTINCT user_id) as count FROM daily_activity
        WHERE local_date = CURRENT_DATE`,

    sql`SELECT COUNT(DISTINCT user_id) as count FROM daily_activity
        WHERE local_date >= CURRENT_DATE - INTERVAL '6 days'`,

    sql`SELECT DATE(created_at) as day, COUNT(*) as count
        FROM users
        WHERE created_at >= NOW() - INTERVAL '30 days'
          AND (is_anonymous = false OR is_anonymous IS NULL)
        GROUP BY day ORDER BY day`,

    sql`SELECT local_date::text as day, COUNT(DISTINCT user_id) as count
        FROM daily_activity
        WHERE local_date >= CURRENT_DATE - INTERVAL '29 days'
        GROUP BY local_date
        ORDER BY local_date`,

    sql`SELECT COUNT(*) as count FROM users WHERE teacher = true`,

    sql`SELECT COUNT(*) as count FROM users WHERE is_anonymous = true`,

    sql`SELECT ROUND(
          COUNT(DISTINCT da.user_id)::numeric / NULLIF(COUNT(DISTINCT u.id), 0) * 100
        ) as pct
        FROM users u
        LEFT JOIN daily_activity da
          ON da.user_id = u.id
          AND da.local_date = DATE(u.created_at AT TIME ZONE 'UTC') + 1
        WHERE u.created_at BETWEEN NOW() - INTERVAL '8 days' AND NOW() - INTERVAL '1 day'
          AND (u.is_anonymous = false OR u.is_anonymous IS NULL)`,

    sql`SELECT ROUND(
          COUNT(DISTINCT da.user_id)::numeric / NULLIF(COUNT(DISTINCT u.id), 0) * 100
        ) as pct
        FROM users u
        LEFT JOIN daily_activity da
          ON da.user_id = u.id
          AND da.local_date = DATE(u.created_at AT TIME ZONE 'UTC') + 7
        WHERE u.created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'
          AND (u.is_anonymous = false OR u.is_anonymous IS NULL)`,

    sql`SELECT ROUND(
          COUNT(DISTINCT da.user_id)::numeric / NULLIF(COUNT(DISTINCT u.id), 0) * 100
        ) as pct
        FROM users u
        LEFT JOIN daily_activity da
          ON da.user_id = u.id
          AND da.local_date = DATE(u.created_at AT TIME ZONE 'UTC') + 30
        WHERE u.created_at BETWEEN NOW() - INTERVAL '37 days' AND NOW() - INTERVAL '30 days'
          AND (u.is_anonymous = false OR u.is_anonymous IS NULL)`,

    sql`SELECT EXTRACT(DOW FROM local_date)::int as dow,
               COUNT(DISTINCT user_id) as users,
               COALESCE(SUM(cards_studied), 0) as cards
        FROM daily_activity
        WHERE local_date >= CURRENT_DATE - INTERVAL '29 days'
        GROUP BY dow ORDER BY dow`,

    sql`SELECT COALESCE(SUM(cards_studied), 0) as total,
               COALESCE(AVG(cards_studied), 0) as avg_per_user_day
        FROM daily_activity
        WHERE local_date >= CURRENT_DATE - INTERVAL '6 days'`,

    sql`SELECT COUNT(*) as count FROM courses`,

    sql`SELECT ROUND(AVG(cnt)) as avg FROM (
          SELECT course_id, COUNT(*) as cnt
          FROM course_members WHERE role = 'student'
          GROUP BY course_id
        ) s`,

    sql`SELECT COUNT(*) as count FROM course_members
        WHERE joined_at >= NOW() - INTERVAL '7 days' AND role = 'student'`,

    sql`SELECT COUNT(DISTINCT u.id) as count
        FROM users u
        JOIN daily_activity da ON da.user_id = u.id
        WHERE u.teacher = true
          AND da.local_date >= CURRENT_DATE - INTERVAL '6 days'`,

    sql`SELECT COUNT(*) as count FROM test_sessions
        WHERE created_at >= NOW() - INTERVAL '7 days'`,

    sql`(SELECT 'new_user' as type,
                COALESCE(display_name, email, 'Аноним') as label,
                created_at as ts
         FROM users
         WHERE is_anonymous = false OR is_anonymous IS NULL
         ORDER BY created_at DESC LIMIT 10)
        UNION ALL
        (SELECT 'course_join' as type,
                COALESCE(u.display_name, u.email, 'Ученик') || ' → ' || c.title as label,
                cm.joined_at as ts
         FROM course_members cm
         JOIN users u ON u.id = cm.user_id
         JOIN courses c ON c.id = cm.course_id
         WHERE cm.role = 'student'
         ORDER BY cm.joined_at DESC LIMIT 5)
        UNION ALL
        (SELECT 'course_created' as type,
                COALESCE(u.display_name, u.email, 'Учитель') || ' создал «' || co.title || '»' as label,
                co.created_at as ts
         FROM courses co
         JOIN users u ON u.id = co.user_id
         ORDER BY co.created_at DESC LIMIT 5)
        UNION ALL
        (SELECT 'live_test' as type,
                COALESCE(u.display_name, u.email, 'Учитель') || ' запустил тест' as label,
                ts.created_at as ts
         FROM test_sessions ts
         JOIN users u ON u.id = ts.teacher_id
         ORDER BY ts.created_at DESC LIMIT 5)
        ORDER BY ts DESC LIMIT 20`,
  ]);

  return {
    generatedAt: new Date().toISOString(),
    users: {
      total:       Number(usersTotal[0].count),
      new7d:       Number(usersNew7d[0].count),
      teachers:    Number(teacherCount[0].count),
      anonymous:   Number(anonymousCount[0].count),
      activeToday: Number(activeToday[0].count),
      active7d:    Number(activeLast7d[0].count),
    },
    registrations: registrationsByDay.map(r => ({ day: r.day, count: Number(r.count) })),
    dailyActiveUsers: dailyActiveUsers.map(r => ({ day: r.day, count: Number(r.count) })),
    retention: {
      d1:  Number(retentionD1[0]?.pct  ?? 0),
      d7:  Number(retentionD7[0]?.pct  ?? 0),
      d30: Number(retentionD30[0]?.pct ?? 0),
    },
    heatmap: heatmap.map(r => ({ dow: r.dow, users: Number(r.users), cards: Number(r.cards) })),
    activity: {
      weeklyCards:    Number(weeklyCards[0]?.total ?? 0),
      avgCardsPerDay: Math.round(Number(weeklyCards[0]?.avg_per_user_day ?? 0)),
    },
    corporate: {
      courses:        Number(corporateCourses[0].count),
      avgStudents:    Number(avgStudents[0]?.avg ?? 0),
      joins7d:        Number(courseJoins7d[0].count),
      activeTeachers: Number(activeTeachers[0].count),
      liveTests7d:    Number(liveTests7d[0].count),
    },
    events: recentEvents.map(e => ({ type: e.type, label: e.label, ts: e.ts })),
  };
}

// ─── Feedback («Написать нам» и окно оценки) ─────────────────────────────────

/**
 * Ждёт ответа: новое (status = new) и есть что ответить — сообщение «Написать нам», текст или
 * проблема в окне оценки, или пользователь дописал. Оценка в одно касание («Нравится», без проблем) не ждёт.
 */
const FEEDBACK_AWAITING = `(f.status = 'new' AND (f.kind = 'message' OR f.message IS NOT NULL OR f.has_problem IS TRUE
  OR EXISTS (SELECT 1 FROM app_feedback_replies r WHERE r.feedback_id = f.id AND r.author = 'user')))`;

export async function getAdminFeedback(sql) {
  try {
    const [items, summary] = await Promise.all([
      sql.query(`SELECT f.id, f.kind, f.category, f.rating, f.has_problem, f.tags, f.message,
                 f.app_version, f.platform, f.os_version, f.user_role, f.status, f.created_at,
                 f.read_at, f.last_message_at, f.last_admin_reply_at,
                 ${FEEDBACK_AWAITING} AS awaiting,
                 (SELECT count(*)::int FROM app_feedback_replies r WHERE r.feedback_id = f.id) AS replies,
                 COALESCE(u.display_name, u.user_name, u.email, 'Удалённый пользователь') AS user_label,
                 u.email
          FROM app_feedback f
          LEFT JOIN users u ON u.id = f.user_id
          ORDER BY f.last_message_at DESC
          LIMIT 300`),
      sql.query(`SELECT
            ROUND(AVG(rating) FILTER (WHERE kind = 'rating'), 2)                                         AS avg_rating,
            COUNT(*) FILTER (WHERE kind = 'rating')::int                                                 AS ratings,
            COUNT(*) FILTER (WHERE kind = 'rating' AND created_at > NOW() - INTERVAL '30 days')::int    AS ratings30d,
            COUNT(*) FILTER (WHERE kind = 'rating' AND has_problem)::int                                 AS with_problems,
            COUNT(*) FILTER (WHERE kind = 'message')::int                                                AS messages,
            COUNT(*) FILTER (WHERE status = 'new')::int                                                  AS unread,
            COUNT(*) FILTER (WHERE ${FEEDBACK_AWAITING})::int                                            AS awaiting
          FROM app_feedback f`),
    ]);
    return { items, summary: summary[0] };
  } catch (e) {
    // Таблица появится после деплоя API (миграция 023 применяется при первом запросе)
    if (e.code === '42P01') return { items: [], summary: null, missing: true };
    throw e;
  }
}

/** Переписка по обращению. Открытие = «Прочитано» для пользователя (кнопка больше не нужна). */
export async function getAdminFeedbackThread(sql, id) {
  const [rows, replies] = await Promise.all([
    sql`UPDATE app_feedback SET status = 'read', read_at = COALESCE(read_at, NOW())
        WHERE id = ${id}::uuid AND status = 'new'
        RETURNING id`,
    sql`SELECT r.id, r.author, r.message, r.created_at,
               COALESCE(u.display_name, u.user_name, u.email) AS admin_label
        FROM app_feedback_replies r
        LEFT JOIN users u ON u.id = r.admin_id
        WHERE r.feedback_id = ${id}::uuid
        ORDER BY r.created_at`,
  ]);
  const f = await sql`SELECT id, status, read_at, user_seen_at, last_admin_reply_at FROM app_feedback WHERE id = ${id}::uuid`;
  if (!f[0]) return null;
  return { ...f[0], justRead: rows.length > 0, replies };
}

/** Ответ команды. close — сразу закрыть обращение (дописка пользователя откроет его снова). */
export async function replyAdminFeedback(sql, adminId, id, message, { close = false } = {}) {
  const rows = await sql`
    INSERT INTO app_feedback_replies (feedback_id, author, admin_id, message)
    SELECT id, 'admin', ${adminId}::uuid, ${message} FROM app_feedback WHERE id = ${id}::uuid
    RETURNING id, created_at
  `;
  if (!rows[0]) return null;
  const at = rows[0].created_at;
  await sql`
    UPDATE app_feedback
    SET status = ${close ? 'closed' : 'answered'}, read_at = COALESCE(read_at, ${at}),
        last_admin_reply_at = ${at}, last_message_at = ${at}
    WHERE id = ${id}::uuid
  `;
  return { id: rows[0].id, author: 'admin', message, created_at: at };
}

/** Закрыть без ответа (спам, оценка без текста) */
export async function closeAdminFeedback(sql, id) {
  await sql`UPDATE app_feedback SET status = 'closed', read_at = COALESCE(read_at, NOW()) WHERE id = ${id}::uuid`;
  return { ok: true };
}

export async function markAdminFeedbackRead(sql, id) {
  await sql`UPDATE app_feedback SET status = 'read' WHERE id = ${id}::uuid`;
  return { ok: true };
}

// ─── Жалобы на наборы по ссылке (plan/new/share_set.md, Share 6; App Review 1.2) ──────────────

export async function getShareReports(sql) {
  try {
    const items = await sql`
      SELECT r.id, r.code, r.reason, r.comment, r.created_at, r.resolved_at,
             s.disabled_at, s.views, s.imports,
             cs.title AS set_title,
             (SELECT COUNT(*) FROM cards c WHERE c.set_id = s.set_id)::int AS cards_count,
             COALESCE(owner.display_name, owner.user_name, owner.email, 'Удалённый пользователь') AS author_label,
             COALESCE(rep.display_name, rep.user_name, rep.email, 'Гость') AS reporter_label,
             (SELECT COUNT(*) FROM set_share_reports r2 WHERE r2.code = r.code)::int AS reports_on_link,
             (SELECT json_agg(json_build_object('front', c.front, 'back', c.back) ORDER BY c.sort_order NULLS LAST, c.created_at)
                FROM (SELECT front, back, sort_order, created_at FROM cards WHERE set_id = s.set_id
                      ORDER BY sort_order NULLS LAST, created_at LIMIT 10) c) AS sample
      FROM set_share_reports r
      JOIN set_shares s ON s.code = r.code
      LEFT JOIN card_sets cs ON cs.id = s.set_id
      LEFT JOIN users owner ON owner.id = s.owner_id
      LEFT JOIN users rep ON rep.id = r.reporter_id
      ORDER BY (r.resolved_at IS NULL) DESC, r.created_at DESC
      LIMIT 300
    `;
    const open = items.filter((i) => !i.resolved_at).length;
    return { items, summary: { open, total: items.length } };
  } catch (e) {
    // Таблицы появятся после деплоя API (миграция 034 применяется при первом запросе)
    if (e.code === '42P01') return { items: [], summary: null, missing: true };
    throw e;
  }
}

/** Отклонить жалобу: набор в порядке, ссылка продолжает работать. */
export async function resolveShareReport(sql, id) {
  await sql`UPDATE set_share_reports SET resolved_at = NOW() WHERE id = ${id}::uuid AND resolved_at IS NULL`;
  return { ok: true };
}

/** Закрыть ссылку по жалобе: набор больше не открывается ни у кого, все жалобы на неё решены. */
export async function disableShareByReport(sql, id) {
  await sql`
    WITH target AS (SELECT code FROM set_share_reports WHERE id = ${id}::uuid),
    closed AS (
      UPDATE set_shares SET disabled_at = COALESCE(disabled_at, NOW())
      WHERE code = (SELECT code FROM target)
      RETURNING code
    )
    UPDATE set_share_reports SET resolved_at = COALESCE(resolved_at, NOW())
    WHERE code = (SELECT code FROM target)
  `;
  return { ok: true };
}

