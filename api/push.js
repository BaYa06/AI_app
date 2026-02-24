/**
 * Consolidated Push Notifications API
 *
 * POST /api/push?action=subscribe   – store FCM token
 * POST /api/push?action=unsubscribe – remove FCM token
 *
 * Legacy URLs /api/push/subscribe and /api/push/unsubscribe are rewritten
 * to this handler via vercel.json rewrites.
 */

import { loadTokens, saveTokens } from './push/_push-store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action } = req.query;

  try {
    if (action === 'subscribe') {
      const { token, platform, userId } = req.body || {};

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid token' });
      }

      const tokens = loadTokens();
      const existingIndex = tokens.findIndex((t) => t.token === token);
      const entry = {
        token,
        platform: platform || 'web',
        userId: userId || null,
        createdAt: existingIndex >= 0 ? tokens[existingIndex].createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (existingIndex >= 0) {
        tokens[existingIndex] = entry;
      } else {
        tokens.push(entry);
      }

      saveTokens(tokens);
      return res.status(200).json({ ok: true, total: tokens.length });
    }

    if (action === 'unsubscribe') {
      const { token } = req.body || {};

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid token' });
      }

      const tokens = loadTokens();
      const filtered = tokens.filter((t) => t.token !== token);
      saveTokens(filtered);

      const removed = tokens.length - filtered.length;
      return res.status(200).json({ ok: true, removed, total: filtered.length });
    }

    return res.status(400).json({ error: 'Unknown action. Use ?action=subscribe or ?action=unsubscribe' });
  } catch (error) {
    console.error('[push] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
