/**
 * SRS (Spaced Repetition System) Service
 * @description Реализация алгоритма интервальных повторений (SM-2)
 */
import type { Card, Rating, ReviewResult, CardStatus } from '@/types';
import { config } from '@/constants';

const { srs } = config;

/**
 * Рассчитывает следующую дату повторения и обновляет параметры карточки
 */
export function calculateNextReview(card: Card, rating: Rating): ReviewResult {
  const now = Date.now();
  const dayInMs = 24 * 60 * 60 * 1000;

  let newEaseFactor = card.easeFactor;
  let newInterval = card.interval;
  let newRepetitions = card.repetitions;
  let newStatus: CardStatus = card.status;

  // Обновление easeFactor
  const easeChange = getEaseFactorChange(rating);
  newEaseFactor = Math.max(srs.minimumEaseFactor, newEaseFactor + easeChange);

  // Логика в зависимости от оценки
  if (rating === 1) {
    // Again - сброс, повторяем через 10 минут
    newRepetitions = 0;
    newInterval = srs.firstIntervals.again;
    newStatus = 'learning';
  } else if (card.repetitions === 0 || card.status === 'new') {
    // Первое повторение новой карточки
    newRepetitions = 1;
    newInterval = getFirstInterval(rating);
    newStatus = 'learning';
  } else {
    // Последующие повторения
    newRepetitions++;
    
    const multiplier = getIntervalMultiplier(rating);
    newInterval = card.interval * multiplier * newEaseFactor;
    
    // Ограничиваем максимальный интервал
    newInterval = Math.min(newInterval, srs.maxInterval);
    
    // Обновляем статус
    if (newInterval >= 21) {
      newStatus = 'mastered';
    } else if (newInterval >= 1) {
      newStatus = 'review';
    } else {
      newStatus = 'learning';
    }
  }

  // Рассчитываем дату следующего повторения
  const nextReviewDate = now + (newInterval * dayInMs);

  return {
    cardId: card.id,
    rating,
    nextReviewDate,
    newInterval,
    newEaseFactor,
    newStatus,
  };
}

/**
 * Получить интервал для первого повторения
 */
function getFirstInterval(rating: Rating): number {
  switch (rating) {
    case 1: return srs.firstIntervals.again;
    case 2: return srs.firstIntervals.hard;
    case 3: return srs.firstIntervals.good;
    case 4: return srs.firstIntervals.easy;
  }
}

/**
 * Получить множитель интервала
 */
function getIntervalMultiplier(rating: Rating): number {
  switch (rating) {
    case 1: return srs.intervalMultipliers.again;
    case 2: return srs.intervalMultipliers.hard;
    case 3: return srs.intervalMultipliers.good;
    case 4: return srs.intervalMultipliers.easy;
  }
}

/**
 * Получить изменение ease factor
 */
function getEaseFactorChange(rating: Rating): number {
  switch (rating) {
    case 1: return srs.easeFactorChanges.again;
    case 2: return srs.easeFactorChanges.hard;
    case 3: return srs.easeFactorChanges.good;
    case 4: return srs.easeFactorChanges.easy;
  }
}

/**
 * Создает очередь карточек для изучения
 * Приоритет: просроченные → запланированные на сегодня → новые
 */
export function buildStudyQueue(
  cards: Card[],
  newLimit: number,
  reviewLimit: number
): Card[] {
  const now = Date.now();
  const queue: Card[] = [];

  // Разделяем карточки по типам
  const overdueCards: Card[] = [];
  const dueCards: Card[] = [];
  const newCards: Card[] = [];

  for (const card of cards) {
    if (card.status === 'new') {
      newCards.push(card);
    } else if (card.nextReviewDate <= now) {
      // Просроченные - те, которые нужно было повторить раньше
      if (card.nextReviewDate < now - 24 * 60 * 60 * 1000) {
        overdueCards.push(card);
      } else {
        dueCards.push(card);
      }
    }
  }

  // Сортируем просроченные по давности (самые старые первыми)
  overdueCards.sort((a, b) => a.nextReviewDate - b.nextReviewDate);
  
  // Добавляем просроченные
  queue.push(...overdueCards.slice(0, reviewLimit));
  
  // Добавляем запланированные на сегодня
  const remainingReviewSlots = reviewLimit - queue.length;
  if (remainingReviewSlots > 0) {
    queue.push(...dueCards.slice(0, remainingReviewSlots));
  }
  
  // Добавляем новые карточки
  queue.push(...newCards.slice(0, newLimit));

  return queue;
}

/**
 * Форматирует интервал для отображения
 */
export function formatInterval(days: number): string {
  if (days < 1) {
    const minutes = Math.round(days * 24 * 60);
    return `${minutes} мин`;
  } else if (days < 7) {
    const d = Math.round(days);
    return `${d} ${pluralize(d, 'день', 'дня', 'дней')}`;
  } else if (days < 30) {
    const weeks = Math.round(days / 7);
    return `${weeks} ${pluralize(weeks, 'неделя', 'недели', 'недель')}`;
  } else if (days < 365) {
    const months = Math.round(days / 30);
    return `${months} ${pluralize(months, 'месяц', 'месяца', 'месяцев')}`;
  } else {
    const years = Math.round(days / 365);
    return `${years} ${pluralize(years, 'год', 'года', 'лет')}`;
  }
}

/**
 * Склонение слов
 */
function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  
  if (mod100 >= 11 && mod100 <= 19) {
    return many;
  }
  if (mod10 === 1) {
    return one;
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return few;
  }
  return many;
}

/**
 * Получить предполагаемый интервал для каждой оценки
 */
export function getExpectedIntervals(card: Card): Record<Rating, string> {
  return {
    1: formatInterval(calculateNextReview(card, 1).newInterval),
    2: formatInterval(calculateNextReview(card, 2).newInterval),
    3: formatInterval(calculateNextReview(card, 3).newInterval),
    4: formatInterval(calculateNextReview(card, 4).newInterval),
  };
}
