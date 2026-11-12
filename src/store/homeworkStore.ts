/**
 * Задания ученика (plan/new/teacher_cabinet.md, Teacher 17).
 * Список — с сервера (my-homework), кэш виден сразу и без сети. Итог законченной сессии уходит
 * через очередь синхронизации (без сети не теряется) — сервер засчитывает слова заданий.
 */
import { create } from 'zustand';
import { NeonService } from '@/services/NeonService';
import { SyncQueueService } from '@/services/SyncQueueService';
import { readCache, writeCache } from '@/services/localCache';
import type { HomeworkSubmission, StudentHomework } from '@/services/homework';
import { useDiamondStore } from './diamondStore';
import { log } from '@/utils/logger';

const CACHE_KEY = 'my_homework';
/** Итог сессии не должен теряться без сети */
const SESSION_REPORT_RETRIES = 20;

type SessionReport = { cards: Array<{ cardId: string; firstTry: boolean }> };

interface HomeworkState {
  items: StudentHomework[];
  /** Список хоть раз пришёл с сервера (или из кэша) */
  loaded: boolean;
  /** Сданные этой сессией — для экрана «Задание сдано» (Teacher 28) */
  justSubmitted: HomeworkSubmission[];
  load: () => Promise<void>;
  /** Конец законченной сессии: слова сессии и слабые (ошибка) среди них */
  reportSession: (cardIds: string[], weakIds: Set<string> | string[]) => void;
  takeJustSubmitted: () => HomeworkSubmission[];
}

const cached = readCache<StudentHomework[]>(CACHE_KEY);

export const useHomeworkStore = create<HomeworkState>((set, get) => ({
  items: cached ?? [],
  loaded: cached !== undefined,
  justSubmitted: [],

  load: async () => {
    const list = await NeonService.loadMyHomework();
    if (!list) return;
    writeCache(CACHE_KEY, list);
    set({ items: list, loaded: true });
  },

  reportSession: (cardIds, weakIds) => {
    if (cardIds.length === 0) return;
    const { items, loaded } = get();
    // Известно, что ни одно слово не из несданного задания, — не шлём (список свежий или из кэша).
    // Список ещё не загружался — шлём: сервер сам пересечёт со словами заданий.
    if (loaded) {
      const words = new Set(items.filter((h) => !h.submitted).flatMap((h) => h.cardIds));
      if (!cardIds.some((id) => words.has(id))) return;
    }
    const weak = weakIds instanceof Set ? weakIds : new Set(weakIds);
    const payload: SessionReport = {
      cards: cardIds.map((cardId) => ({ cardId, firstTry: !weak.has(cardId) })),
    };
    SyncQueueService.enqueue('homeworkSession', payload, SESSION_REPORT_RETRIES);
  },

  takeJustSubmitted: () => {
    const list = get().justSubmitted;
    if (list.length > 0) set({ justSubmitted: [] });
    return list;
  },
}));

SyncQueueService.registerExecutor('homeworkSession', async (p) => {
  const result = await NeonService.reportHomeworkSession((p as SessionReport).cards);
  if (!result) return false;
  if (result.submitted.length > 0) {
    useHomeworkStore.setState((s) => ({
      justSubmitted: [...s.justSubmitted, ...result.submitted],
    }));
    // +20 алмазов начислил сервер — подтягиваем баланс
    useDiamondStore
      .getState()
      .loadRewards()
      .catch(() => {});
  }
  if (result.credited > 0) {
    useHomeworkStore
      .getState()
      .load()
      .catch((e) => log.warn('Homework', 'reload after session failed', e));
  }
  return true;
});
