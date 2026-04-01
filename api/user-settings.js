/**
 * User Notification Settings API
 *
 * GET  /api/user-settings?userId=xxx – get notif settings
 * POST /api/user-settings { userId, notifEnabled, notifHour, notifMinute, notifDays, notifStreak }
 */

import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  const sql = neon(process.env.POSTGRES_URL);

  try {
    if (req.method === 'GET') {
      const { userId } = req.query;

      if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
      }

      const rows = await sql`
        SELECT notif_enabled, notif_hour, notif_minute, notif_days, notif_streak
        FROM user_stats
        WHERE user_id = ${userId}
      `;

      if (!rows.length) {
        return res.status(200).json({
          notifEnabled: true,
          notifHour: 19,
          notifMinute: 0,
          notifDays: 'mon,tue,wed,thu,fri',
          notifStreak: true,
        });
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

    if (req.method === 'POST') {
      const { userId, notifEnabled, notifHour, notifMinute, notifDays, notifStreak } = req.body || {};

      if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
      }

      await sql`
        INSERT INTO user_stats (user_id, notif_enabled, notif_hour, notif_minute, notif_days, notif_streak)
        VALUES (
          ${userId},
          ${notifEnabled ?? true},
          ${notifHour ?? 19},
          ${notifMinute ?? 0},
          ${notifDays ?? 'mon,tue,wed,thu,fri'},
          ${notifStreak ?? true}
        )
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

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[user-settings] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
