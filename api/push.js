/**
 * Consolidated Push Notifications API
 *
 * POST /api/push?action=subscribe   – store FCM token
 * POST /api/push?action=unsubscribe – remove FCM token
 * GET  /api/push?action=get-by-user&userId=xxx – get tokens by userId
 *
 * Legacy URLs /api/push/subscribe and /api/push/unsubscribe are rewritten
 * to this handler via vercel.json rewrites.
 */

import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  const { action } = req.query;
  const sql = neon(process.env.POSTGRES_URL);

  try {
    if (action === 'subscribe' && req.method === 'POST') {
      const { token, platform, userId } = req.body || {};

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid token' });
      }

      await sql`
        INSERT INTO push_tokens (token, user_id, platform, updated_at)
        VALUES (${token}, ${userId || null}, ${platform || 'web'}, NOW())
        ON CONFLICT (token) DO UPDATE SET
          user_id    = EXCLUDED.user_id,
          updated_at = NOW()
      `;

      return res.status(200).json({ ok: true });
    }

    if (action === 'unsubscribe' && req.method === 'POST') {
      const { token } = req.body || {};

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid token' });
      }

      await sql`DELETE FROM push_tokens WHERE token = ${token}`;

      return res.status(200).json({ ok: true });
    }

    if (action === 'get-by-user' && req.method === 'GET') {
      const { userId } = req.query;

      if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
      }

      const rows = await sql`
        SELECT token FROM push_tokens WHERE user_id = ${userId}
      `;

      return res.status(200).json({ tokens: rows.map((r) => r.token) });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.error('[push] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
