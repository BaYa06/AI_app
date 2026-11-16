/**
 * Подсказки в момент нужды (plan/new/new_user_activation.md, Start 4.3). Каждая — один раз.
 * Хранятся на устройстве (по пользователю): это подсказки, а не данные.
 */
import { readCache, writeCache } from './localCache';

export type MomentHintId = 'photo_after_manual' | 'another_game' | 'invite_friend';

interface HintsState {
  shown: MomentHintId[];
  /** Сколько карточек добавлено вручную — на 10-й предлагаем фото */
  manualCards: number;
  /** Режимы по дням: { 'YYYY-MM-DD': ['flashcard', …] }, последние несколько дней */
  modesByDay: Record<string, string[]>;
}

const CACHE_NAME = 'moment_hints';
const EMPTY: HintsState = { shown: [], manualCards: 0, modesByDay: {} };
export const MANUAL_CARDS_FOR_PHOTO_HINT = 10;
export const SAME_MODE_DAYS = 3;

function load(): HintsState {
  return { ...EMPTY, ...(readCache<HintsState>(CACHE_NAME) ?? {}) };
}
function save(s: HintsState) {
  writeCache(CACHE_NAME, s);
}

export function isHintShown(id: MomentHintId): boolean {
  return load().shown.includes(id);
}

export function markHintShown(id: MomentHintId): void {
  const s = load();
  if (s.shown.includes(id)) return;
  save({ ...s, shown: [...s.shown, id] });
}

/**
 * Карточка добавлена вручную. true — это 10-я, и подсказку «Быстрее: сфоткай страницу» ещё
 * не показывали: её надо показать сейчас (отметка ставится здесь же).
 */
export function noteManualCard(): boolean {
  const s = load();
  const manualCards = s.manualCards + 1;
  const due = manualCards >= MANUAL_CARDS_FOR_PHOTO_HINT && !s.shown.includes('photo_after_manual');
  save({
    ...s,
    manualCards,
    shown: due ? [...s.shown, 'photo_after_manual'] : s.shown,
  });
  return due;
}

/** Чистая часть: последние SAME_MODE_DAYS дней с занятиями — все одним и тем же режимом */
export function sameModeStreak(modesByDay: Record<string, string[]>): string | null {
  const days = Object.keys(modesByDay).sort().slice(-SAME_MODE_DAYS);
  if (days.length < SAME_MODE_DAYS) return null;
  const sets = days.map((d) => new Set(modesByDay[d]));
  if (sets.some((m) => m.size !== 1)) return null;
  const [mode] = [...sets[0]];
  return sets.every((m) => m.has(mode)) ? mode : null;
}

/**
 * Режим тренировки пройден сегодня. Возвращает режим, если 3 дня подряд с занятиями ученик
 * учит только им и подсказку «Попробуй другую игру» ещё не показывали.
 */
export function noteStudyMode(day: string, mode: string): string | null {
  const s = load();
  const modes = new Set(s.modesByDay[day] ?? []);
  modes.add(mode);
  const modesByDay = { ...s.modesByDay, [day]: [...modes] };
  // Помним только последние дни
  const keep = Object.keys(modesByDay).sort().slice(-SAME_MODE_DAYS);
  const trimmed = Object.fromEntries(keep.map((d) => [d, modesByDay[d]]));
  save({ ...s, modesByDay: trimmed });
  if (s.shown.includes('another_game')) return null;
  return sameModeStreak(trimmed);
}
