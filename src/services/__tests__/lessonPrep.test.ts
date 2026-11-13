import { describe, expect, it, jest } from '@jest/globals';
import {
  errorPercent,
  hardCardCaption,
  isHighError,
  lastCourseSet,
  loadLessonPrep,
  prepSubtitle,
  readinessFromHomework,
  readinessFromSet,
  readinessOverline,
  warmupCaption,
  warmupCards,
  type HardCard,
  type LessonPrepApi,
} from '../lessonPrep';
import type { HomeworkStatusData, TeacherHomeworkSummary } from '../homework';

const card = (i: number, errorRate = 0.3): HardCard => ({
  cardId: `c${i}`,
  front: `f${i}`,
  back: `b${i}`,
  setId: 's1',
  setTitle: 'Ünite 1',
  errorRate,
  wrongUsers: 17,
  answers: 40,
});

const status = (): HomeworkStatusData =>
  ({
    homework: { id: 'h1', courseId: 'k', title: 'Ünite 4', words: 48 },
    students: [
      { id: 'a', displayName: 'Айша', status: 'submitted' },
      { id: 'b', displayName: 'Бекжан', status: 'not_started' },
      { id: 'c', displayName: 'Сезим', status: 'in_progress' },
    ],
  }) as unknown as HomeworkStatusData;

describe('разминка', () => {
  it('до 6 самых трудных слов; меньше трёх — разминки нет', () => {
    expect(warmupCards(Array.from({ length: 9 }, (_, i) => card(i)))).toHaveLength(6);
    expect(warmupCards([card(1), card(2)])).toEqual([]);
    expect(warmupCards(null)).toEqual([]);
  });

  it('подписи', () => {
    expect(warmupCaption(6)).toBe('6 трудных слов · ~5 минут');
    expect(hardCardCaption(card(1))).toBe('Ünite 1 · ошибались 17 учеников');
    expect(errorPercent(card(1, 0.386))).toBe(39);
    expect(isHighError(card(1, 0.32))).toBe(true);
    expect(isHighError(card(1, 0.31))).toBe(false);
  });
});

describe('готовность', () => {
  it('по заданию: сдали / начали / не начали поимённо', () => {
    const r = readinessFromHomework(status());
    expect(r).toMatchObject({
      source: 'homework',
      total: 3,
      ready: 1,
      started: 1,
      notOpened: 1,
      notOpenedCaption: 'Не начали',
      notOpenedStudents: [{ id: 'b', name: 'Бекжан' }],
      homeworkId: 'h1',
    });
    expect(readinessOverline(r)).toBe('ÜNITE 4 · 48 СЛОВ');
  });

  it('последний набор: открытый юнит учебника важнее своих наборов; пустые не берём', () => {
    const own = { setId: 'a', title: 'Мой', totalCards: 5 };
    const unit = { setId: 'u', title: 'Ünite 4', totalCards: 48, isOfficial: true, unitOpen: true };
    const closed = { ...unit, setId: 'u5', unitOpen: false };
    expect(lastCourseSet([own, unit, closed])?.setId).toBe('u');
    expect(lastCourseSet([own, { ...own, setId: 'e', totalCards: 0 }])?.setId).toBe('a');
    expect(lastCourseSet([])).toBeNull();
  });

  it('по набору', () => {
    const r = readinessFromSet(
      { setId: 'u', title: 'Ünite 4', totalCards: 48, bookTitle: 'Harmoni' },
      [
        { id: 'a', name: 'Айша', status: 'completed' },
        { id: 'b', name: 'Бекжан', status: 'not_opened' },
      ]
    );
    expect(r).toMatchObject({ source: 'set', ready: 1, started: 0, notOpened: 1, setId: 'u' });
    expect(prepSubtitle('Завтра, пт · 10:30', r)).toBe('Завтра, пт · 10:30 · Harmoni · Ünite 4');
    expect(prepSubtitle(null, null)).toBe('');
  });
});

describe('loadLessonPrep', () => {
  const api = (over: Partial<LessonPrepApi> = {}): LessonPrepApi => ({
    loadCourseHardCards: jest.fn(async () => [card(1)]),
    loadCourseHomework: jest.fn(async () => [{ id: 'h1' } as TeacherHomeworkSummary]),
    loadHomeworkStatus: jest.fn(async () => status()),
    loadCourseSetStats: jest.fn(async () => [{ setId: 'u', title: 'Ünite 4', totalCards: 48 }]),
    loadCourseSetStudents: jest.fn(async () => [
      { id: 'a', name: 'Айша', status: 'started' as const },
    ]),
    ...over,
  });
  const pickCurrent = (list: TeacherHomeworkSummary[]) => list[0] ?? null;

  it('есть задание — готовность по нему, наборы не запрашиваются', async () => {
    const a = api();
    const d = await loadLessonPrep('k', a, { homeworkEnabled: true, pickCurrent });
    expect(d.readiness?.source).toBe('homework');
    expect(d.hardCards).toHaveLength(1);
    expect(a.loadCourseSetStats).not.toHaveBeenCalled();
  });

  it('задания выключены или задания нет — по последнему набору', async () => {
    const off = api();
    const d = await loadLessonPrep('k', off, { homeworkEnabled: false, pickCurrent });
    expect(d.readiness?.source).toBe('set');
    expect(off.loadCourseHomework).not.toHaveBeenCalled();

    const none = api({ loadCourseHomework: jest.fn(async () => []) });
    expect(
      (await loadLessonPrep('k', none, { homeworkEnabled: true, pickCurrent })).readiness?.source
    ).toBe('set');
  });

  it('ошибка одной части не роняет другую', async () => {
    const a = api({
      loadCourseHardCards: jest.fn(async () => {
        throw new Error('net');
      }),
    });
    const d = await loadLessonPrep('k', a, { homeworkEnabled: true, pickCurrent });
    expect(d.hardCards).toBeNull();
    expect(d.readiness).not.toBeNull();
  });
});
