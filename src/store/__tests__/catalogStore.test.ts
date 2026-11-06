import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type {
  CatalogCollection,
  CatalogCollectionResponse,
  CatalogSearchResponse,
  CatalogSubjectResponse,
} from '@/types/library';

const mockService = {
  getCatalog: jest.fn<() => Promise<unknown>>(),
  getCatalogSubject: jest.fn<(slug: string) => Promise<unknown>>(),
  getCatalogCollection: jest.fn<(id: string) => Promise<unknown>>(),
  searchCatalog: jest.fn<(q: string) => Promise<unknown>>(),
  importSet: jest.fn<(u: string, id: string, c: string | null) => Promise<{ newSetId: string }>>(),
  importCollection: jest.fn<() => Promise<unknown>>(),
};
// Лениво: фабрика jest.mock поднимается выше объявления mockService.
jest.mock('@/services/LibraryService', () => ({
  LibraryService: new Proxy(
    {},
    {
      get:
        (_t, name: string) =>
        (...args: unknown[]) =>
          (mockService as unknown as Record<string, (...a: unknown[]) => unknown>)[name](...args),
    }
  ),
}));

// Подписка каталога на удаление наборов — без настоящего setsStore (он тянет Supabase).
jest.mock('@/store/setsStore', () => ({ useSetsStore: { subscribe: jest.fn() } }));

import { useCatalogStore } from '../catalogStore';

const store = () => useCatalogStore.getState();

const col = (over: Partial<CatalogCollection> = {}): CatalogCollection => ({
  id: 'travel',
  subject: 'languages',
  track: 'en',
  trackTitle: null,
  level: 'A2',
  title: 'Путешествия',
  description: null,
  icon: null,
  position: 1,
  setsCount: 3,
  cardsCount: 60,
  addedCount: 1,
  ...over,
});

const collectionResponse: CatalogCollectionResponse = {
  collection: { ...col(), subjectTitle: 'Языки', setKind: 'language', levelScale: 'cefr' },
  sets: [
    {
      id: 's1',
      title: 'Аэропорт',
      description: null,
      position: 1,
      cardsCount: 20,
      isImported: true,
    },
    { id: 's2', title: 'Отель', description: null, position: 2, cardsCount: 20, isImported: false },
    { id: 's3', title: 'Город', description: null, position: 3, cardsCount: 20, isImported: false },
  ],
};

const subjectResponse: CatalogSubjectResponse = {
  subject: {
    slug: 'languages',
    title: 'Языки',
    subtitle: null,
    icon: 'globe',
    trackLabel: 'Язык',
    levelScale: 'cefr',
    setKind: 'language',
  },
  tracks: [{ key: 'en', title: null, levels: ['A2'] }],
  collections: [col()],
};

/** Глубокая копия: стор (immer) замораживает переданные объекты. */
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Промис, который разрешаем вручную — чтобы проверить порядок ответов поиска. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const emptySearch: CatalogSearchResponse = { collections: [], sets: [], books: [] };

describe('catalogStore', () => {
  beforeEach(() => {
    Object.values(mockService).forEach((m) => m.mockReset());
    store().clear();
  });

  it('личное добавление: отметка у набора и +1 «добавлено» в подборке, предмете и поиске', async () => {
    mockService.getCatalogCollection.mockResolvedValue(copy(collectionResponse));
    mockService.getCatalogSubject.mockResolvedValue(copy(subjectResponse));
    mockService.searchCatalog.mockResolvedValue({
      collections: [col()],
      sets: [{ ...collectionResponse.sets[1], collection: col() }],
      books: [],
    });
    mockService.importSet.mockResolvedValue({ newSetId: 'copy-1' });

    await store().fetchCollection('travel');
    await store().fetchSubject('languages');
    await store().search('оте');
    await expect(store().importSet('s2')).resolves.toBe('copy-1');

    expect(mockService.importSet).toHaveBeenCalledWith('', 's2', null);
    const c = store().collections.travel.data;
    expect(c.sets.map((s) => s.isImported)).toEqual([true, true, false]);
    expect(c.collection.addedCount).toBe(2);
    expect(store().subjects.languages.data.collections[0].addedCount).toBe(2);
    expect(store().searchResult?.collections[0].addedCount).toBe(2);
    expect(store().searchResult?.sets[0].isImported).toBe(true);
    expect(store().searchResult?.sets[0].collection?.addedCount).toBe(2);
  });

  it('добавление в курс «добавлено» не меняет', async () => {
    mockService.getCatalogCollection.mockResolvedValue(copy(collectionResponse));
    mockService.importSet.mockResolvedValue({ newSetId: 'copy-2' });
    await store().fetchCollection('travel');
    await store().importSet('s2', 'course-1');
    expect(store().collections.travel.data.sets[1].isImported).toBe(false);
    expect(store().collections.travel.data.collection.addedCount).toBe(1);
  });

  it('ответ на устаревший поисковый запрос отбрасывается', async () => {
    const first = deferred<CatalogSearchResponse>();
    mockService.searchCatalog
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ ...emptySearch, collections: [col({ title: 'Отель-2' })] });

    const slow = store().search('от');
    await store().search('отель');
    first.resolve({ ...emptySearch, collections: [col({ title: 'старый ответ' })] });
    await slow;

    expect(store().searchQuery).toBe('отель');
    expect(store().searchResult?.collections[0].title).toBe('Отель-2');
    expect(store().searchLoading).toBe(false);
  });

  it('короткий запрос очищает результат и не ходит на сервер', async () => {
    await store().search('о');
    expect(mockService.searchCatalog).not.toHaveBeenCalled();
    expect(store().searchResult).toBeNull();
  });

  it('кэш: повторный заход не ходит на сервер, invalidate и force — ходят', async () => {
    mockService.getCatalogSubject.mockResolvedValue(copy(subjectResponse));
    await store().fetchSubject('languages');
    await store().fetchSubject('languages');
    expect(mockService.getCatalogSubject).toHaveBeenCalledTimes(1);

    store().invalidate();
    expect(store().subjects.languages).toBeDefined(); // данные остаются — экран не мигает
    await store().fetchSubject('languages');
    await store().fetchSubject('languages', { force: true });
    expect(mockService.getCatalogSubject).toHaveBeenCalledTimes(3);
  });

  it('ошибка загрузки — понятный текст, данные не трогаем', async () => {
    mockService.getCatalog.mockRejectedValue(new Error('HTTP 500'));
    await store().fetchCatalog();
    expect(store().catalog).toBeNull();
    expect(store().catalogLoading).toBe(false);
    expect(typeof store().catalogError).toBe('string');
  });

  it('удалили набор в «Моих наборах» — каталог помечен устаревшим', async () => {
    mockService.getCatalogSubject.mockResolvedValue(copy(subjectResponse));
    await store().fetchSubject('languages');
    const { useSetsStore } = jest.requireMock('@/store/setsStore') as {
      useSetsStore: { subscribe: jest.Mock<(fn: unknown) => void> };
    };
    const listener = useSetsStore.subscribe.mock.calls[0][0] as (
      s: { setsOrder: string[] },
      p: { setsOrder: string[] }
    ) => void;
    listener({ setsOrder: ['a'] }, { setsOrder: ['a', 'b'] });
    await store().fetchSubject('languages');
    expect(mockService.getCatalogSubject).toHaveBeenCalledTimes(2);
  });

  it('выход из аккаунта очищает всё', async () => {
    mockService.getCatalogCollection.mockResolvedValue(copy(collectionResponse));
    await store().fetchCollection('travel');
    store().clear();
    expect(store().collections).toEqual({});
    expect(store().catalog).toBeNull();
  });
});
