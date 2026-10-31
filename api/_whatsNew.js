/**
 * «Что нового» на сервере (plan/new/whats_new.md, News 5).
 *
 * Читает приложение — GET /api/data?action=news, без входа и с кэшем на CDN: тексты одинаковы для всех,
 * отбор по роли, платформе и версии делает приложение (src/services/whatsNew.ts).
 * Правит админка — только локально (admin-server.mjs → «Что нового»).
 *
 * Ответ приложению: { items: WhatsNewItem[], hidden: string[] }. hidden — id снятых с публикации:
 * так можно убрать и новость из запасной копии в сборке, не выпуская новую версию.
 */

const ROLES = ['student', 'teacher'];
const PLATFORMS = ['ios', 'android', 'web'];
/** Куда может вести «Попробовать» — вкладки (openNewsAction в src/components/whatsNew/newsContext.ts) */
const ROUTES = ['Home', 'Library', 'TestTab', 'Statistics', 'Study', 'Profile'];

const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

/** Строка таблицы → WhatsNewItem (src/types/whatsNew.ts) */
export function rowToItem(r) {
  return {
    id: r.id,
    minVersion: r.min_version,
    roles: r.roles,
    platforms: r.platforms,
    minOs: r.min_os,
    priority: r.priority,
    tag: r.tag,
    title: r.title,
    text: r.text,
    art: r.art,
    action: r.action_label && r.action_route ? { label: r.action_label, route: r.action_route } : null,
    publishedAt: day(r.published_at),
    expiresAt: day(r.expires_at),
  };
}

export async function getPublicNews(sql) {
  const rows = await sql`SELECT * FROM whats_new ORDER BY priority DESC, id`;
  return {
    items: rows.filter((r) => r.published).map(rowToItem),
    hidden: rows.filter((r) => !r.published).map((r) => r.id),
  };
}

export async function listNewsAdmin(sql) {
  try {
    const rows = await sql`SELECT * FROM whats_new ORDER BY published DESC, min_version DESC, priority DESC, id`;
    return { items: rows.map((r) => ({ ...rowToItem(r), published: r.published, updatedAt: r.updated_at })) };
  } catch (e) {
    // Таблицы ещё нет — создастся после деплоя API (миграция 037)
    if (e?.code === '42P01') return { missing: true, items: [] };
    throw e;
  }
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Проверка новости из админки. Возвращает { item } или { error } — текст ошибки для админки.
 * Длины по правилам плана (заголовок ≤ 40, текст ≤ 140) — жёстко: длинное не помещается в окно.
 */
export function validateNews(input) {
  const p = input || {};
  const id = str(p.id, 64);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) return { error: 'id: латиница в нижнем регистре, цифры и дефис' };
  const minVersion = str(p.minVersion, 20);
  if (!/^\d+(\.\d+){0,3}$/.test(minVersion)) return { error: 'Версия: например 1.7.0' };
  const roles = Array.isArray(p.roles) ? ROLES.filter((r) => p.roles.includes(r)) : [];
  if (!roles.length) return { error: 'Выбери хотя бы одну роль' };
  const platforms = Array.isArray(p.platforms) ? PLATFORMS.filter((x) => p.platforms.includes(x)) : [];
  if (!platforms.length) return { error: 'Выбери хотя бы одну платформу' };
  const minOs = str(p.minOs, 10) || null;
  if (minOs && !/^\d+(\.\d+){0,2}$/.test(minOs)) return { error: 'Мин. версия ОС: например 26' };
  const title = str(p.title, 60);
  if (!title) return { error: 'Нужен заголовок' };
  if (title.length > 40) return { error: `Заголовок ${title.length} символов — нужно не больше 40` };
  const text = str(p.text, 200);
  if (text.length > 140) return { error: `Текст ${text.length} символов — нужно не больше 140` };
  const actionLabel = str(p.action?.label, 40) || null;
  const actionRoute = str(p.action?.route, 40) || null;
  if ((actionLabel || actionRoute) && !(actionLabel && ROUTES.includes(actionRoute))) {
    return { error: `«Попробовать»: нужна подпись и вкладка (${ROUTES.join(', ')})` };
  }
  const publishedAt = isDay(p.publishedAt) ? p.publishedAt : new Date().toISOString().slice(0, 10);
  const expiresAt = isDay(p.expiresAt) ? p.expiresAt : null;
  if (expiresAt && expiresAt < publishedAt) return { error: 'Дата окончания раньше даты публикации' };
  const priority = Math.max(-1000, Math.min(1000, Math.trunc(Number(p.priority) || 0)));
  return {
    item: {
      id, minVersion, roles, platforms, minOs, priority,
      tag: str(p.tag, 40), title, text, art: str(p.art, 20) || null,
      actionLabel, actionRoute, publishedAt, expiresAt, published: p.published === true,
    },
  };
}

export async function saveNews(sql, input) {
  const { item: n, error } = validateNews(input);
  if (error) return { error };
  await sql`
    INSERT INTO whats_new (id, min_version, roles, platforms, min_os, priority, tag, title, text, art,
      action_label, action_route, published_at, expires_at, published, updated_at)
    VALUES (${n.id}, ${n.minVersion}, ${n.roles}, ${n.platforms}, ${n.minOs}, ${n.priority}, ${n.tag},
      ${n.title}, ${n.text}, ${n.art}, ${n.actionLabel}, ${n.actionRoute}, ${n.publishedAt}::date,
      ${n.expiresAt}::date, ${n.published}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      min_version = EXCLUDED.min_version, roles = EXCLUDED.roles, platforms = EXCLUDED.platforms,
      min_os = EXCLUDED.min_os, priority = EXCLUDED.priority, tag = EXCLUDED.tag, title = EXCLUDED.title,
      text = EXCLUDED.text, art = EXCLUDED.art, action_label = EXCLUDED.action_label,
      action_route = EXCLUDED.action_route, published_at = EXCLUDED.published_at,
      expires_at = EXCLUDED.expires_at, published = EXCLUDED.published, updated_at = NOW()
  `;
  return { ok: true };
}

export async function setNewsPublished(sql, id, published) {
  await sql`UPDATE whats_new SET published = ${published}, updated_at = NOW() WHERE id = ${id}`;
  return { ok: true };
}

export async function deleteNews(sql, id) {
  await sql`DELETE FROM whats_new WHERE id = ${id}`;
  return { ok: true };
}
