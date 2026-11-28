/**
 * Незавершённые тесты учителя (plan/new/live_test_return.md, LiveReturn 2): учитель вышел из
 * лобби или монитора, а тест идёт — сервер отдаёт такие сессии, приложение показывает плашку
 * «Идёт тест — вернуться». Ошибки сети тихие: плашку просто не показываем.
 */
import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { create } from 'zustand';
import { getAccessToken } from '@/services/auth/session';
import { rawApiFetch } from '@/services/api/client';

export interface ActiveTest {
  sessionId: string;
  courseId: string;
  courseTitle: string | null;
  setTitle: string | null;
  /** 'waiting' — лобби с кодом, 'active' — идёт */
  status: 'waiting' | 'active';
  code: string;
  testMode: string;
  /** 'warmup' — разминка перед уроком */
  purpose: string | null;
  /** 2 — экзамен (plan/new/live_exam.md) */
  engine: number;
  questionCount: number;
  timePerQuestion: number;
  participantCount: number;
}

/** Пока плашка на экране, обновляем раз в столько миллисекунд */
export const ACTIVE_TEST_POLL_MS = 30_000;

interface State {
  items: ActiveTest[];
  setItems: (items: ActiveTest[]) => void;
}

export const useActiveTestStore = create<State>((set) => ({
  items: [],
  setItems: (items) => set({ items }),
}));

export const ActiveTestApi = {
  /** null — не удалось узнать (сеть, старый сервер): прежний список не трогаем */
  async list(): Promise<ActiveTest[] | null> {
    try {
      const token = await getAccessToken();
      if (!token) return null;
      const res = await rawApiFetch('test?action=active', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data) ? (data as ActiveTest[]) : null;
    } catch {
      return null;
    }
  },
};

export async function refreshActiveTests(): Promise<void> {
  const items = await ActiveTestApi.list();
  if (items) useActiveTestStore.getState().setItems(items);
}

/** Тест уже закончился (учитель нажал «Завершить» на другом устройстве) — убрать из плашки */
export function dropActiveTest(sessionId: string): void {
  const { items, setItems } = useActiveTestStore.getState();
  if (items.some((i) => i.sessionId === sessionId)) {
    setItems(items.filter((i) => i.sessionId !== sessionId));
  }
}

/**
 * Список незавершённых тестов для плашки. Обновляется при фокусе экрана, при возврате из фона
 * и раз в 30 секунд, пока экран открыт. `enabled = false` (ученик, роль ещё неизвестна) —
 * запросов нет. `courseId` оставляет только тесты этого курса.
 */
export function useActiveTests(enabled: boolean, courseId?: string): ActiveTest[] {
  const items = useActiveTestStore((s) => s.items);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      refreshActiveTests();
      const timer = setInterval(refreshActiveTests, ACTIVE_TEST_POLL_MS);
      return () => clearInterval(timer);
    }, [enabled])
  );

  useEffect(() => {
    if (!enabled) return undefined;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshActiveTests();
    });
    return () => sub.remove();
  }, [enabled]);

  if (!enabled) return [];
  return courseId ? items.filter((i) => i.courseId === courseId) : items;
}
