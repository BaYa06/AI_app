import { neon } from '@neondatabase/serverless';
import { getAuthedUserId } from '../_auth.js';

/**
 * Дневной лимит ИИ-распознаваний на пользователя (plan/done/ai_import.md, AI 3).
 * Бесплатная квота Gemini общая на всех — лимит не даёт одному пользователю выесть её целиком.
 *
 * Счётчик — в api_rate_limits (общая с api/test.js и api/teacher.js, чистится при удалении
 * аккаунта): action = 'ai-recognize', окно — сутки по UTC.
 * Считаются только распознавания (import-files); перевод, примеры и дистракторы — нет.
 *
 * GET /api/ai?fn=usage → { used, limit, resetAt }
 */

export const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT) || 20;
const ACTION = 'ai-recognize';

let tableReady = null;

function getSql() {
  return neon(process.env.POSTGRES_URL);
}

async function ensureTable(sql) {
  if (!tableReady) {
    tableReady = sql`
      CREATE TABLE IF NOT EXISTS api_rate_limits (
        user_id UUID NOT NULL,
        action VARCHAR(50) NOT NULL,
        window_start TIMESTAMPTZ NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, action, window_start)
      )
    `.catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  return tableReady;
}

function dayWindow() {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return {
    windowStart: new Date(start).toISOString(),
    resetAt: new Date(start + 24 * 60 * 60 * 1000).toISOString(),
  };
}

async function readUsed(sql, userId, windowStart) {
  const rows = await sql`
    SELECT attempts FROM api_rate_limits
    WHERE user_id = ${userId}::uuid AND action = ${ACTION} AND window_start = ${windowStart}::timestamptz
  `;
  return rows[0]?.attempts ?? 0;
}

/**
 * Списывает одно распознавание. Атомарно: при исчерпанном лимите строка не обновляется.
 * → { ok: true, usage, refund() } | { ok: false, usage }
 * refund() возвращает распознавание, если ИИ не ответил или не нашёл ни одной карточки.
 */
export async function consumeRecognition(userId) {
  const sql = getSql();
  await ensureTable(sql);
  const { windowStart, resetAt } = dayWindow();

  const rows = await sql`
    INSERT INTO api_rate_limits (user_id, action, window_start, attempts)
    VALUES (${userId}::uuid, ${ACTION}, ${windowStart}::timestamptz, 1)
    ON CONFLICT (user_id, action, window_start) DO UPDATE SET
      attempts = api_rate_limits.attempts + 1
      WHERE api_rate_limits.attempts < ${DAILY_LIMIT}
    RETURNING attempts
  `;

  if (rows.length === 0) {
    return { ok: false, usage: { used: DAILY_LIMIT, limit: DAILY_LIMIT, resetAt } };
  }

  const used = rows[0].attempts;
  let refunded = false;
  const result = { ok: true, usage: { used, limit: DAILY_LIMIT, resetAt } };
  result.refund = async () => {
    if (refunded) return;
    refunded = true;
    try {
      await sql`
        UPDATE api_rate_limits SET attempts = GREATEST(attempts - 1, 0)
        WHERE user_id = ${userId}::uuid AND action = ${ACTION} AND window_start = ${windowStart}::timestamptz
      `;
      result.usage.used = Math.max(used - 1, 0);
    } catch (error) {
      console.error('[usage] refund failed:', error?.message || error);
    }
  };
  return result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const userId = await getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });

  try {
    const sql = getSql();
    await ensureTable(sql);
    const { windowStart, resetAt } = dayWindow();
    const used = await readUsed(sql, userId, windowStart);
    return res.status(200).json({ used, limit: DAILY_LIMIT, resetAt });
  } catch (error) {
    console.error('[usage] error:', error?.message || error);
    return res.status(500).json({ error: 'Failed to read usage' });
  }
}
