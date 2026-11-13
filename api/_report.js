/**
 * Отчёт учителя: родителям (один ученик) и группе (plan/new/teacher_cabinet.md, этап 4,
 * Teacher 53). Данные собираются один раз — при создании ссылки или для превью; ссылка `/r/<код>`
 * показывает сохранённый снимок, а не живые цифры. В отчёте только то, что на экране 14: имя,
 * группа, учитель, период, цифры, комментарий — без почты и идентификаторов.
 * Файл начинается с «_», поэтому Vercel не публикует его как отдельный роут.
 */
import { randomBytes } from 'node:crypto';
import { courseSetIdsSql } from './_course.js';

export const REPORT_KINDS = ['parent', 'group'];
export const REPORT_PERIODS = ['all', 'month', 'week'];
/** Ссылка живёт столько дней (решение 4 этапа 4) */
export const REPORT_TTL_DAYS = 30;
export const REPORT_COMMENT_MAX = 600;
/** Сколько недель показываем столбиками */
export const REPORT_MAX_WEEKS = 6;
const DEFAULT_TZ = 'Asia/Bishkek';
const DAY_MS = 86_400_000;

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
/** 10 символов base62 — как у ссылок «Поделиться набором» */
export function generateReportCode() {
  let code = '';
  for (const b of randomBytes(10)) code += BASE62[b % 62];
  return code;
}

const MONTHS_SHORT = [
  'янв',
  'фев',
  'мар',
  'апр',
  'мая',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

/** 'YYYY-MM-DD' → { d, m } без поясов */
const parts = (key) => {
  const [, m, d] = String(key).slice(0, 10).split('-').map(Number);
  return { d, m: (m || 1) - 1 };
};
const addDays = (key, n) =>
  new Date(Date.parse(`${String(key).slice(0, 10)}T00:00:00Z`) + n * DAY_MS)
    .toISOString()
    .slice(0, 10);

/** «22 окт – 12 ноя» / «5–11 ноя» */
export function rangeLabel(fromKey, toKey) {
  const a = parts(fromKey);
  const b = parts(toKey);
  return a.m === b.m
    ? `${a.d}–${b.d} ${MONTHS_SHORT[b.m]}`
    : `${a.d} ${MONTHS_SHORT[a.m]} – ${b.d} ${MONTHS_SHORT[b.m]}`;
}

/**
 * Период отчёта: 'week' — 7 дней, 'month' — 30, 'all' — с начала (вступление ученика или создание
 * курса). → { from: Date, to: Date }
 */
export function reportRange(period, startedAt, now = new Date()) {
  const to = now;
  if (period === 'week') return { from: new Date(to.getTime() - 7 * DAY_MS), to };
  if (period === 'month') return { from: new Date(to.getTime() - 30 * DAY_MS), to };
  const start = startedAt ? new Date(startedAt) : null;
  return {
    from:
      start && Number.isFinite(start.getTime()) && start < to
        ? start
        : new Date(to.getTime() - 30 * DAY_MS),
    to,
  };
}

/** Столбики по неделям: последние REPORT_MAX_WEEKS недель с ответами, подпись «5–11 ноя» */
export function weekBars(rows) {
  const list = [...(rows || [])]
    .filter((r) => r.week)
    .sort((a, b) => String(a.week).localeCompare(String(b.week)))
    .slice(-REPORT_MAX_WEEKS);
  const max = Math.max(1, ...list.map((r) => Number(r.answers) || 0));
  return list.map((r) => {
    const answers = Number(r.answers) || 0;
    return {
      label: rangeLabel(r.week, addDays(r.week, 6)),
      answers,
      /** Высота столбика 0..100 */
      share: Math.round((answers / max) * 100),
    };
  });
}

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null);

/** Чистая сборка отчёта из строк запросов — проверяется тестами */
export function composeReport({
  kind,
  period,
  range,
  tz,
  head,
  totals,
  weeks,
  units,
  best,
  inactive,
  comment,
}) {
  const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: tz || DEFAULT_TZ }).format(d);
  const answers = Number(totals?.answers) || 0;
  const base = {
    kind,
    period,
    periodLabel: rangeLabel(dayKey(range.from), dayKey(range.to)),
    course: head.course,
    teacher: head.teacher || null,
    answers,
    correctPct: pct(Number(totals?.correct) || 0, answers),
    weeks: weekBars(weeks),
    comment: String(comment || '')
      .trim()
      .slice(0, REPORT_COMMENT_MAX),
  };
  if (kind === 'parent') {
    return {
      ...base,
      student: head.student,
      activeDays: Number(totals?.active_days) || 0,
      streak: Number(head.streak) || 0,
      units: (units || [])
        .filter((u) => Number(u.seen) > 0 && Number(u.total) > 0)
        .map((u) => ({
          title: u.title,
          seen: Math.min(Number(u.seen), Number(u.total)),
          total: Number(u.total),
          correctPct: pct(Number(u.correct) || 0, Number(u.answers) || 0),
        })),
    };
  }
  return {
    ...base,
    students: Number(head.students) || 0,
    activeStudents: Number(totals?.active_users) || 0,
    best: (best || []).map((b) => ({
      name: b.name,
      answers: Number(b.answers) || 0,
      correctPct: pct(Number(b.correct) || 0, Number(b.answers) || 0),
    })),
    inactive: (inactive || []).map((i) => i.name),
  };
}

/**
 * Собрать отчёт. → отчёт или null, если курса/ученика нет (права проверяет вызывающий).
 * studentId обязателен для kind = 'parent'.
 */
export async function buildReport(
  sql,
  { courseId, studentId, kind, period, comment, now = new Date() }
) {
  const [head] = await sql`
    SELECT c.title AS course, c.created_at AS course_created,
      COALESCE(tu.display_name, tu.user_name) AS teacher,
      COALESCE(c.timezone, ts.timezone, ${DEFAULT_TZ}) AS tz,
      (SELECT COUNT(*)::int FROM course_members cm
        WHERE cm.course_id = c.id AND cm.role = 'student') AS students
    FROM courses c
    JOIN users tu ON tu.id = c.user_id
    LEFT JOIN user_stats ts ON ts.user_id = c.user_id
    WHERE c.id = ${courseId}::uuid
  `;
  if (!head) return null;
  const tz = head.tz || DEFAULT_TZ;

  let startedAt = head.course_created;
  if (kind === 'parent') {
    const [student] = await sql`
      SELECT COALESCE(u.display_name, u.user_name, 'Ученик') AS name, cm.joined_at,
        COALESCE(us.current_streak, 0) AS streak
      FROM course_members cm
      JOIN users u ON u.id = cm.user_id
      LEFT JOIN user_stats us ON us.user_id = cm.user_id
      WHERE cm.course_id = ${courseId}::uuid AND cm.user_id = ${studentId}::uuid
        AND cm.role = 'student'
    `;
    if (!student) return null;
    head.student = student.name;
    head.streak = student.streak;
    startedAt = student.joined_at;
  }
  const range = reportRange(period, startedAt, now);
  const from = range.from.toISOString();
  const to = range.to.toISOString();
  // Чьи ответы считаем: один ученик или все ученики курса
  // Каждый запрос получает свой фрагмент (один и тот же объект в несколько запросов не вкладываем)
  const who = () =>
    kind === 'parent'
      ? sql`SELECT ${studentId}::uuid AS user_id`
      : sql`SELECT user_id FROM course_members WHERE course_id = ${courseId}::uuid AND role = 'student'`;

  const [totals, weeks, units, best, inactive] = await Promise.all([
    sql`
      SELECT COUNT(*)::int AS answers, (COUNT(*) FILTER (WHERE a.correct))::int AS correct,
        COUNT(DISTINCT (a.answered_at AT TIME ZONE ${tz})::date)::int AS active_days,
        COUNT(DISTINCT a.user_id)::int AS active_users
      FROM answers a
      JOIN cards c ON c.id = a.card_id
      WHERE a.user_id IN (${who()}) AND a.rejected_reason IS NULL
        AND a.answered_at >= ${from}::timestamptz AND a.answered_at < ${to}::timestamptz
        AND c.set_id IN (${courseSetIdsSql(sql, courseId)})
    `,
    sql`
      SELECT date_trunc('week', a.answered_at AT TIME ZONE ${tz})::date::text AS week,
        COUNT(*)::int AS answers
      FROM answers a
      JOIN cards c ON c.id = a.card_id
      WHERE a.user_id IN (${who()}) AND a.rejected_reason IS NULL
        AND a.answered_at >= ${from}::timestamptz AND a.answered_at < ${to}::timestamptz
        AND c.set_id IN (${courseSetIdsSql(sql, courseId)})
      GROUP BY 1
    `,
    kind === 'parent'
      ? sql`
          SELECT cs.title,
            (SELECT COUNT(*)::int FROM cards WHERE set_id = cs.id) AS total,
            (SELECT COUNT(DISTINCT cp.card_id)::int FROM card_progress cp
              JOIN cards c ON c.id = cp.card_id
              WHERE cp.user_id = ${studentId}::uuid AND c.set_id = cs.id) AS seen,
            acc.answers, acc.correct
          FROM card_sets cs
          LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS answers, (COUNT(*) FILTER (WHERE a.correct))::int AS correct
            FROM answers a JOIN cards c ON c.id = a.card_id
            WHERE a.user_id = ${studentId}::uuid AND c.set_id = cs.id AND a.rejected_reason IS NULL
              AND a.answered_at >= ${from}::timestamptz AND a.answered_at < ${to}::timestamptz
          ) acc ON true
          WHERE cs.id IN (${courseSetIdsSql(sql, courseId)})
          ORDER BY cs.created_at
        `
      : [],
    kind === 'group'
      ? sql`
          SELECT COALESCE(u.display_name, u.user_name, 'Ученик') AS name,
            COUNT(*)::int AS answers, (COUNT(*) FILTER (WHERE a.correct))::int AS correct
          FROM answers a
          JOIN cards c ON c.id = a.card_id
          JOIN users u ON u.id = a.user_id
          WHERE a.user_id IN (${who()}) AND a.rejected_reason IS NULL
            AND a.answered_at >= ${from}::timestamptz AND a.answered_at < ${to}::timestamptz
            AND c.set_id IN (${courseSetIdsSql(sql, courseId)})
          GROUP BY u.id, 1
          ORDER BY COUNT(*) DESC
          LIMIT 3
        `
      : [],
    kind === 'group'
      ? sql`
          SELECT COALESCE(u.display_name, u.user_name, 'Ученик') AS name
          FROM course_members cm
          JOIN users u ON u.id = cm.user_id
          LEFT JOIN user_stats su ON su.user_id = cm.user_id
          WHERE cm.course_id = ${courseId}::uuid AND cm.role = 'student'
            AND cm.joined_at < NOW() - INTERVAL '7 days'
            AND (su.last_active_date IS NULL OR su.last_active_date < (NOW() - INTERVAL '7 days')::date)
          ORDER BY 1
          LIMIT 30
        `
      : [],
  ]);

  return composeReport({
    kind,
    period,
    range,
    tz,
    head,
    totals: totals[0],
    weeks,
    units,
    best,
    inactive,
    comment,
  });
}
