/**
 * «Мои центры» — учебные центры ученика, их книги и мои курсы книг (plan/new/center_books.md, Center 6,
 * этап 7).
 *
 * Хранится на устройстве через localCache (ключ привязан к пользователю): доступ центра и полка
 * «Книги <центр>» видны и без сети. Источник правды — сервер (my-orgs): refresh() при фокусе главной и после
 * изменений. Слова книги без доступа сервер не отдаёт — кэш здесь только про названия и выбор.
 */
import { create } from 'zustand';
import { CACHE_OWNER_KEY, readCache, writeCache } from '@/services/localCache';
import { StorageService } from '@/services/StorageService';
import { CenterService, type MyCenters } from '@/services/CenterService';
import { closedCenterBookIds } from '@/services/centerBooks';
import { useCardsStore } from './cardsStore';
import { useSetsStore } from './setsStore';

const CACHE_NAME = 'my_centers';

/**
 * Доступ к центру закончился — его наборы с телефона убираем (Center 7): из «Моих наборов», урока
 * дня, игр и виджета (главная пересобирает виджет по словам урока). Только локально: прогресс в
 * card_progress на сервере остаётся, с новым кодом наборы вернутся. Без сети уже скачанные слова
 * работают до этого момента; сервер ответы по закрытой книге всё равно не примет (Center 2).
 */
export function closeExpiredCenterSets(data: MyCenters | null, now: number = Date.now()): number {
  const closed = closedCenterBookIds(data, now);
  if (closed.size === 0) return 0;
  const stale = Object.values(useSetsStore.getState().sets).filter(
    (set) => set.isOfficial && !!set.bookId && closed.has(set.bookId)
  );
  for (const set of stale) {
    useCardsStore.getState().replaceSetCards(set.id, []);
    useSetsStore.getState().deleteSet(set.id); // официальный набор: удаляется только локально
  }
  return stale.length;
}

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
}

export const useCenterStore = create<CenterStoreState>((set, get) => {
  const save = (data: MyCenters) => {
    writeCache(CACHE_NAME, data);
    set({ data, loaded: true });
    closeExpiredCenterSets(data);
  };

  return {
    // Кэш читаем при первом refresh/hydrate: до входа владелец кэша (пользователь) ещё неизвестен
    data: null,
    owner: null,
    loaded: false,

    hydrate: () => {
      const owner = StorageService.getString(CACHE_OWNER_KEY) ?? null;
      if (owner !== get().owner) {
        const cached = readCache<MyCenters>(CACHE_NAME) ?? null;
        set({ owner, loaded: false, data: cached });
      }
      // Без сети: по кэшу и часам телефона — срок мог пройти с последней загрузки
      closeExpiredCenterSets(get().data);
    },

    refresh: async () => {
      get().hydrate();
      const fresh = await CenterService.loadMine();
      if (fresh) save(fresh);
      return fresh ?? get().data;
    },
  };
});
