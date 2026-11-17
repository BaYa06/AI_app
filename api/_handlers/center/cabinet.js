/**
 * Кабинет учебного центра (plan/new/center_books.md, Center 9–11). Подключается лениво из
 * api/center.js — пользователь уже проверен по Supabase JWT.
 *
 * Центр определяется только по organization_members (owner | admin) текущего пользователя.
 * Ученики — только числами; учителей (этап 6) центр видит по именам — это его сотрудники.
 */
import { makeCenterCode, monthLabel, normalizeLabel } from './codes.js';
import { makeTeacherToken, removeTeacher } from './teacher.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

/** Часовой пояс дней на графике: центры пока в Бишкеке (как DEFAULT_TIMEZONE в api/progress.js) */
const TZ = 'Asia/Bishkek';
/** Сколько одновременно действующих кодов может быть у центра — от случайного «спама» кодами */
const MAX_ACTIVE_CODES = 100;
const ACCESS_DAYS_MAX = 730;
/** Логотип храним строкой data:image/… (кабинет сжимает до 256 px) */
const LOGO_MAX_CHARS = 200_000;
const LOGO_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

const send = (res, status, body) => res.status(status).json(body);

/** Центр, которым управляет пользователь, или null. */
async function myCenter(sql, userId) {
  const rows = await sql`
    SELECT o.id, o.name, o.city, o.logo_url, o.greeting, o.contact, o.code_prefix, o.seat_limit,
           o.contract_until, m.role,
           (o.contract_until IS NOT NULL AND o.contract_until <= NOW()) AS contract_ended
      FROM organization_members m JOIN organizations o ON o.id = m.organization_id
     WHERE m.user_id = ${userId} AND m.role IN ('owner', 'admin')
     ORDER BY m.created_at LIMIT 1`;
  return rows[0] || null;
}

export async function handle(action, req, res, sql, user) {
  const center = await myCenter(sql, user.id);
  if (!center) return send(res, 403, { error: 'Not a center account', reason: 'not_center' });

  if (action === 'me') return me(res, center, user);
  if (action === 'overview') return overview(req, res, sql, center);
  if (action === 'codes') return codes(res, sql, center);
  if (action === 'books') return books(res, sql, center);
  if (action === 'book-units') return bookUnits(req, res, sql, center);
  if (action === 'teachers') return teachers(res, sql, center);
  if (action === 'groups') return groups(res, sql, center);

  // Запись — только пока действует договор
  if (center.contract_ended) {
    return send(res, 403, { error: 'Contract ended', reason: 'contract_ended' });
  }
  if (action === 'code-create') return codeCreate(req, res, sql, center);
  if (action === 'code-off') return codeOff(req, res, sql, center);
  if (action === 'profile') return profile(req, res, sql, center);
  if (action === 'teacher-link') return teacherLink(res, sql, center);
  if (action === 'teacher-remove') return teacherRemove(req, res, sql, center);
  return send(res, 404, { error: 'Not found' });
}

function me(res, c, user) {
  return send(res, 200, {
    center: {
      id: c.id,
      name: c.name,
      city: c.city,
      logoUrl: c.logo_url,
      greeting: c.greeting,
      contact: c.contact,
      codePrefix: c.code_prefix,
      seatLimit: c.seat_limit,
      contractUntil: c.contract_until,
      contractEnded: c.contract_ended,
    },
    role: c.role,
    login: String(user.email || '').split('@')[0],
    // Метку пишет и сам пользователь — это только подсказка «смени пароль», не права
    mustChangePassword: !!user.user_metadata?.must_change_password,
  });
}

/**
 * Обзор: места (по кодам / только в группах), ученики с доступом, кто занимался за период,
 * слова выучены (young + mature в card_progress), активность по дням (14 дней), по книгам,
 * у скольких доступ кончается в ближайшие 7 дней.
 */
async function overview(req, res, sql, c) {
  const daysRaw = Number(req.query.days);
  const days = [7, 30].includes(daysRaw) ? daysRaw : daysRaw === 0 ? 0 : 7;
  // 0 — всё время: берём с начала договора центра
  const since = days ? new Date(Date.now() - days * 86400_000) : new Date(0);

  // Три запроса независимы — параллельно
  const [[seats], activity, perBook] = await Promise.all([
    sql`
    WITH seats AS (
      SELECT s.user_id, true AS by_code FROM org_students s
       WHERE s.organization_id = ${c.id} AND s.access_until > NOW()
      UNION ALL
      SELECT m.user_id, false FROM course_members m JOIN courses co ON co.id = m.course_id
       WHERE co.organization_id = ${c.id} AND m.role = 'student'
    )
    SELECT COUNT(DISTINCT user_id)::int AS used,
           COUNT(DISTINCT user_id) FILTER (WHERE by_code)::int AS by_code,
           (SELECT COUNT(*)::int FROM org_students s
             WHERE s.organization_id = ${c.id} AND s.created_at >= NOW() - INTERVAL '7 days') AS new_week,
           (SELECT COUNT(*)::int FROM org_students s
             WHERE s.organization_id = ${c.id}
               AND s.access_until > NOW() AND s.access_until <= NOW() + INTERVAL '7 days') AS expiring,
           (SELECT COUNT(*)::int FROM organization_members m
             WHERE m.organization_id = ${c.id} AND m.role = 'teacher') AS teachers,
           (SELECT COUNT(*)::int FROM courses co WHERE co.organization_id = ${c.id}) AS groups
      FROM seats`,

    // Ответы по карточкам книг центра. Сначала люди центра (индекс answers/reviews по user_id).
    sql`
    WITH people AS (
      SELECT s.user_id FROM org_students s WHERE s.organization_id = ${c.id}
      UNION
      SELECT m.user_id FROM course_members m JOIN courses co ON co.id = m.course_id
       WHERE co.organization_id = ${c.id} AND m.role = 'student'
    ),
    org_cards AS (
      SELECT cd.id AS card_id, b.id AS book_id FROM cards cd
        JOIN card_sets cs ON cs.id = cd.set_id
        JOIN book_units u ON u.id = cs.unit_id
        JOIN books b ON b.id = u.book_id
       WHERE b.organization_id = ${c.id}
    )
    SELECT rl.user_id, oc.book_id,
           ((rl.reviewed_at AT TIME ZONE 'UTC') AT TIME ZONE ${TZ})::date::text AS day
      FROM review_log rl
      JOIN people p ON p.user_id = rl.user_id
      JOIN org_cards oc ON oc.card_id = rl.card_id
     WHERE rl.reviewed_at >= LEAST(${since.toISOString()}::timestamptz, NOW() - INTERVAL '14 days') AT TIME ZONE 'UTC'
     GROUP BY 1, 2, 3`,

    sql`
    SELECT b.id, b.title, b.level, b.language_from, b.org_position,
           (SELECT COUNT(*)::int FROM user_books ub WHERE ub.book_id = b.id) AS students,
           (SELECT COUNT(*)::int FROM card_progress cp
              JOIN cards cd ON cd.id = cp.card_id
              JOIN card_sets cs ON cs.id = cd.set_id
              JOIN book_units u ON u.id = cs.unit_id
             WHERE u.book_id = b.id AND cp.status IN ('young', 'mature')) AS learned,
           (SELECT u.number FROM user_books ub JOIN book_units u ON u.id = ub.current_unit_id
             WHERE ub.book_id = b.id
             GROUP BY u.number ORDER BY COUNT(*) DESC, u.number LIMIT 1) AS top_unit
      FROM books b
     WHERE b.organization_id = ${c.id}
     ORDER BY b.language_from, b.org_position NULLS LAST, b.title`,
  ]);

  // Активность: за период и по дням (последние 14 дней)
  const sinceDay = days ? dayIn(TZ, since) : '0000-00-00';
  const activeUsers = new Set();
  const activeByBook = new Map();
  const byDay = new Map();
  const firstDay = dayIn(TZ, new Date(Date.now() - 13 * 86400_000));
  for (const r of activity) {
    if (r.day >= sinceDay) {
      activeUsers.add(r.user_id);
      if (!activeByBook.has(r.book_id)) activeByBook.set(r.book_id, new Set());
      activeByBook.get(r.book_id).add(r.user_id);
    }
    if (r.day >= firstDay) {
      if (!byDay.has(r.day)) byDay.set(r.day, new Set());
      byDay.get(r.day).add(r.user_id);
    }
  }
  const daysList = [];
  for (let i = 13; i >= 0; i--) {
    const d = dayIn(TZ, new Date(Date.now() - i * 86400_000));
    daysList.push({ day: d, students: byDay.get(d)?.size ?? 0 });
  }

  return send(res, 200, {
    period: days,
    seats: {
      limit: c.seat_limit,
      used: seats.used,
      byCode: seats.by_code,
      groupsOnly: seats.used - seats.by_code,
    },
    students: seats.used,
    newThisWeek: seats.new_week,
    active: activeUsers.size,
    learned: perBook.reduce((sum, b) => sum + b.learned, 0),
    teachers: seats.teachers,
    groups: seats.groups,
    expiringSoon: seats.expiring,
    contractUntil: c.contract_until,
    days: daysList,
    books: perBook.map((b) => ({
      id: b.id,
      title: b.title,
      level: b.level,
      languageFrom: b.language_from,
      students: b.students,
      active: activeByBook.get(b.id)?.size ?? 0,
      learned: b.learned,
      topUnit: b.top_unit,
    })),
  });
}

/** Дата «ГГГГ-ММ-ДД» в часовом поясе центра */
function dayIn(timeZone, date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);
}

async function codes(res, sql, c) {
  const rows = await sql`
    SELECT id, code, label, valid_from, valid_until, access_days, max_activations,
           activations_count, is_active, created_at
      FROM org_codes WHERE organization_id = ${c.id}
     ORDER BY created_at DESC`;
  const [{ used }] = await sql`SELECT flashly_org_seats_used(${c.id}) AS used`;
  return send(res, 200, {
    seats: { limit: c.seat_limit, used },
    codePrefix: c.code_prefix,
    codes: rows.map((r) => ({
      id: r.id,
      code: r.code,
      label: r.label,
      validFrom: r.valid_from,
      validUntil: r.valid_until,
      accessDays: r.access_days,
      maxActivations: r.max_activations,
      activations: r.activations_count,
      isActive: r.is_active,
      createdAt: r.created_at,
    })),
  });
}

/**
 * Выпустить код: НАЧАЛО центра + метка (месяц или своя) + случайный хвост. Можно ввести до
 * validUntil (не позже договора), доступ после ввода — accessDays, мест — maxActivations
 * (не больше мест центра; сама активация ещё проверяет свободные места центра).
 */
async function codeCreate(req, res, sql, c) {
  const body = req.body || {};
  if (!c.code_prefix) return send(res, 400, { error: 'No code prefix', reason: 'no_prefix' });
  const accessDays = Number(body.accessDays);
  if (!Number.isInteger(accessDays) || accessDays < 1 || accessDays > ACCESS_DAYS_MAX) {
    return send(res, 400, { error: 'Bad access days', reason: 'bad_days' });
  }
  const maxActivations = Number(body.maxActivations);
  if (!Number.isInteger(maxActivations) || maxActivations < 1 || maxActivations > c.seat_limit) {
    return send(res, 400, { error: 'Bad seats', reason: 'bad_seats', seatLimit: c.seat_limit });
  }
  if (!DATE_RE.test(String(body.validUntil || ''))) {
    return send(res, 400, { error: 'Bad date', reason: 'bad_date' });
  }
  let validUntil = new Date(`${body.validUntil}T23:59:59+06:00`);
  if (Number.isNaN(validUntil.getTime()) || validUntil.getTime() <= Date.now()) {
    return send(res, 400, { error: 'Bad date', reason: 'bad_date' });
  }
  if (c.contract_until && validUntil > new Date(c.contract_until)) {
    validUntil = new Date(c.contract_until);
  }
  const label =
    String(body.label ?? '')
      .trim()
      .slice(0, 80) || null;
  const tag = normalizeLabel(body.tag) || monthLabel(new Date());

  const [{ active }] = await sql`
    SELECT COUNT(*)::int AS active FROM org_codes
     WHERE organization_id = ${c.id} AND is_active AND valid_until > NOW()`;
  if (active >= MAX_ACTIVE_CODES) {
    return send(res, 409, { error: 'Too many codes', reason: 'too_many_codes' });
  }

  // Хвост случайный — на совпадение с чужим кодом пробуем ещё раз
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeCenterCode(c.code_prefix, tag);
    const rows = await sql`
      INSERT INTO org_codes (organization_id, code, label, valid_until, access_days, max_activations)
      VALUES (${c.id}, ${code}, ${label}, ${validUntil.toISOString()}, ${accessDays}, ${maxActivations})
      ON CONFLICT ((upper(code))) DO NOTHING
      RETURNING id, code`;
    if (rows.length) {
      return send(res, 200, {
        id: rows[0].id,
        code: rows[0].code,
        validUntil: validUntil.toISOString(),
        accessDays,
        maxActivations,
      });
    }
  }
  return send(res, 500, { error: 'Could not make a code' });
}

/** Выключить код: ввести больше нельзя, кто уже вошёл — сохраняет доступ до конца срока. */
async function codeOff(req, res, sql, c) {
  const id = req.body?.id;
  if (!isUuid(id)) return send(res, 400, { error: 'Bad id' });
  const rows = await sql`
    UPDATE org_codes SET is_active = false
     WHERE id = ${id} AND organization_id = ${c.id}
     RETURNING id`;
  if (!rows.length) return send(res, 404, { error: 'Not found' });
  return send(res, 200, { ok: true });
}

async function books(res, sql, c) {
  const rows = await sql`
    SELECT b.id, b.title, b.edition, b.level, b.language_from, b.org_position, b.is_published,
           (SELECT COUNT(*)::int FROM book_units u WHERE u.book_id = b.id) AS units,
           (SELECT COUNT(*)::int FROM cards cd
              JOIN card_sets cs ON cs.id = cd.set_id
              JOIN book_units u ON u.id = cs.unit_id
             WHERE u.book_id = b.id) AS words,
           (SELECT COUNT(*)::int FROM user_books ub WHERE ub.book_id = b.id) AS students,
           (SELECT COUNT(DISTINCT cb.course_id)::int FROM course_books cb
              JOIN courses co ON co.id = cb.course_id
             WHERE cb.book_id = b.id AND co.organization_id = ${c.id}) AS groups
      FROM books b
     WHERE b.organization_id = ${c.id}
     ORDER BY b.language_from, b.org_position NULLS LAST, b.title`;
  return send(res, 200, {
    books: rows.map((b) => ({
      id: b.id,
      title: b.title,
      edition: b.edition,
      level: b.level,
      languageFrom: b.language_from,
      position: b.org_position,
      isPublished: b.is_published === true,
      units: b.units,
      words: b.words,
      students: b.students,
      groups: b.groups,
    })),
  });
}

/** Юниты книги центра и слова: проверить, что загрузили верно. */
async function bookUnits(req, res, sql, c) {
  const bookId = req.query.bookId;
  if (!isUuid(bookId)) return send(res, 400, { error: 'Bad id' });
  const [book] = await sql`
    SELECT id, title FROM books WHERE id = ${bookId} AND organization_id = ${c.id}`;
  if (!book) return send(res, 404, { error: 'Not found' });
  const rows = await sql`
    SELECT u.id AS unit_id, u.number, u.title AS unit_title,
           (SELECT COUNT(*)::int FROM user_books ub WHERE ub.current_unit_id = u.id) AS students,
           cd.front, cd.back
      FROM book_units u
      LEFT JOIN card_sets cs ON cs.unit_id = u.id AND cs.is_official
      LEFT JOIN cards cd ON cd.set_id = cs.id
     WHERE u.book_id = ${bookId}
     ORDER BY u.sort_order, u.number, cd.sort_order NULLS LAST, cd.created_at, cd.id`;
  const units = [];
  for (const r of rows) {
    let unit = units[units.length - 1];
    if (!unit || unit.id !== r.unit_id) {
      unit = {
        id: r.unit_id,
        number: r.number,
        title: r.unit_title,
        students: r.students,
        words: [],
      };
      units.push(unit);
    }
    if (r.front !== null) unit.words.push({ term: r.front, translation: r.back });
  }
  return send(res, 200, { book: { id: book.id, title: book.title }, units });
}

/** Профиль для учеников: логотип, приветствие на «Центр найден», контакт при конце доступа. */
async function profile(req, res, sql, c) {
  const body = req.body || {};
  const greeting =
    String(body.greeting ?? '')
      .trim()
      .slice(0, 200) || null;
  const contact =
    String(body.contact ?? '')
      .trim()
      .slice(0, 120) || null;
  let logo = c.logo_url;
  if (body.logo === null) logo = null;
  else if (typeof body.logo === 'string') {
    if (body.logo.length > LOGO_MAX_CHARS || !LOGO_RE.test(body.logo)) {
      return send(res, 400, { error: 'Bad logo', reason: 'bad_logo' });
    }
    logo = body.logo;
  }
  await sql`
    UPDATE organizations SET greeting = ${greeting}, contact = ${contact}, logo_url = ${logo}
     WHERE id = ${c.id}`;
  return send(res, 200, { ok: true });
}

// ── Учителя и группы (Center 13, 15) ──────────────────────

/**
 * Учителя центра: имя и почта (это сотрудники центра — они согласились, что центр их видит),
 * сколько групп с книгами центра и учеников в них. Ссылка для учителей — одна на центр.
 */
async function teachers(res, sql, c) {
  const [org] = await sql`SELECT teacher_invite FROM organizations WHERE id = ${c.id}`;
  const rows = await sql`
    SELECT u.id, COALESCE(NULLIF(u.display_name, ''), u.user_name, u.email) AS name, u.email,
           m.created_at,
           (SELECT COUNT(*)::int FROM courses co
             WHERE co.user_id = u.id AND co.organization_id = ${c.id}) AS groups,
           (SELECT COUNT(DISTINCT cm.user_id)::int FROM courses co
              JOIN course_members cm ON cm.course_id = co.id AND cm.role = 'student'
             WHERE co.user_id = u.id AND co.organization_id = ${c.id}) AS students
      FROM organization_members m JOIN users u ON u.id = m.user_id
     WHERE m.organization_id = ${c.id} AND m.role = 'teacher'
     ORDER BY m.created_at`;
  return send(res, 200, {
    linkToken: org?.teacher_invite || null,
    teachers: rows.map((r) => ({
      id: r.id,
      name: r.name || 'Учитель',
      email: r.email && !String(r.email).endsWith('@privaterelay.appleid.com') ? r.email : null,
      joinedAt: r.created_at,
      groups: r.groups,
      students: r.students,
    })),
  });
}

/** Новая ссылка для учителей: старая перестаёт работать (её переслали не тому). */
async function teacherLink(res, sql, c) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = makeTeacherToken();
    try {
      await sql`UPDATE organizations SET teacher_invite = ${token} WHERE id = ${c.id}`;
      return send(res, 200, { linkToken: token });
    } catch (e) {
      if (!/unique|duplicate/i.test(String(e?.message))) throw e;
    }
  }
  return send(res, 500, { error: 'Could not make a link' });
}

/**
 * Убрать учителя. Без confirm возвращаем, что случится: «Отключим книги от N групп (M учеников)».
 * С confirm — книги центра отключаются от его групп, группы остаются у учителя.
 */
async function teacherRemove(req, res, sql, c) {
  const userId = req.body?.userId;
  if (!isUuid(userId)) return send(res, 400, { error: 'Bad id' });
  const [t] = await sql`
    SELECT 1 FROM organization_members
     WHERE organization_id = ${c.id} AND user_id = ${userId} AND role = 'teacher'`;
  if (!t) return send(res, 404, { error: 'Not found' });
  if (!req.body?.confirm) {
    const [impact] = await sql`
      SELECT COUNT(DISTINCT co.id)::int AS groups, COUNT(DISTINCT cm.user_id)::int AS students
        FROM courses co
        LEFT JOIN course_members cm ON cm.course_id = co.id AND cm.role = 'student'
       WHERE co.user_id = ${userId} AND co.organization_id = ${c.id}`;
    return send(res, 200, { needConfirm: true, groups: impact.groups, students: impact.students });
  }
  const detached = await removeTeacher(sql, c.id, userId);
  if (detached.length) {
    const { notifyCoursesChanged } = await import('../../_realtime.js');
    await notifyCoursesChanged(detached).catch(() => {});
  }
  return send(res, 200, { ok: true, groups: detached.length });
}

/**
 * Группы учителей с книгами центра: учитель, книги и до какого юнита открыто, учеников, сколько
 * занимались за 7 дней (по словам книг центра). Имена учеников не отдаём.
 */
async function groups(res, sql, c) {
  const rows = await sql`
    SELECT co.id, co.title,
           COALESCE(NULLIF(u.display_name, ''), u.user_name, u.email) AS teacher,
           (SELECT COUNT(*)::int FROM course_members cm
             WHERE cm.course_id = co.id AND cm.role = 'student') AS students,
           (SELECT COALESCE(json_agg(json_build_object('title', b.title, 'level', b.level,
                     'openTo', (SELECT MAX(bu.number) FROM course_units cu
                                  JOIN book_units bu ON bu.id = cu.unit_id
                                 WHERE cu.course_id = co.id AND cu.is_open AND bu.book_id = b.id),
                     'open', (SELECT COUNT(*) FROM course_units cu
                                JOIN book_units bu ON bu.id = cu.unit_id
                               WHERE cu.course_id = co.id AND cu.is_open AND bu.book_id = b.id),
                     'units', (SELECT COUNT(*) FROM book_units bu WHERE bu.book_id = b.id))
                   ORDER BY b.org_position NULLS LAST, b.title), '[]')
              FROM course_books cb JOIN books b ON b.id = cb.book_id
             WHERE cb.course_id = co.id AND b.organization_id = ${c.id}) AS books,
           (SELECT COUNT(DISTINCT rl.user_id)::int
              FROM course_members cm
              JOIN review_log rl ON rl.user_id = cm.user_id
              JOIN cards cd ON cd.id = rl.card_id
              JOIN card_sets cs ON cs.id = cd.set_id
              JOIN book_units bu ON bu.id = cs.unit_id
              JOIN books b ON b.id = bu.book_id AND b.organization_id = ${c.id}
             WHERE cm.course_id = co.id AND cm.role = 'student'
               AND rl.reviewed_at >= (NOW() - INTERVAL '7 days') AT TIME ZONE 'UTC') AS active
      FROM courses co JOIN users u ON u.id = co.user_id
     WHERE co.organization_id = ${c.id}
     ORDER BY teacher, co.title`;
  return send(res, 200, {
    groups: rows.map((r) => ({
      id: r.id,
      title: r.title,
      teacher: r.teacher || 'Учитель',
      students: r.students,
      active: r.active,
      books: r.books.map((b) => ({
        title: b.title,
        level: b.level,
        openTo: b.openTo,
        open: Number(b.open) || 0,
        units: Number(b.units) || 0,
      })),
    })),
  });
}
