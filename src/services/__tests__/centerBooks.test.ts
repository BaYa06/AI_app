import { describe, expect, it } from '@jest/globals';
import {
  activeBookEntry,
  activeCenter,
  centerBooksOfLanguage,
  centerLanguages,
  closedCenterBookIds,
  isCenterOpen,
  myBookEntries,
  nextLevelBook,
} from '../centerBooks';
import type { CenterBook, MyCenter, MyCenters } from '../CenterService';

const book = (id: string, languageFrom: string, position: number | null): CenterBook => ({
  id,
  title: id,
  edition: '',
  level: null,
  languageFrom,
  languageTo: 'ru',
  position,
  unitsCount: 12,
  cardsCount: 180,
});

const center = (id: string, active: boolean, books: CenterBook[]): MyCenter => ({
  id,
  name: id,
  city: null,
  logoUrl: null,
  greeting: null,
  contact: null,
  accessUntil: '2099-01-01T00:00:00Z',
  active,
  books,
});

const alfa = center('alfa', true, [
  book('elementary', 'en', 2),
  book('beginner', 'en', 1),
  book('pre-int', 'en', 3),
  book('menschen', 'de', 1),
]);

const data: MyCenters = {
  organizations: [alfa],
  myBooks: [
    { bookId: 'menschen', currentUnitId: null, isActive: false, updatedAt: '2026-11-17T10:00:00Z' },
    { bookId: 'beginner', currentUnitId: null, isActive: true, updatedAt: '2026-11-10T10:00:00Z' },
  ],
};

describe('«Мои книги» учебного центра (Center 6)', () => {
  it('текущая книга — первой, остальные по последнему изменению', () => {
    expect(myBookEntries(data).map((e) => e.book.id)).toEqual(['beginner', 'menschen']);
    expect(activeBookEntry(data)?.book.id).toBe('beginner');
  });

  it('без отмеченной текущей — последняя изменённая', () => {
    const noActive = { ...data, myBooks: data.myBooks.map((m) => ({ ...m, isActive: false })) };
    expect(activeBookEntry(noActive)?.book.id).toBe('menschen');
    expect(activeBookEntry(null)).toBeNull();
  });

  it('книги языка — по порядку уровней', () => {
    expect(centerBooksOfLanguage(alfa, 'en').map((b) => b.id)).toEqual([
      'beginner',
      'elementary',
      'pre-int',
    ]);
  });

  it('следующий уровень того же языка, у последнего — нет', () => {
    expect(nextLevelBook(alfa, alfa.books[1])?.id).toBe('elementary');
    expect(nextLevelBook(alfa, alfa.books[2])).toBeNull();
    expect(nextLevelBook(alfa, alfa.books[3])).toBeNull();
  });

  it('языки центра и центр с доступом', () => {
    expect(centerLanguages(alfa)).toEqual(['en', 'de']);
    const expired = { ...data, organizations: [center('alfa', false, alfa.books)] };
    expect(activeCenter(expired)).toBeNull();
    expect(activeCenter(data, 'alfa')?.id).toBe('alfa');
    expect(activeCenter(data, 'other')).toBeNull();
  });

  it('доступ закрыт: сервер сказал «нет» или срок прошёл по часам телефона (Center 7)', () => {
    const now = Date.parse('2026-11-17T00:00:00Z');
    expect(isCenterOpen(alfa, now)).toBe(true);
    // Без сети кэш «активен», но срок уже прошёл
    expect(isCenterOpen({ ...alfa, accessUntil: '2026-11-16T23:59:00Z' }, now)).toBe(false);
    expect(isCenterOpen({ ...alfa, active: false }, now)).toBe(false);
    expect(isCenterOpen({ ...alfa, accessUntil: 'не дата' }, now)).toBe(false);
  });

  it('закрытые книги — все книги центров без доступа', () => {
    const beta = center('beta', false, [book('beta-1', 'en', 1)]);
    const both = { ...data, organizations: [alfa, beta] };
    expect([...closedCenterBookIds(both, Date.parse('2026-11-17T00:00:00Z'))]).toEqual(['beta-1']);
    expect(closedCenterBookIds(null).size).toBe(0);
  });
});
