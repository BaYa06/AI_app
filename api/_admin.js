/**
 * Админка по ссылке (/admin): статистика и обратная связь.
 * Файл начинается с "_", поэтому Vercel не публикует его как отдельный роут — вызывается из
 * api/data.js (adminDashboard / adminMarkFeedbackRead) только для users.is_admin = true.
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

export async function getAdminFeedback(sql) {
  try {
    const [items, summary] = await Promise.all([
      sql`SELECT f.id, f.kind, f.category, f.rating, f.has_problem, f.tags, f.message,
                 f.app_version, f.platform, f.os_version, f.user_role, f.status, f.created_at,
                 COALESCE(u.display_name, u.user_name, u.email, 'Удалённый пользователь') AS user_label,
                 u.email
          FROM app_feedback f
          LEFT JOIN users u ON u.id = f.user_id
          ORDER BY f.created_at DESC
          LIMIT 300`,
      sql`SELECT
            ROUND(AVG(rating) FILTER (WHERE kind = 'rating'), 2)                                         AS avg_rating,
            COUNT(*) FILTER (WHERE kind = 'rating')::int                                                 AS ratings,
            COUNT(*) FILTER (WHERE kind = 'rating' AND created_at > NOW() - INTERVAL '30 days')::int    AS ratings30d,
            COUNT(*) FILTER (WHERE kind = 'rating' AND has_problem)::int                                 AS with_problems,
            COUNT(*) FILTER (WHERE kind = 'message')::int                                                AS messages,
            COUNT(*) FILTER (WHERE status = 'new')::int                                                  AS unread
          FROM app_feedback`,
    ]);
    return { items, summary: summary[0] };
  } catch (e) {
    // Таблица появится после деплоя API (миграция 023 применяется при первом запросе)
    if (e.code === '42P01') return { items: [], summary: null, missing: true };
    throw e;
  }
}

export async function markAdminFeedbackRead(sql, id) {
  await sql`UPDATE app_feedback SET status = 'read' WHERE id = ${id}::uuid`;
  return { ok: true };
}
