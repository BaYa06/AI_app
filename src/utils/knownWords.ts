/**
 * Прогресс в словах, а не в уроках (plan/new/new_user_activation.md, Start 5.3):
 * «Ты знаешь 47 слов» и на 7-й и 30-й день — «это как первые 2 главы учебника».
 */
import { useCardsStore } from '@/store';
import { pluralize } from './index';

/** Слово «знаешь» — его учили хотя бы раз (уровень ≥ 1) */
export function countKnownWords(): number {
  return Object.values(useCardsStore.getState().cards).filter((c) => (c.learningStep || 0) >= 1)
    .length;
}

/** Слов в главе учебника — примерно (главы школьных учебников — 20–30 новых слов) */
const WORDS_PER_CHAPTER = 25;
/** В какие дни с начала учёбы показываем сравнение */
export const MILESTONE_DAYS = [7, 30];

/** «Это как первая глава учебника» / «…первые 2 главы…»; меньше 20 слов — сравнения нет */
export function chaptersComparison(words: number): string | null {
  if (words < 20) return null;
  const n = Math.max(1, Math.round(words / WORDS_PER_CHAPTER));
  return n === 1
    ? 'Это как первая глава учебника'
    : `Это как первые ${n} ${pluralize(n, 'глава', 'главы', 'глав')} учебника`;
}

/** Какой по счёту день с начала учёбы (startedAt — выдача стартового набора), с 1 */
export function studyDay(startedAt: number | null, now: number = Date.now()): number | null {
  if (startedAt == null) return null;
  return Math.floor((now - startedAt) / (24 * 60 * 60 * 1000)) + 1;
}
