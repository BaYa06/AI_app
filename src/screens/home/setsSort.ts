/** Сортировка наборов на главной (Clean 8a — вынесено из HomeScreen). */
import { StorageService, STORAGE_KEYS } from '@/services/StorageService';
import type { CardSet } from '@/types';

export type SetsSortKey = 'recent' | 'due' | 'progress' | 'newest' | 'alpha' | 'size';

export const SETS_SORT_OPTIONS: { key: SetsSortKey; label: string; short: string }[] = [
  { key: 'recent', label: 'Недавно изученные', short: 'Недавние' },
  { key: 'due', label: 'Нужно повторить', short: 'Повторить' },
  { key: 'progress', label: 'Прогресс: меньше → больше', short: 'Прогресс' },
  { key: 'newest', label: 'Новые', short: 'Новые' },
  { key: 'alpha', label: 'По алфавиту', short: 'А–Я' },
  { key: 'size', label: 'Больше карточек', short: 'Размер' },
];

export const DEFAULT_SETS_SORT: SetsSortKey = 'recent';

/** Месяц создания набора на плитке даты */
export const SHORT_MONTHS = [
  'янв',
  'фев',
  'мар',
  'апр',
  'мая',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

export function loadSetsSort(): SetsSortKey {
  try {
    const saved = StorageService.getString(STORAGE_KEYS.HOME_SETS_SORT);
    if (SETS_SORT_OPTIONS.some((o) => o.key === saved)) return saved as SetsSortKey;
  } catch {}
  return DEFAULT_SETS_SORT;
}

const byRecent = (a: CardSet, b: CardSet) =>
  (b.lastStudiedAt ?? 0) - (a.lastStudiedAt ?? 0) || b.createdAt - a.createdAt;

const masteredRatio = (s: CardSet) =>
  s.cardCount > 0 ? (s.masteredCount || 0) / s.cardCount : Number.POSITIVE_INFINITY; // пустые — в конец

export const SETS_COMPARATORS: Record<SetsSortKey, (a: CardSet, b: CardSet) => number> = {
  recent: byRecent,
  due: (a, b) => (b.reviewCount || 0) - (a.reviewCount || 0) || byRecent(a, b),
  progress: (a, b) => masteredRatio(a) - masteredRatio(b) || byRecent(a, b),
  newest: (a, b) => b.createdAt - a.createdAt,
  alpha: (a, b) =>
    (a.title || '').localeCompare(b.title || '', 'ru', { sensitivity: 'base', numeric: true }),
  size: (a, b) => (b.cardCount || 0) - (a.cardCount || 0) || byRecent(a, b),
};
