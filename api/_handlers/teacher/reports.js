/**
 * api/teacher.js — отчёты учителя (plan/new/teacher_cabinet.md, Teacher 53–54): превью, ссылка
 * `/r/<код>` на сохранённый снимок, отзыв ссылки, PDF.
 */
import {
  REPORT_COMMENT_MAX,
  REPORT_KINDS,
  REPORT_PERIODS,
  REPORT_TTL_DAYS,
  buildReport,
  generateReportCode,
} from '../../_report.js';
import { buildReportPdf, reportFilename } from '../../_reportPdf.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const CODE_RE = /^[0-9A-Za-z]{10}$/;

/** Параметры отчёта из запроса → { courseId, kind, studentId, period, comment } или { error } */
export function parseReportInput(input) {
  const { courseId, kind, studentId = null, period = 'all', comment = '' } = input || {};
  if (!isUuid(courseId)) return { error: 'courseId' };
  if (!REPORT_KINDS.includes(kind)) return { error: 'kind' };
  if (!REPORT_PERIODS.includes(period)) return { error: 'period' };
  if (kind === 'parent' && !isUuid(studentId)) return { error: 'studentId' };
  if (typeof comment !== 'string' || comment.length > REPORT_COMMENT_MAX)
    return { error: 'comment' };
  return {
    courseId,
    kind,
    studentId: kind === 'parent' ? studentId : null,
    period,
    comment: comment.trim(),
  };
}

/** Отчёт курса учителя: 400 — кривые данные, 403 — чужой курс, 404 — ученика нет в курсе */
export async function ownedReport(res, sql, userId, input) {
  const params = parseReportInput(input);
  if (params.error) {
    res.status(400).json({ error: `invalid ${params.error}`, reason: params.error });
    return null;
  }
  const course = await sql`
    SELECT id FROM courses WHERE id = ${params.courseId}::uuid AND user_id = ${userId}::uuid
  `;
  if (course.length === 0) {
    res.status(403).json({ error: 'Not the owner' });
    return null;
  }
  const report = await buildReport(sql, params);
  if (!report) {
    res.status(404).json({ error: 'Student not in this course' });
    return null;
  }
  return { params, report };
}

function originOf(req) {
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '')
    .split(',')[0]
    .trim();
  if (!host) return 'https://flashlycards.app';
  return `${host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'}://${host}`;
}

/** GET ?courseId=&kind=&studentId=&period= → { report } — превью на экране 14 */
export async function reportData(req, res, sql, userId) {
  const owned = await ownedReport(res, sql, userId, req.query);
  if (!owned) return;
  return res.status(200).json({ ok: true, report: owned.report });
}

/** POST { courseId, kind, studentId?, period, comment } → { code, url, expiresAt } */
export async function reportCreate(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const owned = await ownedReport(res, sql, userId, req.body);
  if (!owned) return;
  const { params, report } = owned;
  const code = generateReportCode();
  const rows = await sql`
    INSERT INTO teacher_reports (code, course_id, student_id, kind, period, comment, data, created_by, expires_at)
    VALUES (${code}, ${params.courseId}::uuid, ${params.studentId}, ${params.kind}, ${params.period},
      ${params.comment}, ${JSON.stringify(report)}::jsonb, ${userId}::uuid,
      NOW() + make_interval(days => ${REPORT_TTL_DAYS}))
    RETURNING expires_at
  `;
  return res.status(201).json({
    ok: true,
    code,
    url: `${originOf(req)}/r/${code}`,
    expiresAt: rows[0]?.expires_at || null,
  });
}

/** POST { code } — учитель закрывает ссылку на свой отчёт */
export async function reportRevoke(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { code } = req.body || {};
  if (typeof code !== 'string' || !CODE_RE.test(code)) {
    return res.status(400).json({ error: 'invalid code' });
  }
  const rows = await sql`
    UPDATE teacher_reports SET revoked_at = COALESCE(revoked_at, NOW())
    WHERE code = ${code} AND created_by = ${userId}::uuid
    RETURNING code
  `;
  if (rows.length === 0) return res.status(404).json({ error: 'Report not found' });
  return res.status(200).json({ ok: true });
}

/**
 * POST { courseId, kind, studentId?, period, comment } → { filename, base64 } — PDF отчёта.
 * Файл отдаётся так же, как «Оценки в Excel» (Teacher 22): клиент открывает системное «Поделиться».
 */
export async function reportPdf(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const owned = await ownedReport(res, sql, userId, req.body);
  if (!owned) return;
  const buffer = await buildReportPdf(owned.report);
  return res.status(200).json({
    ok: true,
    filename: reportFilename(owned.report),
    base64: buffer.toString('base64'),
  });
}
