/**
 * Вкладка «Центры» локальной Flashly Admin (plan/new/center_books.md, Center 8).
 *
 * Файл начинается с "_" в пути api/_handlers — Vercel не публикует его роутом. Вызывается только из
 * локального admin-server.mjs (его в git нет): там пользователь сам выбирает базу (staging / прод),
 * запись в прод — только с подтверждением. Здесь — только запросы, без выбора базы.
 *
 * Аккаунт центра — пользователь Supabase с почтой <логин>@center.flashlycards.app (Supabase один на
 * прод и staging) + строка users + organization_members с ролью owner в выбранной базе. Временный
 * пароль показываем один раз; при первом входе кабинет просит сменить его (must_change_password).
 */
import { randomUUID } from 'node:crypto';
import {
  centerEmail,
  isValidLogin,
  isValidPrefix,
  makeTempPassword,
  normalizeLogin,
  normalizePrefix,
  suggestPrefix,
  CENTER_EMAIL_DOMAIN,
} from './codes.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class CenterAdminError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new CenterAdminError(code, message);
};

/** Дата договора «2027-06-30» → конец этого дня (UTC). Пусто — без срока. */
function contractEnd(value) {
  if (value === null || value === undefined || value === '') return null;
  if (!DATE_RE.test(String(value)) || Number.isNaN(Date.parse(String(value)))) {
    fail('bad_contract', 'Срок договора — дата ГГГГ-ММ-ДД');
  }
  return `${value}T23:59:59Z`;
}

function seatLimit(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 100000) fail('bad_seats', 'Места — целое число от 0');
  return n;
}

function cleanText(value, max) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

/** Ищем пользователя Supabase по почте (у admin API нет поиска по почте — листаем). */
async function findAuthUser(supa, email) {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supa.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((u) => (u.email || '').toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
  return null;
}

/** Список центров: места, книги, коды, логин владельца. */
export async function listCenters(sql) {
  const rows = await sql`
    SELECT o.id, o.name, o.city, o.code_prefix, o.seat_limit, o.contract_until, o.created_at,
           o.contact, o.greeting, o.logo_url,
           flashly_org_seats_used(o.id) AS seats_used,
           (SELECT COUNT(*)::int FROM books b WHERE b.organization_id = o.id) AS books,
           (SELECT COUNT(*)::int FROM org_codes c
             WHERE c.organization_id = o.id AND c.is_active AND c.valid_until > NOW()) AS active_codes,
           (SELECT u.email FROM organization_members m JOIN users u ON u.id = m.user_id
             WHERE m.organization_id = o.id AND m.role = 'owner'
             ORDER BY m.created_at LIMIT 1) AS owner_email
      FROM organizations o
     ORDER BY o.created_at DESC`;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    city: r.city,
    codePrefix: r.code_prefix,
    seatLimit: r.seat_limit,
    seatsUsed: r.seats_used,
    contractUntil: r.contract_until,
    createdAt: r.created_at,
    contact: r.contact,
    books: r.books,
    activeCodes: r.active_codes,
    login: r.owner_email ? String(r.owner_email).split('@')[0] : null,
  }));
}

/**
 * Создать центр и его логин. Возвращает временный пароль — показать один раз и передать центру.
 * Логин уже есть в Supabase как аккаунт центра (создан в другой базе) — берём его и ставим новый
 * пароль; занят обычным пользователем — отказ.
 */
export async function createCenter(sql, supa, input) {
  const name = cleanText(input?.name, 120);
  if (!name) fail('bad_name', 'Нужно название центра');
  const login = normalizeLogin(input?.login);
  if (!isValidLogin(login)) {
    fail('bad_login', 'Логин — 3–20 латинских букв, цифр и дефисов, например alfa');
  }
  const prefix = normalizePrefix(input?.codePrefix || suggestPrefix(name));
  if (!isValidPrefix(prefix)) fail('bad_prefix', 'Начало кода — 3–8 латинских букв и цифр');
  const seats = seatLimit(input?.seatLimit);
  const until = contractEnd(input?.contractUntil);
  const city = cleanText(input?.city, 80);
  const email = centerEmail(login);

  const taken = await sql`SELECT id FROM users WHERE lower(email) = ${email} LIMIT 1`;
  if (taken.length) fail('login_taken', `Логин ${login} уже занят в этой базе`);

  const password = makeTempPassword();
  const meta = { center: true, must_change_password: true, center_name: name };
  let authUser = await findAuthUser(supa, email);
  let created = false;
  if (authUser) {
    if (!authUser.user_metadata?.center) fail('login_taken', `Почта ${email} занята`);
    const { error } = await supa.auth.admin.updateUserById(authUser.id, {
      password,
      user_metadata: meta,
    });
    if (error) throw error;
  } else {
    const { data, error } = await supa.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: meta,
    });
    if (error) throw error;
    authUser = data.user;
    created = true;
  }

  const orgId = randomUUID();
  try {
    await sql.transaction([
      sql`INSERT INTO users (id, email, display_name, is_anonymous)
          VALUES (${authUser.id}, ${email}, ${name}, false)
          ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name`,
      sql`INSERT INTO organizations (id, name, city, code_prefix, seat_limit, contract_until)
          VALUES (${orgId}, ${name}, ${city}, ${prefix}, ${seats}, ${until})`,
      sql`INSERT INTO organization_members (organization_id, user_id, role)
          VALUES (${orgId}, ${authUser.id}, 'owner')`,
    ]);
  } catch (e) {
    // Строки в базе не легли — не оставляем «висящий» логин без центра
    if (created) await supa.auth.admin.deleteUser(authUser.id).catch(() => {});
    throw e;
  }
  return { id: orgId, login, password, codePrefix: prefix };
}

/** Изменить название, город, места, срок договора, начало кодов. */
export async function updateCenter(sql, id, input) {
  if (!UUID_RE.test(String(id))) fail('bad_id');
  const name = cleanText(input?.name, 120);
  if (!name) fail('bad_name', 'Нужно название центра');
  const prefix = normalizePrefix(input?.codePrefix);
  if (!isValidPrefix(prefix)) fail('bad_prefix', 'Начало кода — 3–8 латинских букв и цифр');
  const rows = await sql`
    UPDATE organizations
       SET name = ${name}, city = ${cleanText(input?.city, 80)}, code_prefix = ${prefix},
           seat_limit = ${seatLimit(input?.seatLimit)},
           contract_until = ${contractEnd(input?.contractUntil)}
     WHERE id = ${id}
     RETURNING id`;
  if (!rows.length) fail('not_found', 'Центр не найден');
  return { ok: true };
}

/** «Новый пароль»: старый перестаёт работать, центр снова меняет его при входе. */
export async function resetCenterPassword(sql, supa, id) {
  if (!UUID_RE.test(String(id))) fail('bad_id');
  const rows = await sql`
    SELECT u.id, u.email, o.name FROM organization_members m
      JOIN users u ON u.id = m.user_id
      JOIN organizations o ON o.id = m.organization_id
     WHERE m.organization_id = ${id} AND m.role = 'owner'
       AND lower(u.email) LIKE ${'%@' + CENTER_EMAIL_DOMAIN}
     ORDER BY m.created_at LIMIT 1`;
  if (!rows.length) fail('not_found', 'У центра нет логина');
  const password = makeTempPassword();
  const { error } = await supa.auth.admin.updateUserById(rows[0].id, {
    password,
    user_metadata: { center: true, must_change_password: true, center_name: rows[0].name },
  });
  if (error) throw error;
  return { login: String(rows[0].email).split('@')[0], password };
}

/** Все книги: чья (общая / центр), порядок уровней, сколько людей учат, в скольких курсах. */
export async function listBooks(sql) {
  const rows = await sql`
    SELECT b.id, b.title, b.edition, b.level, b.language_from, b.is_published,
           b.organization_id, b.org_position, o.name AS org_name,
           (SELECT COUNT(*)::int FROM book_units u WHERE u.book_id = b.id) AS units,
           (SELECT COUNT(DISTINCT cp.user_id)::int FROM card_progress cp
              JOIN cards c ON c.id = cp.card_id
              JOIN card_sets s ON s.id = c.set_id
              JOIN book_units u ON u.id = s.unit_id
             WHERE u.book_id = b.id) AS learners,
           (SELECT COUNT(*)::int FROM course_books cb WHERE cb.book_id = b.id) AS courses
      FROM books b LEFT JOIN organizations o ON o.id = b.organization_id
     ORDER BY o.name NULLS FIRST, b.language_from, b.org_position NULLS LAST, b.title`;
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    edition: r.edition,
    level: r.level,
    languageFrom: r.language_from,
    isPublished: r.is_published,
    organizationId: r.organization_id,
    orgName: r.org_name,
    position: r.org_position,
    units: r.units,
    learners: r.learners,
    courses: r.courses,
  }));
}

/**
 * Привязать книгу к центру (или сделать общей) и задать порядок уровня.
 * Книгу уже учат люди или она подключена к курсам — без confirm возвращаем { needConfirm }: у
 * общей опубликованной книги привязка убирает её из библиотеки у всех, у книги центра — закрывает
 * её ученикам прежнего центра.
 */
export async function assignBook(sql, input) {
  const bookId = String(input?.bookId || '');
  if (!UUID_RE.test(bookId)) fail('bad_id');
  const orgId = input?.orgId ? String(input.orgId) : null;
  if (orgId && !UUID_RE.test(orgId)) fail('bad_id');
  const position =
    input?.position === null || input?.position === undefined || input?.position === ''
      ? null
      : Number(input.position);
  if (position !== null && (!Number.isInteger(position) || position < 1 || position > 99)) {
    fail('bad_position', 'Порядок — число от 1 до 99');
  }

  const [book] = await sql`
    SELECT b.id, b.organization_id, b.is_published,
           (SELECT COUNT(DISTINCT cp.user_id)::int FROM card_progress cp
              JOIN cards c ON c.id = cp.card_id
              JOIN card_sets s ON s.id = c.set_id
              JOIN book_units u ON u.id = s.unit_id
             WHERE u.book_id = b.id) AS learners,
           (SELECT COUNT(*)::int FROM course_books cb WHERE cb.book_id = b.id) AS courses
      FROM books b WHERE b.id = ${bookId}`;
  if (!book) fail('not_found', 'Книга не найдена');
  if (orgId) {
    const org = await sql`SELECT 1 FROM organizations WHERE id = ${orgId}`;
    if (!org.length) fail('not_found', 'Центр не найден');
  }

  const ownerChanges = (book.organization_id || null) !== orgId;
  if (ownerChanges && (book.learners > 0 || book.courses > 0) && !input?.confirm) {
    return {
      needConfirm: true,
      learners: book.learners,
      courses: book.courses,
      wasPublic: !book.organization_id && book.is_published,
    };
  }
  await sql`
    UPDATE books SET organization_id = ${orgId}, org_position = ${orgId ? position : null},
           updated_at = NOW()
     WHERE id = ${bookId}`;
  return { ok: true };
}

/** Короткий текст ошибки для админки. */
export function describeAdminError(e) {
  if (e instanceof CenterAdminError) return { status: 400, code: e.code, error: e.message };
  return { status: 500, code: 'server', error: e?.message || String(e) };
}
