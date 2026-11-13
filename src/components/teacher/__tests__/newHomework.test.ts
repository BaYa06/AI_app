import { beforeEach, describe, expect, it, jest } from '@jest/globals';

let mockCreated: Record<string, unknown> | null = null;
let mockResult: { ok: true; id: string } | { ok: false; reason: string } = { ok: true, id: 'h1' };
const mockEvents: Array<Record<string, unknown>> = [];

jest.mock('@/services/analytics', () => ({
  Analytics: { teacherHomeworkCreated: (p: Record<string, unknown>) => mockEvents.push(p) },
}));
jest.mock('@/services/NeonService', () => ({
  NeonService: {
    createHomework: async (input: Record<string, unknown>) => {
      mockCreated = input;
      return mockResult;
    },
  },
}));

import {
  assignButtonText,
  createHomework,
  defaultDue,
  dueCardText,
  dueDayIndex,
  dueDayLabels,
  duePresets,
  homeworkTitle,
  snapMinutes,
  wordsSummary,
} from '../newHomework';

// Чт 12.11.2026 10:00
const NOW = new Date(2026, 10, 12, 10, 0);

beforeEach(() => {
  mockCreated = null;
  mockResult = { ok: true, id: 'h1' };
  mockEvents.length = 0;
});

describe('срок', () => {
  it('без расписания — через 3 дня в 20:00; с уроком через сутки и больше — к уроку', () => {
    expect(defaultDue(NOW, null)).toEqual(new Date(2026, 10, 15, 20, 0));
    // пн 10:30 — через 4 дня
    expect(defaultDue(NOW, [{ day: 'mon', time: '10:30' }])).toEqual(
      new Date(2026, 10, 16, 10, 30)
    );
    // урок завтра в 9:00 — меньше суток, не успеют
    expect(defaultDue(NOW, [{ day: 'fri', time: '09:00' }])).toEqual(new Date(2026, 10, 15, 20, 0));
  });

  it('быстрые варианты; «К уроку» — только с расписанием и первым', () => {
    expect(duePresets(NOW, null).map((p) => p.key)).toEqual(['tomorrow', 'in3', 'week']);
    const withLesson = duePresets(NOW, [{ day: 'mon', time: '10:30' }]);
    expect(withLesson[0]).toMatchObject({ key: 'lesson', label: 'К уроку' });
    expect(withLesson[3].date).toEqual(new Date(2026, 10, 19, 20, 0));
  });

  it('подписи барабана и индекс дня', () => {
    const labels = dueDayLabels(NOW, 4);
    expect(labels).toEqual(['Сегодня', 'Пт 13 нояб.', 'Сб 14 нояб.', 'Вс 15 нояб.']);
    expect(dueDayIndex(NOW, new Date(2026, 10, 15, 20, 0))).toBe(3);
    expect(snapMinutes(58)).toBe(55);
    expect(snapMinutes(32)).toBe(30);
    expect(dueCardText(new Date(2026, 10, 15, 20, 0))).toBe('Вс, 15.11.2026 20:00');
  });
});

describe('подписи', () => {
  it('название и строка слов', () => {
    expect(homeworkTitle([{ title: 'Ünite 5' }])).toBe('Ünite 5');
    expect(homeworkTitle([{ title: 'Ünite 4' }, { title: 'Ünite 5' }, { title: 'X' }])).toBe(
      'Ünite 4 + ещё 2'
    );
    expect(
      wordsSummary({ cardIds: Array(50).fill('c'), sets: [{ id: 's', title: 'Ünite 5' }] })
    ).toBe('Ünite 5 · 50 слов');
    expect(assignButtonText(21)).toBe('Задать 21 ученику');
    expect(assignButtonText(22)).toBe('Задать 22 ученикам');
  });
});

describe('createHomework', () => {
  const input = {
    courseId: 'c1',
    words: { cardIds: ['a', 'b'], sets: [{ id: 's', title: 'Ünite 4' }] },
    due: new Date(Date.now() + 3 * 86400000),
    minScore: 80,
    userIds: null,
  };

  it('отправляет название, слова, срок ISO и порог; событие аналитики', async () => {
    const res = await createHomework(input);
    expect(res).toEqual({ ok: true, id: 'h1' });
    expect(mockCreated).toMatchObject({
      courseId: 'c1',
      title: 'Ünite 4',
      cardIds: ['a', 'b'],
      minScore: 80,
      userIds: null,
      dueAt: input.due.toISOString(),
    });
    expect(mockEvents[0]).toMatchObject({ words: 2, allStudents: true, result: 'ok' });
  });

  it('ошибка — понятный текст', async () => {
    mockResult = { ok: false, reason: 'network' };
    const res = await createHomework(input);
    expect(res).toEqual({ ok: false, message: expect.stringContaining('Нет интернета') });
    expect(mockEvents[0]).toMatchObject({ result: 'network' });
  });
});

describe('homeworkFormStart (Teacher 42)', () => {
  const { homeworkFormStart, homeworkTasks } = require('../newHomework');
  const now = new Date(2026, 10, 13, 12, 0);
  const words = { cardIds: ['a', 'b'], sets: [{ id: 's', title: 'Ünite 4' }] };
  const base = { now, schedule: null, initialWords: words, studentIds: ['u1', 'u2'] };

  it('без готовых значений — обычная форма', () => {
    const start = homeworkFormStart({ ...base, tasks: ['learn'] });
    expect(start.words).toBe(words);
    expect(start.userIds).toBeNull();
    expect(start.task).toBe('learn');
    expect(start.due.getTime()).toBeGreaterThan(now.getTime());
  });

  it('готовые слова, ученики, срок и тип', () => {
    const due = new Date(2026, 10, 16, 10, 30);
    const hard = { cardIds: ['x'], sets: [{ id: 'w', title: 'Трудные слова' }] };
    const start = homeworkFormStart({
      ...base,
      tasks: ['learn', 'hard'],
      preset: { words: hard, userIds: ['u2', 'gone'], due, task: 'hard' },
    });
    expect(start).toEqual({ words: hard, userIds: ['u2'], due, task: 'hard' });
  });

  it('учеников не осталось — вся группа; срок в прошлом — по умолчанию; типа нет — «Выучить»', () => {
    const start = homeworkFormStart({
      ...base,
      tasks: ['learn'],
      preset: { words, userIds: ['gone'], due: new Date(2026, 10, 1), task: 'hard' },
    });
    expect(start.userIds).toBeNull();
    expect(start.due.getTime()).toBeGreaterThan(now.getTime());
    expect(start.task).toBe('learn');
  });

  it('«Пройти тест» не показываем; «Повторить трудные» — за флагом', () => {
    expect(homeworkTasks(false)).toEqual(['learn']);
    expect(homeworkTasks(true)).toEqual(['learn', 'hard']);
  });
});
