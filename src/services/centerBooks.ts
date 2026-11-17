/**
 * Правила «Моих книг» учебного центра (plan/new/center_books.md, Center 6) — чистые функции над
 * ответом my-orgs. Хранение — store/centerStore, экраны — screens/center/*.
 */
import type { CenterBook, MyCenter, MyCenterBook, MyCenters } from './CenterService';

export type MyBookEntry = {
  center: MyCenter;
  book: CenterBook;
  mine: MyCenterBook;
};

/** Книги, которые ученик выбрал, — в порядке «текущая первой, потом по последнему изменению». */
export function myBookEntries(data: MyCenters | null): MyBookEntry[] {
  if (!data) return [];
  const entries: MyBookEntry[] = [];
  for (const mine of data.myBooks) {
    for (const center of data.organizations) {
      const book = center.books.find((b) => b.id === mine.bookId);
      if (book) entries.push({ center, book, mine });
    }
  }
  return entries.sort((a, b) => {
    if (a.mine.isActive !== b.mine.isActive) return a.mine.isActive ? -1 : 1;
    return b.mine.updatedAt.localeCompare(a.mine.updatedAt);
  });
}

/** Текущая книга на главной: отмеченная текущей, иначе последняя изменённая. */
export function activeBookEntry(data: MyCenters | null): MyBookEntry | null {
  return myBookEntries(data)[0] ?? null;
}

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

/** Следующий уровень того же языка в этом центре или null. */
export function nextLevelBook(center: MyCenter, book: CenterBook): CenterBook | null {
  const list = centerBooksOfLanguage(center, book.languageFrom);
  const i = list.findIndex((b) => b.id === book.id);
  return i >= 0 && i < list.length - 1 ? list[i + 1] : null;
}

/** Языки (изучаемые) книг центра — для вкладок на экране выбора книги, в порядке появления. */
export function centerLanguages(center: MyCenter): string[] {
  return [...new Set(center.books.map((b) => b.languageFrom))];
}

/** Центр, к книгам которого сейчас есть доступ (первый по порядку) — для экрана выбора книги. */
export function activeCenter(data: MyCenters | null, orgId?: string): MyCenter | null {
  if (!data) return null;
  const list = orgId ? data.organizations.filter((o) => o.id === orgId) : data.organizations;
  return list.find((o) => o.active) ?? null;
}
