import { createClient } from '@supabase/supabase-js';

/**
 * Общая проверка Supabase JWT для backend-эндпоинтов.
 * Файл начинается с "_", поэтому Vercel не публикует его как отдельный роут.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yiwsmjbeirgomkrckoju.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

// Проверка токена у Supabase — сетевой запрос на каждый вызов API. Кэшируем подтверждённые токены
// на 60 с в пределах экземпляра функции: запуск приложения шлёт несколько запросов подряд.
// Не дольше срока самого токена (exp) — просроченный токен из кэша не пройдёт.
const AUTH_CACHE_MS = 60_000;
const AUTH_CACHE_MAX = 500;
const authCache = new Map(); // token → { user, until }

function tokenExpiryMs(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/**
 * Достаёт пользователя Supabase из JWT в заголовке Authorization.
 * Возвращает null, если токен отсутствует/невалиден.
 */
export async function getAuthedUser(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || !SUPABASE_ANON_KEY) return null;

  const now = Date.now();
  const cached = authCache.get(token);
  if (cached && cached.until > now) return cached.user;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;
    const until = Math.min(now + AUTH_CACHE_MS, tokenExpiryMs(token) || now + AUTH_CACHE_MS);
    if (authCache.size >= AUTH_CACHE_MAX) authCache.delete(authCache.keys().next().value);
    authCache.set(token, { user: data.user, until });
    return data.user;
  } catch {
    return null;
  }
}

/** Достаёт userId из Supabase JWT в заголовке Authorization. Возвращает null, если токен отсутствует/невалиден. */
export async function getAuthedUserId(req) {
  const user = await getAuthedUser(req);
  return user ? user.id : null;
}
