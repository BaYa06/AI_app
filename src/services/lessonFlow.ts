/**
 * Ход урока дня по экранам (plan/done/home_redesign.md, шаг 1.3)
 * @description Урок — несколько частей подряд:
 *   повторение (тест) → новые слова (карточки с самооценкой) → проверка новых слов (тест) → главная.
 * Ошибки дня (состояние «Исправь ошибки») — одна часть карточками.
 * Каждая часть — обычная «фаза» тренировки: порции повторяются, пока не исправлены все ошибки;
 * когда фаза завершена, StudyResults спрашивает здесь, что дальше.
 * Чистые функции: возвращают экран и параметры, навигацию делает вызывающий код.
 */
import type { Card } from '@/types';
import type {
  LessonPart,
  LessonRouteParams,
  RootStackParamList,
  SessionRouteParams,
  SessionStage,
  SessionStageRoute,
} from '@/types/navigation';
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

// ─── Сессия набора «Изучить» (plan/new/study_session.md, Session 2) ───
//
// Этапы идут подряд: экран этапа по окончании порции открывает StudyResults, а тот для сессии не
// показывает итоги, а сразу продолжает этап (ошибки — следующей порцией, как сейчас) или открывает
// следующий этап. Итоги — только после последнего этапа.

export type SessionStep =
  | LessonStep
  | { screen: 'Match'; params: RootStackParamList['Match'] }
  | { screen: 'WordBuilder'; params: RootStackParamList['WordBuilder'] }
  | { screen: 'ContextFill'; params: RootStackParamList['ContextFill'] };

/** Длиннее слово плитками на экране не помещается */
export const BUILD_MAX_LETTERS = 10;

/** Подходит ли слово этапу: неподходящее молча пропускаем (решение 10 плана) */
export function fitsSessionStage(stage: SessionStage, card: Card): boolean {
  if (stage === 'context') return !!card.example?.trim();
  if (stage === 'build') {
    const word = (card.frontText || '').trim();
    return word.length > 0 && !/\s/.test(word) && Array.from(word).length <= BUILD_MAX_LETTERS;
  }
  return true;
}

/** Слова под каждый этап; этап без подходящих слов убирается до старта */
export function buildSessionStages(stages: SessionStage[], cards: Card[]): SessionStageRoute[] {
  return stages
    .map((stage) => ({ stage, cardIds: cards.filter((c) => fitsSessionStage(stage, c)).map((c) => c.id) }))
    .filter((s) => s.cardIds.length > 0);
}

/** Состояние порции внутри этапа — как его передают экраны тренировок */
export interface SessionPortion {
  phaseId?: string;
  totalPhaseCards?: number;
  studiedInPhase?: number;
  phaseOffset?: number;
  phaseFailedIds?: string[];
}

function sessionStepAt(session: SessionRouteParams, portion: SessionPortion | null, now: number): SessionStep | null {
  const current = session.stages[session.index];
  if (!current) return null;
  const ids = current.cardIds;
  const phase = portion ?? {
    phaseId: `session_${current.stage}_${now}`,
    totalPhaseCards: ids.length,
    studiedInPhase: 0,
    phaseOffset: 0,
  };
  const base = { setId: session.setId, cardLimit: ids.length, dueCardIds: ids, ...phase, session };
  switch (current.stage) {
    case 'cards':
      return { screen: 'Study', params: { ...base, mode: 'classic', studyAll: true } };
    case 'pairs':
      return { screen: 'Match', params: base };
    case 'test':
    case 'listen':
      return {
        screen: 'MultipleChoice',
        params: { ...base, questionIndex: 1, totalQuestions: ids.length, ...(current.stage === 'listen' ? { listen: true } : {}) },
      };
    case 'context':
      // Порций и повтора ошибок у режима нет — все слова этапа сразу
      return { screen: 'ContextFill', params: { setId: session.setId, dueCardIds: ids, session } };
    case 'build':
      return { screen: 'WordBuilder', params: base };
  }
}

/** Первый этап сессии; null — ни одному этапу слова не подошли */
export function firstSessionStep(
  setId: string,
  stages: SessionStage[],
  cards: Card[],
  now: number = Date.now(),
  xpBase?: number,
): SessionStep | null {
  return sessionStepAt({ setId, stages: buildSessionStages(stages, cards), index: 0, startedAt: now, xpBase }, null, now);
}

/**
 * Что дальше после порции этапа: остались слова или ошибки — та же стадия следующей порцией,
 * иначе следующий этап. null — сессия закончена, показать итоги.
 * streakCount — серия выросла в этой порции: несём до итогов.
 */
export function sessionStepAfterPortion(
  session: SessionRouteParams,
  portion: SessionPortion & { complete: boolean },
  streakCount?: number,
  now: number = Date.now(),
): SessionStep | null {
  const carried: SessionRouteParams = { ...session, streakCount: streakCount ?? session.streakCount };
  const { complete, ...phase } = portion;
  if (!complete) return sessionStepAt(carried, phase, now);
  return sessionStepAt({ ...carried, index: session.index + 1 }, null, now);
}

/**
 * В какую часть дня записать ответ в сессии (по состоянию карточки ДО ответа) — квота новых общая
 * с уроком дня: пора повторить — повторение; ни разу не отвечали — новое; иначе не записываем.
 */
export function sessionPhaseForAnswer(card: Card, now: number = Date.now()): LessonPhase | null {
  if (isCardWaitingReview(card, now)) return 'review';
  if ((card.learningStep || 0) === 0 && !(card.lastReviewDate > 0)) return 'new';
  return null;
}
