/**
 * Стопка «Начало пути» (plan/new/new_user_activation.md, Start 3.1, 3.9).
 *
 * Выполненные задания и награды — на сервере (api/_handlers/data/onboardingTasks.js), здесь —
 * их копия и то, что живёт только на устройстве: порядок после «Позже» и «закрыто крестиком».
 * Стопку видят только новые ученики (startedAt — когда выдан стартовый набор) первые 14 дней.
 */
import { create } from 'zustand';
import { callDataApi } from '@/services/neon/core';
import { readCache, writeCache } from '@/services/localCache';
import { log } from '@/utils/logger';
import { useDiamondStore } from './diamondStore';

export type StartTaskId =
  | 'first_lesson'
  | 'session'
  | 'photo'
  | 'library'
  | 'course'
  | 'push'
  | 'widget'
  | 'voice';

/** Порядок в стопке по умолчанию (первый урок выполнен сразу и в стопке не показывается) */
export const START_TASK_ORDER: StartTaskId[] = [
  'session',
  'photo',
  'library',
  'course',
  'push',
  'widget',
  'voice',
];
export const START_TASKS_TOTAL = START_TASK_ORDER.length + 1;
/** Через сколько дней стопка исчезает сама */
export const START_TASKS_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const LOCAL_CACHE = 'start_tasks_local';

interface LocalState {
  order: StartTaskId[];
  closed: boolean;
}

interface ServerState {
  starterSetId: string | null;
  startedAt: number | null;
  done: StartTaskId[];
  diamonds: number;
  reward: number;
}

interface StartTasksState {
  loaded: boolean;
  starterSetId: string | null;
  startedAt: number | null;
  done: StartTaskId[];
  order: StartTaskId[];
  closed: boolean;
  /** Награда, которую ещё не показали на главной (счётчик алмазов подпрыгнет и покажет «+N») */
  pendingReward: number;
  load: () => Promise<void>;
  /** Задание выполнено (вызывают экраны по событию). Повтор и чужие ученики — без эффекта */
  complete: (task: StartTaskId) => Promise<void>;
  later: (task: StartTaskId) => void;
  close: () => void;
  takePendingReward: () => number;
}

function readLocal(): LocalState {
  const cached = readCache<LocalState>(LOCAL_CACHE);
  const order = (cached?.order ?? []).filter((t) => START_TASK_ORDER.includes(t));
  // Новые задания (после обновления приложения) — в конец
  for (const t of START_TASK_ORDER) if (!order.includes(t)) order.push(t);
  return { order, closed: cached?.closed === true };
}

/** Стопка ещё показывается: новый ученик, не закрыл, не прошло 14 дней, есть невыполненное */
export function isStartTasksVisible(
  s: Pick<StartTasksState, 'loaded' | 'startedAt' | 'closed' | 'done'>,
  now: number = Date.now()
): boolean {
  if (!s.loaded || !s.startedAt || s.closed) return false;
  if (now - s.startedAt > START_TASKS_DAYS * DAY_MS) return false;
  return START_TASK_ORDER.some((t) => !s.done.includes(t));
}

export const useStartTasksStore = create<StartTasksState>((set, get) => ({
  loaded: false,
  starterSetId: null,
  startedAt: null,
  done: [],
  ...readLocal(),
  pendingReward: 0,

  load: async () => {
    const data = await callDataApi<ServerState>('getOnboardingTasks', {}, 'GET');
    if (!data) return;
    set({
      loaded: true,
      starterSetId: data.starterSetId,
      startedAt: data.startedAt,
      done: data.done,
      ...readLocal(),
    });
    useDiamondStore.getState().setDiamonds(data.diamonds);
  },

  complete: async (task) => {
    const s = get();
    if (s.done.includes(task)) return;
    // Стопка только у новых учеников; до загрузки не знаем — спросим сервер, он сам решит
    if (s.loaded && !s.startedAt && task !== 'first_lesson') return;
    set({ done: [...s.done, task] });
    try {
      const res = await callDataApi<{ awarded: number; diamonds: number }>(
        'completeOnboardingTask',
        { task }
      );
      if (!res) return;
      useDiamondStore.getState().setDiamonds(res.diamonds);
      if (res.awarded > 0) set({ pendingReward: get().pendingReward + res.awarded });
    } catch (e) {
      log.warn('StartTasks', 'Задание не отмечено', e);
    }
  },

  later: (task) => {
    const order = [...get().order.filter((t) => t !== task), task];
    set({ order });
    writeCache(LOCAL_CACHE, { order, closed: get().closed });
  },

  close: () => {
    set({ closed: true });
    writeCache(LOCAL_CACHE, { order: get().order, closed: true });
  },

  takePendingReward: () => {
    const n = get().pendingReward;
    if (n) set({ pendingReward: 0 });
    return n;
  },
}));
