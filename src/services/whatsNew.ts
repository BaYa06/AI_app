/**
 * Отбор новостей для окна «Что нового» (plan/new/whats_new.md, шаг News 1)
 * @description Храним не «последнюю версию», а id просмотренных новостей: версия без новостей окно
 * не открывает, а кто пропустил несколько версий, видит всё непросмотренное за них.
 * Состояние — на устройстве (не в localCache: тот привязан к пользователю и пуст до входа).
 */
import { StorageService } from './StorageService';
import {
  WHATS_NEW_ARTS,
  type WhatsNewArt,
  type WhatsNewItem,
  type WhatsNewPage,
  type WhatsNewPlatform,
  type WhatsNewRole,
} from '@/types/whatsNew';

const STORAGE_KEY = 'whats_new';
export const WHATS_NEW_MAX_PAGES = 4;

export interface WhatsNewState {
  /** id просмотренных новостей */
  seen: string[];
  /**
   * Первый запуск был без входа (новичок): после входа все известные новости отмечаем
   * просмотренными, а до этого ничего не показываем
   */
  markOnSignIn?: boolean;
}

export interface WhatsNewContext {
  seen: string[];
  appVersion: string;
  role: WhatsNewRole;
  platform: WhatsNewPlatform;
  /** Версия ОС, например '26.0.1'; на вебе — пусто */
  osVersion?: string | number | null;
  /** YYYY-MM-DD */
  today: string;
}

/** Сравнение версий по числам: 1.6.10 > 1.6.9. Отрицательное — a раньше b */
export function compareVersions(a: string | number, b: string | number): number {
  const pa = String(a).split('.').map((p) => parseInt(p, 10) || 0);
  const pb = String(b).split('.').map((p) => parseInt(p, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Непросмотренные новости, подходящие этому человеку, по убыванию priority */
export function selectNews(all: WhatsNewItem[], ctx: WhatsNewContext): WhatsNewItem[] {
  const seen = new Set(ctx.seen);
  return all
    .filter((n) => !seen.has(n.id))
    .filter((n) => compareVersions(n.minVersion, ctx.appVersion) <= 0)
    .filter((n) => n.roles.includes(ctx.role))
    .filter((n) => n.platforms.includes(ctx.platform))
    .filter((n) => !n.minOs || (ctx.osVersion != null && compareVersions(n.minOs, ctx.osVersion) <= 0))
    .filter((n) => n.publishedAt <= ctx.today)
    .filter((n) => !n.expiresAt || ctx.today <= n.expiresAt)
    .sort((a, b) => b.priority - a.priority);
}

export function knownArt(art: string | null | undefined): WhatsNewArt | null {
  return art && (WHATS_NEW_ARTS as readonly string[]).includes(art) ? (art as WhatsNewArt) : null;
}

/** Не больше 4 страниц: если новостей больше — первые три, остальные списком на странице «И ещё» */
export function toPages(items: WhatsNewItem[]): WhatsNewPage[] {
  const page = (item: WhatsNewItem): WhatsNewPage => ({ kind: 'item', item, art: knownArt(item.art) });
  if (items.length <= WHATS_NEW_MAX_PAGES) return items.map(page);
  const head = items.slice(0, WHATS_NEW_MAX_PAGES - 1);
  return [...head.map(page), { kind: 'summary', items: items.slice(WHATS_NEW_MAX_PAGES - 1) }];
}

/** Все новости на страницах — закрыл окно, значит просмотрел их все */
export function pageItemIds(pages: WhatsNewPage[]): string[] {
  return pages.flatMap((p) => (p.kind === 'item' ? [p.item.id] : p.items.map((n) => n.id)));
}

/**
 * Состояние при запуске. В версии, где появилось окно, ключа нет ни у кого — и у новичка, и у
 * того, кто давно пользуется приложением. Различаем по входу: уже вошёл — старый пользователь,
 * новости покажем; не вошёл — новичок, после входа все известные новости считаем просмотренными.
 */
export function resolveState(
  saved: WhatsNewState | undefined,
  opts: { isSignedIn: boolean; allIds: string[] },
): WhatsNewState {
  if (!saved) return opts.isSignedIn ? { seen: [] } : { seen: [], markOnSignIn: true };
  if (saved.markOnSignIn && opts.isSignedIn) return { seen: markSeen(saved.seen, opts.allIds) };
  return saved;
}

/** Можно ли сейчас показывать окно: новичок до входа и сразу после него ничего не видит */
export function canShowNews(state: WhatsNewState): boolean {
  return !state.markOnSignIn;
}

export function markSeen(seen: string[], ids: string[]): string[] {
  const set = new Set(seen);
  const added = ids.filter((id) => !set.has(id));
  return added.length ? [...seen, ...added] : seen;
}

export function loadWhatsNewState(): WhatsNewState | undefined {
  const saved = StorageService.getObject<WhatsNewState>(STORAGE_KEY);
  return saved && Array.isArray(saved.seen) ? saved : undefined;
}

export function saveWhatsNewState(state: WhatsNewState): void {
  StorageService.setObject(STORAGE_KEY, state);
}
