/**
 * Cron: Reactivation
 * Запускается через cron-job.org каждый день в 04:00 UTC (10:00 Бишкек, UTC+6)
 *
 * POST /api/cron/reactivation
 * Headers: Authorization: Bearer CRON_SECRET
 */

import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const sql = neon(process.env.POSTGRES_URL);

    const users3d = await sql`
      SELECT us.user_id
      FROM user_stats us
      JOIN push_tokens pt ON pt.user_id = us.user_id
      WHERE us.notif_enabled = true
        AND us.last_active_date = CURRENT_DATE - INTERVAL '3 days'
    `;

    const users7d = await sql`
      SELECT us.user_id
      FROM user_stats us
      JOIN push_tokens pt ON pt.user_id = us.user_id
      WHERE us.notif_enabled = true
        AND us.last_active_date = CURRENT_DATE - INTERVAL '7 days'
    `;

    const baseUrl = `https://${req.headers.host}`;
    let sent = 0;

    for (const user of users3d) {
      try {
        await fetch(`${baseUrl}/api/notify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NOTIFY_SECRET}`,
          },
          body: JSON.stringify({ userId: user.user_id, type: 'reactivation_3d' }),
        });
        sent++;
      } catch (e) {
        console.error(`[reactivation] Failed 3d for ${user.user_id}:`, e);
      }
    }

    for (const user of users7d) {
      try {
        await fetch(`${baseUrl}/api/notify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NOTIFY_SECRET}`,
          },
          body: JSON.stringify({ userId: user.user_id, type: 'reactivation_7d' }),
        });
        sent++;
      } catch (e) {
        console.error(`[reactivation] Failed 7d for ${user.user_id}:`, e);
      }
    }

    return res.status(200).json({
      ok: true,
      users3d: users3d.length,
      users7d: users7d.length,
      sent,
    });
  } catch (error) {
    console.error('[reactivation] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
