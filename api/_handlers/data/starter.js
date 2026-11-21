/**
 * Стартовый набор нового ученика (plan/new/new_user_activation.md, Start 1.3).
 *
 * Набор собирает клиент (src/services/StarterSetService.ts), сервер отвечает за правило
 * «один раз в жизни аккаунта»: отметка users.starter_set_id ставится в той же транзакции, что и
 * вставка набора. Удалил набор, переустановил приложение, вошёл с другого устройства — второго
 * не будет. Учитель стартовый набор не получает.
 *
 * Гонка двух запросов: второй UPDATE ждёт блокировку строки users, видит отметку первого
 * и ничего не меняет, а его INSERT ... WHERE EXISTS (starter_set_id = свой id) ничего не вставляет.
 */
import { HttpError, uuid } from '../../_access.js';
import { optString } from './_shared.js';
import { optSetKind } from './sets.js';

const MAX_STARTER_CARDS = 40;

export async function createStarterSet(sql, me, p) {
  const s = p.set || {};
  const setId = uuid(s.id, 'set.id').toLowerCase();
  const cards = Array.isArray(p.cards) ? p.cards : [];
  if (cards.length === 0 || cards.length > MAX_STARTER_CARDS) {
    throw new HttpError(400, 'Invalid starter cards');
  }

  const user = await sql`
    SELECT starter_set_id, COALESCE(teacher, false) AS teacher, target_languages,
           COALESCE(starter_extra, '{}'::jsonb) AS starter_extra
    FROM users WHERE id = ${me}::uuid
  `;
  if (user.length === 0) throw new HttpError(404, 'User not found');
  if (user[0].teacher) return { created: false, reason: 'teacher' };
  if (p.extra === true) return createExtraStarterSet(sql, me, p, user[0], setId, cards);
  if (user[0].starter_set_id) return { created: false, reason: 'already_issued' };

  const now = new Date().toISOString();
  // Карточки — всегда в этот набор, что бы ни прислал клиент
  const rows = cards.map((c, i) => ({
    id: uuid(c.id, 'card.id').toLowerCase(),
    front: optString(c.frontText, 2000) ?? '',
    back: optString(c.backText, 2000) ?? '',
    example: optString(c.example, 4000),
    word_form: optString(c.wordForm, 100),
    // Порядок понятий: сервер сортирует по created_at
    created_at: new Date(Date.parse(now) + i).toISOString(),
  }));
  await sql.transaction([
    sql`
      UPDATE users SET starter_set_id = ${setId}::uuid, starter_set_issued_at = NOW()
      WHERE id = ${me}::uuid AND starter_set_id IS NULL
    `,
    sql`
      INSERT INTO card_sets (
        id, user_id, course_id, title, description, category, language_from, language_to, kind,
        is_public, created_at, updated_at, total_cards, mastered_cards, studying_cards, origin
      )
      SELECT ${setId}::uuid, ${me}::uuid, NULL, ${optString(s.title, 255) || 'Первые слова'},
             NULL, ${optString(s.category, 100) || 'languages'},
             ${optString(s.languageFrom, 10)}, ${optString(s.languageTo, 10)},
             ${optSetKind(s.kind) || 'language'}, false, ${now}, ${now}, ${rows.length}, 0, 0, NULL
      WHERE EXISTS (
        SELECT 1 FROM users WHERE id = ${me}::uuid AND starter_set_id = ${setId}::uuid
      )
      ON CONFLICT (id) DO NOTHING
    `,
    sql`
      INSERT INTO cards (id, set_id, front, back, example, word_form, created_at, next_review, status)
      SELECT r.id, ${setId}::uuid, r.front, r.back, r.example, r.word_form, r.created_at, ${now}, 'new'
      FROM json_to_recordset(${JSON.stringify(rows)}::json) AS r(
        id uuid, front text, back text, example text, word_form varchar, created_at timestamptz
      )
      WHERE EXISTS (
        SELECT 1 FROM users WHERE id = ${me}::uuid AND starter_set_id = ${setId}::uuid
      )
      ON CONFLICT (id) DO NOTHING
    `,
  ]);

  const after = await sql`SELECT starter_set_id FROM users WHERE id = ${me}::uuid`;
  const created = after[0]?.starter_set_id === setId;
  return created ? { created: true, setId } : { created: false, reason: 'already_issued' };
}

/**
 * Стартовый набор второго (третьего) изучаемого языка (plan/new/new_user_activation.md, Start 4.3):
 * «Хочешь начать и немецкий?». По одному на язык из онбординга, кроме основного, тоже один раз
 * в жизни аккаунта: отметка users.starter_extra = { язык: id набора } (миграция 050) ставится
 * в той же транзакции, что и вставка, — так же, как основной набор.
 */
async function createExtraStarterSet(sql, me, p, user, setId, cards) {
  const s = p.set || {};
  const lang = optString(s.languageFrom, 10);
  const targets = Array.isArray(user.target_languages) ? user.target_languages : [];
  if (!user.starter_set_id) return { created: false, reason: 'no_starter' };
  if (!lang || targets.indexOf(lang) < 1) throw new HttpError(400, 'Not an extra target language');
  if (user.starter_extra[lang]) return { created: false, reason: 'already_issued' };

  const now = new Date().toISOString();
  const rows = cards.map((c, i) => ({
    id: uuid(c.id, 'card.id').toLowerCase(),
    front: optString(c.frontText, 2000) ?? '',
    back: optString(c.backText, 2000) ?? '',
    example: optString(c.example, 4000),
    word_form: optString(c.wordForm, 100),
    created_at: new Date(Date.parse(now) + i).toISOString(),
  }));

  await sql.transaction([
    sql`
      UPDATE users
      SET starter_extra = COALESCE(starter_extra, '{}'::jsonb) || jsonb_build_object(${lang}::text, ${setId}::text)
      WHERE id = ${me}::uuid AND NOT (COALESCE(starter_extra, '{}'::jsonb) ? ${lang}::text)
    `,
    sql`
      INSERT INTO card_sets (
        id, user_id, course_id, title, description, category, language_from, language_to, kind,
        is_public, created_at, updated_at, total_cards, mastered_cards, studying_cards, origin
      )
      SELECT ${setId}::uuid, ${me}::uuid, NULL, ${optString(s.title, 255) || 'Первые слова'},
             NULL, ${optString(s.category, 100) || 'languages'}, ${lang}, ${optString(s.languageTo, 10)},
             'language', false, ${now}, ${now}, ${rows.length}, 0, 0, NULL
      WHERE EXISTS (
        SELECT 1 FROM users WHERE id = ${me}::uuid AND starter_extra ->> ${lang}::text = ${setId}::text
      )
      ON CONFLICT (id) DO NOTHING
    `,
    sql`
      INSERT INTO cards (id, set_id, front, back, example, word_form, created_at, next_review, status)
      SELECT r.id, ${setId}::uuid, r.front, r.back, r.example, r.word_form, r.created_at, ${now}, 'new'
      FROM json_to_recordset(${JSON.stringify(rows)}::json) AS r(
        id uuid, front text, back text, example text, word_form varchar, created_at timestamptz
      )
      WHERE EXISTS (
        SELECT 1 FROM users WHERE id = ${me}::uuid AND starter_extra ->> ${lang}::text = ${setId}::text
      )
      ON CONFLICT (id) DO NOTHING
    `,
  ]);

  const after =
    await sql`SELECT starter_extra ->> ${lang}::text AS id FROM users WHERE id = ${me}::uuid`;
  return after[0]?.id === setId
    ? { created: true, setId }
    : { created: false, reason: 'already_issued' };
}
