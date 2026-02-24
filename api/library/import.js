import { neon } from '@neondatabase/serverless';
import { ensureDatabaseInitialized } from '../_db-init.js';

/**
 * Import a library set into user's personal collection
 * Endpoint: /api/library/import
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

    // Check not already imported
    const existingImport = await sql`
      SELECT id FROM library_imports WHERE user_id = ${userId} AND library_set_id = ${librarySetId}
    `;
    if (existingImport.length > 0) {
      return res.status(400).json({ error: 'Set already imported' });
    }

    // Get library set
    const libSet = await sql`
      SELECT * FROM library_sets WHERE id = ${librarySetId} AND status = 'published'
    `;
    if (libSet.length === 0) {
      return res.status(404).json({ error: 'Library set not found' });
    }

    const set = libSet[0];

    // Create personal card_set
    const newSet = await sql`
      INSERT INTO card_sets (
        user_id, title, description, category,
        language_from, language_to, icon, total_cards
      ) VALUES (
        ${userId}, ${set.title + ' (из библиотеки)'}, ${set.description || ''},
        ${set.category || 'general'}, ${set.language_from || 'en'}, ${set.language_to || 'ru'},
        ${set.cover_emoji || null}, ${set.cards_count}
      )
      RETURNING id
    `;
    const newSetId = newSet[0].id;

    // Copy all library_cards → cards
    const libCards = await sql`
      SELECT front, back, hint FROM library_cards
      WHERE library_set_id = ${librarySetId}
      ORDER BY order_index ASC
    `;

    for (const card of libCards) {
      await sql`
        INSERT INTO cards (set_id, front, back, example)
        VALUES (${newSetId}, ${card.front}, ${card.back}, ${card.hint || null})
      `;
    }

    // Record import
    await sql`
      INSERT INTO library_imports (user_id, library_set_id) VALUES (${userId}, ${librarySetId})
    `;

    // Increment imports_count atomically
    await sql`
      UPDATE library_sets SET imports_count = imports_count + 1 WHERE id = ${librarySetId}
    `;

    return res.status(201).json({ newSetId });
  } catch (error) {
    console.error('Library import API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
