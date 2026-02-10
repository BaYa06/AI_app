/**
 * POST /api/push/subscribe
 * @description Сохраняет FCM push-токен.
 *
 * Body: { token: string, platform: "web", userId?: string | null }
 *
 * Защита от дублей: upsert по token.
 *
 * Сейчас используется in-memory + файловое хранилище.
 * TODO: Заменить на INSERT … ON CONFLICT (token) DO UPDATE … в PostgreSQL/Neon.
 */

import { loadTokens, saveTokens } from './_push-store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { token, platform, userId } = req.body || {};

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid token' });
    }

    const tokens = loadTokens();

    // Upsert: обновляем если токен уже есть, иначе добавляем
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
  } catch (error) {
    console.error('[push/subscribe] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
