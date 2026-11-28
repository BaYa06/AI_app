/**
 * Куда вернуть учителя после входа (plan/new/web_cabinet.md, Web 3).
 * Храним только путь внутри кабинета, не полный адрес: так «?returnTo=https://evil.com» не сработает.
 */

const KEY = 'teach.returnTo';

/** Разрешён только свой путь: `/courses/12?tab=exams`. Всё остальное — null. */
export function sanitizeReturnTo(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  if (value.length > 300) return null;
  if (!value.startsWith('/')) return null;
  // `//host`, `/\host`, схемы, управляющие символы
  if (value.startsWith('//') || value.includes('\\')) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  if (/^\/[^?#]*:/.test(value)) return null;
  // Служебные страницы входа не запоминаем — получится петля
  if (value === '/sign-in' || value.startsWith('/sign-in?') || value.startsWith('/auth-callback')) {
    return null;
  }
  return value;
}

export function rememberReturnTo(path: string): void {
  const safe = sanitizeReturnTo(path);
  if (!safe) return;
  try {
    window.sessionStorage.setItem(KEY, safe);
  } catch {
    // sessionStorage недоступен (приватный режим) — вернём на главную
  }
}

/** Забрать запомненный путь (и забыть его) */
export function takeReturnTo(): string {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    return sanitizeReturnTo(raw) ?? '/';
  } catch {
    return '/';
  }
}
