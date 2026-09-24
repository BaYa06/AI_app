import { createClient } from '@supabase/supabase-js';

/**
 * Общая проверка Supabase JWT для backend-эндпоинтов.
 * Файл начинается с "_", поэтому Vercel не публикует его как отдельный роут.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yiwsmjbeirgomkrckoju.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

/** Достаёт userId из Supabase JWT в заголовке Authorization. Возвращает null, если токен отсутствует/невалиден. */
export async function getAuthedUserId(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || !SUPABASE_ANON_KEY) return null;
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}
