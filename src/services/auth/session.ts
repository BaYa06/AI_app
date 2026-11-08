/**
 * Сессия Supabase — единственное место её чтения (plan/new/code_cleanup.md, Clean 5).
 *
 * Зачем: `supabase.auth.getSession()` вызывался в десятках файлов, каждый по-своему
 * доставал токен и id и по-своему обрабатывал ошибки. Теперь — только через этот модуль.
 *
 * Правило: `supabase.auth.*` вызываем только здесь, в `supabaseClient.ts`, `App.tsx`
 * и на экранах входа. Остальной код берёт `getAccessToken()` / `getUserId()` /
 * `getCurrentUser()` / `getSession()` / `onAuthChange()` отсюда.
 *
 * - Кэша нет: каждый вызов читает актуальную сессию (Supabase сам обновляет токен).
 * - Ошибка Supabase (`error`) → null; исключение пробрасывается — как у прямого вызова,
 *   вызывающий обрабатывает его в своём catch (например, как сетевую ошибку).
 * - Импортирует только supabaseClient и logger: сторы подключают модуль напрямую,
 *   без баррела `@/services` (иначе циклические импорты). В баррел не добавлять.
 */
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '@/services/supabaseClient';
import { log } from '@/utils/logger';

export type CurrentUser = { id: string; email: string | null; isAnonymous: boolean };

/** Сырая сессия целиком (или null). Для мест, где нужны и токен, и пользователь. */
export async function getSession(): Promise<Session | null> {
  const auth = supabase?.auth;
  if (!auth?.getSession) return null;
  // Исключение не ловим: пусть уходит в catch вызывающего, как при прямом вызове
  const { data, error } = await auth.getSession();
  if (error) {
    log.warn('Session', 'getSession error', error);
    return null;
  }
  return data?.session ?? null;
}

/** Токен доступа для заголовка Authorization (или null). */
export async function getAccessToken(): Promise<string | null> {
  const session = await getSession();
  return session?.access_token ?? null;
}

/** id текущего пользователя (или null). */
export async function getUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user?.id ?? null;
}

/** Текущий пользователь в коротком виде (или null). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const user = (await getSession())?.user;
  if (!user?.id) return null;
  return {
    id: user.id,
    email: user.email ?? null,
    isAnonymous: user.is_anonymous === true,
  };
}

/**
 * Подписка на смену сессии. Возвращает функцию отписки.
 *
 * cb вызывается через setTimeout(0): Supabase зовёт свой обработчик ВНУТРИ блокировки
 * сессии, и getSession() оттуда ждёт ту же блокировку → взаимоблокировка (см. App.tsx).
 * После отсрочки в cb можно спокойно вызывать getSession()/API.
 */
export function onAuthChange(
  cb: (event: AuthChangeEvent, session: Session | null) => void
): () => void {
  const auth = supabase?.auth;
  if (!auth?.onAuthStateChange) return () => {};

  let active = true;
  const { data } = auth.onAuthStateChange((event, session) => {
    setTimeout(() => {
      if (active) cb(event, session);
    }, 0);
  });

  return () => {
    active = false;
    data?.subscription?.unsubscribe();
  };
}
