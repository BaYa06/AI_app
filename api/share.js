import { neon } from '@neondatabase/serverless';
import { randomBytes } from 'node:crypto';
import { ensureDatabaseInitialized } from './_db-init.js';
import { getAuthedUserId } from './_auth.js';
import { renderSharePage, renderShareErrorPage } from './_share-page.js';

/**
 * Наборы по ссылке (plan/new/share_set.md, Share 1).
 *
 * POST /api/share?action=create   { setId }                 – ссылка на свой набор (повторно — та же)
 * GET  /api/share?action=status&setId=…                     – действующая ссылка своего набора или null
 * POST /api/share?action=disable  { setId }                 – закрыть доступ по ссылке
 * GET  /api/share?action=preview&code=…                     – превью без входа; с токеном + viewer
 * GET  /s/<code> → /api/share?action=page&code=…            – HTML-страница превью (Share 2)
 * GET  /api/share?action=cards&code=…                       – все карточки (гость копирует набор на устройство)
 * POST /api/share?action=import   { code, courseId? }       – копия набора себе (курс — только свой)
 * POST /api/share?action=report   { code, reason, comment? } – жалоба, набор скрывается у пожаловавшегося
 * POST /api/share?action=block    { code }                  – заблокировать автора ссылки
 *
 * userId — только из Supabase JWT. Превью работает без токена: по нему страница-превью (Share 2)
 * и экран приложения показывают набор до входа.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const CODE_RE = /^[0-9A-Za-z]{10}$/;
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// Домен ссылок — один на сервере и в приложении (src/config); свой домен подключается через env.
const SHARE_ORIGIN = (process.env.SHARE_ORIGIN || 'https://ai-app-seven-zeta.vercel.app').replace(/\/$/, '');

const PREVIEW_CARDS = 20;
const MAX_CARDS = 2000;
const IMPORTS_PER_HOUR = 30;
const REPORT_REASONS = new Set(['offensive', 'spam', 'inappropriate', 'copyright', 'other']);

const PUBLIC_ACTIONS = new Set(['preview', 'page', 'cards']);

const shareUrl = (code) => `${SHARE_ORIGIN}/s/${code}`;

// 10 символов base62 ≈ 59 бит. Остаток от 256 % 62 даёт небольшой перекос — для неугадываемости не важно.
function generateCode() {
  const bytes = randomBytes(10);
  let code = '';
  for (const b of bytes) code += BASE62[b % 62];
  return code;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action } = req.query;
  const userId = await getAuthedUserId(req);
  if (!PUBLIC_ACTIONS.has(action) && !userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.body || {};
  const setId = body.setId ?? req.query.setId;
  const code = body.code ?? req.query.code;
  if (setId !== undefined && !isUuid(setId)) return res.status(400).json({ error: 'setId must be a uuid' });
  if (code !== undefined && !CODE_RE.test(code)) {
    if (action === 'page') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(404).send(renderShareErrorPage('not_found', SHARE_ORIGIN));
    }
    return res.status(400).json({ error: 'invalid_code' });
  }

  const sql = neon(process.env.POSTGRES_URL);
  await ensureDatabaseInitialized(sql);

  try {
    const isGet = req.method === 'GET';
    if (action === 'preview' && isGet)  return await preview(req, res, sql, userId, code);
    if (action === 'page' && isGet)     return await page(res, sql, code);
    if (action === 'cards' && isGet)    return await allCards(res, sql, code);
    if (action === 'status' && isGet)   return await status(res, sql, userId, setId);
    if (isGet) return res.status(405).json({ error: 'Method not allowed' });

    if (action === 'create')  return await createShare(res, sql, userId, setId);
    if (action === 'disable') return await disableShare(res, sql, userId, setId);
    if (action === 'import')  return await importShared(res, sql, userId, code, body.courseId ?? null);
    if (action === 'report')  return await reportShared(res, sql, userId, code, body.reason, body.comment);
    if (action === 'block')   return await blockAuthor(res, sql, userId, code);
    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.error('Share API error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// Ссылка вместе с отметкой о закрытии; удалённый набор уносит её строку (ON DELETE CASCADE).
async function findShare(sql, code) {
  const rows = await sql`SELECT code, set_id, owner_id, disabled_at FROM set_shares WHERE code = ${code}`;
  return rows[0] || null;
}

// ── action=create ─────────────────────────────────────────────────────────────
async function createShare(res, sql, userId, setId) {
  if (!setId) return res.status(400).json({ error: 'setId required' });

  const owned = await sql`
    SELECT cs.id, (SELECT COUNT(*) FROM cards c WHERE c.set_id = cs.id) AS cards
    FROM card_sets cs WHERE cs.id = ${setId}::uuid AND cs.user_id = ${userId}::uuid
  `;
  if (owned.length === 0) return res.status(404).json({ error: 'Set not found or access denied' });
  const cards = Number(owned[0].cards) || 0;
  if (cards === 0) return res.status(400).json({ error: 'empty_set' });
  if (cards > MAX_CARDS) return res.status(400).json({ error: 'too_many_cards', max: MAX_CARDS });

  const existing = await sql`SELECT code FROM set_shares WHERE set_id = ${setId}::uuid AND disabled_at IS NULL`;
  if (existing.length > 0) return res.status(200).json({ code: existing[0].code, url: shareUrl(existing[0].code) });

  // Совпадение кода почти невозможно, но повторяем; гонку двух «Поделиться» ловит частичный
  // уникальный индекс по set_id — тогда отдаём ссылку, которую создал соседний запрос.
  for (let attempt = 0; attempt < 3; attempt++) {
    const newCode = generateCode();
    try {
      await sql`INSERT INTO set_shares (code, set_id, owner_id) VALUES (${newCode}, ${setId}::uuid, ${userId}::uuid)`;
      return res.status(201).json({ code: newCode, url: shareUrl(newCode) });
    } catch (e) {
      if (e.code !== '23505') throw e;
      const raced = await sql`SELECT code FROM set_shares WHERE set_id = ${setId}::uuid AND disabled_at IS NULL`;
      if (raced.length > 0) return res.status(200).json({ code: raced[0].code, url: shareUrl(raced[0].code) });
    }
  }
  return res.status(500).json({ error: 'code_generation_failed' });
}

// ── action=status ─────────────────────────────────────────────────────────────
async function status(res, sql, userId, setId) {
  if (!setId) return res.status(400).json({ error: 'setId required' });
  const rows = await sql`
    SELECT s.code, s.views, s.imports FROM set_shares s
    WHERE s.set_id = ${setId}::uuid AND s.owner_id = ${userId}::uuid AND s.disabled_at IS NULL
  `;
  if (rows.length === 0) return res.status(200).json({ share: null });
  const { code, views, imports } = rows[0];
  return res.status(200).json({ share: { code, url: shareUrl(code), views, imports } });
}

// ── action=disable ────────────────────────────────────────────────────────────
async function disableShare(res, sql, userId, setId) {
  if (!setId) return res.status(400).json({ error: 'setId required' });
  await sql`
    UPDATE set_shares SET disabled_at = NOW()
    WHERE set_id = ${setId}::uuid AND owner_id = ${userId}::uuid AND disabled_at IS NULL
  `;
  return res.status(200).json({ success: true });
}

// ── action=preview ────────────────────────────────────────────────────────────
async function preview(req, res, sql, userId, code) {
  if (!code) return res.status(400).json({ error: 'code required' });

  const share = await findShare(sql, code);
  if (!share) return res.status(404).json({ error: 'not_found' });
  if (share.disabled_at) return res.status(410).json({ error: 'disabled' });

  if (userId && userId !== share.owner_id) {
    const hidden = await sql`
      SELECT
        EXISTS (SELECT 1 FROM user_blocks WHERE user_id = ${userId}::uuid AND blocked_user_id = ${share.owner_id}::uuid) AS blocked,
        EXISTS (SELECT 1 FROM set_share_reports WHERE code = ${code} AND reporter_id = ${userId}::uuid) AS reported
    `;
    if (hidden[0].blocked) return res.status(403).json({ error: 'blocked' });
    if (hidden[0].reported) return res.status(403).json({ error: 'reported' });
  }

  const content = await loadContent(sql, share);
  if (!content) return res.status(404).json({ error: 'not_found' });

  await sql`UPDATE set_shares SET views = views + 1 WHERE code = ${code}`;

  let viewer = null;
  if (userId) {
    const isOwner = userId === share.owner_id;
    // Куда можно добавить: только свои курсы (в курс, где пользователь ученик, — нельзя).
    const [courses, imports] = await Promise.all([
      sql`SELECT id, title FROM courses WHERE user_id = ${userId}::uuid ORDER BY created_at`,
      sql`SELECT course_id, new_set_id FROM set_share_imports WHERE user_id = ${userId}::uuid AND code = ${code}`,
    ]);
    viewer = {
      isOwner,
      ownSetId: isOwner ? share.set_id : null,
      courses: courses.map((c) => ({ id: c.id, title: c.title })),
      imports: imports.map((i) => ({ courseId: i.course_id, setId: i.new_set_id })),
    };
  }

  // Без токена ответ одинаков для всех — кэшируем на CDN (views тогда считаются по промахам кэша).
  res.setHeader('Cache-Control', userId ? 'private, no-store' : 'public, s-maxage=60, stale-while-revalidate=60');
  return res.status(200).json({ ...content, viewer });
}

// Набор, автор и первые карточки — общие для JSON-превью и HTML-страницы. null — набора нет.
async function loadContent(sql, share) {
  const [setRows, cards] = await Promise.all([
    sql`
      SELECT cs.title, cs.description, cs.category, cs.language_from, cs.language_to,
             (SELECT COUNT(*) FROM cards c WHERE c.set_id = cs.id) AS cards_count,
             COALESCE(NULLIF(u.display_name, ''), NULLIF(u.user_name, '')) AS author_name
      FROM card_sets cs
      LEFT JOIN users u ON u.id = ${share.owner_id}::uuid
      WHERE cs.id = ${share.set_id}::uuid
    `,
    sql`
      SELECT front, back, example, word_form FROM cards
      WHERE set_id = ${share.set_id}::uuid
      ORDER BY sort_order NULLS LAST, created_at
      LIMIT ${PREVIEW_CARDS}
    `,
  ]);
  if (setRows.length === 0) return null;
  const set = setRows[0];

  return {
    code: share.code,
    url: shareUrl(share.code),
    set: {
      title: set.title,
      description: set.description || '',
      category: set.category || 'general',
      languageFrom: set.language_from,
      languageTo: set.language_to,
      cardsCount: Number(set.cards_count) || 0,
    },
    author: { name: set.author_name || null },
    cards: cards.map((c) => ({ front: c.front, back: c.back, example: c.example || null, wordForm: c.word_form || null })),
  };
}

// ── action=page ───────────────────────────────────────────────────────────────
// HTML для /s/<code>: без входа, одинаковый для всех — кэш на CDN. В поиск не попадает (noindex).
async function page(res, sql, code) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const url = code ? shareUrl(code) : SHARE_ORIGIN;

  const share = code ? await findShare(sql, code) : null;
  if (!share || share.disabled_at) {
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(share ? 410 : 404).send(renderShareErrorPage(share ? 'disabled' : 'not_found', url));
  }

  const content = await loadContent(sql, share);
  if (!content) return res.status(404).send(renderShareErrorPage('not_found', url));

  await sql`UPDATE set_shares SET views = views + 1 WHERE code = ${code}`;
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=60');
  return res.status(200).send(renderSharePage(content));
}

// ── action=cards ──────────────────────────────────────────────────────────────
// У гостя (анонимный вход) нет строки в users, поэтому серверный import ему недоступен: приложение
// копирует набор на устройство из этого списка (как гостевой импорт библиотеки).
async function allCards(res, sql, code) {
  if (!code) return res.status(400).json({ error: 'code required' });
  const share = await findShare(sql, code);
  if (!share) return res.status(404).json({ error: 'not_found' });
  if (share.disabled_at) return res.status(410).json({ error: 'disabled' });

  const cards = await sql`
    SELECT front, back, example, word_form, word_type FROM cards
    WHERE set_id = ${share.set_id}::uuid
    ORDER BY sort_order NULLS LAST, created_at
    LIMIT ${MAX_CARDS}
  `;
  res.setHeader('Cache-Control', 'public, s-maxage=60');
  return res.status(200).json({
    cards: cards.map((c) => ({
      front: c.front,
      back: c.back,
      example: c.example || null,
      wordForm: c.word_form || null,
      wordType: c.word_type || null,
    })),
  });
}

// ── action=import ─────────────────────────────────────────────────────────────
async function importShared(res, sql, userId, code, courseId) {
  if (!code) return res.status(400).json({ error: 'code required' });
  if (courseId !== null && !isUuid(courseId)) return res.status(400).json({ error: 'courseId must be uuid or null' });

  const share = await findShare(sql, code);
  if (!share) return res.status(404).json({ error: 'not_found' });
  if (share.disabled_at) return res.status(410).json({ error: 'disabled' });

  const [account, blocked] = await Promise.all([
    sql`SELECT 1 FROM users WHERE id = ${userId}::uuid`,
    sql`SELECT 1 FROM user_blocks WHERE user_id = ${userId}::uuid AND blocked_user_id = ${share.owner_id}::uuid`,
  ]);
  // Гость (анонимный вход) не записан в users — копирует набор на устройство через action=cards
  if (account.length === 0) return res.status(403).json({ error: 'guest_account' });
  if (blocked.length > 0) return res.status(403).json({ error: 'blocked' });

  // Набор можно положить только в свой курс (не в курс, где пользователь ученик).
  if (courseId) {
    const course = await sql`SELECT id FROM courses WHERE id = ${courseId}::uuid AND user_id = ${userId}::uuid`;
    if (course.length === 0) return res.status(403).json({ error: 'Not the owner of the course' });
  }

  const existing = await sql`
    SELECT new_set_id FROM set_share_imports
    WHERE user_id = ${userId}::uuid AND code = ${code}
      AND course_id IS NOT DISTINCT FROM ${courseId}::uuid
  `;
  if (existing.length > 0) return res.status(409).json({ error: 'already_imported', setId: existing[0].new_set_id });

  const recent = await sql`
    SELECT COUNT(*) AS n FROM set_share_imports
    WHERE user_id = ${userId}::uuid AND created_at > NOW() - INTERVAL '1 hour'
  `;
  if (Number(recent[0].n) >= IMPORTS_PER_HOUR) return res.status(429).json({ error: 'rate_limited' });

  const source = await sql`
    SELECT cs.title, cs.description, cs.category, cs.language_from, cs.language_to,
           (SELECT COUNT(*) FROM cards c WHERE c.set_id = cs.id) AS cards_count
    FROM card_sets cs WHERE cs.id = ${share.set_id}::uuid
  `;
  if (source.length === 0) return res.status(404).json({ error: 'not_found' });
  const s = source[0];
  if (Number(s.cards_count) > MAX_CARDS) return res.status(400).json({ error: 'too_many_cards', max: MAX_CARDS });

  // Одним запросом (атомарно): набор + копии карточек (без прогресса) + отметка + счётчик.
  // Двойной тап упрётся в уникальный индекс idx_set_share_imports_place, и весь запрос откатится.
  // Медиа (image_url/audio_url) не копируем — удаление у автора не должно ломать копии.
  try {
    const created = await sql`
      WITH new_set AS (
        INSERT INTO card_sets (user_id, course_id, title, description, category, language_from, language_to,
                               is_public, total_cards)
        VALUES (${userId}::uuid, ${courseId}::uuid, ${s.title}, ${s.description || ''}, ${s.category || 'general'},
                ${s.language_from}, ${s.language_to}, false, ${Number(s.cards_count) || 0})
        RETURNING id
      ), copied AS (
        INSERT INTO cards (set_id, front, back, example, word_form, word_type, sort_order)
        SELECT (SELECT id FROM new_set), c.front, c.back, c.example, c.word_form, c.word_type, c.sort_order
          FROM cards c WHERE c.set_id = ${share.set_id}::uuid
        RETURNING 1
      ), recorded AS (
        INSERT INTO set_share_imports (user_id, code, course_id, new_set_id)
        VALUES (${userId}::uuid, ${code}, ${courseId}::uuid, (SELECT id FROM new_set))
        RETURNING 1
      ), counted AS (
        UPDATE set_shares SET imports = imports + 1 WHERE code = ${code}
        RETURNING 1
      )
      SELECT (SELECT id FROM new_set) AS id, (SELECT COUNT(*) FROM copied) AS cards
    `;
    return res.status(201).json({ newSetId: created[0].id, courseId, cardsCopied: Number(created[0].cards) || 0 });
  } catch (e) {
    if (e.code !== '23505') throw e;
    const again = await sql`
      SELECT new_set_id FROM set_share_imports
      WHERE user_id = ${userId}::uuid AND code = ${code} AND course_id IS NOT DISTINCT FROM ${courseId}::uuid
    `;
    return res.status(409).json({ error: 'already_imported', setId: again[0]?.new_set_id ?? null });
  }
}

// ── action=report ─────────────────────────────────────────────────────────────
async function reportShared(res, sql, userId, code, reason, comment) {
  if (!code) return res.status(400).json({ error: 'code required' });
  if (!REPORT_REASONS.has(reason)) return res.status(400).json({ error: 'invalid_reason' });

  const share = await findShare(sql, code);
  if (!share) return res.status(404).json({ error: 'not_found' });
  if (share.owner_id === userId) return res.status(400).json({ error: 'own_set' });

  const text = typeof comment === 'string' ? comment.trim().slice(0, 1000) : '';
  await sql`
    INSERT INTO set_share_reports (code, reporter_id, reason, comment)
    VALUES (${code}, ${userId}::uuid, ${reason}, ${text || null})
    ON CONFLICT (code, reporter_id) DO NOTHING
  `;
  return res.status(201).json({ success: true });
}

// ── action=block ──────────────────────────────────────────────────────────────
async function blockAuthor(res, sql, userId, code) {
  if (!code) return res.status(400).json({ error: 'code required' });

  const share = await findShare(sql, code);
  if (!share) return res.status(404).json({ error: 'not_found' });
  if (share.owner_id === userId) return res.status(400).json({ error: 'own_set' });

  await sql`
    INSERT INTO user_blocks (user_id, blocked_user_id) VALUES (${userId}::uuid, ${share.owner_id}::uuid)
    ON CONFLICT DO NOTHING
  `;
  return res.status(201).json({ success: true });
}
