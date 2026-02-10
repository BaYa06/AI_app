/**
 * POST /api/push/unsubscribe
 * @description Удаляет FCM push-токен.
 *
 * Body: { token: string }
 */

import { loadTokens, saveTokens } from './_push-store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { token } = req.body || {};

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid token' });
    }

    const tokens = loadTokens();
    const filtered = tokens.filter((t) => t.token !== token);
    saveTokens(filtered);

    const removed = tokens.length - filtered.length;
    return res.status(200).json({ ok: true, removed, total: filtered.length });
  } catch (error) {
    console.error('[push/unsubscribe] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
