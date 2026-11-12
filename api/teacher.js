import { neon } from '@neondatabase/serverless';
import { getAuthedUserId } from './_auth.js';
import { log } from './_log.js';
import {
  deleteCourse,
  renameCourse,
  getSchedule,
  setSchedule,
} from './_handlers/teacher/courses.js';
import {
  createInvite,
  regenerateInvite,
  inviteInfoByCode,
  inviteInfoByToken,
  joinByCode,
  joinByToken,
  leaveCourse,
  removeStudent,
} from './_handlers/teacher/invites.js';
import {
  listMembers,
  studentStats,
  checkOwner,
  toggleSetHidden,
  remindReview,
} from './_handlers/teacher/roster.js';
import {
  courseActivityChart,
  courseSetStats,
  setHardCards,
  courseSetsByMembership,
} from './_handlers/teacher/stats.js';
import {
  homeworkCreate,
  homeworkList,
  homeworkStatus,
  homeworkCancel,
  homeworkRemind,
  homeworkExport,
} from './_handlers/teacher/homework.js';

/**
 * API для учительских мутаций (курсы, приглашения, ростер, видимость наборов)
 *
 * В отличие от остального приложения (которое подключается к Neon напрямую с клиента),
 * этот эндпоинт — единственный путь для перечисленных ниже операций. Он проверяет
 * подлинность вызывающего по Supabase JWT (Authorization: Bearer <access_token>) и сам
 * определяет userId из токена — тело/query запроса на userId/teacherId не полагается.
 *
 * POST /api/teacher?action=delete-course        { courseId, withSets? } — withSets: удалить и наборы
 *                                               курса (MySets 3); без флага они уходят в «Мои наборы»
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
 * POST /api/teacher?action=remind-review       { courseId, studentId? } — пуш «повтори слова»
 *                                               (всему классу — не чаще раза в сутки)
 * Задания (plan/new/teacher_cabinet.md, этап 2):
 * POST /api/teacher?action=homework-create  { courseId, title, cardIds, dueAt, minScore?, userIds? }
 * GET  /api/teacher?action=homework-list    ?courseId=
 * GET  /api/teacher?action=homework-status  ?homeworkId=
 * POST /api/teacher?action=homework-cancel  { homeworkId }
 * POST /api/teacher?action=homework-remind  { homeworkId, userIds } — каждому не чаще раза в 20 ч
 * GET  /api/teacher?action=homework-export  ?homeworkId= → { filename, base64 } (xlsx)
 */

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
    if (action === 'delete-course') return await deleteCourse(req, res, sql, userId);
    if (action === 'rename-course') return await renameCourse(req, res, sql, userId);
    if (action === 'get-schedule') return await getSchedule(req, res, sql, userId);
    if (action === 'set-schedule') return await setSchedule(req, res, sql, userId);
    if (action === 'create-invite') return await createInvite(req, res, sql, userId);
    if (action === 'regenerate-invite') return await regenerateInvite(req, res, sql, userId);
    if (action === 'invite-info-by-code') return await inviteInfoByCode(req, res, sql, userId);
    if (action === 'invite-info-by-token') return await inviteInfoByToken(req, res, sql);
    if (action === 'join-by-code') return await joinByCode(req, res, sql, userId);
    if (action === 'join-by-token') return await joinByToken(req, res, sql, userId);
    if (action === 'leave-course') return await leaveCourse(req, res, sql, userId);
    if (action === 'remove-student') return await removeStudent(req, res, sql, userId);
    if (action === 'list-members') return await listMembers(req, res, sql, userId);
    if (action === 'student-stats') return await studentStats(req, res, sql, userId);
    if (action === 'toggle-set-hidden') return await toggleSetHidden(req, res, sql, userId);
    if (action === 'check-owner') return await checkOwner(req, res, sql, userId);
    if (action === 'remind-review') return await remindReview(req, res, sql, userId);
    if (action === 'course-activity-chart') return await courseActivityChart(req, res, sql, userId);
    if (action === 'course-set-stats') return await courseSetStats(req, res, sql, userId);
    if (action === 'set-hard-cards') return await setHardCards(req, res, sql, userId);
    if (action === 'course-sets-by-membership') {
      return await courseSetsByMembership(req, res, sql, userId);
    }
    if (action === 'homework-create') return await homeworkCreate(req, res, sql, userId);
    if (action === 'homework-list') return await homeworkList(req, res, sql, userId);
    if (action === 'homework-status') return await homeworkStatus(req, res, sql, userId);
    if (action === 'homework-cancel') return await homeworkCancel(req, res, sql, userId);
    if (action === 'homework-remind') return await homeworkRemind(req, res, sql, userId);
    if (action === 'homework-export') return await homeworkExport(req, res, sql, userId);

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    log.error('teacher', 'Teacher API error', error);
    return res.status(500).json({ error: error.message });
  }
}
