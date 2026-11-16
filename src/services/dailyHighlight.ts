/**
 * «Новое» — одна фича в день после урока дня (plan/new/new_user_activation.md, Start 4.1).
 *
 * Считаем дни с пройденным уроком, а не календарные: пропустил день — фича не сгорает.
 * На N-й день с уроком подсвечиваем фичу этого дня, если ученик её ещё не открыл сам
 * (задание «Начала пути» выполнено — фича уже знакома, в этот день плашки нет).
 * Каждую плашку показываем, пока её не нажали или не закрыли; на следующий день — следующая.
 */
import { readCache, writeCache } from './localCache';
import type { StartTaskId } from '@/store/startTasksStore';

export type HighlightId = 'photo' | 'builder' | 'widget' | 'context' | 'voice' | 'week';

/** День с уроком → фича. День 1 — первый урок (карточки и «Пары»), плашки нет */
export const HIGHLIGHT_BY_DAY: Record<number, HighlightId> = {
  2: 'photo',
  3: 'builder',
  4: 'widget',
  5: 'context',
  6: 'voice',
  7: 'week',
};

/** Если это задание «Начала пути» уже выполнено — фича знакома, плашку не показываем */
const TASK_OF: Partial<Record<HighlightId, StartTaskId>> = {
  photo: 'photo',
  widget: 'widget',
  voice: 'voice',
};

export interface HighlightState {
  /** Даты (YYYY-MM-DD) с пройденным уроком, по порядку; первые 7 — больше не нужно */
  lessonDays: string[];
  /** Плашки, которые нажали или закрыли */
  dismissed: HighlightId[];
  /** «Хочешь начать и <язык>?» — закрытые языки (Start 4.3) */
  dismissedLanguages?: string[];
}

const CACHE_NAME = 'daily_highlight';
const EMPTY: HighlightState = { lessonDays: [], dismissed: [] };
const MAX_DAYS = 7;

export function addHighlightLessonDay(state: HighlightState, date: string): HighlightState {
  if (state.lessonDays.includes(date) || state.lessonDays.length >= MAX_DAYS) return state;
  return { ...state, lessonDays: [...state.lessonDays, date] };
}

/**
 * Что подсветить сегодня. Только в день, когда урок уже пройден (плашка — после урока дня),
 * и только у новых учеников (isNewStudent — выдан стартовый набор).
 */
export function pickHighlight(
  state: HighlightState,
  today: string,
  opts: {
    isNewStudent: boolean;
    doneTasks: readonly StartTaskId[];
    /** Виджет на экране блокировки доступен (iPhone, iOS 16+) */
    widgetAvailable: boolean;
  }
): { id: HighlightId; day: number } | null {
  if (!opts.isNewStudent) return null;
  const index = state.lessonDays.indexOf(today);
  if (index < 0) return null;
  const day = index + 1;
  const id = HIGHLIGHT_BY_DAY[day];
  if (!id || state.dismissed.includes(id)) return null;
  if (id === 'widget' && !opts.widgetAvailable) return null;
  const task = TASK_OF[id];
  if (task && opts.doneTasks.includes(task)) return null;
  return { id, day };
}

export function dismissHighlight(state: HighlightState, id: HighlightId): HighlightState {
  if (state.dismissed.includes(id)) return state;
  return { ...state, dismissed: [...state.dismissed, id] };
}

export function loadHighlightState(): HighlightState {
  return readCache<HighlightState>(CACHE_NAME) ?? EMPTY;
}

export function saveHighlightState(state: HighlightState): void {
  writeCache(CACHE_NAME, state);
}

/** Урок дня пройден сегодня (итоги урока, первый урок в онбординге) */
export function recordHighlightLessonDay(date: string): void {
  const prev = loadHighlightState();
  const next = addHighlightLessonDay(prev, date);
  if (next !== prev) saveHighlightState(next);
}

/** С какого дня с уроком предлагаем начать ещё один изучаемый язык */
export const EXTRA_LANGUAGE_FROM_DAY = 3;

/**
 * «Хочешь начать и <язык>?» (Start 4.3): в онбординге выбрано 2–3 языка, набор — только на первом.
 * С 3-го дня с уроком, в день урока; язык, для которого набор уже выдан или карточку закрыли, — нет.
 */
export function pickExtraLanguage(
  state: HighlightState,
  today: string,
  opts: { isNewStudent: boolean; targetLanguages: readonly string[]; issued: readonly string[] }
): string | null {
  if (!opts.isNewStudent || !state.lessonDays.includes(today)) return null;
  if (state.lessonDays.length < EXTRA_LANGUAGE_FROM_DAY) return null;
  const closed = state.dismissedLanguages ?? [];
  return (
    opts.targetLanguages.slice(1).find((l) => !opts.issued.includes(l) && !closed.includes(l)) ??
    null
  );
}

export function dismissExtraLanguage(state: HighlightState, language: string): HighlightState {
  const closed = state.dismissedLanguages ?? [];
  if (closed.includes(language)) return state;
  return { ...state, dismissedLanguages: [...closed, language] };
}
