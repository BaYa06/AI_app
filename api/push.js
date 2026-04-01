/**
 * Consolidated Push & Notifications API
 *
 * POST /api/push?action=subscribe       – store FCM token
 * POST /api/push?action=unsubscribe     – remove FCM token
 * GET  /api/push?action=get-by-user     – get tokens by userId
 * GET  /api/push?action=settings        – get notif settings
 * POST /api/push?action=settings        – save notif settings
 * POST /api/push?action=notify          – send FCM push (server-to-server)
 * POST /api/push?action=cron-streak     – streak reminder cron
 * POST /api/push?action=cron-reactivation – reactivation cron
 */

import { neon } from '@neondatabase/serverless';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { ensureDatabaseInitialized } from './_db-init.js';

function initFirebase() {
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  }
  return getMessaging();
}

function buildMessage(type, name, streak, longest, data = {}) {
  switch (type) {
    case 'streak_reminder':
      return { title: 'Не теряй серию!', body: `${name}, у тебя ${streak} дней подряд. Позанимайся сегодня!` };
    case 'streak_lost':
      return { title: 'Серия прервана', body: `Серия в ${data.prevStreak} дней потеряна. Начни сегодня заново!` };
    case 'streak_milestone':
      return { title: `${data.days} дней подряд!`, body: `${name}, это твой личный рекорд! Так держать` };
    case 'reactivation_3d':
      return { title: 'Давно не виделись', body: `${name}, прошло 3 дня. Карточки ждут тебя!` };
    case 'reactivation_7d':
      return { title: 'Вернись к учёбе', body: `Твой рекорд был ${longest} дней. Начни новую серию!` };
    default:
      return null;
  }
}

export default async function handler(req, res) {
  const { action } = req.query;
  const sql = neon(process.env.POSTGRES_URL);
  await ensureDatabaseInitialized(sql);

  try {
    // ── subscribe ──────────────────────────────────────────────
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

    // ── unsubscribe ────────────────────────────────────────────
    if (action === 'unsubscribe' && req.method === 'POST') {
      const { token } = req.body || {};
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid token' });
      }
      await sql`DELETE FROM push_tokens WHERE token = ${token}`;
      return res.status(200).json({ ok: true });
    }

    // ── get-by-user ────────────────────────────────────────────
    if (action === 'get-by-user' && req.method === 'GET') {
      const { userId } = req.query;
      if (!userId) return res.status(400).json({ error: 'Missing userId' });
      const rows = await sql`SELECT token FROM push_tokens WHERE user_id = ${userId}`;
      return res.status(200).json({ tokens: rows.map((r) => r.token) });
    }

    // ── settings GET ───────────────────────────────────────────
    if (action === 'settings' && req.method === 'GET') {
      const { userId } = req.query;
      if (!userId) return res.status(400).json({ error: 'Missing userId' });
      const rows = await sql`
        SELECT notif_enabled, notif_hour, notif_minute, notif_days, notif_streak
        FROM user_stats WHERE user_id = ${userId}
      `;
      if (!rows.length) {
        return res.status(200).json({ notifEnabled: true, notifHour: 19, notifMinute: 0, notifDays: 'mon,tue,wed,thu,fri', notifStreak: true });
      }
      const r = rows[0];
      return res.status(200).json({
        notifEnabled: r.notif_enabled,
        notifHour: r.notif_hour,
        notifMinute: r.notif_minute,
        notifDays: r.notif_days,
        notifStreak: r.notif_streak,
      });
    }

    // ── settings POST ──────────────────────────────────────────
    if (action === 'settings' && req.method === 'POST') {
      const { userId, notifEnabled, notifHour, notifMinute, notifDays, notifStreak } = req.body || {};
      if (!userId) return res.status(400).json({ error: 'Missing userId' });
      await sql`
        INSERT INTO user_stats (user_id, notif_enabled, notif_hour, notif_minute, notif_days, notif_streak)
        VALUES (${userId}, ${notifEnabled ?? true}, ${notifHour ?? 19}, ${notifMinute ?? 0}, ${notifDays ?? 'mon,tue,wed,thu,fri'}, ${notifStreak ?? true})
        ON CONFLICT (user_id) DO UPDATE SET
          notif_enabled = EXCLUDED.notif_enabled,
          notif_hour    = EXCLUDED.notif_hour,
          notif_minute  = EXCLUDED.notif_minute,
          notif_days    = EXCLUDED.notif_days,
          notif_streak  = EXCLUDED.notif_streak,
          updated_at    = NOW()
      `;
      return res.status(200).json({ ok: true });
    }

    // ── notify ─────────────────────────────────────────────────
    if (action === 'notify' && req.method === 'POST') {
      if (req.headers.authorization !== `Bearer ${process.env.NOTIFY_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { userId, type, data = {} } = req.body || {};
      if (!userId || !type) return res.status(400).json({ error: 'Missing userId or type' });

      const [tokenRow] = await sql`SELECT token FROM push_tokens WHERE user_id = ${userId} LIMIT 1`;
      if (!tokenRow?.token) return res.status(200).json({ ok: false, reason: 'no token' });

      const [user] = await sql`
        SELECT u.display_name, us.current_streak, us.longest_streak, us.notif_enabled, us.notif_streak
        FROM user_stats us JOIN users u ON u.id = us.user_id WHERE us.user_id = ${userId}
      `;
      if (!user?.notif_enabled) return res.status(200).json({ ok: false, reason: 'notifications disabled' });

      const message = buildMessage(type, user.display_name || 'Привет', user.current_streak, user.longest_streak, data);
      if (!message) return res.status(400).json({ error: `Unknown type: ${type}` });

      const messaging = initFirebase();
      await messaging.send({ token: tokenRow.token, notification: message, data: { type, url: '/' } });
      return res.status(200).json({ ok: true });
    }

    // ── cron-streak ────────────────────────────────────────────
    if (action === 'cron-streak' && req.method === 'POST') {
      if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const users = await sql`
        SELECT us.user_id FROM user_stats us
        JOIN push_tokens pt ON pt.user_id = us.user_id
        WHERE us.notif_enabled = true AND us.notif_streak = true
          AND us.current_streak > 0 AND us.last_active_date < CURRENT_DATE
      `;
      const baseUrl = `https://${req.headers.host}`;
      let sent = 0;
      for (const user of users) {
        try {
          await fetch(`${baseUrl}/api/push?action=notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.NOTIFY_SECRET}` },
            body: JSON.stringify({ userId: user.user_id, type: 'streak_reminder' }),
          });
          sent++;
        } catch (e) {
          console.error(`[cron-streak] Failed for ${user.user_id}:`, e);
        }
      }
      return res.status(200).json({ ok: true, total: users.length, sent });
    }

    // ── cron-reactivation ──────────────────────────────────────
    if (action === 'cron-reactivation' && req.method === 'POST') {
      if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const users3d = await sql`
        SELECT us.user_id FROM user_stats us JOIN push_tokens pt ON pt.user_id = us.user_id
        WHERE us.notif_enabled = true AND us.last_active_date = CURRENT_DATE - INTERVAL '3 days'
      `;
      const users7d = await sql`
        SELECT us.user_id FROM user_stats us JOIN push_tokens pt ON pt.user_id = us.user_id
        WHERE us.notif_enabled = true AND us.last_active_date = CURRENT_DATE - INTERVAL '7 days'
      `;
      const baseUrl = `https://${req.headers.host}`;
      let sent = 0;
      for (const user of users3d) {
        try {
          await fetch(`${baseUrl}/api/push?action=notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.NOTIFY_SECRET}` },
            body: JSON.stringify({ userId: user.user_id, type: 'reactivation_3d' }),
          });
          sent++;
        } catch (e) { console.error(`[cron-reactivation] 3d failed:`, e); }
      }
      for (const user of users7d) {
        try {
          await fetch(`${baseUrl}/api/push?action=notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.NOTIFY_SECRET}` },
            body: JSON.stringify({ userId: user.user_id, type: 'reactivation_7d' }),
          });
          sent++;
        } catch (e) { console.error(`[cron-reactivation] 7d failed:`, e); }
      }
      return res.status(200).json({ ok: true, users3d: users3d.length, users7d: users7d.length, sent });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.error('[push] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
