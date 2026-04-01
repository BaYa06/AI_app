/**
 * Cron: Streak Reminder
 * Запускается через cron-job.org каждый день в 14:00 UTC (20:00 Бишкек, UTC+6)
 *
 * POST /api/cron/streak-reminder
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

    const users = await sql`
      SELECT us.user_id
      FROM user_stats us
      JOIN push_tokens pt ON pt.user_id = us.user_id
      WHERE us.notif_enabled = true
        AND us.notif_streak = true
        AND us.current_streak > 0
        AND us.last_active_date < CURRENT_DATE
    `;

    const baseUrl = `https://${req.headers.host}`;
    let sent = 0;

    for (const user of users) {
      try {
        await fetch(`${baseUrl}/api/notify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NOTIFY_SECRET}`,
          },
          body: JSON.stringify({ userId: user.user_id, type: 'streak_reminder' }),
        });
        sent++;
      } catch (e) {
        console.error(`[streak-reminder] Failed for ${user.user_id}:`, e);
      }
    }

    return res.status(200).json({ ok: true, total: users.length, sent });
  } catch (error) {
    console.error('[streak-reminder] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
