import { neon } from '@neondatabase/serverless';
import { ensureDatabaseInitialized } from '../_db-init.js';

/**
 * Publish / update / unpublish a set in the library
 * Endpoint: /api/library/publish
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = neon(process.env.POSTGRES_URL);
  await ensureDatabaseInitialized(sql);

  try {
    switch (req.method) {
      case 'POST':
        return await publishSet(req, res, sql);
      case 'PUT':
        return await updatePublication(req, res, sql);
      case 'DELETE':
        return await unpublishSet(req, res, sql);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Library publish API error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function publishSet(req, res, sql) {
  const { userId, setId, description, tags, category } = req.body;

  if (!userId || !setId) {
    return res.status(400).json({ error: 'userId and setId are required' });
  }

  // Check set belongs to user
  const setRows = await sql`
    SELECT * FROM card_sets WHERE id = ${setId} AND user_id = ${userId}
  `;
  if (setRows.length === 0) {
    return res.status(404).json({ error: 'Set not found or access denied' });
  }
  const cardSet = setRows[0];

  // Check minimum 5 cards
  const cardCount = await sql`SELECT COUNT(*) as cnt FROM cards WHERE set_id = ${setId}`;
  if (parseInt(cardCount[0].cnt, 10) < 5) {
    return res.status(400).json({ error: 'At least 5 cards are required to publish' });
  }

  // Check not already published
  const existing = await sql`
    SELECT id FROM library_sets
    WHERE original_set_id = ${setId} AND status = 'published'
  `;
  if (existing.length > 0) {
    return res.status(400).json({ error: 'Set is already published' });
  }

  // Create library set
  const libSet = await sql`
    INSERT INTO library_sets (
      user_id, original_set_id, title, description, category, tags,
      language_from, language_to, cards_count, cover_emoji, status
    ) VALUES (
      ${userId}, ${setId}, ${cardSet.title},
      ${description || cardSet.description || null},
      ${category || cardSet.category || null},
      ${tags || []},
      ${cardSet.language_from || null}, ${cardSet.language_to || null},
      ${parseInt(cardCount[0].cnt, 10)},
      ${cardSet.icon || null},
      'published'
    )
    RETURNING id
  `;

  const librarySetId = libSet[0].id;

  // Copy cards
  const cards = await sql`
    SELECT front, back, example FROM cards WHERE set_id = ${setId} ORDER BY created_at ASC
  `;

  for (let i = 0; i < cards.length; i++) {
    await sql`
      INSERT INTO library_cards (library_set_id, front, back, hint, order_index)
      VALUES (${librarySetId}, ${cards[i].front}, ${cards[i].back}, ${cards[i].example || null}, ${i})
    `;
  }

  return res.status(201).json({ librarySetId });
}

async function updatePublication(req, res, sql) {
  const { userId, librarySetId } = req.body;

  if (!userId || !librarySetId) {
    return res.status(400).json({ error: 'userId and librarySetId are required' });
  }

  // Check ownership
  const libSet = await sql`
    SELECT * FROM library_sets WHERE id = ${librarySetId} AND user_id = ${userId} AND status = 'published'
  `;
  if (libSet.length === 0) {
    return res.status(404).json({ error: 'Publication not found or access denied' });
  }

  const originalSetId = libSet[0].original_set_id;
  if (!originalSetId) {
    return res.status(400).json({ error: 'Original set reference is missing' });
  }

  // Check min cards
  const cardCount = await sql`SELECT COUNT(*) as cnt FROM cards WHERE set_id = ${originalSetId}`;
  if (parseInt(cardCount[0].cnt, 10) < 5) {
    return res.status(400).json({ error: 'Original set must have at least 5 cards' });
  }

  // Delete old library cards
  await sql`DELETE FROM library_cards WHERE library_set_id = ${librarySetId}`;

  // Copy fresh cards
  const cards = await sql`
    SELECT front, back, example FROM cards WHERE set_id = ${originalSetId} ORDER BY created_at ASC
  `;

  for (let i = 0; i < cards.length; i++) {
    await sql`
      INSERT INTO library_cards (library_set_id, front, back, hint, order_index)
      VALUES (${librarySetId}, ${cards[i].front}, ${cards[i].back}, ${cards[i].example || null}, ${i})
    `;
  }

  // Update count
  await sql`
    UPDATE library_sets SET cards_count = ${cards.length} WHERE id = ${librarySetId}
  `;

  return res.status(200).json({ success: true });
}

async function unpublishSet(req, res, sql) {
  const { userId, librarySetId } = req.body;

  if (!userId || !librarySetId) {
    return res.status(400).json({ error: 'userId and librarySetId are required' });
  }

  const result = await sql`
    UPDATE library_sets SET status = 'archived'
    WHERE id = ${librarySetId} AND user_id = ${userId} AND status = 'published'
    RETURNING id
  `;

  if (result.length === 0) {
    return res.status(404).json({ error: 'Publication not found or access denied' });
  }

  return res.status(200).json({ success: true });
}
