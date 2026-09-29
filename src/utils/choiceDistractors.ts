/**
 * Неверные варианты для теста с выбором ответа (MultipleChoiceScreen).
 *
 * Раньше варианты брались случайно из текущей порции (10–20 слов), и правильный ответ легко
 * находился исключением: рядом с «собака» стояли «бежать» и «красивый». Теперь:
 *   1. Кандидаты — весь набор карточки, а если он маленький — наборы с той же парой языков.
 *   2. Кандидатам ставится балл похожести на правильный ответ по виду: длина, число слов,
 *      окончание (в русском оно часто выдаёт часть речи), первая буква, написание.
 *      Берутся самые похожие, с долей случайности, чтобы варианты не повторялись.
 *   3. Отсекаются варианты, которые совпадают с правильным ответом или почти совпадают
 *      (иначе ученик выберет верный по смыслу текст, а засчитается ошибка).
 *
 * Сравниваются ответы (оборот карточки), потому что их и показывает тест.
 */
import type { Card } from '@/types';

const MAX_POOL = 600; // для больших наборов считаем баллы по случайной выборке — быстро
const MIN_SAME_SET_POOL = 8; // меньше кандидатов в наборе — добираем из наборов с той же парой языков
const RANDOM_JITTER = 0.15; // доля случайности в выборе среди похожих

const answerOf = (card: Card) => card.backText ?? (card as any).back ?? '';

/** Для сравнения: первая строка, нижний регистр, без скобок, знаков и лишних пробелов */
export function normalizeAnswer(text: string): string {
  return (text || '')
    .split(/\r?\n/)[0]
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/[.,;:!?¡¿"«»“”'`…–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const commonSuffix = (a: string, b: string, max = 3) => {
  let n = 0;
  while (n < max && n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
};

const isCyrillic = (s: string) => /[а-я]/.test(s);

/** Почти тот же ответ: совпадает, отличается одной буквой или входит в другой целым словом */
function isNearDuplicate(a: string, b: string): boolean {
  if (!a || !b) return true;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = shorter === a ? b : a;
  if (shorter.length >= 4 && levenshtein(a, b) <= 1) return true;
  // «дом» и «дом здание», «to go» и «go»
  return (` ${longer} `).includes(` ${shorter} `);
}

/** Насколько вариант похож на правильный ответ по виду: 0..1 */
function similarity(correct: string, candidate: string): number {
  const la = correct.length;
  const lb = candidate.length;
  const lengthScore = 1 - Math.abs(la - lb) / Math.max(la, lb, 1);
  const wordsA = correct.split(' ').length;
  const wordsB = candidate.split(' ').length;
  const wordsScore = wordsA === wordsB ? 1 : 1 - Math.min(Math.abs(wordsA - wordsB), 3) / 3;
  const suffixScore = commonSuffix(correct, candidate) / 3;
  const firstScore = correct[0] === candidate[0] ? 1 : 0;
  const spellingScore = 1 - levenshtein(correct, candidate) / Math.max(la, lb, 1);
  return (
    0.3 * lengthScore +
    0.2 * wordsScore +
    0.25 * suffixScore +
    0.1 * firstScore +
    0.15 * spellingScore
  );
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type SetLite = { languageFrom?: string; languageTo?: string };

/**
 * Кандидаты в неверные варианты: карточки набора; если их мало — ещё наборы с той же парой
 * языков (чтобы вариант был на том же языке, что и правильный ответ).
 */
export function buildDistractorPool(
  correct: Card,
  cardsBySet: Record<string, string[]>,
  cardsMap: Record<string, Card>,
  sets: Record<string, SetLite>,
  extra: Card[] = [],
): Card[] {
  const byId = new Map<string, Card>();
  const add = (card?: Card) => {
    if (card && card.id !== correct.id) byId.set(card.id, card);
  };
  for (const id of cardsBySet[correct.setId] || []) add(cardsMap[id]);
  extra.forEach(add);

  if (byId.size < MIN_SAME_SET_POOL) {
    const own = sets[correct.setId];
    if (own?.languageFrom && own?.languageTo) {
      for (const [setId, set] of Object.entries(sets)) {
        if (setId === correct.setId) continue;
        if (set.languageFrom !== own.languageFrom || set.languageTo !== own.languageTo) continue;
        for (const id of cardsBySet[setId] || []) add(cardsMap[id]);
      }
    }
  }

  const pool = [...byId.values()];
  return pool.length > MAX_POOL ? shuffle(pool).slice(0, MAX_POOL) : pool;
}

/** До `count` неверных вариантов, похожих на правильный ответ, без повторов и почти-повторов */
export function pickSimilarDistractors(correct: Card, pool: Card[], count = 3): Card[] {
  const target = normalizeAnswer(answerOf(correct));
  const targetCyr = isCyrillic(target);
  const taken: string[] = [target];

  const scored = pool
    .map((card) => ({ card, text: normalizeAnswer(answerOf(card)) }))
    // Пустые ответы и другой алфавит (кириллица против латиницы) сразу видны — не берём
    .filter(({ text }) => text && isCyrillic(text) === targetCyr)
    .map((c) => ({ ...c, score: similarity(target, c.text) + Math.random() * RANDOM_JITTER }))
    .sort((a, b) => b.score - a.score);

  const picked: Card[] = [];
  for (const { card, text } of scored) {
    if (picked.length >= count) break;
    if (taken.some((t) => isNearDuplicate(t, text))) continue;
    picked.push(card);
    taken.push(text);
  }

  // Совсем мало подходящих (крошечный набор) — добираем любыми, лишь бы текст не совпадал
  if (picked.length < count) {
    for (const card of shuffle(pool)) {
      if (picked.length >= count) break;
      const text = normalizeAnswer(answerOf(card));
      if (!text || picked.includes(card) || taken.includes(text)) continue;
      picked.push(card);
      taken.push(text);
    }
  }
  return picked;
}
