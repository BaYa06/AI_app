/**
 * Каталог библиотеки: предмет → (язык / раздел) → (уровень) → подборка → набор
 * (plan/new/library_catalog.md, Catalog 3). Только чтение; маршруты — в api/library.js:
 *
 * GET /api/library?action=catalog[&lang=en]       предметы, «Продолжить» или «С чего начать», полка учебников
 * GET /api/library?action=subject&subject=<slug>   разделы, уровни и подборки предмета
 * GET /api/library?action=collection&id=<uuid>     наборы подборки по порядку
 * GET /api/library?action=search&q=<текст>         подборки, наборы, учебники с путём
 *
 * Токен необязателен: без него «добавлено» = 0 и нет «Продолжить». «Добавлено» — только личный
 * импорт (library_imports.course_id IS NULL): набор, положенный учителем в курс, — не «мой».
 *
 * Что видно (правила показа, plan «Правила показа»):
 *  - набор — status = 'published' и автор админ (как в остальной библиотеке);
 *  - подборка — status = 'published' и в ней есть хотя бы один видимый набор;
 *  - предмет — is_published и в нём есть видимая подборка;
 *  - разделы и уровни — только те, где есть видимые подборки (считает клиент по списку подборок).
 * Учебники — как в api/books.js: опубликованные; ученику (не учитель и не админ) — только student_visible.
 */
import { HttpError, uuid } from '../../_access.js';

/** Порядок уровней: A1…C2, затем basic → advanced. NULL (нет уровней) — первым. */
const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'basic', 'advanced'];
const SLUG_RE = /^[a-z][a-z0-9_-]{0,40}$/;
const LANG_RE = /^[a-z]{2,3}$/;
const SHELF_LIMIT = 6;
const SEARCH_LIMIT = 6;
const SEARCH_SETS_LIMIT = 8;

const int = (v) => parseInt(v, 10) || 0;

function mapCollection(row) {
  return {
    id: row.id,
    subject: row.subject_slug,
    track: row.track || null,
    trackTitle: row.track_title || null,
    level: row.level || null,
    title: row.title,
    description: row.description || null,
    icon: row.icon || null,
    position: row.position,
    setsCount: int(row.sets_count),
    cardsCount: int(row.cards_count),
    addedCount: int(row.added_count),
  };
}

function mapBook(row) {
  return {
    id: row.id,
    title: row.title,
    edition: row.edition || '',
    level: row.level || null,
    subject: row.subject || null,
    languageFrom: row.language_from,
    languageTo: row.language_to,
    publisher: row.publisher || null,
    unitsCount: int(row.units_count),
  };
}

/** Видит ли пользователь все опубликованные книги (учитель, админ) или только student_visible. */
async function seesAllBooks(sql, me) {
  if (!me) return false;
  const rows = await sql`SELECT is_admin, teacher FROM users WHERE id = ${me}::uuid`;
  return rows[0]?.is_admin === true || rows[0]?.teacher === true;
}

/** Видимые подборки с числами. Фильтры необязательны: NULL — без фильтра. */
async function loadCollections(sql, me, { subject = null, collectionId = null, ids = null } = {}) {
  return sql`
    SELECT c.id, s.slug AS subject_slug, c.track, t.title AS track_title, c.level, c.title,
           c.description, c.icon, c.position,
           COUNT(ls.id) AS sets_count,
           COALESCE(SUM(ls.cards_count), 0) AS cards_count,
           COUNT(ls.id) FILTER (WHERE EXISTS (
             SELECT 1 FROM library_imports li
              WHERE li.library_set_id = ls.id AND li.user_id = ${me}::uuid AND li.course_id IS NULL
           )) AS added_count
      FROM library_collections c
      JOIN library_subjects s ON s.id = c.subject_id AND s.is_published
      JOIN library_sets ls ON ls.collection_id = c.id AND ls.status = 'published'
      JOIN users au ON au.id = ls.user_id AND au.is_admin = true
      LEFT JOIN library_tracks t ON t.subject_id = c.subject_id AND t.key = c.track
     WHERE c.status = 'published'
       AND (${subject}::text IS NULL OR s.slug = ${subject}::text)
       AND (${collectionId}::uuid IS NULL OR c.id = ${collectionId}::uuid)
       AND (${ids}::uuid[] IS NULL OR c.id = ANY(${ids}::uuid[]))
     GROUP BY c.id, s.slug, s.position, t.title, t.position
     ORDER BY s.position, COALESCE(t.position, 0), c.track,
              array_position(${LEVEL_ORDER}::text[], c.level) NULLS FIRST, c.position, c.title
  `;
}

/** Видимые наборы подборки по порядку, с отметкой «добавлен». */
async function loadCollectionSets(sql, me, collectionId) {
  return sql`
    SELECT ls.id, ls.title, ls.description, ls.position, ls.cards_count,
           EXISTS (SELECT 1 FROM library_imports li
                    WHERE li.library_set_id = ls.id AND li.user_id = ${me}::uuid AND li.course_id IS NULL
                  ) AS is_imported
      FROM library_sets ls
      JOIN users au ON au.id = ls.user_id AND au.is_admin = true
     WHERE ls.collection_id = ${collectionId}::uuid AND ls.status = 'published'
     ORDER BY ls.position, ls.title
  `;
}

const mapSet = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description || null,
  position: row.position,
  cardsCount: int(row.cards_count),
  isImported: row.is_imported === true,
});

// ── action=catalog ───────────────────────────────────────────────────────────

/**
 * «Продолжить»: подборки, куда я последним добавлял набор, по убыванию времени; берём первую,
 * где остался недобавленный набор. Если я ничего не добавлял — «С чего начать».
 */
async function continueOrStart(sql, me, lang) {
  if (me) {
    const recent = await sql`
      SELECT ls.collection_id AS id, MAX(li.imported_at) AS last
        FROM library_imports li
        JOIN library_sets ls ON ls.id = li.library_set_id AND ls.collection_id IS NOT NULL
       WHERE li.user_id = ${me}::uuid AND li.course_id IS NULL
       GROUP BY ls.collection_id
       ORDER BY last DESC
       LIMIT 20
    `;
    if (recent.length > 0) {
      const ids = recent.map((r) => r.id);
      const cols = await loadCollections(sql, me, { ids });
      const byId = new Map(cols.map((c) => [c.id, c]));
      for (const { id } of recent) {
        const col = byId.get(id);
        if (!col || int(col.added_count) >= int(col.sets_count)) continue;
        const sets = await loadCollectionSets(sql, me, id);
        const next = sets.find((s) => s.is_imported !== true);
        if (next)
          return { continue: { collection: mapCollection(col), next: mapSet(next) }, start: null };
      }
      // Всё начатое добавлено целиком — блока нет.
      return { continue: null, start: null };
    }
  }

  // Новичок: первая подборка самого простого уровня на языке, который он учит.
  let language = LANG_RE.test(lang || '') ? lang : null;
  if (!language && me) {
    const rows = await sql`SELECT target_languages FROM users WHERE id = ${me}::uuid`;
    const first = rows[0]?.target_languages?.[0];
    if (typeof first === 'string' && LANG_RE.test(first)) language = first;
  }
  // Язык не известен — английский: с него начинает большинство.
  if (!language) language = 'en';
  const rows = await sql`
    SELECT c.id
      FROM library_collections c
      JOIN library_subjects s ON s.id = c.subject_id AND s.is_published
     WHERE c.status = 'published'
       AND EXISTS (SELECT 1 FROM library_sets ls JOIN users au ON au.id = ls.user_id AND au.is_admin = true
                    WHERE ls.collection_id = c.id AND ls.status = 'published')
     ORDER BY COALESCE(s.set_kind = 'language' AND c.track = ${language}::text, false) DESC,
              (s.set_kind = 'language') DESC, s.position,
              array_position(${LEVEL_ORDER}::text[], c.level) NULLS FIRST, c.position
     LIMIT 1
  `;
  if (rows.length === 0) return { continue: null, start: null };
  const [col] = await loadCollections(sql, me, { collectionId: rows[0].id });
  return { continue: null, start: col ? mapCollection(col) : null };
}

async function loadShelf(sql, allBooks, { q = null, limit = SHELF_LIMIT } = {}) {
  return sql`
    SELECT b.id, b.title, b.edition, b.level, b.subject, b.language_from, b.language_to, b.publisher,
           (SELECT COUNT(*) FROM book_units u WHERE u.book_id = b.id) AS units_count
      FROM books b
     WHERE b.is_published = true
       AND (${allBooks}::boolean OR b.student_visible = true)
       AND (${q}::text IS NULL
            OR b.title ILIKE ${q}::text ESCAPE '\\'
            OR EXISTS (SELECT 1 FROM book_units u WHERE u.book_id = b.id AND u.title ILIKE ${q}::text ESCAPE '\\'))
     ORDER BY b.subject NULLS LAST, b.level NULLS LAST, b.title, b.edition
     LIMIT ${limit}
  `;
}

export async function getCatalog(req, res, sql, me) {
  const lang = typeof req.query.lang === 'string' ? req.query.lang.trim().toLowerCase() : null;
  const [subjects, entry, allBooks] = await Promise.all([
    sql`
      SELECT s.slug, s.title, s.subtitle, s.icon, COUNT(DISTINCT c.id) AS collections_count
        FROM library_subjects s
        JOIN library_collections c ON c.subject_id = s.id AND c.status = 'published'
       WHERE s.is_published
         AND EXISTS (SELECT 1 FROM library_sets ls JOIN users au ON au.id = ls.user_id AND au.is_admin = true
                      WHERE ls.collection_id = c.id AND ls.status = 'published')
       GROUP BY s.id
       ORDER BY s.position, s.title
    `,
    continueOrStart(sql, me, lang),
    seesAllBooks(sql, me),
  ]);
  const books = await loadShelf(sql, allBooks);
  return res.status(200).json({
    ok: true,
    subjects: subjects.map((s) => ({
      slug: s.slug,
      title: s.title,
      subtitle: s.subtitle || null,
      icon: s.icon || null,
      collectionsCount: int(s.collections_count),
    })),
    continue: entry.continue,
    start: entry.start,
    books: books.map(mapBook),
  });
}

// ── action=subject ───────────────────────────────────────────────────────────

export async function getSubject(req, res, sql, me) {
  const slug = typeof req.query.subject === 'string' ? req.query.subject.trim().toLowerCase() : '';
  if (!SLUG_RE.test(slug)) throw new HttpError(400, 'subject must be a slug');
  const subjects = await sql`
    SELECT slug, title, subtitle, icon, track_label, level_scale, set_kind
      FROM library_subjects WHERE slug = ${slug} AND is_published
  `;
  if (subjects.length === 0) throw new HttpError(404, 'Subject not found');
  const s = subjects[0];
  const collections = (await loadCollections(sql, me, { subject: slug })).map(mapCollection);
  // Предмет без видимых подборок скрыт и на плитках — отвечаем так же, как на несуществующий.
  if (collections.length === 0) throw new HttpError(404, 'Subject not found');

  // Разделы и уровни — только непустые. Порядок разделов — как у подборок (по library_tracks.position).
  const tracks = [];
  for (const c of collections) {
    let t = tracks.find((x) => x.key === c.track);
    if (!t) {
      t = { key: c.track, title: c.trackTitle, levels: [] };
      tracks.push(t);
    }
    if (c.level && !t.levels.includes(c.level)) t.levels.push(c.level);
  }
  for (const t of tracks) t.levels.sort((a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b));

  return res.status(200).json({
    ok: true,
    subject: {
      slug: s.slug,
      title: s.title,
      subtitle: s.subtitle || null,
      icon: s.icon || null,
      trackLabel: s.track_label || null,
      levelScale: s.level_scale || null,
      setKind: s.set_kind,
    },
    tracks,
    collections,
  });
}

// ── action=collection ────────────────────────────────────────────────────────

export async function getCollection(req, res, sql, me) {
  const id = uuid(req.query.id, 'id');
  const [col] = await loadCollections(sql, me, { collectionId: id });
  if (!col) throw new HttpError(404, 'Collection not found');
  const subject = await sql`
    SELECT s.title, s.set_kind, s.level_scale FROM library_subjects s WHERE s.slug = ${col.subject_slug}
  `;
  const sets = (await loadCollectionSets(sql, me, id)).map(mapSet);
  return res.status(200).json({
    ok: true,
    collection: {
      ...mapCollection(col),
      subjectTitle: subject[0]?.title || null,
      setKind: subject[0]?.set_kind || null,
      levelScale: subject[0]?.level_scale || null,
    },
    sets,
  });
}

// ── action=search ────────────────────────────────────────────────────────────

/** Подстрока для ILIKE: % _ \ из запроса — буквально. */
function likePattern(q) {
  return `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

export async function searchCatalog(req, res, sql, me) {
  const raw = typeof req.query.q === 'string' ? req.query.q.trim().replace(/\s+/g, ' ') : '';
  if (raw.length < 2)
    return res.status(200).json({ ok: true, collections: [], sets: [], books: [] });
  const q = likePattern(raw.slice(0, 100));

  const [colRows, setRows, allBooks] = await Promise.all([
    sql`
      SELECT c.id FROM library_collections c
       WHERE c.status = 'published' AND c.title ILIKE ${q} ESCAPE '\\'
       ORDER BY c.title LIMIT 50
    `,
    // Набор без подборки (старый) виден в поиске; набор в неопубликованной подборке — нет.
    sql`
      SELECT ls.id, ls.title, ls.description, ls.position, ls.cards_count, ls.collection_id,
             EXISTS (SELECT 1 FROM library_imports li
                      WHERE li.library_set_id = ls.id AND li.user_id = ${me}::uuid AND li.course_id IS NULL
                    ) AS is_imported
        FROM library_sets ls
        JOIN users au ON au.id = ls.user_id AND au.is_admin = true
        LEFT JOIN library_collections c ON c.id = ls.collection_id
       WHERE ls.status = 'published' AND ls.title ILIKE ${q} ESCAPE '\\'
         AND (ls.collection_id IS NULL OR c.status = 'published')
       ORDER BY ls.title LIMIT ${SEARCH_SETS_LIMIT}
    `,
    seesAllBooks(sql, me),
  ]);

  // Подборки — через loadCollections: так в поиск не попадут пустые и с числами всё сходится.
  const ids = [
    ...new Set([
      ...colRows.map((r) => r.id),
      ...setRows.map((r) => r.collection_id).filter(Boolean),
    ]),
  ];
  const cols = ids.length > 0 ? (await loadCollections(sql, me, { ids })).map(mapCollection) : [];
  const colById = new Map(cols.map((c) => [c.id, c]));
  const matched = new Set(colRows.map((r) => r.id));
  const books = await loadShelf(sql, allBooks, { q, limit: SEARCH_LIMIT });

  return res.status(200).json({
    ok: true,
    collections: cols.filter((c) => matched.has(c.id)).slice(0, SEARCH_LIMIT),
    sets: setRows
      .filter((r) => !r.collection_id || colById.has(r.collection_id))
      .map((r) => ({
        ...mapSet(r),
        collection: r.collection_id ? colById.get(r.collection_id) : null,
      })),
    books: books.map(mapBook),
  });
}
