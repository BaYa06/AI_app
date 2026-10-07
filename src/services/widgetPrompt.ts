/**
 * Подсказка «Учи слова прямо с экрана блокировки» (plan/widgets.md, шаг 3.1)
 * @description Когда предлагать виджет: не при первом запуске, а когда привычка уже начинается —
 * на итогах урока дня во второй день с пройденным уроком. Не больше двух раз, не в один день,
 * не тем, у кого виджет уже стоит. Только iPhone с iOS 16+ (виджет только на экране блокировки).
 */
import { Platform } from 'react-native';
import { readCache, writeCache } from './localCache';
import { isWidgetSupported } from './widgetBridge';

const CACHE_NAME = 'widget_prompt';
/** С какого по счёту дня с пройденным уроком предлагаем */
export const PROMPT_FROM_LESSON_DAY = 2;
export const PROMPT_MAX_SHOWS = 2;
/** Сколько последних дней урока помним — больше не нужно */
const KEEP_DAYS = 10;

export interface WidgetPromptState {
  /** Даты (YYYY-MM-DD), в которые урок дня пройден до конца */
  lessonDays: string[];
  /** Даты, в которые подсказку показывали */
  shownDays: string[];
}

const EMPTY: WidgetPromptState = { lessonDays: [], shownDays: [] };

/** Урок дня пройден сегодня — запоминаем день (один раз за дату) */
export function addLessonDay(state: WidgetPromptState, date: string): WidgetPromptState {
  if (state.lessonDays.includes(date)) return state;
  return { ...state, lessonDays: [...state.lessonDays, date].slice(-KEEP_DAYS) };
}

export function shouldShowWidgetPrompt(
  state: WidgetPromptState,
  today: string,
  opts: { supported: boolean; installed: boolean },
): boolean {
  if (!opts.supported || opts.installed) return false;
  if (state.shownDays.length >= PROMPT_MAX_SHOWS || state.shownDays.includes(today)) return false;
  return state.lessonDays.length >= PROMPT_FROM_LESSON_DAY;
}

export function markPromptShown(state: WidgetPromptState, date: string): WidgetPromptState {
  if (state.shownDays.includes(date)) return state;
  return { ...state, shownDays: [...state.shownDays, date] };
}

// ==================== Хранение (на устройстве, по пользователю) ====================

export function loadPromptState(): WidgetPromptState {
  return readCache<WidgetPromptState>(CACHE_NAME) ?? EMPTY;
}

export function savePromptState(state: WidgetPromptState): void {
  writeCache(CACHE_NAME, state);
}

/** Виджет на экране блокировки есть с iOS 16 */
export function isLockScreenWidgetAvailable(): boolean {
  if (!isWidgetSupported || Platform.OS !== 'ios') return false;
  return parseInt(String(Platform.Version), 10) >= 16;
}
