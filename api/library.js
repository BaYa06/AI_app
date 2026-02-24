import { neon } from '@neondatabase/serverless';
import { ensureDatabaseInitialized } from './_db-init.js';

/**
 * Consolidated Library API
 * Handles all library operations via ?action= parameter.
 *
 * GET  /api/library                         – list sets
 * GET  /api/library?id=xxx                  – set detail
 * GET  /api/library?action=my-publications  – user's publications
 * GET  /api/library?action=check-published  – check if set is published
 * POST /api/library?action=publish          – publish a set
 * PUT  /api/library?action=publish          – update a publication
 * DELETE /api/library?action=publish        – unpublish a set
 * POST /api/library?action=like             – toggle like
 * POST /api/library?action=rate             – rate a set
 * POST /api/library?action=report           – report a set
 * POST /api/library?action=import           – import a set
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const sql = neon(process.env.POSTGRES_URL);
  await ensureDatabaseInitialized(sql);

  const { action, id, userId } = req.query;

  try {
    // ── Action-based routing (sub-endpoints consolidated here) ──────────────
    if (action === 'my-publications') return await getMyPublications(req, res, sql);
    if (action === 'check-published') return await checkPublished(req, res, sql);
    if (action === 'like')            return await toggleLike(req, res, sql);
    if (action === 'rate')            return await rateSet(req, res, sql);
    if (action === 'report')          return await reportSet(req, res, sql);
    if (action === 'import')          return await importSet(req, res, sql);
    if (action === 'publish') {
      switch (req.method) {
        case 'POST':   return await publishSet(req, res, sql);
        case 'PUT':    return await updatePublication(req, res, sql);
        case 'DELETE': return await unpublishSet(req, res, sql);
        default:       return res.status(405).json({ error: 'Method not allowed' });
      }
    }

    // ── Default GET routes ───────────────────────────────────────────────────
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (id) {
      return await getSetDetail(req, res, sql, id, userId);
    }
    return await getLibrarySets(req, res, sql);
  } catch (error) {
    console.error('Library API error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// Get list of library sets with filters
async function getLibrarySets(req, res, sql) {
  const {
    search,
    category,
    language,
    sort = 'popular',
    cardsMin,
    cardsMax,
    page = '1',
    limit = '20',
    userId,
  } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  // Build dynamic query with parameterized values
  const conditions = [`ls.status = 'published'`];
  const params = [];
  let paramIndex = 1;

  if (search) {
    conditions.push(`(ls.title ILIKE $${paramIndex} OR ls.description ILIKE $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (category) {
    conditions.push(`ls.category = $${paramIndex}`);
    params.push(category);
    paramIndex++;
  }

  if (language) {
    const [langFrom, langTo] = language.split('-');
    if (langFrom && langTo) {
      conditions.push(`ls.language_from = $${paramIndex}`);
      params.push(langFrom);
      paramIndex++;
      conditions.push(`ls.language_to = $${paramIndex}`);
      params.push(langTo);
      paramIndex++;
    }
  }

  if (cardsMin) {
    conditions.push(`ls.cards_count >= $${paramIndex}`);
    params.push(parseInt(cardsMin, 10));
    paramIndex++;
  }

  if (cardsMax) {
    conditions.push(`ls.cards_count <= $${paramIndex}`);
    params.push(parseInt(cardsMax, 10));
    paramIndex++;
  }

  if (sort === 'featured') {
    conditions.push(`ls.is_featured = true`);
  }

  const whereClause = conditions.join(' AND ');

  // ORDER BY
  let orderBy;
  switch (sort) {
    case 'top_rated':
      orderBy = 'CASE WHEN ls.rating_count > 0 THEN ls.rating_sum::float / ls.rating_count ELSE 0 END DESC, ls.rating_count DESC';
      break;
    case 'newest':
      orderBy = 'ls.published_at DESC';
      break;
    case 'featured':
      orderBy = 'ls.imports_count DESC';
      break;
    case 'popular':
    default:
      orderBy = 'ls.imports_count DESC';
      break;
  }

  // userId-dependent subqueries as parameterized
  let importedSelect;
  if (userId) {
    const uidParam = `$${paramIndex}`;
    params.push(userId);
    paramIndex++;
    importedSelect = `, EXISTS(SELECT 1 FROM library_imports li WHERE li.library_set_id = ls.id AND li.user_id = ${uidParam}) AS is_imported,
       EXISTS(SELECT 1 FROM library_likes ll WHERE ll.library_set_id = ls.id AND ll.user_id = ${uidParam}) AS is_liked`;
  } else {
    importedSelect = `, false AS is_imported, false AS is_liked`;
  }

  const limitParam = `$${paramIndex}`;
  params.push(limitNum + 1);
  paramIndex++;
  const offsetParam = `$${paramIndex}`;
  params.push(offset);
  paramIndex++;

  const query = `
    SELECT ls.*,
      COALESCE(u.user_name, u.email) AS author_name,
      CASE WHEN ls.rating_count > 0 THEN ROUND(ls.rating_sum::numeric / ls.rating_count, 1) ELSE NULL END AS average_rating
      ${importedSelect}
    FROM library_sets ls
    LEFT JOIN users u ON u.id = ls.user_id
    WHERE ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ${limitParam} OFFSET ${offsetParam}
  `;

  const rows = await sql(query, params);

  const has_more = rows.length > limitNum;
  const sets = has_more ? rows.slice(0, limitNum) : rows;

  return res.status(200).json({ sets, has_more });
}

// Get single set detail with preview cards
async function getSetDetail(req, res, sql, id, userId) {
  let importedSelect;
  const params = [id];
  let paramIndex = 2;

  if (userId) {
    const uidParam = `$${paramIndex}`;
    params.push(userId);
    paramIndex++;
    importedSelect = `, EXISTS(SELECT 1 FROM library_imports li WHERE li.library_set_id = ls.id AND li.user_id = ${uidParam}) AS is_imported,
       EXISTS(SELECT 1 FROM library_likes ll WHERE ll.library_set_id = ls.id AND ll.user_id = ${uidParam}) AS is_liked,
       (SELECT rating FROM library_ratings lr WHERE lr.library_set_id = ls.id AND lr.user_id = ${uidParam}) AS user_rating`;
  } else {
    importedSelect = `, false AS is_imported, false AS is_liked, NULL::smallint AS user_rating`;
  }

  const setRows = await sql(`
    SELECT ls.*,
      COALESCE(u.user_name, u.email) AS author_name,
      CASE WHEN ls.rating_count > 0 THEN ROUND(ls.rating_sum::numeric / ls.rating_count, 1) ELSE NULL END AS average_rating
      ${importedSelect}
    FROM library_sets ls
    LEFT JOIN users u ON u.id = ls.user_id
    WHERE ls.id = $1 AND ls.status = 'published'
  `, params);

  if (setRows.length === 0) {
    return res.status(404).json({ error: 'Set not found' });
  }

  // Get preview cards (first 10)
  const cards = await sql(`
    SELECT * FROM library_cards
    WHERE library_set_id = $1
    ORDER BY order_index ASC
    LIMIT 10
  `, [id]);

  const detail = { ...setRows[0], preview_cards: cards };
  return res.status(200).json(detail);
}

// ── action=my-publications ────────────────────────────────────────────────────
async function getMyPublications(req, res, sql) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

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
}

// ── action=check-published ───────────────────────────────────────────────────
async function checkPublished(req, res, sql) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { setId, userId } = req.query;
  if (!setId || !userId) return res.status(400).json({ error: 'setId and userId are required' });

  const result = await sql`
    SELECT id FROM library_sets
    WHERE original_set_id = ${setId} AND user_id = ${userId} AND status = 'published'
    LIMIT 1
  `;
  if (result.length > 0) {
    return res.status(200).json({ isPublished: true, librarySetId: result[0].id });
  }
  return res.status(200).json({ isPublished: false });
}

// ── action=like ───────────────────────────────────────────────────────────────
async function toggleLike(req, res, sql) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { userId, librarySetId } = req.body;
  if (!userId || !librarySetId) return res.status(400).json({ error: 'userId and librarySetId are required' });

  const existing = await sql`
    SELECT id FROM library_likes WHERE user_id = ${userId} AND library_set_id = ${librarySetId}
  `;

  let is_liked;
  if (existing.length > 0) {
    await sql`DELETE FROM library_likes WHERE user_id = ${userId} AND library_set_id = ${librarySetId}`;
    await sql`UPDATE library_sets SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ${librarySetId}`;
    is_liked = false;
  } else {
    await sql`INSERT INTO library_likes (user_id, library_set_id) VALUES (${userId}, ${librarySetId})`;
    await sql`UPDATE library_sets SET likes_count = likes_count + 1 WHERE id = ${librarySetId}`;
    is_liked = true;
  }

  const updated = await sql`SELECT likes_count FROM library_sets WHERE id = ${librarySetId}`;
  const likes_count = updated.length > 0 ? updated[0].likes_count : 0;
  return res.status(200).json({ is_liked, likes_count });
}

// ── action=rate ───────────────────────────────────────────────────────────────
async function rateSet(req, res, sql) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { userId, librarySetId, rating } = req.body;
  if (!userId || !librarySetId || !rating) return res.status(400).json({ error: 'userId, librarySetId, and rating are required' });

  const ratingNum = parseInt(rating, 10);
  if (ratingNum < 1 || ratingNum > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5' });

  const existing = await sql`
    SELECT id, rating FROM library_ratings
    WHERE user_id = ${userId} AND library_set_id = ${librarySetId}
  `;

  if (existing.length > 0) {
    const oldRating = existing[0].rating;
    await sql`UPDATE library_ratings SET rating = ${ratingNum} WHERE user_id = ${userId} AND library_set_id = ${librarySetId}`;
    await sql`UPDATE library_sets SET rating_sum = rating_sum - ${oldRating} + ${ratingNum} WHERE id = ${librarySetId}`;
  } else {
    await sql`INSERT INTO library_ratings (user_id, library_set_id, rating) VALUES (${userId}, ${librarySetId}, ${ratingNum})`;
    await sql`UPDATE library_sets SET rating_sum = rating_sum + ${ratingNum}, rating_count = rating_count + 1 WHERE id = ${librarySetId}`;
  }

  const updated = await sql`SELECT rating_sum, rating_count FROM library_sets WHERE id = ${librarySetId}`;
  const { rating_sum, rating_count } = updated[0];
  const average_rating = rating_count > 0 ? Math.round((rating_sum / rating_count) * 10) / 10 : null;
  return res.status(200).json({ user_rating: ratingNum, average_rating, rating_count });
}

// ── action=report ─────────────────────────────────────────────────────────────
async function reportSet(req, res, sql) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { userId, librarySetId, reason } = req.body;
  if (!userId || !librarySetId) return res.status(400).json({ error: 'userId and librarySetId are required' });

  await sql`INSERT INTO library_reports (user_id, library_set_id, reason) VALUES (${userId}, ${librarySetId}, ${reason || null})`;
  return res.status(201).json({ success: true });
}

// ── action=import ─────────────────────────────────────────────────────────────
async function importSet(req, res, sql) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { userId, librarySetId } = req.body;
  if (!userId || !librarySetId) return res.status(400).json({ error: 'userId and librarySetId are required' });

  const existingImport = await sql`SELECT id FROM library_imports WHERE user_id = ${userId} AND library_set_id = ${librarySetId}`;
  if (existingImport.length > 0) return res.status(400).json({ error: 'Set already imported' });

  const libSet = await sql`SELECT * FROM library_sets WHERE id = ${librarySetId} AND status = 'published'`;
  if (libSet.length === 0) return res.status(404).json({ error: 'Library set not found' });

  const set = libSet[0];
  const newSet = await sql`
    INSERT INTO card_sets (user_id, title, description, category, language_from, language_to, icon, total_cards)
    VALUES (${userId}, ${set.title + ' (из библиотеки)'}, ${set.description || ''}, ${set.category || 'general'},
            ${set.language_from || 'en'}, ${set.language_to || 'ru'}, ${set.cover_emoji || null}, ${set.cards_count})
    RETURNING id
  `;
  const newSetId = newSet[0].id;

  const libCards = await sql`SELECT front, back, hint FROM library_cards WHERE library_set_id = ${librarySetId} ORDER BY order_index ASC`;
  for (const card of libCards) {
    await sql`INSERT INTO cards (set_id, front, back, example) VALUES (${newSetId}, ${card.front}, ${card.back}, ${card.hint || null})`;
  }

  await sql`INSERT INTO library_imports (user_id, library_set_id) VALUES (${userId}, ${librarySetId})`;
  await sql`UPDATE library_sets SET imports_count = imports_count + 1 WHERE id = ${librarySetId}`;

  return res.status(201).json({ newSetId });
}

// ── action=publish (POST/PUT/DELETE) ─────────────────────────────────────────
async function publishSet(req, res, sql) {
  const { userId, setId, description, tags, category } = req.body;
  if (!userId || !setId) return res.status(400).json({ error: 'userId and setId are required' });

  const setRows = await sql`SELECT * FROM card_sets WHERE id = ${setId} AND user_id = ${userId}`;
  if (setRows.length === 0) return res.status(404).json({ error: 'Set not found or access denied' });
  const cardSet = setRows[0];

  const cardCount = await sql`SELECT COUNT(*) as cnt FROM cards WHERE set_id = ${setId}`;
  if (parseInt(cardCount[0].cnt, 10) < 5) return res.status(400).json({ error: 'At least 5 cards are required to publish' });

  const existing = await sql`SELECT id FROM library_sets WHERE original_set_id = ${setId} AND status = 'published'`;
  if (existing.length > 0) return res.status(400).json({ error: 'Set is already published' });

  const libSet = await sql`
    INSERT INTO library_sets (user_id, original_set_id, title, description, category, tags,
      language_from, language_to, cards_count, cover_emoji, status)
    VALUES (${userId}, ${setId}, ${cardSet.title}, ${description || cardSet.description || null},
            ${category || cardSet.category || null}, ${tags || []},
            ${cardSet.language_from || null}, ${cardSet.language_to || null},
            ${parseInt(cardCount[0].cnt, 10)}, ${cardSet.icon || null}, 'published')
    RETURNING id
  `;
  const librarySetId = libSet[0].id;

  const cards = await sql`SELECT front, back, example FROM cards WHERE set_id = ${setId} ORDER BY created_at ASC`;
  for (let i = 0; i < cards.length; i++) {
    await sql`INSERT INTO library_cards (library_set_id, front, back, hint, order_index) VALUES (${librarySetId}, ${cards[i].front}, ${cards[i].back}, ${cards[i].example || null}, ${i})`;
  }

  return res.status(201).json({ librarySetId });
}

async function updatePublication(req, res, sql) {
  const { userId, librarySetId } = req.body;
  if (!userId || !librarySetId) return res.status(400).json({ error: 'userId and librarySetId are required' });

  const libSet = await sql`SELECT * FROM library_sets WHERE id = ${librarySetId} AND user_id = ${userId} AND status = 'published'`;
  if (libSet.length === 0) return res.status(404).json({ error: 'Publication not found or access denied' });

  const originalSetId = libSet[0].original_set_id;
  if (!originalSetId) return res.status(400).json({ error: 'Original set reference is missing' });

  const cardCount = await sql`SELECT COUNT(*) as cnt FROM cards WHERE set_id = ${originalSetId}`;
  if (parseInt(cardCount[0].cnt, 10) < 5) return res.status(400).json({ error: 'Original set must have at least 5 cards' });

  await sql`DELETE FROM library_cards WHERE library_set_id = ${librarySetId}`;

  const cards = await sql`SELECT front, back, example FROM cards WHERE set_id = ${originalSetId} ORDER BY created_at ASC`;
  for (let i = 0; i < cards.length; i++) {
    await sql`INSERT INTO library_cards (library_set_id, front, back, hint, order_index) VALUES (${librarySetId}, ${cards[i].front}, ${cards[i].back}, ${cards[i].example || null}, ${i})`;
  }

  await sql`UPDATE library_sets SET cards_count = ${cards.length} WHERE id = ${librarySetId}`;
  return res.status(200).json({ success: true });
}

async function unpublishSet(req, res, sql) {
  const { userId, librarySetId } = req.body;
  if (!userId || !librarySetId) return res.status(400).json({ error: 'userId and librarySetId are required' });

  const result = await sql`
    UPDATE library_sets SET status = 'archived'
    WHERE id = ${librarySetId} AND user_id = ${userId} AND status = 'published'
    RETURNING id
  `;
  if (result.length === 0) return res.status(404).json({ error: 'Publication not found or access denied' });
  return res.status(200).json({ success: true });
}
