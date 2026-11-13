import { neon } from '@neondatabase/serverless';
import { ensureDatabaseInitialized } from './_db-init.js';
import { getAuthedUserId } from './_auth.js';
import { log } from './_log.js';
import { HttpError } from './_access.js';
import {
  getCatalog,
  getCollection,
  getSubject,
  searchCatalog,
} from './_handlers/library/catalog.js';

/**
 * Consolidated Library API
 * Handles all library operations via ?action= parameter.
 *
 * GET  /api/library                         – list sets
 * GET  /api/library?id=xxx                  – set detail
 * GET  /api/library?action=my-publications  – user's publications
 * GET  /api/library?action=check-published  – check if set is published (+ canPublish)
 * GET  /api/library?action=can-publish      – может ли пользователь публиковать (только админ)
 * POST /api/library?action=publish          – publish a set
 * PUT  /api/library?action=publish          – update a publication
 * DELETE /api/library?action=publish        – unpublish a set
 * POST /api/library?action=like             – ничего не пишет, текущее состояние (для старых версий)
 * POST /api/library?action=rate             – ничего не пишет, текущее состояние (для старых версий)
 * POST /api/library?action=report           – report a set
 * POST /api/library?action=import           – import a set { librarySetId, courseId? } (JWT; курс — только свой;
 *                                             один раз себе и один раз в каждый курс)
 * POST /api/library?action=import-collection – вся подборка в свой курс { collectionId, courseId } (JWT)
 * GET  /api/library?action=cards&id=xxx      – все карточки опубликованного набора
 *
 * Каталог (plan/new/library_catalog.md, Catalog 3; api/_handlers/library/catalog.js), токен необязателен:
 * GET  /api/library?action=catalog[&lang=en]  – предметы, «Продолжить» / «С чего начать», полка учебников
 * GET  /api/library?action=subject&subject=slug – разделы, уровни, подборки предмета
 * GET  /api/library?action=collection&id=xxx – наборы подборки по порядку
 * GET  /api/library?action=search&q=текст    – подборки, наборы, учебники
 *
 * userId — только из Supabase JWT: мутации и «мои» запросы требуют токен, в списке/деталях
 * токен необязателен (без него флаги is_imported/is_liked = false). is_imported — только личный импорт,
 * не «положил в курс» (Catalog 4).
 *
 * Публикуют только админы (users.is_admin), plan/done/community_library.md: весь контент библиотеки —
 * от команды, поэтому App Review 1.2 (модерация пользовательского контента) не применяется.
 * Чужие наборы видны, только если автор — админ; автор показывается как «Flashly».
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

const MUTATION_ACTIONS = new Set([
  'like',
  'rate',
  'report',
  'import',
  'import-collection',
  'publish',
]);

const OWN_READ_ACTIONS = new Set(['my-publications', 'check-published', 'can-publish']);

const CATALOG_ROUTES = {
  catalog: getCatalog,
  subject: getSubject,
  collection: getCollection,
  search: searchCatalog,
};

// Набор виден другим, только если его опубликовал админ.
const ADMIN_AUTHOR = `EXISTS (SELECT 1 FROM users au WHERE au.id = ls.user_id AND au.is_admin = true)`;
const TEAM_AUTHOR_NAME = 'Flashly';

async function isAdmin(sql, userId) {
  if (!userId) return false;
  const rows = await sql`SELECT is_admin FROM users WHERE id = ${userId}::uuid`;
  return rows[0]?.is_admin === true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action, id } = req.query;

  // userId никогда не берётся из запроса — только из Supabase JWT, иначе любой мог бы
  // лайкать/импортировать/публиковать от имени другого пользователя или смотреть его публикации.
  const authedUserId = await getAuthedUserId(req);
  if ((MUTATION_ACTIONS.has(action) || OWN_READ_ACTIONS.has(action)) && !authedUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.body = { ...(req.body || {}), userId: authedUserId };
  req.query = { ...req.query, userId: authedUserId || undefined };
  const userId = authedUserId;
  for (const key of ['librarySetId', 'setId']) {
    const value = req.body[key] ?? req.query[key];
    if (value !== undefined && value !== null && !isUuid(value)) {
      return res.status(400).json({ error: `${key} must be a uuid` });
    }
  }
  if (id !== undefined && !isUuid(id)) return res.status(400).json({ error: 'id must be a uuid' });

  const sql = neon(process.env.POSTGRES_URL);
  await ensureDatabaseInitialized(sql);

  try {
    // Публиковать и обновлять публикацию может только админ; снять свою — любой автор.
    const isPublishWrite = action === 'publish' && (req.method === 'POST' || req.method === 'PUT');
    if (isPublishWrite && !(await isAdmin(sql, userId))) {
      return res.status(403).json({ error: 'admins_only' });
    }

    // ── Action-based routing (sub-endpoints consolidated here) ──────────────
    if (action === 'my-publications') return await getMyPublications(req, res, sql);
    if (action === 'check-published') return await checkPublished(req, res, sql);
    if (action === 'can-publish') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      return res.status(200).json({ canPublish: await isAdmin(sql, userId) });
    }
    if (action === 'like') return await toggleLike(req, res, sql);
    if (action === 'rate') return await rateSet(req, res, sql);
    if (action === 'report') return await reportSet(req, res, sql);
    if (action === 'import') return await importSet(req, res, sql);
    if (action === 'import-collection') return await importCollection(req, res, sql);
    if (action === 'cards') return await getLibraryCards(req, res, sql, id);
    const catalogRoute = CATALOG_ROUTES[action];
    if (catalogRoute) {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      return await catalogRoute(req, res, sql, userId);
    }
    if (action === 'publish') {
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
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    log.error('library', 'Library API error', error);
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
    curatedOnly,
  } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  // Build dynamic query with parameterized values
  const conditions = [`ls.status = 'published'`, ADMIN_AUTHOR];
  const params = [];
  let paramIndex = 1;

  // curatedOnly шлют только старые сборки (до отказа от фильтра «подборки» на главной библиотеки).
  if (curatedOnly === 'true') {
    conditions.push(`ls.is_featured = true`);
  }

  // Поиск по @нику автора убран: все наборы от команды, автор показывается как «Flashly».
  const searchText = typeof search === 'string' ? search.replace(/^@/, '').trim() : '';
  if (searchText) {
    conditions.push(`(ls.title ILIKE $${paramIndex} OR ls.description ILIKE $${paramIndex})`);
    params.push(`%${searchText}%`);
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
    conditions.push(
      `(SELECT COUNT(*) FROM library_cards lc WHERE lc.library_set_id = ls.id) >= $${paramIndex}`
    );
    params.push(parseInt(cardsMin, 10));
    paramIndex++;
  }

  if (cardsMax) {
    conditions.push(
      `(SELECT COUNT(*) FROM library_cards lc WHERE lc.library_set_id = ls.id) <= $${paramIndex}`
    );
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
      orderBy =
        'CASE WHEN ls.rating_count > 0 THEN ls.rating_sum::float / ls.rating_count ELSE 0 END DESC, ls.rating_count DESC';
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
    importedSelect = `, EXISTS(SELECT 1 FROM library_imports li WHERE li.library_set_id = ls.id AND li.user_id = ${uidParam} AND li.course_id IS NULL) AS is_imported,
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
      '${TEAM_AUTHOR_NAME}' AS author_name,
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
    importedSelect = `, EXISTS(SELECT 1 FROM library_imports li WHERE li.library_set_id = ls.id AND li.user_id = ${uidParam} AND li.course_id IS NULL) AS is_imported,
       EXISTS(SELECT 1 FROM library_likes ll WHERE ll.library_set_id = ls.id AND ll.user_id = ${uidParam}) AS is_liked,
       (SELECT rating FROM library_ratings lr WHERE lr.library_set_id = ls.id AND lr.user_id = ${uidParam}) AS user_rating`;
  } else {
    importedSelect = `, false AS is_imported, false AS is_liked, NULL::smallint AS user_rating`;
  }

  const setRows = await sql.query(
    `
    SELECT ls.*,
      '${TEAM_AUTHOR_NAME}' AS author_name,
      CASE WHEN ls.rating_count > 0 THEN ROUND(ls.rating_sum::numeric / ls.rating_count, 1) ELSE NULL END AS average_rating,
      (SELECT COUNT(*) FROM library_cards lc WHERE lc.library_set_id = ls.id)::int AS cards_count
      ${importedSelect}
    FROM library_sets ls
    LEFT JOIN users u ON u.id = ls.user_id
    WHERE ls.id = $1 AND ls.status = 'published' AND ${ADMIN_AUTHOR}
  `,
    params
  );

  if (setRows.length === 0) {
    return res.status(404).json({ error: 'Set not found' });
  }

  // Get preview cards (first 10)
  const cards = await sql.query(
    `
    SELECT * FROM library_cards
    WHERE library_set_id = $1
    ORDER BY order_index ASC
    LIMIT 10
  `,
    [id]
  );

  const detail = { ...setRows[0], preview_cards: cards };
  return res.status(200).json(detail);
}

// ── action=cards ─────────────────────────────────────────────────────────────
// Все карточки опубликованного набора (гостевой импорт на устройство).
async function getLibraryCards(req, res, sql, id) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!id) return res.status(400).json({ error: 'id is required' });
  const cards = await sql`
    SELECT lc.front, lc.back, lc.hint
    FROM library_cards lc
    JOIN library_sets ls ON ls.id = lc.library_set_id AND ls.status = 'published'
    JOIN users au ON au.id = ls.user_id AND au.is_admin = true
    WHERE lc.library_set_id = ${id}::uuid
    ORDER BY lc.order_index ASC
  `;
  return res.status(200).json(cards);
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
      END AS average_rating,
      (SELECT COUNT(*) FROM library_cards lc WHERE lc.library_set_id = ls.id)::int AS cards_count
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

  const [result, canPublish] = await Promise.all([
    sql`
      SELECT id FROM library_sets
      WHERE original_set_id = ${setId} AND user_id = ${userId} AND status = 'published'
      LIMIT 1
    `,
    isAdmin(sql, userId),
  ]);
  if (result.length > 0) {
    return res.status(200).json({ isPublished: true, librarySetId: result[0].id, canPublish });
  }
  return res.status(200).json({ isPublished: false, canPublish });
}

// ── action=like / action=rate ─────────────────────────────────────────────────
// Лайки и оценки убраны (plan/new/library_catalog.md, решение 8): каталог ведёт команда.
// Старые версии приложения ещё вызывают эти action — отвечаем в прежнем формате текущим
// состоянием и ничего не записываем. Таблицы удаляются, когда сменится минимальная версия.
async function toggleLike(req, res, sql) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { userId, librarySetId } = req.body;
  if (!userId || !librarySetId)
    return res.status(400).json({ error: 'userId and librarySetId are required' });

  const rows = await sql`
    SELECT ls.likes_count,
           EXISTS (SELECT 1 FROM library_likes l
                    WHERE l.user_id = ${userId}::uuid AND l.library_set_id = ls.id) AS is_liked
      FROM library_sets ls WHERE ls.id = ${librarySetId}::uuid
  `;
  return res
    .status(200)
    .json({ is_liked: rows[0]?.is_liked === true, likes_count: rows[0]?.likes_count ?? 0 });
}

async function rateSet(req, res, sql) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { userId, librarySetId, rating } = req.body;
  if (!userId || !librarySetId || !rating)
    return res.status(400).json({ error: 'userId, librarySetId, and rating are required' });

  const ratingNum = parseInt(rating, 10);
  if (!(ratingNum >= 1 && ratingNum <= 5))
    return res.status(400).json({ error: 'Rating must be between 1 and 5' });

  const rows = await sql`
    SELECT ls.rating_sum, ls.rating_count,
           (SELECT r.rating FROM library_ratings r
             WHERE r.user_id = ${userId}::uuid AND r.library_set_id = ls.id) AS user_rating
      FROM library_sets ls WHERE ls.id = ${librarySetId}::uuid
  `;
  const row = rows[0] || { rating_sum: 0, rating_count: 0, user_rating: null };
  const average_rating =
    row.rating_count > 0 ? Math.round((row.rating_sum / row.rating_count) * 10) / 10 : null;
  return res.status(200).json({
    user_rating: row.user_rating ?? null,
    average_rating,
    rating_count: row.rating_count,
  });
}

// ── action=report ─────────────────────────────────────────────────────────────
async function reportSet(req, res, sql) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { userId, librarySetId, reason } = req.body;
  if (!userId || !librarySetId)
    return res.status(400).json({ error: 'userId and librarySetId are required' });

  await sql`INSERT INTO library_reports (user_id, library_set_id, reason) VALUES (${userId}, ${librarySetId}, ${reason || null})`;
  return res.status(201).json({ success: true });
}

// ── action=import / action=import-collection ─────────────────────────────────

/** Курс принадлежит пользователю: набор можно положить только в свой курс (не туда, где ты ученик). */
async function ownsCourse(sql, userId, courseId) {
  const rows =
    await sql`SELECT 1 FROM courses WHERE id = ${courseId}::uuid AND user_id = ${userId}::uuid`;
  return rows.length > 0;
}

/**
 * Один запрос (атомарно): копия набора + карточек (порядок из библиотеки → sort_order) +
 * отметка об импорте (с курсом и копией) + счётчик. Возвращает запрос, не выполняя его, — так его
 * можно и выполнить сразу, и сложить в sql.transaction для целой подборки.
 *
 * Отметка: card_set_id → копия с ON DELETE CASCADE (удалил копию — набор снова «не добавлен»).
 * Двойной тап упрётся в уникальность (user, набор, курс), и весь запрос откатится — дубля не будет.
 * Название копии — как в библиотеке, без «(из библиотеки)»: источник записан в library_imports.
 */
function importQuery(sql, userId, set, courseId) {
  return sql`
    WITH new_set AS (
      INSERT INTO card_sets (user_id, course_id, title, description, category, language_from, language_to, kind, origin, total_cards)
      VALUES (${userId}::uuid, ${courseId}::uuid, ${set.title}, ${set.description || ''},
              ${set.category || 'general'}, ${set.language_from || 'en'}, ${set.language_to || 'ru'}, ${set.kind || null}, 'library',
              (SELECT COUNT(*) FROM library_cards WHERE library_set_id = ${set.id}::uuid))
      RETURNING id
    ), copied AS (
      INSERT INTO cards (set_id, front, back, example, sort_order)
      SELECT (SELECT id FROM new_set), lc.front, lc.back, lc.hint, lc.order_index
        FROM library_cards lc WHERE lc.library_set_id = ${set.id}::uuid
      RETURNING 1
    ), recorded AS (
      INSERT INTO library_imports (user_id, library_set_id, course_id, card_set_id)
      VALUES (${userId}::uuid, ${set.id}::uuid, ${courseId}::uuid, (SELECT id FROM new_set))
      RETURNING 1
    ), counted AS (
      UPDATE library_sets SET imports_count = imports_count + 1 WHERE id = ${set.id}::uuid
      RETURNING 1
    )
    SELECT (SELECT id FROM new_set) AS id, (SELECT COUNT(*) FROM copied) AS cards
  `;
}

const isUniqueViolation = (e) => e?.code === '23505';

async function importSet(req, res, sql) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  // userId — из Supabase JWT (подставляется в handler), не из тела запроса.
  const { userId, librarySetId, courseId = null } = req.body;
  if (!isUuid(librarySetId) || (courseId !== null && !isUuid(courseId))) {
    return res.status(400).json({ error: 'librarySetId required, courseId must be uuid or null' });
  }
  if (courseId && !(await ownsCourse(sql, userId, courseId))) {
    return res.status(403).json({ error: 'Not the owner of the course' });
  }

  // Один раз себе и один раз в каждый свой курс (plan: учитель кладёт набор и себе, и в несколько курсов).
  const existingImport = await sql`
    SELECT id FROM library_imports
     WHERE user_id = ${userId}::uuid AND library_set_id = ${librarySetId}::uuid
       AND course_id IS NOT DISTINCT FROM ${courseId}::uuid
  `;
  if (existingImport.length > 0) return res.status(400).json({ error: 'Set already imported' });

  const libSet = await sql`
    SELECT ls.* FROM library_sets ls
    JOIN users au ON au.id = ls.user_id AND au.is_admin = true
    WHERE ls.id = ${librarySetId} AND ls.status = 'published'
  `;
  if (libSet.length === 0) return res.status(404).json({ error: 'Library set not found' });

  let created;
  try {
    created = await importQuery(sql, userId, libSet[0], courseId);
  } catch (e) {
    if (isUniqueViolation(e)) return res.status(400).json({ error: 'Set already imported' });
    throw e;
  }
  return res
    .status(201)
    .json({ newSetId: created[0].id, courseId, cardsCopied: Number(created[0].cards) || 0 });
}

/**
 * Учитель кладёт в свой курс всю подборку (Catalog 4). Уже положенные в этот курс наборы
 * пропускаются; остальные — одной транзакцией, по порядку подборки. Себе целиком подборку
 * не добавляют: ученик берёт наборы по одному (plan, открытые вопросы).
 */
async function importCollection(req, res, sql) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { userId, collectionId, courseId } = req.body;
  if (!isUuid(collectionId) || !isUuid(courseId)) {
    return res.status(400).json({ error: 'collectionId and courseId must be uuids' });
  }
  if (!(await ownsCourse(sql, userId, courseId))) {
    return res.status(403).json({ error: 'Not the owner of the course' });
  }

  const sets = await sql`
    SELECT ls.*,
           EXISTS (SELECT 1 FROM library_imports li
                    WHERE li.library_set_id = ls.id AND li.user_id = ${userId}::uuid
                      AND li.course_id = ${courseId}::uuid) AS in_course
      FROM library_sets ls
      JOIN users au ON au.id = ls.user_id AND au.is_admin = true
      JOIN library_collections c ON c.id = ls.collection_id AND c.status = 'published'
     WHERE ls.collection_id = ${collectionId}::uuid AND ls.status = 'published'
     ORDER BY ls.position, ls.title
  `;
  if (sets.length === 0) return res.status(404).json({ error: 'Collection not found' });

  const todo = sets.filter((s) => s.in_course !== true);
  let results = [];
  if (todo.length > 0) {
    try {
      results = await sql.transaction(todo.map((s) => importQuery(sql, userId, s, courseId)));
    } catch (e) {
      // Параллельный запрос успел положить набор — повтор пропустит уже положенные.
      if (isUniqueViolation(e))
        return res.status(409).json({ error: 'Retry: some sets were just imported' });
      throw e;
    }
  }
  return res.status(201).json({
    courseId,
    imported: results.map((rows, i) => ({
      librarySetId: todo[i].id,
      newSetId: rows[0].id,
      cardsCopied: Number(rows[0].cards) || 0,
    })),
    skipped: sets.length - todo.length,
  });
}

async function publishSet(req, res, sql) {
  const { userId, setId, description, tags, category, coverEmoji } = req.body;
  if (!userId || !setId) return res.status(400).json({ error: 'userId and setId are required' });

  const setRows = await sql`SELECT * FROM card_sets WHERE id = ${setId} AND user_id = ${userId}`;
  if (setRows.length === 0)
    return res.status(404).json({ error: 'Set not found or access denied' });
  const cardSet = setRows[0];

  const cardCount = await sql`SELECT COUNT(*) as cnt FROM cards WHERE set_id = ${setId}`;
  if (parseInt(cardCount[0].cnt, 10) < 5)
    return res.status(400).json({ error: 'At least 5 cards are required to publish' });

  const existing =
    await sql`SELECT id FROM library_sets WHERE original_set_id = ${setId} AND status = 'published'`;
  if (existing.length > 0) return res.status(400).json({ error: 'Set is already published' });

  const libSet = await sql`
    INSERT INTO library_sets (user_id, original_set_id, title, description, category, tags,
      language_from, language_to, kind, cards_count, cover_emoji, status)
    VALUES (${userId}, ${setId}, ${cardSet.title}, ${description || cardSet.description || null},
            ${category || cardSet.category || null}, ${tags || []},
            ${cardSet.language_from || null}, ${cardSet.language_to || null}, ${cardSet.kind || null},
            ${parseInt(cardCount[0].cnt, 10)}, ${coverEmoji || null}, 'published')
    RETURNING id
  `;
  const librarySetId = libSet[0].id;

  const cards =
    await sql`SELECT front, back, example FROM cards WHERE set_id = ${setId} ORDER BY created_at ASC`;
  if (cards.length > 0) {
    const placeholders = cards
      .map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`)
      .join(', ');
    const params = cards.flatMap((card, i) => [
      librarySetId,
      card.front,
      card.back,
      card.example || null,
      i,
    ]);
    await sql.query(
      `INSERT INTO library_cards (library_set_id, front, back, hint, order_index) VALUES ${placeholders}`,
      params
    );
  }

  return res.status(201).json({ librarySetId });
}

async function updatePublication(req, res, sql) {
  const { userId, librarySetId, description, category, coverEmoji } = req.body;
  if (!userId || !librarySetId)
    return res.status(400).json({ error: 'userId and librarySetId are required' });

  const libSet =
    await sql`SELECT * FROM library_sets WHERE id = ${librarySetId} AND user_id = ${userId} AND status = 'published'`;
  if (libSet.length === 0)
    return res.status(404).json({ error: 'Publication not found or access denied' });

  const originalSetId = libSet[0].original_set_id;
  if (!originalSetId) return res.status(400).json({ error: 'Original set reference is missing' });

  // Get fresh data from original set
  const setRows = await sql`SELECT * FROM card_sets WHERE id = ${originalSetId}`;
  if (setRows.length === 0) return res.status(404).json({ error: 'Original set not found' });
  const cardSet = setRows[0];

  const cardCount = await sql`SELECT COUNT(*) as cnt FROM cards WHERE set_id = ${originalSetId}`;
  if (parseInt(cardCount[0].cnt, 10) < 5)
    return res.status(400).json({ error: 'Original set must have at least 5 cards' });

  await sql`DELETE FROM library_cards WHERE library_set_id = ${librarySetId}`;

  const cards =
    await sql`SELECT front, back, example FROM cards WHERE set_id = ${originalSetId} ORDER BY created_at ASC`;
  if (cards.length > 0) {
    const placeholders = cards
      .map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`)
      .join(', ');
    const params = cards.flatMap((card, i) => [
      librarySetId,
      card.front,
      card.back,
      card.example || null,
      i,
    ]);
    await sql.query(
      `INSERT INTO library_cards (library_set_id, front, back, hint, order_index) VALUES ${placeholders}`,
      params
    );
  }

  // Update metadata from original set
  await sql`
    UPDATE library_sets
    SET title = ${cardSet.title},
        description = ${description || cardSet.description || null},
        category = ${category || cardSet.category || null},
        language_from = ${cardSet.language_from || null},
        language_to = ${cardSet.language_to || null},
        kind = ${cardSet.kind || null},
        cards_count = ${cards.length},
        cover_emoji = ${coverEmoji || null},
        updated_at = NOW()
    WHERE id = ${librarySetId}
  `;
  return res.status(200).json({ success: true });
}

async function unpublishSet(req, res, sql) {
  const { userId, librarySetId } = req.body;
  if (!userId || !librarySetId)
    return res.status(400).json({ error: 'userId and librarySetId are required' });

  const result = await sql`
    UPDATE library_sets SET status = 'archived'
    WHERE id = ${librarySetId} AND user_id = ${userId} AND status = 'published'
    RETURNING id
  `;
  if (result.length === 0)
    return res.status(404).json({ error: 'Publication not found or access denied' });
  return res.status(200).json({ success: true });
}
