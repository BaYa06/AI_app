/**
 * Книги учебного центра (plan/new/center_books.md, Center 6–7, этап 7) — чистые функции над ответом
 * my-orgs: книги по языкам и уровням, открыт ли доступ, центр по книге. Хранение — store/centerStore.
 */
import type { CenterBook, MyCenter, MyCenters } from './CenterService';

/** Книги центра одного языка по порядку уровней (org_position, потом название). */
export function centerBooksOfLanguage(center: MyCenter, languageFrom: string): CenterBook[] {
  return center.books
    .filter((b) => b.languageFrom === languageFrom)
    .sort(
      (a, b) =>
        (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) ||
        a.title.localeCompare(b.title)
    );
}

/** Языки (изучаемые) книг центра — для вкладок на экране выбора книги, в порядке появления. */
export function centerLanguages(center: MyCenter): string[] {
  return [...new Set(center.books.map((b) => b.languageFrom))];
}

/**
 * Доступ к книгам центра идёт сейчас: сервер так сказал И срок не прошёл по часам телефона —
 * без сети кэш мог остаться «активным» после конца доступа (plan/new/center_books.md, Center 7).
 */
export function isCenterOpen(center: MyCenter, now: number = Date.now()): boolean {
  const until = Date.parse(center.accessUntil);
  return center.active && Number.isFinite(until) && until > now;
}

/** Книги центров, доступ к которым закончился: их наборы на телефоне надо закрыть. */
export function closedCenterBookIds(data: MyCenters | null, now: number = Date.now()): Set<string> {
  const ids = new Set<string>();
  for (const center of data?.organizations ?? []) {
    if (!isCenterOpen(center, now)) center.books.forEach((b) => ids.add(b.id));
  }
  return ids;
}

/** За сколько дней до конца показываем плашку «возьми новый код» */
export const CENTER_WARN_DAYS = 7;

/** Центр и книга по id книги — для главной на курсе книги (этап 7). null — не книга моих центров. */
export function centerEntryOfBook(
  data: MyCenters | null,
  bookId: string
): { center: MyCenter; book: CenterBook } | null {
  for (const center of data?.organizations ?? []) {
    const book = center.books.find((b) => b.id === bookId);
    if (book) return { center, book };
  }
  return null;
}

/** Центр, к книгам которого сейчас есть доступ (первый по порядку) — для экрана выбора книги. */
export function activeCenter(data: MyCenters | null, orgId?: string): MyCenter | null {
  if (!data) return null;
  const list = orgId ? data.organizations.filter((o) => o.id === orgId) : data.organizations;
  return list.find((o) => isCenterOpen(o)) ?? null;
}
