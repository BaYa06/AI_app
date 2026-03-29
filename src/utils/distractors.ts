/**
 * Логика подбора дистракторов для режима "Слово в контексте"
 *
 * Три уровня:
 *   1. Карточки из того же набора, той же части речи
 *   2. Карточки из других наборов пользователя, той же части речи
 *   3. AI генерирует слова-дистракторы (если из карточек не набирается нужное кол-во)
 *
 * Возвращает frontText (слова на изучаемом языке), не переводы.
 */

import type { Card } from '@/types';

const API_BASE = __DEV__ ? 'http://localhost:3000/api' : '/api';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function getDistractors(
  correctCard: Card,
  allCards: Card[],
  count: number = 3,
): Promise<string[]> {
  const others = allCards.filter(c => c.id !== correctCard.id);

  // Фильтр по wordType — только если у правильной карточки он известен
  const filterByType = (cards: Card[]) =>
    correctCard.wordType
      ? cards.filter(c => c.wordType === correctCard.wordType)
      : cards;

  // Уровень 1: тот же набор, та же часть речи
  const sameSet = filterByType(
    others.filter(c => c.setId === correctCard.setId),
  );

  if (sameSet.length >= count) {
    return shuffle(sameSet).slice(0, count).map(c => c.frontText);
  }

  // Уровень 2: другие наборы, та же часть речи
  const otherSets = filterByType(
    others.filter(c => c.setId !== correctCard.setId),
  );
  const combined = shuffle([...sameSet, ...otherSets]);

  if (combined.length >= count) {
    return combined.slice(0, count).map(c => c.frontText);
  }

  // Уровень 3: AI генерирует недостающие дистракторы
  const needed = count - combined.length;
  const aiWords = await generateAIDistractors(correctCard, needed);

  return [
    ...combined.map(c => c.frontText),
    ...aiWords,
  ];
}

async function generateAIDistractors(
  card: Card,
  count: number,
): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE}/context?action=distractors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word: card.frontText,
        translation: card.backText,
        wordType: card.wordType || 'other',
        count,
      }),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json.distractors) ? json.distractors : [];
  } catch {
    return [];
  }
}
