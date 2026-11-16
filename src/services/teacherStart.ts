/**
 * Первые шаги учителя (plan/new/new_user_activation.md, Start 6.1–6.3): демо теста, курс,
 * приглашение, первый тест, статистика. На устройстве, по пользователю — это подсказки, не данные.
 * Чек-лист видят только новые учителя (отметка ставится в конце онбординга) первые 14 дней.
 */
import { create } from 'zustand';
import { readCache, writeCache } from './localCache';

export type TeacherTaskId = 'demo' | 'course' | 'invite' | 'test' | 'stats';
export const TEACHER_TASK_ORDER: TeacherTaskId[] = ['demo', 'course', 'invite', 'test', 'stats'];
const DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_NAME = 'teacher_start';

interface Saved {
  startedAt: number | null;
  subject: string | null;
  done: TeacherTaskId[];
  closed: boolean;
}

const EMPTY: Saved = { startedAt: null, subject: null, done: [], closed: false };

interface TeacherStartState extends Saved {
  reload: () => void;
}

export const useTeacherStartStore = create<TeacherStartState>((set) => ({
  ...(readCache<Saved>(CACHE_NAME) ?? EMPTY),
  reload: () => set({ ...(readCache<Saved>(CACHE_NAME) ?? EMPTY) }),
}));

function update(change: (s: Saved) => Saved) {
  const prev = readCache<Saved>(CACHE_NAME) ?? EMPTY;
  const next = change(prev);
  writeCache(CACHE_NAME, next);
  useTeacherStartStore.setState(next);
}

/** Учитель закончил онбординг — начинаем «Первые шаги» */
export function markTeacherStarted(subject: string | null): void {
  update((s) => (s.startedAt ? s : { ...s, startedAt: Date.now(), subject }));
}

export function markTeacherTask(task: TeacherTaskId): void {
  update((s) => (s.done.includes(task) ? s : { ...s, done: [...s.done, task] }));
}

export function closeTeacherStart(): void {
  update((s) => ({ ...s, closed: true }));
}

export function isTeacherStartVisible(
  s: Pick<Saved, 'startedAt' | 'closed' | 'done'>,
  now: number = Date.now()
): boolean {
  if (!s.startedAt || s.closed || now - s.startedAt > DAYS * DAY_MS) return false;
  return TEACHER_TASK_ORDER.some((t) => !s.done.includes(t));
}
