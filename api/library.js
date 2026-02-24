import { neon } from '@neondatabase/serverless';
import { ensureDatabaseInitialized } from './_db-init.js';

/**
 * API для библиотеки публичных наборов
 * Endpoint: /api/library
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = neon(process.env.POSTGRES_URL);
  await ensureDatabaseInitialized(sql);

  try {
    const { id, userId } = req.query;

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
