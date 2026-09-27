/**
 * SRS (Spaced Repetition System) Service
 * @description Интервальные повторения. Уровень карточки считает сервер (api/progress.js) —
 * здесь та же логика только для мгновенного отклика интерфейса; после ответа сервера
 * состояние карточки заменяется серверным. При изменении правил менять оба места.
 *
 * Правила (plan/course_rating_and_review_plan.md, §1.2):
 * - шаг растёт только когда пришло время повторения (или карточка новая), на 1 за ответ;
 * - правильный ответ раньше срока ничего не меняет;
 * - ошибка — шаг −1 и сразу к повторению; «Не знаю» — шаг 0; «Сомневаюсь» — шаг тот же, сразу к повторению;
 * - слово просрочено дольше интервала своего шага («угасает») — сначала шаг −1 (план §3.3).
 */
import type { Card, Rating, CardStatus } from '@/types';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
/** Повторение «вовремя», если до срока осталось не больше 6 часов */
const DUE_GRACE_MS = 6 * 60 * 60 * 1000;

/**
 * Интервалы повторения в днях в зависимости от learningStep
 * step 0: сегодня, 1: 1 день, 2: 3 дня, 3: 7 дней, 4: 14 дней, 5: 30 дней, 6+: 60 дней
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
export function getStatusForStep(step: number): CardStatus {
  if (step === 0) return 'new';
  if (step <= 2) return 'learning';
  if (step <= 4) return 'young';
  return 'mature';
}

/** Выученная карточка — «знаю» и выше (шаг ≥ 3). Одно определение для наборов, статистики и рейтинга. */
export const LEARNED_STEP = 3;

export function isCardLearned(card: Pick<Card, 'learningStep'>): boolean {
  return (card.learningStep || 0) >= LEARNED_STEP;
}

/** Режимы, в которых ответ меняет уровень: тест и «Собери слово» проверяет сервер, карточки — самооценка */
export type AnswerMode = 'test' | 'builder' | 'flashcard';

/** Пришло ли время повторения карточки */
export function isCardDue(card: Pick<Card, 'learningStep' | 'nextReviewDate'>, now: number = Date.now()): boolean {
  return (card.learningStep || 0) === 0 || card.nextReviewDate <= now + DUE_GRACE_MS;
}

/**
 * Новое состояние карточки после ответа (зеркало applyAnswer в api/progress.js).
 */
/**
 * Слово «угасает»: не повторяли дольше интервала его шага (зеркало isFading в api/progress.js).
 * При следующем ответе такое слово сначала теряет шаг.
 */
export function isCardFading(card: Pick<Card, 'learningStep' | 'nextReviewDate'>, now: number = Date.now()): boolean {
  const step = card.learningStep || 0;
  return step >= 1 && now - card.nextReviewDate > getIntervalForStep(step) * DAY_IN_MS;
}

/** Слово ждёт повторения: уже изучалось (шаг ≥ 1) и время повторения пришло */
export function isCardWaitingReview(card: Pick<Card, 'learningStep' | 'nextReviewDate'>, now: number = Date.now()): boolean {
  return (card.learningStep || 0) >= 1 && card.nextReviewDate <= now + DUE_GRACE_MS;
}

export function applyAnswer(
  card: Pick<Card, 'learningStep' | 'nextReviewDate'>,
  answer: { mode: AnswerMode; correct: boolean; selfRating?: Rating },
  answeredAt: number = Date.now(),
): Pick<Card, 'learningStep' | 'nextReviewDate' | 'lastReviewDate' | 'status'> {
  const fading = isCardFading(card, answeredAt);
  let step = fading ? (card.learningStep || 0) - 1 : card.learningStep || 0;
  let nextReviewDate = card.nextReviewDate;

  if (answer.mode === 'flashcard' && answer.selfRating === 1) {
    step = 0;
    nextReviewDate = answeredAt;
  } else if (answer.mode === 'flashcard' && answer.selfRating === 2) {
    nextReviewDate = answeredAt;
  } else if (!answer.correct) {
    step = Math.max(0, step - 1);
    nextReviewDate = answeredAt;
  } else if (isCardDue(card, answeredAt)) {
    step = step + 1;
    nextReviewDate = answeredAt + getIntervalForStep(step) * DAY_IN_MS;
  }

  return { learningStep: step, nextReviewDate, lastReviewDate: answeredAt, status: getStatusForStep(step) };
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
  // Раньше срока правильный ответ уровень не меняет
  const next = isCardDue(card) ? formatInterval(getIntervalForStep(currentStep + 1)) : '—';
  return {
    1: 'сброс',
    2: '—',
    3: next,
    4: next,
  };
}
