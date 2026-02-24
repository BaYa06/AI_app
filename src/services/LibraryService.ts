/**
 * Library Service — direct DB access via @neondatabase/serverless
 * Mirrors the API logic from api/library/*.js but runs client-side
 */

import { neon } from '@neondatabase/serverless';
import type {
  LibraryFilters,
  LibraryListResponse,
  LibrarySetDetail,
  PublishSetPayload,
  PublishResponse,
  ImportResponse,
  CheckPublishedResponse,
  ToggleLikeResponse,
  RateResponse,
  LibrarySet,
} from '@/types/library';

const getConnectionString = () => {
  return (
    process.env.POSTGRES_URL ||
    process.env.EXPO_PUBLIC_POSTGRES_URL ||
    process.env.REACT_APP_POSTGRES_URL ||
    process.env.NEXT_PUBLIC_POSTGRES_URL ||
    (globalThis as any)?.POSTGRES_URL ||
    (typeof window !== 'undefined' && (window as any).POSTGRES_URL) ||
    ''
  );
};

const getSql = () => {
  const connStr = getConnectionString();
  if (!connStr) throw new Error('Database connection string not configured');
  return neon(connStr);
};

let _tablesEnsured = false;

async function ensureLibraryTables() {
  if (_tablesEnsured) return;
  const sql = getSql();
  try {
    const result = await sql.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_name = 'library_sets'
      )
    `);
    if (result[0]?.exists) {
      _tablesEnsured = true;
      return;
    }
  } catch {}

  // Create tables if they don't exist
  await sql.query(`CREATE TABLE IF NOT EXISTS library_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    original_set_id UUID,
    title VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50),
    tags TEXT[],
    language_from VARCHAR(10),
    language_to VARCHAR(10),
    cards_count INTEGER DEFAULT 0,
    imports_count INTEGER DEFAULT 0,
    likes_count INTEGER DEFAULT 0,
    rating_sum INTEGER DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'published',
    is_featured BOOLEAN DEFAULT false,
    cover_emoji VARCHAR(10),
    published_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`);
  await sql.query(`CREATE TABLE IF NOT EXISTS library_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    library_set_id UUID NOT NULL REFERENCES library_sets(id) ON DELETE CASCADE,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    hint TEXT,
    order_index INTEGER DEFAULT 0
  )`);
  await sql.query(`CREATE TABLE IF NOT EXISTS library_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    library_set_id UUID NOT NULL REFERENCES library_sets(id) ON DELETE CASCADE,
    imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, library_set_id)
  )`);
  await sql.query(`CREATE TABLE IF NOT EXISTS library_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    library_set_id UUID NOT NULL REFERENCES library_sets(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, library_set_id)
  )`);
  await sql.query(`CREATE TABLE IF NOT EXISTS library_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    library_set_id UUID NOT NULL REFERENCES library_sets(id) ON DELETE CASCADE,
    rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, library_set_id)
  )`);
  await sql.query(`CREATE TABLE IF NOT EXISTS library_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    library_set_id UUID NOT NULL REFERENCES library_sets(id) ON DELETE CASCADE,
    reason VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`);

  // Indexes
  await sql.query(`CREATE INDEX IF NOT EXISTS idx_library_sets_status ON library_sets(status)`);
  await sql.query(`CREATE INDEX IF NOT EXISTS idx_library_sets_category ON library_sets(category)`);
  await sql.query(`CREATE INDEX IF NOT EXISTS idx_library_sets_user_id ON library_sets(user_id)`);
  await sql.query(`CREATE INDEX IF NOT EXISTS idx_library_cards_set ON library_cards(library_set_id)`);
  await sql.query(`CREATE INDEX IF NOT EXISTS idx_library_imports_user ON library_imports(user_id)`);
  await sql.query(`CREATE INDEX IF NOT EXISTS idx_library_likes_user ON library_likes(user_id)`);

  _tablesEnsured = true;
}

class LibraryServiceClass {

  /** Get library sets with filters */
  async getLibrarySets(filters: LibraryFilters, userId?: string): Promise<LibraryListResponse> {
    await ensureLibraryTables();
    const sql = getSql();
    const {
      search,
      category,
      language,
      sort = 'popular',
      cardsMin,
      cardsMax,
      page = 1,
    } = filters;
    const limitNum = 20;
    const offset = (page - 1) * limitNum;

    // Build dynamic query with parameterized values
    const conditions: string[] = [`ls.status = 'published'`];
    const params: any[] = [];
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
      conditions.push(`(SELECT COUNT(*) FROM library_cards lc WHERE lc.library_set_id = ls.id) >= $${paramIndex}`);
      params.push(cardsMin);
      paramIndex++;
    }

    if (cardsMax) {
      conditions.push(`(SELECT COUNT(*) FROM library_cards lc WHERE lc.library_set_id = ls.id) <= $${paramIndex}`);
      params.push(cardsMax);
      paramIndex++;
    }

    if (sort === 'featured') {
      conditions.push(`ls.is_featured = true`);
    }

    const whereClause = conditions.join(' AND ');

    let orderBy: string;
    switch (sort) {
      case 'top_rated':
        orderBy = 'CASE WHEN ls.rating_count > 0 THEN ls.rating_sum::float / ls.rating_count ELSE 0 END DESC, ls.rating_count DESC';
        break;
      case 'newest':
        orderBy = 'ls.published_at DESC';
        break;
      case 'featured':
      case 'popular':
      default:
        orderBy = 'ls.imports_count DESC';
        break;
    }

    let importedSelect: string;
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

    const query = `
      SELECT ls.*,
        COALESCE(u.user_name, u.email) AS author_name,
        CASE WHEN ls.rating_count > 0 THEN ROUND(ls.rating_sum::numeric / ls.rating_count, 1) ELSE NULL END AS average_rating,
        (SELECT COUNT(*) FROM library_cards lc WHERE lc.library_set_id = ls.id)::int AS cards_count
        ${importedSelect}
      FROM library_sets ls
      LEFT JOIN users u ON u.id = ls.user_id
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const rows = await sql.query(query, params);
    const has_more = rows.length > limitNum;
    const sets = has_more ? rows.slice(0, limitNum) : rows;

    return { sets: sets as unknown as LibrarySet[], has_more };
  }

  /** Get single library set detail */
  async getLibrarySetDetail(id: string, userId?: string): Promise<LibrarySetDetail> {
    await ensureLibraryTables();
    const sql = getSql();
    const params: any[] = [id];
    let paramIndex = 2;

    let importedSelect: string;
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

    const setRows = await sql.query(`
      SELECT ls.*,
        COALESCE(u.user_name, u.email) AS author_name,
        CASE WHEN ls.rating_count > 0 THEN ROUND(ls.rating_sum::numeric / ls.rating_count, 1) ELSE NULL END AS average_rating,
        (SELECT COUNT(*) FROM library_cards lc WHERE lc.library_set_id = ls.id)::int AS cards_count
        ${importedSelect}
      FROM library_sets ls
      LEFT JOIN users u ON u.id = ls.user_id
      WHERE ls.id = $1 AND ls.status = 'published'
    `, params);

    if (setRows.length === 0) {
      throw new Error('Set not found');
    }

    const cards = await sql.query(`
      SELECT * FROM library_cards
      WHERE library_set_id = $1
      ORDER BY order_index ASC
      LIMIT 10
    `, [id]);

    return { ...setRows[0], preview_cards: cards } as unknown as LibrarySetDetail;
  }

  /** Publish a personal set to the library */
  async publishSet(userId: string, payload: PublishSetPayload): Promise<PublishResponse> {
    await ensureLibraryTables();
    const sql = getSql();
    const { setId, description, tags, category } = payload;

    // Check set belongs to user
    const setRows = await sql.query(`
      SELECT * FROM card_sets WHERE id = $1 AND user_id = $2
    `, [setId, userId]);
    if (setRows.length === 0) {
      throw new Error('Set not found or access denied');
    }
    const cardSet = setRows[0];

    // Check minimum 5 cards
    const cardCount = await sql.query(`SELECT COUNT(*) as cnt FROM cards WHERE set_id = $1`, [setId]);
    if (parseInt(cardCount[0].cnt, 10) < 5) {
      throw new Error('At least 5 cards are required to publish');
    }

    // Check not already published
    const existing = await sql.query(`
      SELECT id FROM library_sets WHERE original_set_id = $1 AND status = 'published'
    `, [setId]);
    if (existing.length > 0) {
      throw new Error('Set is already published');
    }

    // Create library set
    const libSet = await sql.query(`
      INSERT INTO library_sets (
        user_id, original_set_id, title, description, category, tags,
        language_from, language_to, cards_count, cover_emoji, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'published'
      )
      RETURNING id
    `, [
      userId, setId, cardSet.title,
      description || cardSet.description || null,
      category || cardSet.category || null,
      JSON.stringify(tags || []),
      cardSet.language_from || null, cardSet.language_to || null,
      parseInt(cardCount[0].cnt, 10),
      null,
    ]);

    const librarySetId = libSet[0].id;

    // Copy cards
    const cards = await sql.query(`
      SELECT front, back, example FROM cards WHERE set_id = $1 ORDER BY created_at ASC
    `, [setId]);

    for (let i = 0; i < cards.length; i++) {
      await sql.query(`
        INSERT INTO library_cards (library_set_id, front, back, hint, order_index)
        VALUES ($1, $2, $3, $4, $5)
      `, [librarySetId, cards[i].front, cards[i].back, cards[i].example || null, i]);
    }

    return { librarySetId };
  }

  /** Update published set cards from original */
  async updatePublication(userId: string, librarySetId: string): Promise<{ success: boolean }> {
    const sql = getSql();

    const libSet = await sql.query(`
      SELECT * FROM library_sets WHERE id = $1 AND user_id = $2 AND status = 'published'
    `, [librarySetId, userId]);
    if (libSet.length === 0) {
      throw new Error('Publication not found or access denied');
    }

    const originalSetId = libSet[0].original_set_id;
    if (!originalSetId) {
      throw new Error('Original set reference is missing');
    }

    const cardCount = await sql.query(`SELECT COUNT(*) as cnt FROM cards WHERE set_id = $1`, [originalSetId]);
    if (parseInt(cardCount[0].cnt, 10) < 5) {
      throw new Error('Original set must have at least 5 cards');
    }

    // Delete old library cards
    await sql.query(`DELETE FROM library_cards WHERE library_set_id = $1`, [librarySetId]);

    // Copy fresh cards
    const cards = await sql.query(`
      SELECT front, back, example FROM cards WHERE set_id = $1 ORDER BY created_at ASC
    `, [originalSetId]);

    for (let i = 0; i < cards.length; i++) {
      await sql.query(`
        INSERT INTO library_cards (library_set_id, front, back, hint, order_index)
        VALUES ($1, $2, $3, $4, $5)
      `, [librarySetId, cards[i].front, cards[i].back, cards[i].example || null, i]);
    }

    await sql.query(`UPDATE library_sets SET cards_count = $1 WHERE id = $2`, [cards.length, librarySetId]);

    return { success: true };
  }

  /** Unpublish (archive) a set */
  async unpublishSet(userId: string, librarySetId: string): Promise<{ success: boolean }> {
    const sql = getSql();

    const result = await sql.query(`
      UPDATE library_sets SET status = 'archived'
      WHERE id = $1 AND user_id = $2 AND status = 'published'
      RETURNING id
    `, [librarySetId, userId]);

    if (result.length === 0) {
      throw new Error('Publication not found or access denied');
    }

    return { success: true };
  }

  /** Import a library set into personal collection */
  async importSet(userId: string, librarySetId: string): Promise<ImportResponse> {
    const sql = getSql();

    // Check not already imported
    const existingImport = await sql.query(`
      SELECT id FROM library_imports WHERE user_id = $1 AND library_set_id = $2
    `, [userId, librarySetId]);
    if (existingImport.length > 0) {
      throw new Error('Set already imported');
    }

    // Get library set
    const libSet = await sql.query(`
      SELECT * FROM library_sets WHERE id = $1 AND status = 'published'
    `, [librarySetId]);
    if (libSet.length === 0) {
      throw new Error('Library set not found');
    }
    const set = libSet[0];

    // Create personal card_set
    const newSet = await sql.query(`
      INSERT INTO card_sets (
        user_id, title, description, category,
        language_from, language_to, total_cards
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      userId, set.title + ' (из библиотеки)', set.description || '',
      set.category || 'general', set.language_from || 'en', set.language_to || 'ru',
      set.cards_count,
    ]);
    const newSetId = newSet[0].id;

    // Copy all library_cards → cards
    const libCards = await sql.query(`
      SELECT front, back, hint FROM library_cards
      WHERE library_set_id = $1 ORDER BY order_index ASC
    `, [librarySetId]);

    for (const card of libCards) {
      await sql.query(`
        INSERT INTO cards (set_id, front, back, example)
        VALUES ($1, $2, $3, $4)
      `, [newSetId, card.front, card.back, card.hint || null]);
    }

    // Record import
    await sql.query(`INSERT INTO library_imports (user_id, library_set_id) VALUES ($1, $2)`, [userId, librarySetId]);

    // Increment imports_count
    await sql.query(`UPDATE library_sets SET imports_count = imports_count + 1 WHERE id = $1`, [librarySetId]);

    return { newSetId };
  }

  /** Toggle like on a library set */
  async toggleLike(userId: string, librarySetId: string): Promise<ToggleLikeResponse> {
    const sql = getSql();

    const existing = await sql.query(`
      SELECT id FROM library_likes WHERE user_id = $1 AND library_set_id = $2
    `, [userId, librarySetId]);

    let is_liked: boolean;
    if (existing.length > 0) {
      await sql.query(`DELETE FROM library_likes WHERE user_id = $1 AND library_set_id = $2`, [userId, librarySetId]);
      await sql.query(`UPDATE library_sets SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = $1`, [librarySetId]);
      is_liked = false;
    } else {
      await sql.query(`INSERT INTO library_likes (user_id, library_set_id) VALUES ($1, $2)`, [userId, librarySetId]);
      await sql.query(`UPDATE library_sets SET likes_count = likes_count + 1 WHERE id = $1`, [librarySetId]);
      is_liked = true;
    }

    const updated = await sql.query(`SELECT likes_count FROM library_sets WHERE id = $1`, [librarySetId]);
    const likes_count = updated.length > 0 ? updated[0].likes_count : 0;

    return { is_liked, likes_count };
  }

  /** Rate a library set (1-5) */
  async rateSet(userId: string, librarySetId: string, rating: number): Promise<RateResponse> {
    const sql = getSql();

    const ratingNum = Math.max(1, Math.min(5, Math.round(rating)));

    const existing = await sql.query(`
      SELECT id, rating FROM library_ratings
      WHERE user_id = $1 AND library_set_id = $2
    `, [userId, librarySetId]);

    if (existing.length > 0) {
      const oldRating = existing[0].rating;
      await sql.query(`
        UPDATE library_ratings SET rating = $1
        WHERE user_id = $2 AND library_set_id = $3
      `, [ratingNum, userId, librarySetId]);
      await sql.query(`
        UPDATE library_sets
        SET rating_sum = rating_sum - $1 + $2
        WHERE id = $3
      `, [oldRating, ratingNum, librarySetId]);
    } else {
      await sql.query(`
        INSERT INTO library_ratings (user_id, library_set_id, rating)
        VALUES ($1, $2, $3)
      `, [userId, librarySetId, ratingNum]);
      await sql.query(`
        UPDATE library_sets
        SET rating_sum = rating_sum + $1, rating_count = rating_count + 1
        WHERE id = $2
      `, [ratingNum, librarySetId]);
    }

    const updated = await sql.query(`
      SELECT rating_sum, rating_count FROM library_sets WHERE id = $1
    `, [librarySetId]);

    const { rating_sum, rating_count } = updated[0];
    const average_rating = rating_count > 0
      ? Math.round((rating_sum / rating_count) * 10) / 10
      : 0;

    return { user_rating: ratingNum, average_rating, rating_count };
  }

  /** Report a library set */
  async reportSet(userId: string, librarySetId: string, reason: string): Promise<{ success: boolean }> {
    const sql = getSql();
    await sql.query(`
      INSERT INTO library_reports (user_id, library_set_id, reason)
      VALUES ($1, $2, $3)
    `, [userId, librarySetId, reason || null]);
    return { success: true };
  }

  /** Get user's own publications */
  async getMyPublications(userId: string): Promise<LibrarySet[]> {
    const sql = getSql();
    const sets = await sql.query(`
      SELECT ls.*,
        CASE WHEN ls.rating_count > 0
          THEN ROUND(ls.rating_sum::numeric / ls.rating_count, 1)
          ELSE NULL
        END AS average_rating,
        (SELECT COUNT(*) FROM library_cards lc WHERE lc.library_set_id = ls.id)::int AS cards_count
      FROM library_sets ls
      WHERE ls.user_id = $1 AND ls.status IN ('published', 'archived')
      ORDER BY ls.published_at DESC
    `, [userId]);
    return sets as unknown as LibrarySet[];
  }

  /** Check if a personal set is published */
  async checkPublished(setId: string, userId: string): Promise<CheckPublishedResponse> {
    const sql = getSql();
    const result = await sql.query(`
      SELECT id FROM library_sets
      WHERE original_set_id = $1 AND user_id = $2 AND status = 'published'
      LIMIT 1
    `, [setId, userId]);

    if (result.length > 0) {
      return { isPublished: true, librarySetId: result[0].id };
    }
    return { isPublished: false };
  }
}

export const LibraryService = new LibraryServiceClass();
