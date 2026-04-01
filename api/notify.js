/**
 * Central push notification sender
 *
 * POST /api/notify
 * Headers: Authorization: Bearer NOTIFY_SECRET
 * Body: { userId, type, data? }
 *
 * Types: streak_reminder, streak_lost, streak_milestone, reactivation_3d, reactivation_7d
 */

import { neon } from '@neondatabase/serverless';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

function initFirebase() {
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  }
  return getMessaging();
}

function buildMessage(type, name, streak, longest, data = {}) {
  switch (type) {
    case 'streak_reminder':
      return {
        title: 'Не теряй серию!',
        body: `${name}, у тебя ${streak} дней подряд. Позанимайся сегодня!`,
      };
    case 'streak_lost':
      return {
        title: 'Серия прервана',
        body: `Серия в ${data.prevStreak} дней потеряна. Начни сегодня заново!`,
      };
    case 'streak_milestone':
      return {
        title: `${data.days} дней подряд!`,
        body: `${name}, это твой личный рекорд! Так держать`,
      };
    case 'reactivation_3d':
      return {
        title: 'Давно не виделись',
        body: `${name}, прошло 3 дня. Карточки ждут тебя!`,
      };
    case 'reactivation_7d':
      return {
        title: 'Вернись к учёбе',
        body: `Твой рекорд был ${longest} дней. Начни новую серию!`,
      };
    default:
      return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (req.headers.authorization !== `Bearer ${process.env.NOTIFY_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { userId, type, data = {} } = req.body || {};

  if (!userId || !type) {
    return res.status(400).json({ error: 'Missing userId or type' });
  }

  try {
    const sql = neon(process.env.POSTGRES_URL);

    const [tokenRow] = await sql`
      SELECT token FROM push_tokens WHERE user_id = ${userId} LIMIT 1
    `;

    if (!tokenRow?.token) {
      return res.status(200).json({ ok: false, reason: 'no token' });
    }

    const [user] = await sql`
      SELECT u.display_name, us.current_streak, us.longest_streak,
             us.notif_enabled, us.notif_streak
      FROM user_stats us
      JOIN users u ON u.id = us.user_id
      WHERE us.user_id = ${userId}
    `;

    if (!user?.notif_enabled) {
      return res.status(200).json({ ok: false, reason: 'notifications disabled' });
    }

    const name = user.display_name || 'Привет';
    const message = buildMessage(type, name, user.current_streak, user.longest_streak, data);

    if (!message) {
      return res.status(400).json({ error: `Unknown type: ${type}` });
    }

    const messaging = initFirebase();
    await messaging.send({
      token: tokenRow.token,
      notification: { title: message.title, body: message.body },
      data: { type, url: '/' },
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[notify] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
