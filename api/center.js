import { neon } from '@neondatabase/serverless';
import { getAuthedUser } from './_auth.js';
import { log } from './_log.js';

/**
 * API веб-кабинета учебного центра flashlycards.app/center (plan/new/center_books.md, Center 9–11).
 *
 * Вход — логин и пароль центра (Supabase, почта <логин>@center.flashlycards.app), страница шлёт
 * Supabase JWT. Права даёт только строка organization_members с ролью owner | admin: каждый запрос
 * ограничен своим центром, id центра из запроса не берём. Имён учеников кабинет не получает —
 * только числа.
 *
 * GET  /api/center?action=me                          центр, роль, договор
 * GET  /api/center?action=overview&days=7|30|0        места, ученики, активность, по книгам
 * GET  /api/center?action=codes                       коды подключения
 * POST /api/center?action=code-create                 { label, tag, validUntil, accessDays, maxActivations }
 * POST /api/center?action=code-off                    { id }
 * GET  /api/center?action=books                       книги центра
 * GET  /api/center?action=book-units&bookId=          юниты и слова книги
 * POST /api/center?action=profile                     { greeting, contact, logo }
 *
 * Договор кончился — только чтение (новые коды и профиль — 403 contract_ended).
 */

const GET_ACTIONS = new Set(['me', 'overview', 'codes', 'books', 'book-units']);
const POST_ACTIONS = new Set(['code-create', 'code-off', 'profile']);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;
  if (
    GET_ACTIONS.has(action)
      ? req.method !== 'GET'
      : POST_ACTIONS.has(action)
        ? req.method !== 'POST'
        : true
  ) {
    return res.status(GET_ACTIONS.has(action) || POST_ACTIONS.has(action) ? 405 : 404).json({
      error: 'Not found',
    });
  }

  const user = await getAuthedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized', reason: 'unauthorized' });

  const sql = neon(process.env.POSTGRES_URL);
  try {
    const cabinet = await import('./_handlers/center/cabinet.js');
    return await cabinet.handle(action, req, res, sql, user);
  } catch (e) {
    log.error('center', `action ${action} failed`, e);
    return res.status(500).json({ error: 'Server error' });
  }
}
