import { neon } from '@neondatabase/serverless';
import { ensureDatabaseInitialized } from '../_db-init.js';

/**
 * Get user's published sets
 * Endpoint: /api/library/my-publications
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.POSTGRES_URL);
  await ensureDatabaseInitialized(sql);

  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const sets = await sql`
      SELECT ls.*,
        CASE WHEN ls.rating_count > 0
          THEN ROUND(ls.rating_sum::numeric / ls.rating_count, 1)
          ELSE NULL
        END AS average_rating
      FROM library_sets ls
      WHERE ls.user_id = ${userId} AND ls.status IN ('published', 'archived')
      ORDER BY ls.published_at DESC
    `;

    return res.status(200).json(sets);
  } catch (error) {
    console.error('Library my-publications API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
