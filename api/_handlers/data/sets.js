/**
 * api/data.js — наборы и карточки (Clean 10 — перенесено без изменений).
 */
import { HttpError, uuid, assertReadableSet } from '../../_access.js';
import { optString, isoOrNull } from './_shared.js';

/** Тип набора (plan/new/set_kind.md): нет поля → null (не менять), неизвестное значение → 400. */
export function optSetKind(value) {
  if (value === undefined || value === null) return null;
  if (value !== 'language' && value !== 'subject') throw new HttpError(400, 'Invalid kind');
  return value;
}

/** Набор принадлежит пользователю (менять можно только свои наборы). */
export async function assertOwnSet(sql, me, setId) {
  const rows =
    await sql`SELECT 1 FROM card_sets WHERE id = ${setId}::uuid AND user_id = ${me}::uuid`;
  if (rows.length === 0) throw new HttpError(403, 'Not your set');
}

/** Курс принадлежит пользователю (учитель). */
export async function assertOwnCourse(sql, me, courseId) {
  const rows =
    await sql`SELECT 1 FROM courses WHERE id = ${courseId}::uuid AND user_id = ${me}::uuid`;
  if (rows.length === 0) throw new HttpError(403, 'Not your course');
}

export async function loadSets(sql, me) {
  return sql`
    SELECT id, user_id, course_id, title, description, category, language_from, language_to, kind,
           is_public, created_at, updated_at, total_cards, mastered_cards, studying_cards,
           is_hidden_from_students
    FROM card_sets
    WHERE user_id = ${me}::uuid
    ORDER BY created_at DESC
  `;
}

export async function loadCardsBySet(sql, me, p) {
  const setId = uuid(p.setId, 'setId');
  await assertReadableSet(sql, me, setId);
  return sql`
    SELECT id, set_id, front, back, example, word_form, word_type, image_url, audio_url,
           created_at, learning_step, next_review, last_reviewed, status
    FROM cards
    WHERE set_id = ${setId}::uuid
    ORDER BY sort_order NULLS LAST, created_at ASC
  `;
}

export async function loadAllCards(sql, me) {
  return sql`
    SELECT
      c.id, c.set_id, c.front, c.back, c.example, c.word_form, c.word_type, c.image_url, c.audio_url, c.created_at,
      CASE WHEN s.user_id = ${me}::uuid THEN COALESCE(cp.learning_step, c.learning_step)
           ELSE COALESCE(cp.learning_step, 0) END AS learning_step,
      CASE WHEN s.user_id = ${me}::uuid THEN COALESCE(cp.next_review, c.next_review)
           ELSE COALESCE(cp.next_review, NOW()) END AS next_review,
      CASE WHEN s.user_id = ${me}::uuid THEN COALESCE(cp.last_reviewed, c.last_reviewed)
           ELSE cp.last_reviewed END AS last_reviewed,
      CASE WHEN s.user_id = ${me}::uuid THEN COALESCE(cp.status, c.status)
           ELSE COALESCE(cp.status, 'new') END AS status
    FROM cards c
    INNER JOIN card_sets s ON c.set_id = s.id
    LEFT JOIN card_progress cp ON cp.card_id = c.id AND cp.user_id = ${me}::uuid
    WHERE s.user_id = ${me}::uuid
       OR s.course_id IN (
         SELECT course_id FROM course_members WHERE user_id = ${me}::uuid AND role = 'student'
       )
    ORDER BY c.created_at ASC, c.sort_order NULLS LAST
  `;
}

export async function updateCard(sql, me, p) {
  const cardId = uuid(p.cardId, 'cardId');
  const d = p.data || {};
  const rows = await sql`
    UPDATE cards c
    SET front = COALESCE(${optString(d.frontText, 2000)}, c.front),
        back = COALESCE(${optString(d.backText, 2000)}, c.back),
        example = COALESCE(${optString(d.example, 4000)}, c.example),
        word_form = COALESCE(${optString(d.wordForm, 100)}, c.word_form),
        word_type = COALESCE(${optString(d.wordType, 20)}, c.word_type),
        image_url = COALESCE(${optString(d.frontImage, 2000)}, c.image_url),
        audio_url = COALESCE(${optString(d.frontAudio, 2000)}, c.audio_url)
    FROM card_sets s
    WHERE c.id = ${cardId}::uuid AND s.id = c.set_id AND s.user_id = ${me}::uuid
    RETURNING c.id
  `;
  if (rows.length === 0) throw new HttpError(403, 'Not your card');
  return true;
}

export async function createSet(sql, me, p) {
  const id = uuid(p.id, 'id');
  const courseId = p.courseId ? uuid(p.courseId, 'courseId') : null;
  if (courseId) await assertOwnCourse(sql, me, courseId);
  const now = new Date().toISOString();
  await sql`
    INSERT INTO card_sets (
      id, user_id, course_id, title, description, category, language_from, language_to, kind,
      is_public, created_at, updated_at, total_cards, mastered_cards, studying_cards
    ) VALUES (
      ${id}::uuid, ${me}::uuid, ${courseId}, ${optString(p.title, 255) || 'Без названия'},
      ${optString(p.description, 2000)}, ${optString(p.category, 100) || 'custom'},
      ${optString(p.languageFrom, 10)}, ${optString(p.languageTo, 10)}, ${optSetKind(p.kind)}, ${p.isPublic === true},
      ${isoOrNull(p.createdAt) || now}, ${isoOrNull(p.updatedAt) || now}, 0, 0, 0
    )
    ON CONFLICT (id) DO NOTHING
  `;
  return true;
}

/** Вставка карточек одним запросом; все карточки должны быть в своих наборах. */
export async function insertCards(sql, me, cards) {
  if (!Array.isArray(cards) || cards.length === 0) return true;
  if (cards.length > 2000) throw new HttpError(400, 'Too many cards');
  const rows = cards.map((c) => ({
    id: uuid(c.id, 'card.id'),
    set_id: uuid(c.setId, 'card.setId'),
    front: optString(c.frontText, 2000) ?? '',
    back: optString(c.backText, 2000) ?? '',
    example: optString(c.example, 4000),
    word_type: optString(c.wordType, 20),
    image_url: optString(c.frontImage, 2000),
    audio_url: optString(c.frontAudio, 2000),
    created_at: isoOrNull(c.createdAt) || new Date().toISOString(),
    next_review: isoOrNull(c.nextReviewDate) || new Date().toISOString(),
    last_reviewed: isoOrNull(c.lastReviewDate),
    status: optString(c.status, 20) || 'new',
  }));
  const setIds = [...new Set(rows.map((r) => r.set_id))];
  const own =
    await sql`SELECT id FROM card_sets WHERE id = ANY(${setIds}::uuid[]) AND user_id = ${me}::uuid`;
  if (own.length !== setIds.length) throw new HttpError(403, 'Not your set');

  const inserted = await sql`
    INSERT INTO cards (id, set_id, front, back, example, word_type, image_url, audio_url,
                       created_at, next_review, last_reviewed, status)
    SELECT id, set_id, front, back, example, word_type, image_url, audio_url,
           created_at, next_review, last_reviewed, status
    FROM json_to_recordset(${JSON.stringify(rows)}::json) AS r(
      id uuid, set_id uuid, front text, back text, example text, word_type varchar, image_url text,
      audio_url text, created_at timestamptz, next_review timestamptz, last_reviewed timestamptz, status varchar
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING set_id
  `;
  // total_cards увеличиваем только на реально вставленные (повтор из очереди не задваивает)
  const countsBySet = {};
  for (const r of inserted) countsBySet[r.set_id] = (countsBySet[r.set_id] || 0) + 1;
  for (const [setId, count] of Object.entries(countsBySet)) {
    await sql`UPDATE card_sets SET total_cards = total_cards + ${count} WHERE id = ${setId}::uuid`;
  }
  return true;
}

export async function createCard(sql, me, p) {
  return insertCards(sql, me, [p.card]);
}

export async function createCardsBatch(sql, me, p) {
  return insertCards(sql, me, p.cards);
}

export async function deleteSet(sql, me, p) {
  const setId = uuid(p.setId, 'setId');
  await assertOwnSet(sql, me, setId);
  await sql`DELETE FROM cards WHERE set_id = ${setId}::uuid`;
  await sql`DELETE FROM card_sets WHERE id = ${setId}::uuid`;
  return true;
}

export async function deleteCard(sql, me, p) {
  const cardId = uuid(p.cardId, 'cardId');
  const rows = await sql`
    DELETE FROM cards c USING card_sets s
    WHERE c.id = ${cardId}::uuid AND s.id = c.set_id AND s.user_id = ${me}::uuid
    RETURNING c.id
  `;
  // Уже удалённая карточка (повтор из очереди) — не ошибка
  if (rows.length === 0) {
    const exists = await sql`SELECT 1 FROM cards WHERE id = ${cardId}::uuid`;
    if (exists.length > 0) throw new HttpError(403, 'Not your card');
  }
  return true;
}

export async function updateSetMeta(sql, me, p) {
  const setId = uuid(p.setId, 'setId');
  const f = p.fields || {};
  const rows = await sql`
    UPDATE card_sets
    SET title = COALESCE(${optString(f.title, 255)}, title),
        description = COALESCE(${optString(f.description, 2000)}, description),
        category = COALESCE(${optString(f.category, 100)}, category),
        language_from = COALESCE(${optString(f.languageFrom, 10)}, language_from),
        language_to = COALESCE(${optString(f.languageTo, 10)}, language_to),
        kind = COALESCE(${optSetKind(f.kind)}, kind),
        updated_at = NOW()
    WHERE id = ${setId}::uuid AND user_id = ${me}::uuid
    RETURNING id
  `;
  if (rows.length === 0) throw new HttpError(403, 'Not your set');
  return true;
}

export async function updateSetCourse(sql, me, p) {
  const setId = uuid(p.setId, 'setId');
  const courseId = p.courseId ? uuid(p.courseId, 'courseId') : null;
  if (courseId) await assertOwnCourse(sql, me, courseId);
  const rows = await sql`
    UPDATE card_sets SET course_id = ${courseId}, updated_at = NOW()
    WHERE id = ${setId}::uuid AND user_id = ${me}::uuid
    RETURNING id
  `;
  if (rows.length === 0) throw new HttpError(403, 'Not your set');
  return true;
}

// ─── Курсы ──────────────────────────────────────────────────────────────────
