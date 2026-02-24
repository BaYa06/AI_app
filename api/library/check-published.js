import { neon } from '@neondatabase/serverless';
import { ensureDatabaseInitialized } from '../_db-init.js';

/**
 * Check if a personal set is published in the library
 * Endpoint: /api/library/check-published
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
    const { setId, userId } = req.query;

    if (!setId || !userId) {
      return res.status(400).json({ error: 'setId and userId are required' });
    }

    const result = await sql`
      SELECT id FROM library_sets
      WHERE original_set_id = ${setId} AND user_id = ${userId} AND status = 'published'
      LIMIT 1
    `;

    if (result.length > 0) {
      return res.status(200).json({ isPublished: true, librarySetId: result[0].id });
    }

    return res.status(200).json({ isPublished: false });
  } catch (error) {
    console.error('Library check-published API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
