import { isCardWaitingReview } from '@/services/SRSService';
import type { Card } from '@/types';

/**
 * Карточки для мини-игры (план §3.2): сначала слова, которым пришло время повторения — самые
 * просроченные первыми, потом случайные. Порядок в игре перемешан.
 */
export function pickCardsForGame(cards: Card[], count: number): Card[] {
  const now = Date.now();
  const shuffle = <T>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const waiting = cards
    .filter((c) => isCardWaitingReview(c, now))
    .sort((a, b) => a.nextReviewDate - b.nextReviewDate);
  const rest = shuffle(cards.filter((c) => !isCardWaitingReview(c, now)));
  return shuffle([...waiting, ...rest].slice(0, count));
}
