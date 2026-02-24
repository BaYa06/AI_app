import { neon } from '@neondatabase/serverless';
import { ensureDatabaseInitialized } from '../_db-init.js';

/**
 * Rate a library set (1-5 stars)
 * Endpoint: /api/library/rate
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
    const { userId, librarySetId, rating } = req.body;

    if (!userId || !librarySetId || !rating) {
      return res.status(400).json({ error: 'userId, librarySetId, and rating are required' });
    }

    const ratingNum = parseInt(rating, 10);
    if (ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    // Check existing rating
    const existing = await sql`
      SELECT id, rating FROM library_ratings
      WHERE user_id = ${userId} AND library_set_id = ${librarySetId}
    `;

    if (existing.length > 0) {
      const oldRating = existing[0].rating;
      // Update rating
      await sql`
        UPDATE library_ratings SET rating = ${ratingNum}
        WHERE user_id = ${userId} AND library_set_id = ${librarySetId}
      `;
      // Adjust sum atomically
      await sql`
        UPDATE library_sets
        SET rating_sum = rating_sum - ${oldRating} + ${ratingNum}
        WHERE id = ${librarySetId}
      `;
    } else {
      // Insert new rating
      await sql`
        INSERT INTO library_ratings (user_id, library_set_id, rating)
        VALUES (${userId}, ${librarySetId}, ${ratingNum})
      `;
      // Increment count and sum
      await sql`
        UPDATE library_sets
        SET rating_sum = rating_sum + ${ratingNum}, rating_count = rating_count + 1
        WHERE id = ${librarySetId}
      `;
    }

    // Get updated values
    const updated = await sql`
      SELECT rating_sum, rating_count FROM library_sets WHERE id = ${librarySetId}
    `;

    const { rating_sum, rating_count } = updated[0];
    const average_rating = rating_count > 0
      ? Math.round((rating_sum / rating_count) * 10) / 10
      : null;

    return res.status(200).json({
      user_rating: ratingNum,
      average_rating,
      rating_count,
    });
  } catch (error) {
    console.error('Library rate API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
