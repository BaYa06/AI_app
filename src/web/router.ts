/**
 * Маленький роутер веб-кабинета учителя на History API (plan/new/web_cabinet.md, Web 2).
 *
 * Без react-router: маршрутов немного, нужны только путь, параметры, navigate, назад/вперёд и защита
 * от потери несохранённого. Кабинет живёт либо в корне домена (teach.flashlycards.app), либо под
 * префиксом /teach (app.flashlycards.app/teach) — префикс определяется один раз при запуске.
 */
import { useSyncExternalStore } from 'react';

export type RouteParams = Record<string, string>;
export type RouteMatch = { name: string; params: RouteParams };
export type RouteDef = { name: string; pattern: string };

/** Путь без префикса и без query: `/courses/12` → ['courses','12'] */
function segments(path: string): string[] {
  return path.split('?')[0].split('#')[0].split('/').filter(Boolean);
}

/** Сопоставить путь с первым подходящим шаблоном (`/courses/:id`). Лишние/недостающие сегменты — не совпадение. */
export function matchRoute(path: string, defs: RouteDef[]): RouteMatch | null {
  const parts = segments(path);
  for (const def of defs) {
    const pat = segments(def.pattern);
    if (pat.length !== parts.length) continue;
    const params: RouteParams = {};
    let ok = true;
    for (let i = 0; i < pat.length; i++) {
      if (pat[i].startsWith(':')) {
        try {
          params[pat[i].slice(1)] = decodeURIComponent(parts[i]);
        } catch {
          ok = false;
          break;
        }
      } else if (pat[i] !== parts[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { name: def.name, params };
  }
  return null;
}

/** Убрать префикс кабинета из пути браузера. `/teach/courses` при base `/teach` → `/courses`. */
export function stripBase(pathname: string, base: string): string {
  if (!base) return pathname || '/';
  if (pathname === base) return '/';
  if (pathname.startsWith(base + '/')) return pathname.slice(base.length);
  return pathname || '/';
}

export function withBase(path: string, base: string): string {
  return base + (path.startsWith('/') ? path : '/' + path);
}

/** Префикс определяем по адресу страницы: под /teach — это app.flashlycards.app/teach */
export function detectBase(pathname: string): string {
  return pathname === '/teach' || pathname.startsWith('/teach/') ? '/teach' : '';
}

export const BASE_PATH = typeof window !== 'undefined' ? detectBase(window.location.pathname) : '';
const NAV_EVENT = 'teach:navigate';

/** Текущий путь кабинета вместе с query: `/courses/12?tab=exams` */
function currentPath(): string {
  if (typeof window === 'undefined') return '/';
  const { pathname, search } = window.location;
  return stripBase(pathname, BASE_PATH) + search;
}

// ---- защита от ухода со страницы ----

let guard: (() => boolean) | null = null;

/**
 * Поставить защиту: перед переходом вызывается guard(); false — остаться на месте.
 * Возвращает функцию снятия. Нужна форме с несохранёнными изменениями («Несохранённые изменения»).
 */
export function setNavigationGuard(fn: (() => boolean) | null): () => void {
  guard = fn;
  return () => {
    if (guard === fn) guard = null;
  };
}

export function navigate(path: string, opts: { replace?: boolean } = {}): boolean {
  if (typeof window === 'undefined') return false;
  if (guard && !guard()) return false;
  const url = withBase(path, BASE_PATH);
  if (opts.replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
  window.dispatchEvent(new Event(NAV_EVENT));
  return true;
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('popstate', cb);
  window.addEventListener(NAV_EVENT, cb);
  return () => {
    window.removeEventListener('popstate', cb);
    window.removeEventListener(NAV_EVENT, cb);
  };
}

/** Текущий путь кабинета (перерисовывает компонент при переходах и «назад/вперёд») */
export function usePath(): string {
  return useSyncExternalStore(subscribe, currentPath, () => '/');
}

export function useRoute(defs: RouteDef[]): RouteMatch | null {
  return matchRoute(usePath(), defs);
}

/** Query-параметры текущего адреса */
export function useQuery(): URLSearchParams {
  const path = usePath();
  return new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
}
