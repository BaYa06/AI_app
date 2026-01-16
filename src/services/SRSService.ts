/**
 * SRS (Spaced Repetition System) Service
 * @description Упрощенная система интервальных повторений
 * 
 * Логика:
 * 1. Не знаю (1) - сброс learningStep на 0, nextReview НЕ меняется
 * 2. Сомневаюсь (2) - ничего не меняется
 * 3. Почти (3) - learningStep +1, nextReview обновляется
 * 4. Уверенно (4) - learningStep +2, nextReview обновляется
 */
import type { Card, Rating, ReviewResult, CardStatus } from '@/types';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/**
 * Интервалы повторения в днях в зависимости от learningStep
 * step 0: сегодня (не выучено)
 * step 1: 1 день
 * step 2: 3 дня
 * step 3: 7 дней
 * step 4: 14 дней
 * step 5: 30 дней
 * step 6+: 60 дней
 */
const INTERVALS = [0, 1, 3, 7, 14, 30, 60];

function getIntervalForStep(step: number): number {
  if (step < 0) return 0;
  if (step >= INTERVALS.length) return INTERVALS[INTERVALS.length - 1];
  return INTERVALS[step];
}

/**
 * Определяет статус карточки на основе learningStep
 */
function getStatusForStep(step: number): CardStatus {
  if (step === 0) return 'new';
  if (step <= 2) return 'learning';
  if (step <= 4) return 'young';
  return 'mature';
}

/**
 * Рассчитывает следующую дату повторения и обновляет параметры карточки
 */
export function calculateNextReview(card: Card, rating: Rating): ReviewResult {
  const now = Date.now();
  let newLearningStep = card.learningStep || 0;
  let nextReviewDate: number;

  switch (rating) {
    case 1: // Не знаю - сброс на 0, nextReview удаляется
      newLearningStep = 0;
      nextReviewDate = 0; // Удаляем дату повторения
      break;

    case 2: // Сомневаюсь - nextReview удаляется
      nextReviewDate = 0; // Удаляем дату повторения
      break;

    case 3: // Почти - step +1, обновляем nextReview
      newLearningStep = newLearningStep + 1;
      const intervalGood = getIntervalForStep(newLearningStep);
      nextReviewDate = now + (intervalGood * DAY_IN_MS);
      break;

    case 4: // Уверенно - step +2, обновляем nextReview
      newLearningStep = newLearningStep + 2;
      const intervalEasy = getIntervalForStep(newLearningStep);
      nextReviewDate = now + (intervalEasy * DAY_IN_MS);
      break;
  }

  const newStatus = getStatusForStep(newLearningStep);

  return {
    cardId: card.id,
    rating,
    nextReviewDate,
    newStatus,
    newLearningStep,
  };
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
    if (card.status === 'new' || card.learningStep === 0) {
      newCards.push(card);
    } else if (card.nextReviewDate <= now) {
      // Просроченные - те, которые нужно было повторить раньше
      if (card.nextReviewDate < now - DAY_IN_MS) {
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
    return 'сегодня';
  } else if (days === 1) {
    return '1 день';
  } else if (days < 7) {
    return `${Math.round(days)} ${pluralize(Math.round(days), 'день', 'дня', 'дней')}`;
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
 * Получить предполагаемые интервалы для каждой оценки
 * Возвращает строки для отображения на кнопках
 */
export function getExpectedIntervals(card: Card): Record<Rating, string> {
  const currentStep = card.learningStep || 0;
  
  // Не знаю (1) - сброс, показываем текущий интервал
  // Сомневаюсь (2) - без изменений
  // Почти (3) - +1 шаг
  // Уверенно (4) - +2 шага
  
  return {
    1: 'сброс',
    2: '—',
    3: formatInterval(getIntervalForStep(currentStep + 1)),
    4: formatInterval(getIntervalForStep(currentStep + 2)),
  };
}
