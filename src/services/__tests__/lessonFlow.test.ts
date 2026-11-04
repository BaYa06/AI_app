import { describe, expect, it } from '@jest/globals';
import type { Card } from '@/types';
import {
  buildSessionStages,
  firstLessonStep,
  firstSessionStep,
  fitsSessionStage,
  isSessionWordWeak,
  lessonPhaseForAnswer,
  nextLessonLabel,
  nextLessonStep,
  sessionCardIds,
  sessionPhaseForAnswer,
  sessionStepAfterPortion,
} from '../lessonFlow';
import type { SessionRouteParams } from '@/types/navigation';

const NOW = Date.UTC(2026, 9, 1, 9, 0, 0);
const DAY = 24 * 60 * 60 * 1000;
const setIdOf = (id: string) => id.split('-')[0];
const words = (n: number) => (n === 1 ? 'новое слово' : n < 5 ? 'новых слова' : 'новых слов');

function card(step: number, nextReviewDate: number): Card {
  return {
    id: 'a-1',
    setId: 'a',
    frontText: 'w',
    backText: 'п',
    createdAt: 0,
    updatedAt: 0,
    learningStep: step,
    nextReviewDate,
    lastReviewDate: 0,
    status: step === 0 ? 'new' : 'learning',
  };
}

describe('ход урока', () => {
  const review = ['a-1', 'a-2'];
  const fresh = ['b-1', 'b-2', 'b-3'];

  it('повторение → новые (карточки) → проверка (тест) → конец', () => {
    const first = firstLessonStep({ reviewIds: review, newIds: fresh }, setIdOf, NOW);
    expect(first?.screen).toBe('MultipleChoice');
    expect(first?.params).toMatchObject({
      setId: 'a',
      dueCardIds: review,
      cardLimit: 2,
      totalPhaseCards: 2,
      phaseOffset: 0,
      lesson: { part: 'review', newIds: fresh },
    });

    const second = nextLessonStep({ part: 'review', newIds: fresh }, setIdOf, NOW);
    expect(second?.screen).toBe('Study');
    expect(second?.params).toMatchObject({
      setId: 'b',
      mode: 'classic',
      studyAll: true,
      dueCardIds: fresh,
      lesson: { part: 'new' },
    });

    const third = nextLessonStep({ part: 'new', newIds: fresh }, setIdOf, NOW);
    expect(third?.screen).toBe('MultipleChoice');
    expect(third?.params).toMatchObject({ dueCardIds: fresh, lesson: { part: 'check' } });

    expect(nextLessonStep({ part: 'check', newIds: fresh }, setIdOf, NOW)).toBeNull();
  });

  it('время начала и число повторений доходят до последней части (для lesson_completed)', () => {
    const padded = [...review, 'a-9', 'a-8'];
    const first = firstLessonStep(
      { reviewIds: padded, newIds: fresh, reviewCount: 2 },
      setIdOf,
      NOW
    );
    expect(first?.params.lesson).toMatchObject({ startedAt: NOW, reviewCount: 2 });
    const second = nextLessonStep(first!.params.lesson!, setIdOf, NOW + 60_000);
    const third = nextLessonStep(second!.params.lesson!, setIdOf, NOW + 120_000);
    expect(third?.params.lesson).toMatchObject({
      part: 'check',
      startedAt: NOW,
      reviewCount: 2,
      newIds: fresh,
    });
  });

  it('у каждой части свой phaseId — порции разных частей не смешиваются', () => {
    const a = firstLessonStep({ reviewIds: review, newIds: fresh }, setIdOf, NOW);
    const b = nextLessonStep({ part: 'review', newIds: fresh }, setIdOf, NOW);
    expect(a?.params.phaseId).not.toBe(b?.params.phaseId);
  });

  it('нечего повторять — сразу новые слова', () => {
    const first = firstLessonStep({ reviewIds: [], newIds: fresh }, setIdOf, NOW);
    expect(first?.screen).toBe('Study');
    expect(first?.params.lesson?.part).toBe('new');
  });

  it('только повторение — после него конец', () => {
    expect(nextLessonStep({ part: 'review', newIds: [] }, setIdOf, NOW)).toBeNull();
  });

  it('ошибки дня — одна часть карточками', () => {
    const first = firstLessonStep(
      { reviewIds: review, newIds: fresh, mistakeIds: ['c-1'] },
      setIdOf,
      NOW
    );
    expect(first?.screen).toBe('Study');
    expect(first?.params).toMatchObject({
      dueCardIds: ['c-1'],
      lesson: { part: 'mistakes', newIds: [] },
    });
    expect(nextLessonStep({ part: 'mistakes', newIds: [] }, setIdOf, NOW)).toBeNull();
  });

  it('пустой урок — не запускается', () => {
    expect(firstLessonStep({ reviewIds: [], newIds: [] }, setIdOf, NOW)).toBeNull();
  });

  it('подпись кнопки итогов', () => {
    expect(nextLessonLabel({ part: 'review', newIds: fresh }, words)).toBe('Дальше: 3 новых слова');
    expect(nextLessonLabel({ part: 'review', newIds: ['x'] }, words)).toBe('Дальше: 1 новое слово');
    expect(nextLessonLabel({ part: 'new', newIds: fresh }, words)).toBe('Дальше: проверка');
    expect(nextLessonLabel({ part: 'check', newIds: fresh }, words)).toBe('Закончить');
    expect(nextLessonLabel({ part: 'review', newIds: [] }, words)).toBe('Закончить');
  });
});

describe('lessonPhaseForAnswer', () => {
  it('повторение — только слово, которому пришёл срок (добивка теста не считается)', () => {
    expect(lessonPhaseForAnswer('review', card(2, NOW - DAY), NOW)).toBe('review');
    expect(lessonPhaseForAnswer('review', card(2, NOW + 3 * DAY), NOW)).toBeNull();
    expect(lessonPhaseForAnswer('review', card(0, 0), NOW)).toBeNull();
  });

  it('новые — только слово на шаге 0', () => {
    expect(lessonPhaseForAnswer('new', card(0, 0), NOW)).toBe('new');
    expect(lessonPhaseForAnswer('new', card(1, NOW + DAY), NOW)).toBeNull();
  });

  it('проверка, ошибки и тренировки вне урока день не меняют', () => {
    expect(lessonPhaseForAnswer('check', card(1, NOW + DAY), NOW)).toBeNull();
    expect(lessonPhaseForAnswer('mistakes', card(0, 0), NOW)).toBeNull();
    expect(lessonPhaseForAnswer(undefined, card(2, NOW - DAY), NOW)).toBeNull();
  });
});

describe('сессия набора', () => {
  const LEARN = ['cards', 'pairs', 'test', 'listen', 'context', 'build'] as const;
  function word(id: string, frontText: string, example?: string): Card {
    return { ...card(0, 0), id, frontText, example };
  }
  const cards = [
    word('a-1', 'scharf', 'Die Suppe ist scharf.'),
    word('a-2', 'kalt', 'Heute ist es kalt.'),
    word('a-3', 'neu'),
    word('a-4', 'guten Morgen', 'Guten Morgen!'),
    word('a-5', 'Geschwindigkeit', 'Die Geschwindigkeit ist hoch.'),
  ];

  it('неподходящие слова молча выпадают из этапа', () => {
    expect(fitsSessionStage('context', cards[2])).toBe(false);
    expect(fitsSessionStage('build', cards[3])).toBe(false);
    expect(fitsSessionStage('build', cards[4])).toBe(false);
    expect(fitsSessionStage('build', word('a-6', 'müde'))).toBe(true);
    const stages = buildSessionStages([...LEARN], cards);
    expect(stages.map((s) => s.stage)).toEqual([...LEARN]);
    expect(stages.find((s) => s.stage === 'context')!.cardIds).toEqual([
      'a-1',
      'a-2',
      'a-4',
      'a-5',
    ]);
    expect(stages.find((s) => s.stage === 'build')!.cardIds).toEqual(['a-1', 'a-2', 'a-3']);
  });

  it('этап без подходящих слов убирается до старта', () => {
    const noExamples = [word('a-1', 'guten Tag'), word('a-2', 'auf Wiedersehen')];
    expect(buildSessionStages([...LEARN], noExamples).map((s) => s.stage)).toEqual([
      'cards',
      'pairs',
      'test',
      'listen',
    ]);
  });

  it('первый этап — карточки по словам сессии одной порцией', () => {
    const step = firstSessionStep('a', [...LEARN], cards, NOW)!;
    expect(step.screen).toBe('Study');
    expect(step.params).toMatchObject({
      setId: 'a',
      mode: 'classic',
      studyAll: true,
      dueCardIds: cards.map((c) => c.id),
      cardLimit: 5,
      totalPhaseCards: 5,
      phaseOffset: 0,
    });
    expect(step.params.session).toMatchObject({ setId: 'a', index: 0, startedAt: NOW });
    expect(firstSessionStep('a', ['context'], [cards[2]], NOW)).toBeNull();
  });

  function session(index: number): SessionRouteParams {
    return {
      setId: 'a',
      index,
      startedAt: NOW,
      stages: buildSessionStages([...LEARN], cards),
    };
  }

  it('ошибки в порции — тот же этап следующей порцией, без итогов', () => {
    const portion = {
      complete: false,
      phaseId: 'p1',
      totalPhaseCards: 5,
      studiedInPhase: 4,
      phaseOffset: 5,
      phaseFailedIds: ['a-2'],
    };
    const step = sessionStepAfterPortion(session(2), portion, undefined, NOW)!;
    expect(step.screen).toBe('MultipleChoice');
    expect(step.params).toMatchObject({ phaseId: 'p1', phaseOffset: 5, phaseFailedIds: ['a-2'] });
    expect(step.params.session!.index).toBe(2);
  });

  it('этап пройден — следующий: тест → на слух → контекст → собери слово → итоги', () => {
    const done = { complete: true };
    const listen = sessionStepAfterPortion(session(2), done, undefined, NOW)!;
    expect(listen.screen).toBe('MultipleChoice');
    expect(listen.params).toMatchObject({ listen: true, phaseOffset: 0 });
    const context = sessionStepAfterPortion(session(3), done, undefined, NOW)!;
    expect(context).toMatchObject({
      screen: 'ContextFill',
      params: { dueCardIds: ['a-1', 'a-2', 'a-4', 'a-5'] },
    });
    expect(sessionStepAfterPortion(session(4), done, undefined, NOW)!.screen).toBe('WordBuilder');
    expect(sessionStepAfterPortion(session(5), done, undefined, NOW)).toBeNull();
  });

  it('рост серии посреди сессии доезжает до итогов', () => {
    const next = sessionStepAfterPortion(session(0), { complete: true }, 7, NOW)!;
    expect(next.params.session!.streakCount).toBe(7);
    const later = sessionStepAfterPortion(
      next.params.session!,
      { complete: true },
      undefined,
      NOW
    )!;
    expect(later.params.session!.streakCount).toBe(7);
  });

  it('ответ в сессии идёт в квоту дня: новое — если ни разу не отвечали, повторение — если пора', () => {
    expect(sessionPhaseForAnswer(card(0, 0), NOW)).toBe('new');
    expect(
      sessionPhaseForAnswer({ ...card(0, NOW - DAY), lastReviewDate: NOW - DAY }, NOW)
    ).toBeNull();
    expect(sessionPhaseForAnswer(card(2, NOW - DAY), NOW)).toBe('review');
    expect(sessionPhaseForAnswer(card(2, NOW + 3 * DAY), NOW)).toBeNull();
  });

  it('итоги: слабое — уровень упал или снова пора повторить', () => {
    expect(isSessionWordWeak({ ...card(0, NOW), lastReviewDate: NOW - 1000 }, NOW)).toBe(true);
    expect(isSessionWordWeak(card(1, NOW - 1000), NOW)).toBe(true);
    expect(isSessionWordWeak(card(1, NOW + DAY), NOW)).toBe(false);
    expect(isSessionWordWeak(card(0, 0), NOW)).toBe(false);
    expect(sessionCardIds(session(0))).toEqual(['a-1', 'a-2', 'a-3', 'a-4', 'a-5']);
  });
});
