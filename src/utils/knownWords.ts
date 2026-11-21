/**
 * Прогресс в словах, а не в уроках (plan/new/new_user_activation.md, Start 5.3):
 * «Ты знаешь 47 слов» и на 7-й и 30-й день — «это как первые 2 главы учебника».
 */
import { useCardsStore } from '@/store';
import { STARTER_LANGS, STARTER_THEMES } from '@/constants/starterWords';
import type { Card } from '@/types';
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

/** Что уже можно сказать в поездке — по выученным словам стартовых наборов (Start 5.4) */
const ABILITIES: Array<[conceptId: string, can: string]> = [
  ['hello', 'поздороваться'],
  ['coffee', 'заказать кофе'],
  ['where', 'спросить дорогу'],
  ['how_much', 'узнать цену'],
  ['ticket', 'купить билет'],
  ['taxi', 'вызвать такси'],
  ['bill', 'попросить счёт'],
  ['thank_you', 'поблагодарить'],
];

/** Учебные цели — ближайший рубеж: «До 100 слов — ещё 53» */
const WORD_MILESTONES = [50, 100, 250, 500, 1000, 2000];

function joinAbilities(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} и ${items[items.length - 1]}`;
}

/**
 * Подпись прогресса по цели из онбординга (plan/new/new_user_activation.md, Start 5.4):
 * «Для путешествий» → «Ты уже можешь поздороваться, заказать кофе и спросить дорогу»;
 * «Для учёбы», «Для курсов» → «До 100 слов — ещё 53»; «Для себя» и без цели — ничего.
 */
export function goalProgressLine(
  goal: string | null | undefined,
  known: number,
  learnedCards: Pick<Card, 'frontText'>[] = []
): string | null {
  if (goal === 'travel') {
    const fronts = new Set(learnedCards.map((c) => c.frontText.trim().toLowerCase()));
    const concepts = [...STARTER_THEMES.first_words.concepts, ...STARTER_THEMES.travel.concepts];
    const can = ABILITIES.filter(([id]) =>
      concepts.some(
        (c) => c.id === id && STARTER_LANGS.some((l) => fronts.has(c.words[l].word.toLowerCase()))
      )
    ).map(([, text]) => text);
    return can.length ? `Ты уже можешь ${joinAbilities(can.slice(0, 3))}` : null;
  }
  if (goal === 'studies' || goal === 'courses') {
    const next = WORD_MILESTONES.find((m) => m > known);
    if (!next || known === 0) return null;
    const left = next - known;
    return `До ${next} слов — ещё ${left}`;
  }
  return null;
}

/** Выученные карточки (уровень ≥ 1) — для goalProgressLine */
export function knownCards(): Card[] {
  return Object.values(useCardsStore.getState().cards).filter((c) => (c.learningStep || 0) >= 1);
}
