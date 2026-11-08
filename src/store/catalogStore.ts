/**
 * Каталог библиотеки: предмет → (язык / раздел) → (уровень) → подборка → набор
 * (plan/new/library_catalog.md, Catalog 5). Отдельно от libraryStore: тот держит старые полки
 * и фильтры, которые уходят целиком (Catalog 6, 10).
 *
 * Кэш: каталог и предметы — 5 минут, подборки — 2 минуты. Повторный заход на экран рисуется из кэша
 * сразу; force — перезагрузить. invalidate() помечает всё устаревшим, но данные оставляет, чтобы не
 * мигать пустым экраном (зовётся, когда пользователь удалил набор: его копия могла быть из библиотеки).
 *
 * «Добавлено» после личного импорта обновляется на месте во всех загруженных подборках, предметах и
 * поиске — без перезагрузки дерева (план, «Слабые места», п. 8). Импорт в курс «добавлено» не меняет.
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { LibraryService } from '@/services/LibraryService';
import { useSetsStore } from '@/store/setsStore';
import type {
  CatalogCollection,
  CatalogCollectionResponse,
  CatalogResponse,
  CatalogSearchResponse,
  CatalogSubjectResponse,
  ImportCollectionResponse,
} from '@/types/library';
import { describeError } from '@/utils/userErrors';

const CATALOG_TTL_MS = 5 * 60 * 1000;
const SUBJECT_TTL_MS = 5 * 60 * 1000;
const COLLECTION_TTL_MS = 2 * 60 * 1000;
/** Короче — сервер вернёт пустой ответ, не ходим зря. */
export const MIN_SEARCH_LENGTH = 2;

interface Cached<T> {
  data: T;
  at: number;
}

interface CatalogState {
  catalog: Cached<CatalogResponse> | null;
  catalogLoading: boolean;
  catalogError: string | null;

  subjects: Record<string, Cached<CatalogSubjectResponse>>;
  subjectLoading: Record<string, boolean>;
  subjectError: Record<string, string | null>;

  collections: Record<string, Cached<CatalogCollectionResponse>>;
  collectionLoading: Record<string, boolean>;
  collectionError: Record<string, string | null>;

  searchQuery: string;
  searchResult: CatalogSearchResponse | null;
  searchLoading: boolean;
  searchError: string | null;
}

interface CatalogActions {
  fetchCatalog: (opts?: { force?: boolean; lang?: string | null }) => Promise<void>;
  fetchSubject: (slug: string, opts?: { force?: boolean }) => Promise<void>;
  fetchCollection: (id: string, opts?: { force?: boolean }) => Promise<void>;
  /** Запрос короче MIN_SEARCH_LENGTH очищает результат. Ответы на устаревший запрос отбрасываются. */
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
  /** Добавить набор себе (courseId = null) или в свой курс. Возвращает id копии. */
  importSet: (librarySetId: string, courseId?: string | null) => Promise<string>;
  /** Вся подборка в свой курс (учитель). */
  importCollection: (collectionId: string, courseId: string) => Promise<ImportCollectionResponse>;
  invalidate: () => void;
  /** Выход из аккаунта: отметки «добавлено» принадлежат пользователю. */
  clear: () => void;
}

const fresh = (c: { at: number } | null | undefined, ttl: number) => !!c && Date.now() - c.at < ttl;

const initialState: CatalogState = {
  catalog: null,
  catalogLoading: false,
  catalogError: null,
  subjects: {},
  subjectLoading: {},
  subjectError: {},
  collections: {},
  collectionLoading: {},
  collectionError: {},
  searchQuery: '',
  searchResult: null,
  searchLoading: false,
  searchError: null,
};

export const useCatalogStore = create<CatalogState & CatalogActions>()(
  immer((set, get) => {
    /**
     * Набор добавлен себе: отметка у набора и +1 «добавлено» у его подборки везде, где она загружена.
     * «Продолжить» зависит от последних добавлений — каталог помечаем устаревшим.
     */
    const markImported = (librarySetId: string) =>
      set((s) => {
        let collectionId: string | null = null;
        for (const entry of Object.values(s.collections)) {
          const item = entry.data.sets.find((x) => x.id === librarySetId);
          if (!item || item.isImported) continue;
          item.isImported = true;
          collectionId = entry.data.collection.id;
        }
        const searchSet = s.searchResult?.sets.find((x) => x.id === librarySetId);
        if (searchSet && !searchSet.isImported) {
          searchSet.isImported = true;
          collectionId = collectionId ?? searchSet.collection?.id ?? null;
        }
        if (collectionId) {
          const bump = (c: CatalogCollection | null | undefined) => {
            if (c && c.id === collectionId && c.addedCount < c.setsCount) c.addedCount += 1;
          };
          const own = s.collections[collectionId];
          if (own) bump(own.data.collection);
          for (const entry of Object.values(s.subjects)) entry.data.collections.forEach(bump);
          s.searchResult?.collections.forEach(bump);
          s.searchResult?.sets.forEach((x) => bump(x.collection));
          if (s.catalog) {
            bump(s.catalog.data.continue?.collection);
            bump(s.catalog.data.start);
          }
        }
        if (s.catalog) s.catalog.at = 0;
      });

    return {
      ...initialState,

      fetchCatalog: async ({ force = false, lang = null } = {}) => {
        if (get().catalogLoading) return;
        if (!force && fresh(get().catalog, CATALOG_TTL_MS)) return;
        set((s) => {
          s.catalogLoading = true;
          s.catalogError = null;
        });
        try {
          const data = await LibraryService.getCatalog(lang);
          set((s) => {
            s.catalog = { data, at: Date.now() };
            s.catalogLoading = false;
          });
        } catch (error) {
          set((s) => {
            s.catalogLoading = false;
            s.catalogError = describeError(error, 'Не удалось загрузить библиотеку');
          });
        }
      },

      fetchSubject: async (slug, { force = false } = {}) => {
        if (get().subjectLoading[slug]) return;
        if (!force && fresh(get().subjects[slug], SUBJECT_TTL_MS)) return;
        set((s) => {
          s.subjectLoading[slug] = true;
          s.subjectError[slug] = null;
        });
        try {
          const data = await LibraryService.getCatalogSubject(slug);
          set((s) => {
            s.subjects[slug] = { data, at: Date.now() };
            s.subjectLoading[slug] = false;
          });
        } catch (error) {
          set((s) => {
            s.subjectLoading[slug] = false;
            s.subjectError[slug] = describeError(error, 'Не удалось загрузить предмет');
          });
        }
      },

      fetchCollection: async (id, { force = false } = {}) => {
        if (get().collectionLoading[id]) return;
        if (!force && fresh(get().collections[id], COLLECTION_TTL_MS)) return;
        set((s) => {
          s.collectionLoading[id] = true;
          s.collectionError[id] = null;
        });
        try {
          const data = await LibraryService.getCatalogCollection(id);
          set((s) => {
            s.collections[id] = { data, at: Date.now() };
            s.collectionLoading[id] = false;
          });
        } catch (error) {
          set((s) => {
            s.collectionLoading[id] = false;
            s.collectionError[id] = describeError(error, 'Не удалось загрузить подборку');
          });
        }
      },

      search: async (query) => {
        const q = query.trim();
        set((s) => {
          s.searchQuery = query;
          s.searchError = null;
          if (q.length < MIN_SEARCH_LENGTH) {
            s.searchResult = null;
            s.searchLoading = false;
          } else {
            s.searchLoading = true;
          }
        });
        if (q.length < MIN_SEARCH_LENGTH) return;
        try {
          const result = await LibraryService.searchCatalog(q);
          // Пока шёл запрос, пользователь допечатал — этот ответ уже не нужен.
          if (get().searchQuery.trim() !== q) return;
          set((s) => {
            s.searchResult = result;
            s.searchLoading = false;
          });
        } catch (error) {
          if (get().searchQuery.trim() !== q) return;
          set((s) => {
            s.searchLoading = false;
            s.searchError = describeError(error, 'Не удалось выполнить поиск');
          });
        }
      },

      clearSearch: () =>
        set((s) => {
          s.searchQuery = '';
          s.searchResult = null;
          s.searchLoading = false;
          s.searchError = null;
        }),

      importSet: async (librarySetId, courseId = null) => {
        // userId сервер берёт из токена — первый аргумент в LibraryService не используется.
        const result = await LibraryService.importSet('', librarySetId, courseId);
        if (!courseId) markImported(librarySetId);
        return result.newSetId;
      },

      importCollection: (collectionId, courseId) =>
        LibraryService.importCollection(collectionId, courseId),

      invalidate: () =>
        set((s) => {
          if (s.catalog) s.catalog.at = 0;
          for (const entry of Object.values(s.subjects)) entry.at = 0;
          for (const entry of Object.values(s.collections)) entry.at = 0;
        }),

      clear: () => set(() => ({ ...initialState })),
    };
  })
);

/**
 * Пользователь удалил набор (или курс вместе с наборами): копия могла быть из библиотеки, на сервере её
 * отметка «добавлено» снимается каскадом — каталог перечитаем при следующем заходе
 * (plan/new/library_catalog.md, слабые места, п. 4). Подписка здесь, а не в setsStore: так setsStore
 * не зависит от библиотеки.
 */
useSetsStore.subscribe((state, prev) => {
  if (state.setsOrder.length < prev.setsOrder.length) useCatalogStore.getState().invalidate();
});
