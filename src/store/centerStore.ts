/**
 * «Мои центры» — учебные центры ученика, их книги и выбранные книги (plan/new/center_books.md, Center 6).
 *
 * Хранится на устройстве через localCache (ключ привязан к пользователю): карточка книги на главной
 * видна и без сети. Источник правды — сервер (my-orgs): refresh() при фокусе главной и после
 * изменений. Слова книги без доступа сервер не отдаёт — кэш здесь только про названия и выбор.
 */
import { create } from 'zustand';
import { CACHE_OWNER_KEY, readCache, writeCache } from '@/services/localCache';
import { StorageService } from '@/services/StorageService';
import { CenterService, type MyCenters, type MyCenterBook } from '@/services/CenterService';

const CACHE_NAME = 'my_centers';

interface CenterStoreState {
  data: MyCenters | null;
  /** Чей кэш в памяти: после выхода и входа другим аккаунтом перечитываем */
  owner: string | null;
  /** Хотя бы раз загрузили с сервера в этом запуске */
  loaded: boolean;
  /** Показать кэш с устройства (без сети) — до ответа сервера */
  hydrate: () => void;
  /** Загрузить с сервера; без сети — остаётся кэш */
  refresh: () => Promise<MyCenters | null>;
  /** Выбрать книгу / юнит / сделать текущей. false — не удалось (нет сети или доступа) */
  pickBook: (
    bookId: string,
    opts?: { unitId?: string | null; active?: boolean }
  ) => Promise<boolean>;
  /** Убрать книгу из «Моих книг» (прогресс по словам остаётся) */
  removeBook: (bookId: string) => Promise<boolean>;
}

export const useCenterStore = create<CenterStoreState>((set, get) => {
  const save = (data: MyCenters) => {
    writeCache(CACHE_NAME, data);
    set({ data, loaded: true });
  };

  /** Ответ my-book — сразу в кэш, не дожидаясь полного my-orgs */
  const applyMine = (mine: MyCenterBook, makeActive: boolean) => {
    const data = get().data;
    if (!data) return;
    const others = data.myBooks
      .filter((m) => m.bookId !== mine.bookId)
      .map((m) => (makeActive ? { ...m, isActive: false } : m));
    save({ ...data, myBooks: [mine, ...others] });
  };

  return {
    // Кэш читаем при первом refresh/hydrate: до входа владелец кэша (пользователь) ещё неизвестен
    data: null,
    owner: null,
    loaded: false,

    hydrate: () => {
      const owner = StorageService.getString(CACHE_OWNER_KEY) ?? null;
      if (owner !== get().owner) {
        set({ owner, loaded: false, data: readCache<MyCenters>(CACHE_NAME) ?? null });
      }
    },

    refresh: async () => {
      get().hydrate();
      const fresh = await CenterService.loadMine();
      if (fresh) save(fresh);
      return fresh ?? get().data;
    },

    pickBook: async (bookId, opts = {}) => {
      const r = await CenterService.setMyBook({
        bookId,
        unitId: opts.unitId ?? undefined,
        active: opts.active,
      });
      if (!r.ok) return false;
      if (r.myBook) applyMine(r.myBook, opts.active === true);
      // В ответе my-book нет названия и набора юнита — берём полный my-orgs
      await get().refresh();
      return true;
    },

    removeBook: async (bookId) => {
      const r = await CenterService.setMyBook({ bookId, remove: true });
      if (!r.ok) return false;
      const data = get().data;
      if (data) save({ ...data, myBooks: data.myBooks.filter((m) => m.bookId !== bookId) });
      return true;
    },
  };
});
