/**
 * Что и когда приходит учителю (plan/new/teacher_cabinet.md, этап 4, Teacher 46–47). Запускается
 * тем же cron, что и арбитр учеников (каждые 15 минут); отправка и журнал — _teacher.js.
 * Файл начинается с «_», поэтому Vercel не публикует его как отдельный роут.
 */
import { notifyTeacher } from './_teacher.js';
import { DEFAULT_TZ } from './_send.js';
import { hardCardRows } from '../_handlers/teacher/stats.js';
import { log } from '../_log.js';

/** «Урок через 2 часа»: окно ± 15 минут — cron ходит каждые 15 минут, повтор отсекает ключ урока */
export const LESSON_SOON_FROM_MIN = 105;
export const LESSON_SOON_TO_MIN = 135;
/** Сколько трудных слов называем в пуше */
export const LESSON_SOON_HARD_WORDS = 3;

/**
 * Данные пуша П1 или null — цифр не набралось (ни готовности, ни трудных слов), пуш не собираем.
 * readiness: { ready, total, readyLabel, homeworkId? } | null
 */
export function lessonSoonData(course, readiness, hardWords) {
  const words = (hardWords || []).slice(0, LESSON_SOON_HARD_WORDS);
  const hasReadiness = !!readiness && readiness.total > 0;
  if (!hasReadiness && words.length === 0) return null;
  return {
    courseId: course.course_id,
    course: course.course,
    time: course.time_label,
    ...(hasReadiness
      ? {
          ready: readiness.ready,
          total: readiness.total,
          readyLabel: readiness.readyLabel,
          ...(readiness.homeworkId ? { homeworkId: readiness.homeworkId } : {}),
        }
      : {}),
    hardWords: words,
  };
}

/** Готовность к уроку: текущее задание (сдали N из M), а без него — кто занимался за 7 дней */
async function courseReadiness(sql, courseId) {
  const hw = await sql`
    SELECT h.id,
      CASE WHEN h.assign_all
        THEN (SELECT COUNT(*)::int FROM course_members cm
              WHERE cm.course_id = h.course_id AND cm.role = 'student')
        ELSE (SELECT COUNT(*)::int FROM homework_assignees ha
              JOIN course_members cm ON cm.user_id = ha.user_id
                AND cm.course_id = h.course_id AND cm.role = 'student'
              WHERE ha.homework_id = h.id)
      END AS assigned,
      (SELECT COUNT(*)::int FROM homework_results r WHERE r.homework_id = h.id) AS submitted
    FROM homework h
    WHERE h.course_id = ${courseId}::uuid AND h.canceled_at IS NULL
      AND h.due_at > NOW() - INTERVAL '2 days'
    ORDER BY h.due_at ASC
    LIMIT 1
  `;
  if (hw.length > 0 && hw[0].assigned > 0) {
    return {
      ready: Math.min(hw[0].submitted, hw[0].assigned),
      total: hw[0].assigned,
      readyLabel: 'Сдали задание',
      homeworkId: hw[0].id,
    };
  }
  const [row] = await sql`
    SELECT COUNT(*)::int AS total,
      (COUNT(*) FILTER (WHERE us.last_active_date >= (NOW() - INTERVAL '7 days')::date))::int AS active
    FROM course_members cm
    LEFT JOIN user_stats us ON us.user_id = cm.user_id
    WHERE cm.course_id = ${courseId}::uuid AND cm.role = 'student'
  `;
  return row && row.total > 0
    ? { ready: row.active, total: row.total, readyLabel: 'Занимались за неделю' }
    : null;
}

/** П1 «Урок через 2 часа» (Teacher 46): урок курса по расписанию через 2 ч ± 15 мин в поясе курса */
export async function sendLessonSoon(sql) {
  const lessons = await sql`
    WITH slots AS (
      SELECT c.id AS course_id, c.user_id AS teacher_id, c.title AS course, s.time::time AS class_time,
             COALESCE(c.timezone, ts.timezone, ${DEFAULT_TZ}) AS tz
      FROM courses c
      LEFT JOIN user_stats ts ON ts.user_id = c.user_id
      CROSS JOIN LATERAL jsonb_to_recordset(c.schedule) AS s(day text, time text)
      WHERE c.schedule IS NOT NULL
        AND s.day = trim(to_char(NOW() AT TIME ZONE COALESCE(c.timezone, ts.timezone, ${DEFAULT_TZ}), 'dy'))
        AND EXISTS (SELECT 1 FROM course_members cm WHERE cm.course_id = c.id AND cm.role = 'student')
    )
    SELECT sl.course_id, sl.teacher_id, sl.course, sl.tz,
           to_char(sl.class_time, 'HH24:MI') AS time_label,
           (NOW() AT TIME ZONE sl.tz)::date::text AS local_day
    FROM slots sl
    WHERE EXTRACT(EPOCH FROM (sl.class_time - (NOW() AT TIME ZONE sl.tz)::time)) / 60
          BETWEEN ${LESSON_SOON_FROM_MIN} AND ${LESSON_SOON_TO_MIN}
  `;
  let created = 0;
  for (const lesson of lessons) {
    try {
      const [readiness, hard] = await Promise.all([
        courseReadiness(sql, lesson.course_id),
        hardCardRows(sql, lesson.course_id, 14, LESSON_SOON_HARD_WORDS),
      ]);
      const data = lessonSoonData(
        lesson,
        readiness,
        hard.map((h) => h.front)
      );
      if (!data) continue;
      const res = await notifyTeacher(sql, lesson.teacher_id, 'teacher_lesson_soon', data, {
        dedupe: `lesson:${lesson.course_id}:${lesson.local_day}:${lesson.time_label}`,
        timezone: lesson.tz,
      });
      if (res.status !== 'duplicate' && res.status !== 'no_specifics') created++;
    } catch (e) {
      log.error('teacher-push', `lesson_soon for course ${lesson.course_id} failed`, e);
    }
  }
  return { lessons: lessons.length, lessonNotes: created };
}

// ─── Итоги недели, ученики и задания (Teacher 47) ─────────────────────────────

/** «Итоги недели» — в понедельник в этот час по поясу учителя */
export const WEEK_SUMMARY_HOUR = 9;
/** «N не заходят 7+ дней» — в этот час по поясу курса, не чаще раза в 3 дня на курс */
export const INACTIVE_HOUR = 16;
export const INACTIVE_EVERY_DAYS = 3;
/** Серия ученика, с которой запись «можно похвалить» появляется в колокольчике */
export const PRAISE_MIN_STREAK = 7;

/** Данные «Итогов недели» или null — у учителя нет учеников */
export function weekSummaryData(row) {
  if (!row || !(row.total > 0)) return null;
  const answers = Number(row.answers) || 0;
  return {
    active: Math.min(row.active || 0, row.total),
    total: row.total,
    answers,
    correctPct: answers > 0 ? Math.round(((Number(row.correct) || 0) / answers) * 100) : 0,
    inactive: row.inactive || 0,
  };
}

/** Что сообщить по заданию: 'done' — все сдали, 'due' — срок прошёл, а сдали не все, иначе null */
export function homeworkEvent(h) {
  if (!(h.assigned > 0)) return null;
  if (h.submitted >= h.assigned) return 'done';
  return h.due_passed ? 'due' : null;
}

/** Ступень серии для похвалы: 7, 14, 21… — одна запись на ступень */
export function praiseStep(streak) {
  return Math.floor(streak / PRAISE_MIN_STREAK) * PRAISE_MIN_STREAK;
}

export async function sendWeekSummary(sql) {
  const rows = await sql`
    WITH teachers AS (
      SELECT u.id AS teacher_id, COALESCE(us.timezone, ${DEFAULT_TZ}) AS tz
      FROM users u LEFT JOIN user_stats us ON us.user_id = u.id
      WHERE u.teacher = true
    ),
    due AS (
      SELECT t.* FROM teachers t
      WHERE trim(to_char(NOW() AT TIME ZONE t.tz, 'dy')) = 'mon'
        AND EXTRACT(HOUR FROM NOW() AT TIME ZONE t.tz)::int = ${WEEK_SUMMARY_HOUR}
    ),
    students AS (
      SELECT DISTINCT d.teacher_id, cm.user_id
      FROM due d
      JOIN courses c ON c.user_id = d.teacher_id
      JOIN course_members cm ON cm.course_id = c.id AND cm.role = 'student'
    )
    SELECT d.teacher_id, d.tz, (NOW() AT TIME ZONE d.tz)::date::text AS local_day,
      (SELECT COUNT(*)::int FROM students s WHERE s.teacher_id = d.teacher_id) AS total,
      w.active, w.answers, w.correct,
      (SELECT COUNT(*)::int FROM students s
        LEFT JOIN user_stats su ON su.user_id = s.user_id
        WHERE s.teacher_id = d.teacher_id
          AND (su.last_active_date IS NULL OR su.last_active_date < (NOW() - INTERVAL '7 days')::date)) AS inactive
    FROM due d
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT a.user_id)::int AS active, COUNT(*)::int AS answers,
             (COUNT(*) FILTER (WHERE a.correct))::int AS correct
      FROM answers a
      JOIN students s ON s.user_id = a.user_id AND s.teacher_id = d.teacher_id
      WHERE a.answered_at >= NOW() - INTERVAL '7 days' AND a.rejected_reason IS NULL
    ) w ON true
    WHERE EXISTS (SELECT 1 FROM students s WHERE s.teacher_id = d.teacher_id)
  `;
  let created = 0;
  for (const r of rows) {
    const data = weekSummaryData(r);
    if (!data) continue;
    const res = await notifyTeacher(sql, r.teacher_id, 'teacher_week_summary', data, {
      dedupe: `week:${r.local_day}`,
      timezone: r.tz,
    });
    if (res.status !== 'duplicate' && res.status !== 'no_specifics') created++;
  }
  return { weekNotes: created };
}

export async function sendInactiveStudents(sql) {
  const rows = await sql`
    SELECT c.id AS course_id, c.user_id AS teacher_id, c.title AS course,
      COALESCE(c.timezone, ts.timezone, ${DEFAULT_TZ}) AS tz,
      (NOW() AT TIME ZONE COALESCE(c.timezone, ts.timezone, ${DEFAULT_TZ}))::date::text AS local_day,
      ARRAY(
        SELECT COALESCE(u.display_name, u.user_name, 'Ученик')
        FROM course_members cm
        JOIN users u ON u.id = cm.user_id
        LEFT JOIN user_stats su ON su.user_id = cm.user_id
        WHERE cm.course_id = c.id AND cm.role = 'student'
          AND cm.joined_at < NOW() - INTERVAL '7 days'
          AND (su.last_active_date IS NULL OR su.last_active_date < (NOW() - INTERVAL '7 days')::date)
        ORDER BY 1
        LIMIT 50
      ) AS names
    FROM courses c
    LEFT JOIN user_stats ts ON ts.user_id = c.user_id
    WHERE EXTRACT(HOUR FROM NOW() AT TIME ZONE COALESCE(c.timezone, ts.timezone, ${DEFAULT_TZ}))::int = ${INACTIVE_HOUR}
      AND NOT EXISTS (
        SELECT 1 FROM push_log p
        WHERE p.user_id = c.user_id AND p.type = 'teacher_inactive'
          AND p.payload->>'courseId' = c.id::text
          AND p.created_at > NOW() - make_interval(days => ${INACTIVE_EVERY_DAYS}) + INTERVAL '2 hours'
      )
  `;
  let created = 0;
  for (const r of rows) {
    const names = r.names || [];
    if (names.length === 0) continue;
    const res = await notifyTeacher(
      sql,
      r.teacher_id,
      'teacher_inactive',
      { courseId: r.course_id, course: r.course, count: names.length, names: names.slice(0, 5) },
      { dedupe: `inactive:${r.course_id}:${r.local_day}`, timezone: r.tz }
    );
    if (res.status !== 'duplicate' && res.status !== 'no_specifics') created++;
  }
  return { inactiveNotes: created };
}

export async function sendHomeworkEvents(sql) {
  const rows = await sql`
    SELECT h.id, h.title, h.course_id, c.title AS course, c.user_id AS teacher_id,
      COALESCE(c.timezone, ts.timezone, ${DEFAULT_TZ}) AS tz,
      h.due_at <= NOW() AS due_passed,
      CASE WHEN h.assign_all
        THEN (SELECT COUNT(*)::int FROM course_members cm
              WHERE cm.course_id = h.course_id AND cm.role = 'student')
        ELSE (SELECT COUNT(*)::int FROM homework_assignees ha
              JOIN course_members cm ON cm.user_id = ha.user_id
                AND cm.course_id = h.course_id AND cm.role = 'student'
              WHERE ha.homework_id = h.id)
      END AS assigned,
      (SELECT COUNT(*)::int FROM homework_results r WHERE r.homework_id = h.id) AS submitted
    FROM homework h
    JOIN courses c ON c.id = h.course_id
    LEFT JOIN user_stats ts ON ts.user_id = c.user_id
    WHERE h.canceled_at IS NULL AND h.due_at > NOW() - INTERVAL '1 day'
  `;
  let created = 0;
  for (const h of rows) {
    const event = homeworkEvent(h);
    if (!event) continue;
    const res = await notifyTeacher(
      sql,
      h.teacher_id,
      event === 'done' ? 'teacher_homework_done' : 'teacher_homework_due',
      {
        courseId: h.course_id,
        course: h.course,
        homeworkId: h.id,
        title: h.title,
        submitted: Math.min(h.submitted, h.assigned),
        total: h.assigned,
      },
      // «Срок прошёл» после «Все сдали» не нужен — у обоих один ключ на задание
      { dedupe: `hw:${h.id}:${event}`, timezone: h.tz }
    );
    if (res.status !== 'duplicate' && res.status !== 'no_specifics') created++;
  }
  return { homeworkNotes: created };
}

/** Записи только для колокольчика: лучшая серия ученика и «юнит открыт 2 дня» */
export async function writeBellNotes(sql) {
  let created = 0;
  const streaks = await sql`
    SELECT DISTINCT ON (c.id) c.id AS course_id, c.user_id AS teacher_id, c.title AS course,
      cm.user_id AS student_id, COALESCE(u.display_name, u.user_name, 'Ученик') AS student,
      us.current_streak AS streak
    FROM courses c
    JOIN course_members cm ON cm.course_id = c.id AND cm.role = 'student'
    JOIN user_stats us ON us.user_id = cm.user_id
    JOIN users u ON u.id = cm.user_id
    LEFT JOIN user_stats ts ON ts.user_id = c.user_id
    WHERE us.current_streak >= ${PRAISE_MIN_STREAK}
      AND us.last_active_date >= (NOW() - INTERVAL '1 day')::date
      AND EXTRACT(HOUR FROM NOW() AT TIME ZONE COALESCE(c.timezone, ts.timezone, ${DEFAULT_TZ}))::int = ${WEEK_SUMMARY_HOUR}
    ORDER BY c.id, us.current_streak DESC
  `;
  for (const r of streaks) {
    const res = await notifyTeacher(
      sql,
      r.teacher_id,
      'teacher_streak_praise',
      {
        courseId: r.course_id,
        course: r.course,
        studentId: r.student_id,
        student: r.student,
        streak: r.streak,
      },
      { dedupe: `streak:${r.student_id}:${praiseStep(r.streak)}` }
    );
    if (res.status === 'bell_only') created++;
  }

  const units = await sql`
    SELECT cu.course_id, cu.unit_id, c.user_id AS teacher_id, c.title AS course, ocs.title AS unit,
      (SELECT COUNT(*)::int FROM course_members cm
        WHERE cm.course_id = cu.course_id AND cm.role = 'student') AS total,
      (SELECT COUNT(DISTINCT cp.user_id)::int FROM card_progress cp
        JOIN cards ca ON ca.id = cp.card_id AND ca.set_id = ocs.id
        JOIN course_members cm ON cm.user_id = cp.user_id
          AND cm.course_id = cu.course_id AND cm.role = 'student') AS started
    FROM course_units cu
    JOIN courses c ON c.id = cu.course_id
    JOIN card_sets ocs ON ocs.unit_id = cu.unit_id AND ocs.is_official = true
    WHERE cu.is_open = true
      AND cu.opened_at <= NOW() - INTERVAL '2 days' AND cu.opened_at > NOW() - INTERVAL '3 days'
      AND NOT EXISTS (
        SELECT 1 FROM homework h
        WHERE h.course_id = cu.course_id AND h.canceled_at IS NULL AND h.due_at > NOW()
      )
  `;
  for (const r of units) {
    if (!(r.total > 0)) continue;
    const res = await notifyTeacher(
      sql,
      r.teacher_id,
      'teacher_unit_open',
      {
        courseId: r.course_id,
        course: r.course,
        unit: r.unit,
        started: Math.min(r.started, r.total),
        total: r.total,
      },
      { dedupe: `unit:${r.course_id}:${r.unit_id}` }
    );
    if (res.status === 'bell_only') created++;
  }
  return { bellNotes: created };
}

/** Все уведомления учителям за один проход cron. Ошибка одного вида не мешает остальным. */
export async function runTeacherPushes(sql) {
  const out = {};
  for (const step of [
    sendLessonSoon,
    sendWeekSummary,
    sendHomeworkEvents,
    sendInactiveStudents,
    writeBellNotes,
  ]) {
    try {
      Object.assign(out, await step(sql));
    } catch (e) {
      log.error('teacher-push', `${step.name} failed`, e);
    }
  }
  return out;
}
