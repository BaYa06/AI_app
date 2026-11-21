/**
 * Книги учебного центра для ученика по коду (plan/new/center_books.md, Center 3).
 * Подключается лениво из api/books.js — userId уже проверен по Supabase JWT.
 *
 * GET  /api/books?action=org-info&code=     центр по коду без активации (экран «Центр найден»)
 * POST /api/books?action=org-activate       { code }  активация: доступ к книгам центра
 * GET  /api/books?action=my-orgs            мои центры: доступ, книги центра, мои книги
 * POST /api/books?action=my-book            { bookId, unitId?, active?, remove? }  выбрать / сменить книгу
 *                                           (Center 6; нужен приложениям 1.9.x)
 * POST /api/books?action=book-course        { bookId }  книга целиком = мой курс (этап 7, Center 16)
 *
 * Проверка кода, места и запись — одна SQL-функция flashly_activate_org_code (миграция 052): строка
 * центра блокируется, последнее место не займут двое. Лимиты и счётчики кода клиенту не отдаём.
 *
 * Защита от перебора — только по НЕУДАЧНЫМ попыткам: 10 за 10 минут на аккаунт и 30 за час на IP.
 * Удачные не считаем: класс на школьном Wi-Fi вводит код с одного IP.
 */
import { createHash } from 'node:crypto';

const CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,19}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

const USER_FAIL = { action: 'org-code-fail', max: 10, windowSeconds: 600 };
const IP_FAIL = { action: 'org-code-ip-fail', max: 30, windowSeconds: 3600 };

/** HTTP-статус по ответу функции активации. */
const STATUS = {
  ok: 200,
  already_active: 200,
  not_found: 404,
  expired: 410,
  contract_ended: 410,
  full: 409,
};

/** IP клиента → uuid-ключ для api_rate_limits (там user_id UUID). */
function ipKey(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  const ip = fwd || String(req.headers['x-real-ip'] || '') || 'unknown';
  const h = createHash('md5').update(`ip:${ip}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function windowStart(windowSeconds) {
  const ms = Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000;
  return new Date(ms).toISOString();
}

async function ensureRateTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS api_rate_limits (
      user_id UUID NOT NULL,
      action VARCHAR(50) NOT NULL,
      window_start TIMESTAMPTZ NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, action, window_start)
    )
  `;
}

/** Неудачных попыток уже слишком много — по аккаунту или по IP. Ничего не записывает. */
async function tooManyFailures(sql, userId, ip) {
  await ensureRateTable(sql);
  const rows = await sql`
    SELECT action, attempts FROM api_rate_limits
     WHERE (user_id = ${userId}::uuid AND action = ${USER_FAIL.action}
            AND window_start = ${windowStart(USER_FAIL.windowSeconds)}::timestamptz)
        OR (user_id = ${ip}::uuid AND action = ${IP_FAIL.action}
            AND window_start = ${windowStart(IP_FAIL.windowSeconds)}::timestamptz)
  `;
  return rows.some(
    (r) =>
      (r.action === USER_FAIL.action && r.attempts >= USER_FAIL.max) ||
      (r.action === IP_FAIL.action && r.attempts >= IP_FAIL.max)
  );
}

async function recordFailure(sql, userId, ip) {
  for (const [key, rule] of [
    [userId, USER_FAIL],
    [ip, IP_FAIL],
  ]) {
    await sql`
      INSERT INTO api_rate_limits (user_id, action, window_start, attempts)
      VALUES (${key}::uuid, ${rule.action}, ${windowStart(rule.windowSeconds)}::timestamptz, 1)
      ON CONFLICT (user_id, action, window_start) DO UPDATE SET attempts = api_rate_limits.attempts + 1
    `;
  }
}

function mapOrg(o) {
  return {
    id: o.id,
    name: o.name,
    city: o.city || null,
    logoUrl: o.logo_url || null,
    greeting: o.greeting || null,
    contact: o.contact || null,
  };
}

/** Общий путь org-info / org-activate: формат, лимит, функция, ответ. */
async function runCode(req, res, sql, userId, code, dryRun) {
  const normalized = String(code || '')
    .trim()
    .toUpperCase();
  if (!CODE_RE.test(normalized)) {
    return res.status(400).json({ ok: false, error: 'Bad code', reason: 'not_found' });
  }

  const ip = ipKey(req);
  if (await tooManyFailures(sql, userId, ip)) {
    return res.status(429).json({ ok: false, error: 'Too many attempts', reason: 'rate_limited' });
  }

  const rows = await sql`
    SELECT out_reason, out_org, out_until
      FROM flashly_activate_org_code(${userId}::uuid, ${normalized}, ${dryRun}::boolean)
  `;
  const { out_reason: reason, out_org: orgId, out_until: until } = rows[0] || {};

  if (reason !== 'ok' && reason !== 'already_active') {
    await recordFailure(sql, userId, ip);
    return res.status(STATUS[reason] || 400).json({ ok: false, reason: reason || 'not_found' });
  }

  const org = await sql`
    SELECT id, name, city, logo_url, greeting, contact FROM organizations WHERE id = ${orgId}::uuid
  `;
  return res.status(200).json({
    ok: true,
    reason,
    organization: mapOrg(org[0]),
    accessUntil: until,
  });
}

export async function orgInfo(req, res, sql, userId) {
  return runCode(req, res, sql, userId, req.query.code, true);
}

export async function orgActivate(req, res, sql, userId) {
  return runCode(req, res, sql, userId, (req.body || {}).code, false);
}

/**
 * Мои центры: доступ (до какого числа и открыт ли сейчас), книги центра и мои выбранные книги.
 * Книги центра отдаём и при закончившемся доступе — только названия, для экрана «Доступ
 * закончился»; слова книги без доступа сервер не отдаёт (official-sets, Center 2).
 */
export async function myOrgs(req, res, sql, userId) {
  const orgs = await sql`
    SELECT o.id, o.name, o.city, o.logo_url, o.greeting, o.contact, s.access_until,
           (s.access_until > NOW() AND (o.contract_until IS NULL OR o.contract_until > NOW())) AS active
      FROM org_students s JOIN organizations o ON o.id = s.organization_id
     WHERE s.user_id = ${userId}::uuid
     ORDER BY s.created_at
  `;
  if (orgs.length === 0) return res.status(200).json({ ok: true, organizations: [] });

  const orgIds = orgs.map((o) => o.id);
  const [books, mine, courses] = await Promise.all([
    sql`
      SELECT b.id, b.organization_id, b.title, b.edition, b.level, b.language_from, b.language_to,
             b.org_position,
             (SELECT COUNT(*) FROM book_units u WHERE u.book_id = b.id)::int AS units_count,
             (SELECT COUNT(*) FROM book_units u
                JOIN card_sets cs ON cs.unit_id = u.id AND cs.is_official
                JOIN cards c ON c.set_id = cs.id
               WHERE u.book_id = b.id)::int AS cards_count
        FROM books b
       WHERE b.organization_id = ANY(${orgIds}::uuid[]) AND b.is_published = true
       ORDER BY b.language_to, b.org_position NULLS LAST, b.title
    `,
    sql`
      SELECT ub.book_id, ub.current_unit_id, ub.is_active, ub.updated_at,
             u.number AS unit_number, u.title AS unit_title,
             (SELECT cs.id FROM card_sets cs WHERE cs.unit_id = u.id AND cs.is_official
               ORDER BY cs.created_at LIMIT 1) AS unit_set_id,
             (SELECT COUNT(*) FROM card_sets cs JOIN cards c ON c.set_id = cs.id
               WHERE cs.unit_id = u.id AND cs.is_official)::int AS unit_cards,
             NOT EXISTS (
               SELECT 1 FROM book_units u2
                WHERE u2.book_id = u.book_id
                  AND (u2.sort_order, u2.number) > (u.sort_order, u.number)
             ) AS unit_is_last
        FROM user_books ub
        JOIN books b ON b.id = ub.book_id
        LEFT JOIN book_units u ON u.id = ub.current_unit_id
       WHERE ub.user_id = ${userId}::uuid AND b.organization_id = ANY(${orgIds}::uuid[])
       ORDER BY ub.updated_at DESC
    `,
    // Мой курс книги (этап 7): «Добавлена» на полке и «Открыть курс»
    sql`
      SELECT c.id, c.source_book_id FROM courses c JOIN books b ON b.id = c.source_book_id
       WHERE c.user_id = ${userId}::uuid AND b.organization_id = ANY(${orgIds}::uuid[])
    `,
  ]);
  const courseByBook = new Map(courses.map((c) => [c.source_book_id, c.id]));

  return res.status(200).json({
    ok: true,
    organizations: orgs.map((o) => ({
      ...mapOrg(o),
      accessUntil: o.access_until,
      active: o.active === true,
      books: books
        .filter((b) => b.organization_id === o.id)
        .map((b) => ({
          id: b.id,
          title: b.title,
          edition: b.edition || '',
          level: b.level || null,
          languageFrom: b.language_from,
          languageTo: b.language_to,
          position: b.org_position,
          unitsCount: b.units_count,
          cardsCount: b.cards_count,
          courseId: courseByBook.get(b.id) || null,
        })),
    })),
    myBooks: mine.map((m) => ({
      bookId: m.book_id,
      currentUnitId: m.current_unit_id,
      // Текущий юнит для карточки на главной и «Моих книг» (Center 6). setId — его официальный набор
      currentUnit: m.current_unit_id
        ? {
            id: m.current_unit_id,
            number: m.unit_number,
            title: m.unit_title,
            setId: m.unit_set_id,
            totalCards: m.unit_cards,
            isLast: m.unit_is_last === true,
          }
        : null,
      isActive: m.is_active === true,
      updatedAt: m.updated_at,
    })),
  });
}

/**
 * Выбрать книгу центра, юнит, сделать книгу текущей или убрать её из «Моих книг».
 * Только книга центра, к которому у пользователя сейчас есть доступ. Прогресс по словам не
 * трогается: он в card_progress.
 */
export async function myBook(req, res, sql, userId) {
  const { bookId, unitId, active, remove } = req.body || {};
  if (!isUuid(bookId) || (unitId != null && !isUuid(unitId))) {
    return res.status(400).json({ error: 'bookId required, unitId must be uuid' });
  }

  const book = await sql`
    SELECT id FROM books
     WHERE id = ${bookId}::uuid AND is_published = true AND organization_id IS NOT NULL
       AND flashly_org_access(organization_id, ${userId}::uuid)
  `;
  if (book.length === 0) return res.status(404).json({ error: 'Book not found' });

  if (remove === true) {
    await sql`DELETE FROM user_books WHERE user_id = ${userId}::uuid AND book_id = ${bookId}::uuid`;
    return res.status(200).json({ ok: true, removed: true });
  }

  if (unitId) {
    const unit =
      await sql`SELECT 1 FROM book_units WHERE id = ${unitId}::uuid AND book_id = ${bookId}::uuid`;
    if (unit.length === 0) return res.status(400).json({ error: 'Unit is not from this book' });
  }

  const makeActive = active === true;
  if (makeActive) {
    await sql`
      UPDATE user_books SET is_active = false, updated_at = NOW()
       WHERE user_id = ${userId}::uuid AND book_id <> ${bookId}::uuid AND is_active
    `;
  }
  const rows = await sql`
    INSERT INTO user_books (user_id, book_id, current_unit_id, is_active)
    VALUES (${userId}::uuid, ${bookId}::uuid, ${unitId || null}::uuid, ${makeActive}::boolean)
    ON CONFLICT (user_id, book_id) DO UPDATE SET
      current_unit_id = COALESCE(EXCLUDED.current_unit_id, user_books.current_unit_id),
      is_active = CASE WHEN ${makeActive}::boolean THEN true ELSE user_books.is_active END,
      updated_at = NOW()
    RETURNING book_id, current_unit_id, is_active, updated_at
  `;
  const m = rows[0];
  return res.status(200).json({
    ok: true,
    myBook: {
      bookId: m.book_id,
      currentUnitId: m.current_unit_id,
      isActive: m.is_active === true,
      updatedAt: m.updated_at,
    },
  });
}

/**
 * Книга центра целиком = мой курс (plan/new/center_books.md, этап 7, Center 16).
 * Курс с source_book_id: название — книги, все юниты открыты по правилу в official-sets, строк
 * course_books / course_units нет. organization_id не ставим — это не группа центра: места не
 * занимает (место уже даёт код) и в кабинете центра не виден. Одна книга — один курс: повторный
 * вызов вернёт тот же курс (уникальный индекс миграции 054). Та же книга в группе учителя не мешает:
 * юнит покажется под обоими курсами.
 */
export async function bookCourse(req, res, sql, userId) {
  const { bookId } = req.body || {};
  if (!isUuid(bookId)) return res.status(400).json({ error: 'bookId required' });

  const book = await sql`
    SELECT id, title FROM books
     WHERE id = ${bookId}::uuid AND is_published = true AND organization_id IS NOT NULL
       AND flashly_org_access(organization_id, ${userId}::uuid)
  `;
  if (book.length === 0) return res.status(404).json({ error: 'Book not found' });

  const rows = await sql`
    INSERT INTO courses (id, user_id, title, source_book_id, created_at, updated_at)
    VALUES (gen_random_uuid(), ${userId}::uuid, ${book[0].title}, ${bookId}::uuid, NOW(), NOW())
    ON CONFLICT (user_id, source_book_id) WHERE source_book_id IS NOT NULL
      DO UPDATE SET updated_at = courses.updated_at
    RETURNING id, title, created_at, updated_at, source_book_id, (xmax = 0) AS created
  `;
  // Для приложений 1.9.x: книга в «Моих книгах» (my-orgs.myBooks), юнит они выберут сами
  await sql`
    INSERT INTO user_books (user_id, book_id) VALUES (${userId}::uuid, ${bookId}::uuid)
    ON CONFLICT (user_id, book_id) DO NOTHING
  `;
  const c = rows[0];
  return res.status(200).json({
    ok: true,
    created: c.created === true,
    course: {
      id: c.id,
      title: c.title,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      sourceBookId: c.source_book_id,
    },
  });
}
