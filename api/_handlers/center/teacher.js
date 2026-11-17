/**
 * Учителя учебного центра (plan/new/center_books.md, Center 13–15). Подключается лениво из
 * api/books.js (приложение) и api/_handlers/center/cabinet.js (кабинет центра).
 *
 * GET  /api/books?action=org-teacher-info&token=   центр по ссылке flashlycards.app/t/<код>
 * POST /api/books?action=org-teacher-join          { token }  стать учителем центра
 * GET  /api/books?action=teacher-orgs              мои центры как учителя и их книги (полка в Библиотеке)
 *
 * Учитель по ссылке получает доступ сразу (решение 4): строка organization_members с ролью
 * teacher. Ссылка одна на центр; «Новая ссылка» в кабинете заменяет код — старая не работает.
 * Книгу центра учитель подключает только к своим группам: группа получает courses.organization_id,
 * ученики группы занимают места центра (один человек — одно место).
 */
import { randomBytes } from 'node:crypto';

const TOKEN_RE = /^[A-Za-z0-9_-]{8,32}$/;

function mapOrg(o) {
  return {
    id: o.id,
    name: o.name,
    city: o.city || null,
    logoUrl: o.logo_url || null,
  };
}

/** Новый код ссылки учителей: 16 знаков (96 бит) — не угадать перебором. */
export function makeTeacherToken() {
  return randomBytes(12).toString('base64url');
}

async function orgByToken(sql, token) {
  if (!TOKEN_RE.test(String(token || ''))) return null;
  const rows = await sql`
    SELECT id, name, city, logo_url,
           (contract_until IS NOT NULL AND contract_until <= NOW()) AS contract_ended
      FROM organizations WHERE teacher_invite = ${token}`;
  return rows[0] || null;
}

/** Окно «Alfa приглашает тебя учителем»: центр по ссылке, уже ли я учитель этого центра. */
export async function teacherInviteInfo(req, res, sql, userId) {
  const org = await orgByToken(sql, req.query.token);
  if (!org) return res.status(404).json({ ok: false, reason: 'not_found' });
  if (org.contract_ended) return res.status(410).json({ ok: false, reason: 'contract_ended' });
  const member = await sql`
    SELECT role FROM organization_members
     WHERE organization_id = ${org.id}::uuid AND user_id = ${userId}::uuid`;
  return res.status(200).json({
    ok: true,
    organization: mapOrg(org),
    alreadyMember: member.length > 0,
  });
}

/** «Стать учителем центра»: роль teacher в центре и роль учителя в приложении. */
export async function teacherInviteJoin(req, res, sql, userId) {
  const org = await orgByToken(sql, (req.body || {}).token);
  if (!org) return res.status(404).json({ ok: false, reason: 'not_found' });
  if (org.contract_ended) return res.status(410).json({ ok: false, reason: 'contract_ended' });
  await sql.transaction([
    // Владелец или админ центра остаются со своей ролью
    sql`INSERT INTO organization_members (organization_id, user_id, role)
        VALUES (${org.id}::uuid, ${userId}::uuid, 'teacher')
        ON CONFLICT (organization_id, user_id) DO NOTHING`,
    sql`UPDATE users SET teacher = true WHERE id = ${userId}::uuid`,
  ]);
  return res.status(200).json({ ok: true, organization: mapOrg(org) });
}

/** Полки «Книги <центр>» в Библиотеке: центры, где я учитель, договор действует. */
export async function teacherOrgs(req, res, sql, userId) {
  const orgs = await sql`
    SELECT o.id, o.name, o.city, o.logo_url
      FROM organization_members m JOIN organizations o ON o.id = m.organization_id
     WHERE m.user_id = ${userId}::uuid
       AND (o.contract_until IS NULL OR o.contract_until > NOW())
     ORDER BY m.created_at`;
  if (orgs.length === 0) return res.status(200).json({ ok: true, organizations: [] });
  const books = await sql`
    SELECT b.id, b.organization_id, b.title, b.edition, b.level, b.subject, b.language_from,
           b.language_to, b.publisher, b.is_published,
           (SELECT COUNT(*) FROM book_units u WHERE u.book_id = b.id)::int AS units_count,
           (SELECT COUNT(*) FROM book_units u
              JOIN card_sets cs ON cs.unit_id = u.id AND cs.is_official
              JOIN cards c ON c.set_id = cs.id
             WHERE u.book_id = b.id)::int AS cards_count
      FROM books b
     WHERE b.organization_id = ANY(${orgs.map((o) => o.id)}::uuid[]) AND b.is_published = true
     ORDER BY b.language_from, b.org_position NULLS LAST, b.title`;
  return res.status(200).json({
    ok: true,
    organizations: orgs.map((o) => ({
      ...mapOrg(o),
      books: books
        .filter((b) => b.organization_id === o.id)
        .map((b) => ({
          id: b.id,
          title: b.title,
          edition: b.edition || '',
          level: b.level || null,
          subject: b.subject || null,
          languageFrom: b.language_from,
          languageTo: b.language_to,
          publisher: b.publisher || null,
          isPublished: true,
          unitsCount: b.units_count,
          cardsCount: b.cards_count,
        })),
    })),
  });
}

/**
 * Можно ли подключить книгу центра к этим группам (их владелец уже проверен).
 * Только участник центра (не ученик по коду); группа не принадлежит другому центру; новых для
 * центра учеников не больше, чем свободных мест. Возвращает null — можно, иначе { status, body }.
 */
export async function checkOrgAttach(sql, orgId, userId, courseIds, { admin = false } = {}) {
  const [org] = await sql`
    SELECT o.seat_limit, flashly_org_seats_used(o.id) AS used,
           (o.contract_until IS NOT NULL AND o.contract_until <= NOW()) AS contract_ended,
           EXISTS (SELECT 1 FROM organization_members m
                    WHERE m.organization_id = o.id AND m.user_id = ${userId}::uuid) AS member
      FROM organizations o WHERE o.id = ${orgId}::uuid`;
  if (!org || (!org.member && !admin) || org.contract_ended) {
    return { status: 404, body: { error: 'Book not found' } };
  }
  const other = await sql`
    SELECT id FROM courses
     WHERE id = ANY(${courseIds}::uuid[])
       AND organization_id IS NOT NULL AND organization_id <> ${orgId}::uuid`;
  if (other.length) {
    return {
      status: 409,
      body: { error: 'Course belongs to another center', reason: 'other_org' },
    };
  }
  // Ученики этих групп, у которых сейчас нет места в центре, — займут новые места
  const [{ need }] = await sql`
    SELECT COUNT(DISTINCT m.user_id)::int AS need
      FROM course_members m
     WHERE m.course_id = ANY(${courseIds}::uuid[]) AND m.role = 'student'
       AND NOT flashly_org_has_seat(${orgId}::uuid, m.user_id)`;
  const free = Math.max(0, org.seat_limit - org.used);
  if (need > free) {
    return {
      status: 409,
      body: { error: 'Not enough center seats', reason: 'org_seats_full', need, free },
    };
  }
  return null;
}

/** После подключения: группы становятся группами центра (места, доступ учеников к юнитам). */
export async function markOrgCourses(sql, orgId, courseIds) {
  await sql`
    UPDATE courses SET organization_id = ${orgId}::uuid
     WHERE id = ANY(${courseIds}::uuid[]) AND organization_id IS NULL`;
}

/** После отключения книги: в группе не осталось книг центра — она снова обычная, места свободны. */
export async function releaseOrgCourse(sql, courseId) {
  await sql`
    UPDATE courses c SET organization_id = NULL
     WHERE c.id = ${courseId}::uuid AND c.organization_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM course_books cb JOIN books b ON b.id = cb.book_id
          WHERE cb.course_id = c.id AND b.organization_id = c.organization_id)`;
}

/**
 * Убрать учителя из центра (кабинет): книги центра отключаются от его групп — план юнитов и
 * связи с книгами удаляются, группа становится обычной; сами группы и ученики остаются у учителя.
 * Возвращает id групп, от которых отключили книги.
 */
export async function removeTeacher(sql, orgId, userId) {
  const courses = await sql`
    SELECT id FROM courses WHERE user_id = ${userId}::uuid AND organization_id = ${orgId}::uuid`;
  const ids = courses.map((c) => c.id);
  await sql.transaction([
    sql`DELETE FROM course_units cu USING book_units u, books b
         WHERE cu.unit_id = u.id AND u.book_id = b.id AND b.organization_id = ${orgId}::uuid
           AND cu.course_id = ANY(${ids}::uuid[])`,
    sql`DELETE FROM course_books cb USING books b
         WHERE cb.book_id = b.id AND b.organization_id = ${orgId}::uuid
           AND cb.course_id = ANY(${ids}::uuid[])`,
    sql`UPDATE courses SET organization_id = NULL WHERE id = ANY(${ids}::uuid[])`,
    sql`DELETE FROM organization_members
         WHERE organization_id = ${orgId}::uuid AND user_id = ${userId}::uuid AND role = 'teacher'`,
  ]);
  return ids;
}
