/**
 * Ход урока дня по экранам (plan/home_redesign.md, шаг 1.3)
 * @description Урок — несколько частей подряд:
 *   повторение (тест) → новые слова (карточки с самооценкой) → проверка новых слов (тест) → главная.
 * Ошибки дня (состояние «Исправь ошибки») — одна часть карточками.
 * Каждая часть — обычная «фаза» тренировки: порции повторяются, пока не исправлены все ошибки;
 * когда фаза завершена, StudyResults спрашивает здесь, что дальше.
 * Чистые функции: возвращают экран и параметры, навигацию делает вызывающий код.
 */
import type { Card } from '@/types';
import type { LessonPart, LessonRouteParams, RootStackParamList } from '@/types/navigation';
import { isCardWaitingReview } from './SRSService';
import type { LessonPhase } from './LessonService';

export type LessonStep =
  | { screen: 'MultipleChoice'; params: RootStackParamList['MultipleChoice'] }
  | { screen: 'Study'; params: RootStackParamList['Study'] };

/** Набор карточки — для параметра setId (экраны тренировок берут из него название и статистику) */
type SetIdOf = (cardId: string) => string | undefined;

function stepFor(
  part: LessonPart,
  ids: string[],
  base: Omit<LessonRouteParams, 'part'>,
  setIdOf: SetIdOf,
  now: number,
): LessonStep | null {
  if (ids.length === 0) return null;
  const setId = setIdOf(ids[0]) ?? '';
  const lesson: LessonRouteParams = { ...base, part };
  const phase = {
    cardLimit: ids.length, // вся часть — одной порцией; ошибки повторяются следующими порциями
    dueCardIds: ids,
    phaseId: `lesson_${part}_${now}`,
    totalPhaseCards: ids.length,
    studiedInPhase: 0,
    phaseOffset: 0,
    lesson,
  };
  if (part === 'review' || part === 'check') {
    return { screen: 'MultipleChoice', params: { setId, questionIndex: 1, totalQuestions: ids.length, ...phase } };
  }
  return { screen: 'Study', params: { setId, mode: 'classic', studyAll: true, ...phase } };
}

/**
 * Первая часть урока. reviewIds может быть дополнен карточками для теста (минимум вариантов) —
 * такие ответы в урок не записываются (lessonPhaseForAnswer).
 */
export function firstLessonStep(
  queue: {
    reviewIds: string[];
    newIds: string[];
    mistakeIds?: string[];
    /** Сколько слов на повторение без добора теста (для аналитики); по умолчанию reviewIds.length */
    reviewCount?: number;
  },
  setIdOf: SetIdOf,
  now: number = Date.now(),
): LessonStep | null {
  if (queue.mistakeIds && queue.mistakeIds.length > 0) {
    return stepFor('mistakes', queue.mistakeIds, { newIds: [], startedAt: now, reviewCount: queue.mistakeIds.length }, setIdOf, now);
  }
  const base = { newIds: queue.newIds, startedAt: now, reviewCount: queue.reviewCount ?? queue.reviewIds.length };
  return stepFor('review', queue.reviewIds, base, setIdOf, now) ?? stepFor('new', queue.newIds, base, setIdOf, now);
}

/** Следующая часть после завершённой фазы; null — урок окончен, на главную */
export function nextLessonStep(lesson: LessonRouteParams, setIdOf: SetIdOf, now: number = Date.now()): LessonStep | null {
  const { part, ...base } = lesson;
  if (part === 'review') return stepFor('new', lesson.newIds, base, setIdOf, now);
  if (part === 'new') return stepFor('check', lesson.newIds, base, setIdOf, now);
  return null;
}

/** Подпись главной кнопки итогов, когда фаза урока завершена */
export function nextLessonLabel(lesson: LessonRouteParams, pluralizeWords: (n: number) => string): string {
  const n = lesson.newIds.length;
  if (lesson.part === 'review' && n > 0) return `Дальше: ${n} ${pluralizeWords(n)}`;
  if (lesson.part === 'new' && n > 0) return 'Дальше: проверка';
  return 'Закончить';
}

/**
 * В какую часть дня записать ответ (по состоянию карточки ДО ответа):
 * повторение — только слово, которому пришёл срок; новое — только слово на шаге 0.
 * Проверка новых и исправление ошибок день не меняют: эти слова уже записаны.
 */
export function lessonPhaseForAnswer(part: LessonPart | undefined, card: Card, now: number = Date.now()): LessonPhase | null {
  if (part === 'review') return isCardWaitingReview(card, now) ? 'review' : null;
  if (part === 'new') return (card.learningStep || 0) === 0 ? 'new' : null;
  return null;
}
