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

/** Все уведомления учителям за один проход cron. Ошибка одного вида не мешает остальным. */
export async function runTeacherPushes(sql) {
  const out = {};
  for (const step of [sendLessonSoon]) {
    try {
      Object.assign(out, await step(sql));
    } catch (e) {
      log.error('teacher-push', `${step.name} failed`, e);
    }
  }
  return out;
}
