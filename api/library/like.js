import { neon } from '@neondatabase/serverless';
import { ensureDatabaseInitialized } from '../_db-init.js';

/**
 * Toggle like on a library set
 * Endpoint: /api/library/like
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.POSTGRES_URL);
  await ensureDatabaseInitialized(sql);

  try {
    const { userId, librarySetId } = req.body;

    if (!userId || !librarySetId) {
      return res.status(400).json({ error: 'userId and librarySetId are required' });
    }

    // Check if already liked
    const existing = await sql`
      SELECT id FROM library_likes WHERE user_id = ${userId} AND library_set_id = ${librarySetId}
    `;

    let is_liked;
    if (existing.length > 0) {
      // Unlike
      await sql`DELETE FROM library_likes WHERE user_id = ${userId} AND library_set_id = ${librarySetId}`;
      await sql`UPDATE library_sets SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ${librarySetId}`;
      is_liked = false;
    } else {
      // Like
      await sql`INSERT INTO library_likes (user_id, library_set_id) VALUES (${userId}, ${librarySetId})`;
      await sql`UPDATE library_sets SET likes_count = likes_count + 1 WHERE id = ${librarySetId}`;
      is_liked = true;
    }

    // Get updated count
    const updated = await sql`SELECT likes_count FROM library_sets WHERE id = ${librarySetId}`;
    const likes_count = updated.length > 0 ? updated[0].likes_count : 0;

    return res.status(200).json({ is_liked, likes_count });
  } catch (error) {
    console.error('Library like API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
