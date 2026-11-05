import { neon } from '@neondatabase/serverless';
import { getAuthedUser } from './_auth.js';
import { ensureDatabaseInitialized } from './_db-init.js';
import { HttpError } from './_access.js';
import { notifyCoursesChanged } from './_realtime.js';
import { getPublicNews } from './_whatsNew.js';
import { log } from './_log.js';
import {
  loadSets,
  loadCardsBySet,
  loadAllCards,
  updateCard,
  createSet,
  createCard,
  createCardsBatch,
  deleteSet,
  deleteCard,
  updateSetMeta,
  updateSetCourse,
} from './_handlers/data/sets.js';
import {
  upsertDailyActivity,
  updateUserStatsStreak,
  buyStreakFreeze,
  logStreakEvent,
  getWeekActivity,
  getUserStats,
  getDailyActivity,
} from './_handlers/data/streak.js';
import {
  ensureUserExists,
  getProfile,
  updateDisplayName,
  updateUserName,
  updateLanguagePreferences,
  getAboutMe,
  saveAboutMe,
  saveOnboardingData,
  bootstrap,
} from './_handlers/data/profile.js';
import { loadCourses, createCourse, loadStudentCourses } from './_handlers/data/courses.js';
import {
  submitFeedback,
  myFeedback,
  feedbackThread,
  replyFeedback,
  feedbackUnreadCount,
} from './_handlers/data/feedback.js';
import {
  adminDashboard,
  adminMarkFeedbackRead,
  adminFeedbackThread,
  adminReplyFeedback,
  adminCloseFeedback,
} from './_handlers/data/admin.js';
import { deleteAccount } from './_handlers/data/account.js';

/**
 * API данных пользователя: профиль, наборы, карточки, курсы, прогресс, серия.
 *
 * Раньше всё это делал клиент (src/services/NeonService.ts) напрямую в Neon со строкой
 * подключения, встроенной в сборку приложения, — любой, кто распакует приложение, мог читать и
 * менять любые данные. Теперь клиент ходит только сюда: userId берётся из Supabase JWT
 * (Authorization: Bearer), права на набор/карточку/курс проверяются на сервере.
 * См. plan/course_rating_and_review_plan.md, этап 0.
 *
 * GET|POST /api/data?action=<имя>  — параметры в query (GET) или JSON-теле (POST).
 * GET /api/data?action=news — исключение: без входа (новости «Что нового», api/_whatsNew.js).
 * Ответ: { data } или { error }. Имена действий совпадают с методами NeonService.
 *
 * Прогресс по карточкам (уровень, дата повторения) здесь не пишется — только api/progress.js,
 * который сам считает уровень по ответу ученика.
 */

const ACTIONS = {
  ensureUserExists,
  getProfile,
  updateDisplayName,
  updateUserName,
  updateLanguagePreferences,
  saveOnboardingData,
  getAboutMe,
  saveAboutMe,
  loadSets,
  loadCardsBySet,
  loadAllCards,
  updateCard,
  createSet,
  createCard,
  createCardsBatch,
  deleteSet,
  deleteCard,
  updateSetMeta,
  updateSetCourse,
  loadCourses,
  createCourse,
  loadStudentCourses,
  upsertDailyActivity,
  updateUserStatsStreak,
  buyStreakFreeze,
  logStreakEvent,
  getWeekActivity,
  getUserStats,
  bootstrap,
  getDailyActivity,
  deleteAccount,
  submitFeedback,
  myFeedback,
  feedbackThread,
  replyFeedback,
  feedbackUnreadCount,
  adminDashboard,
  adminMarkFeedbackRead,
  adminFeedbackThread,
  adminReplyFeedback,
  adminCloseFeedback,
};

// ─── Сигнал ученикам об изменениях в курсе ─────────────────────────────────

/**
 * Курсы, которых касается действие (для сигнала ученикам через Realtime). Считается ДО действия:
 * у удаляемого набора/карточки курс потом уже не узнать, а при переносе набора нужен и старый курс.
 */
async function coursesTouchedBy(sql, action, p) {
  try {
    const setCourse = async (setId) => {
      if (!setId) return [];
      const rows = await sql`SELECT course_id FROM card_sets WHERE id = ${setId}::uuid`;
      return rows.map((r) => r.course_id);
    };
    const cardCourse = async (cardId) => {
      if (!cardId) return [];
      const rows = await sql`
        SELECT s.course_id FROM cards c JOIN card_sets s ON s.id = c.set_id WHERE c.id = ${cardId}::uuid
      `;
      return rows.map((r) => r.course_id);
    };
    switch (action) {
      case 'createSet':
        return [p.courseId];
      case 'updateSetMeta':
      case 'deleteSet':
        return setCourse(p.setId);
      case 'updateSetCourse':
        return [...(await setCourse(p.setId)), p.courseId];
      case 'updateCard':
      case 'deleteCard':
        return cardCourse(p.cardId);
      case 'createCard':
        return setCourse(p.card?.setId);
      case 'createCardsBatch': {
        const setIds = [...new Set((p.cards || []).map((c) => c?.setId).filter(Boolean))];
        if (setIds.length === 0) return [];
        const rows =
          await sql`SELECT DISTINCT course_id FROM card_sets WHERE id = ANY(${setIds}::uuid[])`;
        return rows.map((r) => r.course_id);
      }
      default:
        return [];
    }
  } catch {
    // Кривой id и т.п. — действие само вернёт 400, сигнал не нужен
    return [];
  }
}

export default async function handler(req, res) {
  const { action } = req.query;

  // «Что нового» (plan/new/whats_new.md, News 5) — одинаково для всех, без входа и с кэшем на CDN.
  // Отдельной функции Vercel не заводим: их уже 11 из 12.
  if (action === 'news') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    try {
      const sql = neon(process.env.POSTGRES_URL);
      await ensureDatabaseInitialized(sql);
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
      return res.status(200).json({ data: await getPublicNews(sql) });
    } catch (error) {
      log.error('data', 'news failed', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
  if (!Object.hasOwn(ACTIONS, action || ''))
    return res.status(400).json({ error: 'Unknown action' });
  if (req.method !== 'GET' && req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const sql = neon(process.env.POSTGRES_URL);
  await ensureDatabaseInitialized(sql);

  const params = req.method === 'GET' ? { ...req.query } : { ...(req.body || {}) };
  try {
    const touchedCourses = await coursesTouchedBy(sql, action, params);
    const data = await ACTIONS[action](sql, user.id, params, user);
    // Ждём сигнал до ответа: после ответа Vercel может заморозить функцию (не дольше 2 с)
    if (touchedCourses.length > 0) await notifyCoursesChanged(touchedCourses);
    return res.status(200).json({ data });
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    log.error('data', `${action} failed`, error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Для проверки без HTTP (скрипты/тесты): вызвать действие напрямую
export const __actions = ACTIONS;
