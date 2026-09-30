import { describe, expect, it } from '@jest/globals';
import type { Card } from '@/types';
import { firstLessonStep, lessonPhaseForAnswer, nextLessonLabel, nextLessonStep } from '../lessonFlow';

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
    expect(second?.params).toMatchObject({ setId: 'b', mode: 'classic', studyAll: true, dueCardIds: fresh, lesson: { part: 'new' } });

    const third = nextLessonStep({ part: 'new', newIds: fresh }, setIdOf, NOW);
    expect(third?.screen).toBe('MultipleChoice');
    expect(third?.params).toMatchObject({ dueCardIds: fresh, lesson: { part: 'check' } });

    expect(nextLessonStep({ part: 'check', newIds: fresh }, setIdOf, NOW)).toBeNull();
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
    const first = firstLessonStep({ reviewIds: review, newIds: fresh, mistakeIds: ['c-1'] }, setIdOf, NOW);
    expect(first?.screen).toBe('Study');
    expect(first?.params).toMatchObject({ dueCardIds: ['c-1'], lesson: { part: 'mistakes', newIds: [] } });
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
