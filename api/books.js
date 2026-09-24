import { neon } from '@neondatabase/serverless';
import { getAuthedUserId } from './_auth.js';

/**
 * API каталога книг (Книга → Юнит → официальный набор) и планов юнитов курса.
 * План: plan/book_catalog_plan.md, часть 3.
 *
 * Как и api/teacher.js, проверяет Supabase JWT (Authorization: Bearer <access_token>) и сам
 * определяет userId из токена — тело/query запроса на userId не полагается.
 * Книги загружаются только скриптом scripts/import-book.ts — здесь записи в books/book_units/
 * официальные наборы нет (их к тому же защищает триггер из миграции 018).
 *
 * GET  /api/books?action=list-books          ?subject=&level=&q=   опубликованные книги (админ видит и черновики)
 * GET  /api/books?action=book-detail         ?bookId=              юниты + официальные наборы + мои курсы с этой книгой
 * POST /api/books?action=attach-to-courses   { bookId, courseIds } подключить книгу к своим курсам
 * POST /api/books?action=detach-from-course  { bookId, courseId }  отключить книгу от своего курса
 * GET  /api/books?action=course-plan         ?courseId=            книги курса и юниты; ученику — только открытые
 * POST /api/books?action=set-unit-open       { courseId, unitId, isOpen }
 * POST /api/books?action=fork-set            { setId, courseId? }  копия официального набора в свой обычный набор
 * GET  /api/books?action=official-sets       ?setIds=a,b           официальные наборы + карточки с моим прогрессом:
 *                                                                   запрошенные + открытые в моих курсах (я учитель
 *                                                                   или ученик) + те, что я уже начинал учить
 *
 * План юнитов: строка в course_units есть только у юнитов, которые хоть раз переключали.
 * Нет строки = юнит закрыт. Поэтому юниты, добавленные в книгу позже, в уже подключённых
 * курсах автоматически появляются закрытыми.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const userId = await getAuthedUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized', reason: 'unauthorized' });
  }

  const sql = neon(process.env.POSTGRES_URL);
  const { action } = req.query;

  const GET_ACTIONS = new Set(['list-books', 'book-detail', 'course-plan', 'official-sets']);
  const POST_ACTIONS = new Set(['attach-to-courses', 'detach-from-course', 'set-unit-open', 'fork-set']);
  if (GET_ACTIONS.has(action) && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (POST_ACTIONS.has(action) && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (action === 'list-books')         return await listBooks(req, res, sql, userId);
    if (action === 'book-detail')        return await bookDetail(req, res, sql, userId);
    if (action === 'attach-to-courses')  return await attachToCourses(req, res, sql, userId);
    if (action === 'detach-from-course') return await detachFromCourse(req, res, sql, userId);
    if (action === 'course-plan')        return await coursePlan(req, res, sql, userId);
    if (action === 'set-unit-open')      return await setUnitOpen(req, res, sql, userId);
    if (action === 'fork-set')           return await forkSet(req, res, sql, userId);
    if (action === 'official-sets')      return await officialSets(req, res, sql, userId);

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.error('Books API error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// ─── Общее ──────────────────────────────────────────────────

async function isAdmin(sql, userId) {
  const rows = await sql`SELECT is_admin FROM users WHERE id = ${userId}::uuid`;
  return rows[0]?.is_admin === true;
}

/** Книга, видимая вызывающему: опубликованная, либо любая — для админа. */
async function findVisibleBook(sql, bookId, admin) {
  const rows = await sql`
    SELECT id, title, edition, level, subject, language_from, language_to, publisher, is_published
    FROM books WHERE id = ${bookId}::uuid AND (is_published = true OR ${admin}::boolean)
  `;
  return rows[0] || null;
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
    isPublished: row.is_published === true,
  };
}

// ─── Каталог ────────────────────────────────────────────────

async function listBooks(req, res, sql, userId) {
  const subject = (req.query.subject || '').trim() || null;
  const level = (req.query.level || '').trim() || null;
  const q = (req.query.q || '').trim().slice(0, 100) || null;
  const admin = await isAdmin(sql, userId);

  const rows = await sql`
    SELECT b.id, b.title, b.edition, b.level, b.subject, b.language_from, b.language_to,
           b.publisher, b.is_published,
           (SELECT COUNT(*) FROM book_units u WHERE u.book_id = b.id) AS units_count,
           (SELECT COUNT(*) FROM book_units u
              JOIN card_sets cs ON cs.unit_id = u.id AND cs.is_official
              JOIN cards c ON c.set_id = cs.id
             WHERE u.book_id = b.id) AS cards_count
    FROM books b
    WHERE (b.is_published = true OR ${admin}::boolean)
      AND (${subject}::text IS NULL OR lower(b.subject) = lower(${subject}::text))
      AND (${level}::text IS NULL OR lower(b.level) = lower(${level}::text))
      AND (${q}::text IS NULL OR b.title ILIKE '%' || ${q}::text || '%' OR b.publisher ILIKE '%' || ${q}::text || '%')
    ORDER BY b.subject NULLS LAST, b.level NULLS LAST, b.title, b.edition
    LIMIT 200
  `;

  return res.status(200).json({
    ok: true,
    books: rows.map((row) => ({
      ...mapBook(row),
      unitsCount: parseInt(row.units_count, 10) || 0,
      cardsCount: parseInt(row.cards_count, 10) || 0,
    })),
  });
}

async function bookDetail(req, res, sql, userId) {
  const { bookId } = req.query;
  if (!isUuid(bookId)) return res.status(400).json({ error: 'bookId required' });

  const admin = await isAdmin(sql, userId);
  const book = await findVisibleBook(sql, bookId, admin);
  if (!book) return res.status(404).json({ error: 'Book not found' });

  // На старте 1 юнит = 1 набор, но отдаём массив — схема допускает несколько наборов в юните.
  const units = await sql`
    SELECT u.id, u.number, u.title, u.pages,
           COALESCE(json_agg(json_build_object(
             'id', cs.id, 'title', cs.title, 'totalCards',
             (SELECT COUNT(*) FROM cards c WHERE c.set_id = cs.id)
           ) ORDER BY cs.created_at) FILTER (WHERE cs.id IS NOT NULL), '[]') AS sets
    FROM book_units u
    LEFT JOIN card_sets cs ON cs.unit_id = u.id AND cs.is_official
    WHERE u.book_id = ${bookId}::uuid
    GROUP BY u.id
    ORDER BY u.sort_order, u.number
  `;

  // Свои курсы, к которым книга уже подключена — чтобы отметить их в окне «Подключить к курсу».
  const attached = await sql`
    SELECT cb.course_id FROM course_books cb
    JOIN courses c ON c.id = cb.course_id
    WHERE cb.book_id = ${bookId}::uuid AND c.user_id = ${userId}::uuid
  `;

  return res.status(200).json({
    ok: true,
    book: mapBook(book),
    units: units.map((u) => ({
      id: u.id,
      number: u.number,
      title: u.title,
      pages: u.pages || null,
      sets: u.sets.map((s) => ({ id: s.id, title: s.title, totalCards: Number(s.totalCards) || 0 })),
    })),
    attachedCourseIds: attached.map((r) => r.course_id),
  });
}

// ─── Подключение книги к курсам ─────────────────────────────

async function attachToCourses(req, res, sql, userId) {
  const { bookId, courseIds } = req.body || {};
  if (!isUuid(bookId) || !Array.isArray(courseIds) || courseIds.length === 0 || courseIds.length > 50 || !courseIds.every(isUuid)) {
    return res.status(400).json({ error: 'bookId and non-empty courseIds[] required' });
  }
  const uniqueIds = [...new Set(courseIds)];

  const admin = await isAdmin(sql, userId);
  const book = await findVisibleBook(sql, bookId, admin);
  if (!book) return res.status(404).json({ error: 'Book not found' });

  // Все курсы должны принадлежать вызывающему — иначе не подключаем ни один.
  const owned = await sql`
    SELECT id FROM courses WHERE id = ANY(${uniqueIds}::uuid[]) AND user_id = ${userId}::uuid
  `;
  if (owned.length !== uniqueIds.length) {
    return res.status(403).json({ error: 'Not the owner of all courses', reason: 'forbidden' });
  }

  const inserted = await sql`
    INSERT INTO course_books (course_id, book_id)
    SELECT unnest(${uniqueIds}::uuid[]), ${bookId}::uuid
    ON CONFLICT (course_id, book_id) DO NOTHING
    RETURNING course_id
  `;

  return res.status(200).json({
    ok: true,
    attachedCourseIds: inserted.map((r) => r.course_id),
    alreadyAttachedCourseIds: uniqueIds.filter((id) => !inserted.some((r) => r.course_id === id)),
  });
}

async function detachFromCourse(req, res, sql, userId) {
  const { bookId, courseId } = req.body || {};
  if (!isUuid(bookId) || !isUuid(courseId)) return res.status(400).json({ error: 'bookId and courseId required' });

  const course = await sql`SELECT id FROM courses WHERE id = ${courseId}::uuid AND user_id = ${userId}::uuid`;
  if (course.length === 0) return res.status(403).json({ error: 'Not the owner', reason: 'forbidden' });

  // Одним запросом (атомарно): план юнитов этой книги в курсе + сама связь.
  const deleted = await sql`
    WITH plan AS (
      DELETE FROM course_units cu
       USING book_units u
       WHERE cu.unit_id = u.id AND u.book_id = ${bookId}::uuid AND cu.course_id = ${courseId}::uuid
    )
    DELETE FROM course_books
     WHERE course_id = ${courseId}::uuid AND book_id = ${bookId}::uuid
    RETURNING course_id
  `;
  if (deleted.length === 0) return res.status(404).json({ error: 'Book is not attached to this course' });
  return res.status(200).json({ ok: true });
}

// ─── План юнитов курса ──────────────────────────────────────

async function coursePlan(req, res, sql, userId) {
  const { courseId } = req.query;
  if (!isUuid(courseId)) return res.status(400).json({ error: 'courseId required' });

  const access = await sql`
    SELECT (c.user_id = ${userId}::uuid) AS is_owner,
           EXISTS (SELECT 1 FROM course_members m WHERE m.course_id = c.id AND m.user_id = ${userId}::uuid) AS is_member
    FROM courses c WHERE c.id = ${courseId}::uuid
  `;
  if (access.length === 0) return res.status(404).json({ error: 'Course not found' });
  const isOwner = access[0].is_owner === true;
  if (!isOwner && access[0].is_member !== true) {
    return res.status(403).json({ error: 'Not a member of this course', reason: 'forbidden' });
  }

  // Ученик видит только опубликованные книги и открытые юниты; учитель — всё подключённое.
  // progress — по вызывающему: сколько карточек набора он уже начинал (есть строка в card_progress).
  const rows = await sql`
    SELECT b.id AS book_id, b.title AS book_title, b.edition, b.level, b.subject,
           b.language_from, b.language_to, b.publisher, b.is_published, cb.created_at AS attached_at,
           u.id AS unit_id, u.number, u.title AS unit_title, u.pages, u.sort_order,
           COALESCE(cu.is_open, false) AS is_open, cu.opened_at,
           cs.id AS set_id, cs.title AS set_title,
           (SELECT COUNT(*) FROM cards c WHERE c.set_id = cs.id) AS total_cards,
           (SELECT COUNT(*) FROM cards c JOIN card_progress p ON p.card_id = c.id AND p.user_id = ${userId}::uuid
             WHERE c.set_id = cs.id) AS started_cards
    FROM course_books cb
    JOIN books b ON b.id = cb.book_id
    JOIN book_units u ON u.book_id = b.id
    LEFT JOIN course_units cu ON cu.course_id = cb.course_id AND cu.unit_id = u.id
    LEFT JOIN LATERAL (
      SELECT id, title FROM card_sets
       WHERE unit_id = u.id AND is_official ORDER BY created_at LIMIT 1
    ) cs ON true
    WHERE cb.course_id = ${courseId}::uuid
      AND (${isOwner}::boolean OR (b.is_published = true AND cu.is_open = true))
    ORDER BY cb.created_at, b.title, u.sort_order, u.number
  `;

  const books = [];
  const byId = new Map();
  for (const r of rows) {
    let book = byId.get(r.book_id);
    if (!book) {
      book = {
        ...mapBook({ ...r, id: r.book_id, title: r.book_title }),
        units: [],
      };
      byId.set(r.book_id, book);
      books.push(book);
    }
    book.units.push({
      id: r.unit_id,
      number: r.number,
      title: r.unit_title,
      pages: r.pages || null,
      isOpen: r.is_open === true,
      openedAt: r.opened_at,
      set: r.set_id ? { id: r.set_id, title: r.set_title, totalCards: parseInt(r.total_cards, 10) || 0 } : null,
      progress: { startedCards: parseInt(r.started_cards, 10) || 0 },
    });
  }

  // Учителю отдаём и книги без юнитов (редкий случай), чтобы их можно было отключить.
  if (isOwner) {
    const empty = await sql`
      SELECT b.id, b.title, b.edition, b.level, b.subject, b.language_from, b.language_to, b.publisher, b.is_published
      FROM course_books cb JOIN books b ON b.id = cb.book_id
      WHERE cb.course_id = ${courseId}::uuid
        AND NOT EXISTS (SELECT 1 FROM book_units u WHERE u.book_id = b.id)
    `;
    for (const b of empty) books.push({ ...mapBook(b), units: [] });
  }

  return res.status(200).json({ ok: true, isOwner, books });
}

async function setUnitOpen(req, res, sql, userId) {
  const { courseId, unitId, isOpen } = req.body || {};
  if (!isUuid(courseId) || !isUuid(unitId) || typeof isOpen !== 'boolean') {
    return res.status(400).json({ error: 'courseId, unitId and boolean isOpen required' });
  }

  // Курс свой, и книга этого юнита подключена к курсу.
  const allowed = await sql`
    SELECT 1 FROM courses c
    JOIN course_books cb ON cb.course_id = c.id
    JOIN book_units u ON u.book_id = cb.book_id
    WHERE c.id = ${courseId}::uuid AND c.user_id = ${userId}::uuid AND u.id = ${unitId}::uuid
  `;
  if (allowed.length === 0) {
    return res.status(403).json({ error: 'Not the owner or the book is not attached to this course', reason: 'forbidden' });
  }

  // opened_at — время последнего открытия; при закрытии сохраняется.
  const rows = await sql`
    INSERT INTO course_units (course_id, unit_id, is_open, opened_at)
    VALUES (${courseId}::uuid, ${unitId}::uuid, ${isOpen}::boolean, CASE WHEN ${isOpen}::boolean THEN NOW() END)
    ON CONFLICT (course_id, unit_id) DO UPDATE SET
      is_open = EXCLUDED.is_open,
      opened_at = CASE
        WHEN EXCLUDED.is_open AND NOT course_units.is_open THEN NOW()
        ELSE course_units.opened_at
      END
    RETURNING is_open, opened_at
  `;
  return res.status(200).json({ ok: true, isOpen: rows[0].is_open, openedAt: rows[0].opened_at });
}

// ─── Копия официального набора ──────────────────────────────

async function forkSet(req, res, sql, userId) {
  const { setId, courseId } = req.body || {};
  if (!isUuid(setId) || (courseId != null && !isUuid(courseId))) {
    return res.status(400).json({ error: 'setId required, courseId must be uuid or null' });
  }

  const admin = await isAdmin(sql, userId);
  const source = await sql`
    SELECT cs.id, cs.title, cs.description, cs.category, cs.language_from, cs.language_to
    FROM card_sets cs
    JOIN book_units u ON u.id = cs.unit_id
    JOIN books b ON b.id = u.book_id
    WHERE cs.id = ${setId}::uuid AND cs.is_official AND (b.is_published = true OR ${admin}::boolean)
  `;
  if (source.length === 0) return res.status(404).json({ error: 'Official set not found' });

  if (courseId) {
    const course = await sql`SELECT id FROM courses WHERE id = ${courseId}::uuid AND user_id = ${userId}::uuid`;
    if (course.length === 0) return res.status(403).json({ error: 'Not the owner of the course', reason: 'forbidden' });
  }

  // Одним запросом: новый обычный набор (is_official = false, без unit_id) + копии карточек.
  // Прогресс не копируется — у копии новые card_id.
  const s = source[0];
  const created = await sql`
    WITH new_set AS (
      INSERT INTO card_sets (user_id, course_id, title, description, category, language_from, language_to,
                             is_public, total_cards)
      VALUES (${userId}::uuid, ${courseId || null}::uuid, ${s.title}, ${s.description || ''}, ${s.category || 'general'},
              ${s.language_from}, ${s.language_to}, false,
              (SELECT COUNT(*) FROM cards WHERE set_id = ${setId}::uuid))
      RETURNING id
    ), copied AS (
      INSERT INTO cards (set_id, front, back, example, word_form, word_type, image_url, audio_url, sort_order)
      SELECT (SELECT id FROM new_set), c.front, c.back, c.example, c.word_form, c.word_type, c.image_url, c.audio_url, c.sort_order
        FROM cards c WHERE c.set_id = ${setId}::uuid
      RETURNING 1
    )
    SELECT (SELECT id FROM new_set) AS id, (SELECT COUNT(*) FROM copied) AS cards
  `;

  return res.status(201).json({
    ok: true,
    newSetId: created[0].id,
    cardsCopied: parseInt(created[0].cards, 10) || 0,
  });
}

// ─── Официальные наборы с карточками для учёбы ──────────────

/**
 * Наборы: запрошенные по setIds (например, юнит, который открыли в каталоге) + юниты, открытые
 * в курсах вызывающего — своих (учитель видит у себя то же, что ученики) и тех, где он ученик —
 * + все официальные наборы, по карточкам которых у него уже есть прогресс (начатые юниты остаются
 * в «Моих наборах» между запусками). Только опубликованные книги (админу — все).
 * courseIds — курсы вызывающего, где юнит сейчас открыт: под ними набор показывается в приложении.
 * Прогресс в карточках — личный, из card_progress; общие SRS-колонки cards не используются.
 */
async function officialSets(req, res, sql, userId) {
  const requested = String(req.query.setIds || '')
    .split(',').map((id) => id.trim()).filter(Boolean);
  if (requested.length > 100 || !requested.every(isUuid)) {
    return res.status(400).json({ error: 'setIds must be up to 100 comma-separated uuids' });
  }
  const admin = await isAdmin(sql, userId);

  const sets = await sql`
    WITH my_open_units AS (
      SELECT cu.unit_id, cu.course_id
      FROM course_units cu
      JOIN courses c ON c.id = cu.course_id
      JOIN book_units bu ON bu.id = cu.unit_id
      JOIN course_books cb ON cb.course_id = cu.course_id AND cb.book_id = bu.book_id
      WHERE cu.is_open = true
        AND (
          c.user_id = ${userId}::uuid
          OR EXISTS (SELECT 1 FROM course_members m WHERE m.course_id = c.id AND m.user_id = ${userId}::uuid)
        )
    )
    SELECT cs.id, cs.title, cs.description, cs.category, cs.language_from, cs.language_to,
           cs.created_at, cs.updated_at, cs.unit_id,
           u.number AS unit_number, u.title AS unit_title, b.id AS book_id, b.title AS book_title,
           COALESCE((SELECT array_agg(mou.course_id::text ORDER BY mou.course_id)
                       FROM my_open_units mou WHERE mou.unit_id = u.id), '{}') AS course_ids
    FROM card_sets cs
    JOIN book_units u ON u.id = cs.unit_id
    JOIN books b ON b.id = u.book_id AND (b.is_published = true OR ${admin}::boolean)
    WHERE cs.is_official = true
      AND (
        cs.id = ANY(${requested}::uuid[])
        OR u.id IN (SELECT unit_id FROM my_open_units)
        OR EXISTS (
          SELECT 1 FROM cards c JOIN card_progress p ON p.card_id = c.id AND p.user_id = ${userId}::uuid
          WHERE c.set_id = cs.id
        )
      )
    ORDER BY b.title, u.sort_order, u.number
    LIMIT 200
  `;
  if (sets.length === 0) return res.status(200).json({ ok: true, sets: [], cards: [] });

  const setIds = sets.map((row) => row.id);
  const cards = await sql`
    SELECT c.id, c.set_id, c.front, c.back, c.example, c.word_form, c.word_type, c.image_url, c.audio_url,
           c.created_at, c.sort_order,
           COALESCE(p.learning_step, 0) AS learning_step,
           COALESCE(p.next_review, NOW()) AS next_review,
           p.last_reviewed,
           COALESCE(p.status, 'new') AS status
    FROM cards c
    LEFT JOIN card_progress p ON p.card_id = c.id AND p.user_id = ${userId}::uuid
    WHERE c.set_id = ANY(${setIds}::uuid[])
    ORDER BY c.set_id, c.sort_order NULLS LAST, c.created_at
  `;

  return res.status(200).json({
    ok: true,
    sets: sets.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description || '',
      category: row.category || 'general',
      languageFrom: row.language_from,
      languageTo: row.language_to,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      unitId: row.unit_id,
      unitNumber: row.unit_number,
      unitTitle: row.unit_title,
      bookId: row.book_id,
      bookTitle: row.book_title,
      courseIds: row.course_ids || [],
    })),
    cards: cards.map((row) => ({
      id: row.id,
      setId: row.set_id,
      front: row.front,
      back: row.back,
      example: row.example || '',
      wordForm: row.word_form || null,
      wordType: row.word_type || null,
      imageUrl: row.image_url || null,
      audioUrl: row.audio_url || null,
      createdAt: row.created_at,
      learningStep: row.learning_step,
      nextReview: row.next_review,
      lastReviewed: row.last_reviewed,
      status: row.status,
    })),
  });
}
