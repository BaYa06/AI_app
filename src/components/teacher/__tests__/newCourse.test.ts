import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockCalls: string[] = [];
let mockSynced = true;
let mockAttachOk = true;
let mockScheduleOk = true;

jest.mock('@/services/analytics', () => ({ Analytics: { teacherCourseCreated: () => {} } }));
jest.mock('@/store', () => ({
  useCoursesStore: {
    getState: () => ({
      createCourseSynced: async (title: string) => {
        mockCalls.push(`create:${title}`);
        return { course: { id: 'c1', title, createdAt: 0 }, synced: mockSynced };
      },
    }),
  },
}));
jest.mock('@/services/BookService', () => ({
  BookService: {
    attachToCourses: async (bookId: string, ids: string[]) => {
      mockCalls.push(`book:${bookId}:${ids.join(',')}`);
      return { ok: mockAttachOk };
    },
    listBooks: async () => [],
  },
}));
jest.mock('@/services/NeonService', () => ({
  NeonService: {
    setCourseSchedule: async (id: string, schedule: Array<{ day: string; time: string }>) => {
      mockCalls.push(`schedule:${id}:${schedule.map((s) => `${s.day}@${s.time}`).join(',')}`);
      return mockScheduleOk;
    },
  },
}));

import { createCourseWithSetup, newCourseProblemMessage } from '../newCourse';

const input = { title: 'A1-C', bookId: 'b1', days: ['mon', 'wed'], time: '10:30' };

describe('createCourseWithSetup', () => {
  beforeEach(() => {
    mockCalls.length = 0;
    mockSynced = true;
    mockAttachOk = true;
    mockScheduleOk = true;
  });

  it('курс → учебник → расписание, без проблем', async () => {
    const result = await createCourseWithSetup(input);
    expect(mockCalls).toEqual(['create:A1-C', 'book:b1:c1', 'schedule:c1:mon@10:30,wed@10:30']);
    expect(result.problems).toEqual([]);
    expect(result.course.id).toBe('c1');
  });

  it('без учебника и дней — только курс', async () => {
    await createCourseWithSetup({ ...input, bookId: null, days: [] });
    expect(mockCalls).toEqual(['create:A1-C']);
  });

  it('курс не дошёл до сервера — учебник и расписание не трогаем', async () => {
    mockSynced = false;
    const result = await createCourseWithSetup(input);
    expect(mockCalls).toEqual(['create:A1-C']);
    expect(result.problems).toEqual(['offline']);
  });

  it('учебник и расписание не сохранились — курс остаётся, проблемы списком', async () => {
    mockAttachOk = false;
    mockScheduleOk = false;
    const result = await createCourseWithSetup(input);
    expect(result.course.id).toBe('c1');
    expect(result.problems).toEqual(['book', 'schedule']);
  });
});

describe('newCourseProblemMessage', () => {
  it('всё хорошо — null', () => {
    expect(newCourseProblemMessage([])).toBeNull();
  });
  it('только расписание', () => {
    expect(newCourseProblemMessage(['schedule'])).toBe(
      'Курс создан, но расписание не сохранилось — добавь в курсе'
    );
  });
  it('учебник и расписание', () => {
    expect(newCourseProblemMessage(['book', 'schedule'])).toBe(
      'Курс создан, но учебник и расписание не сохранились — добавь в курсе'
    );
  });
  it('нет сети', () => {
    expect(newCourseProblemMessage(['offline'])).toContain('только на этом устройстве');
  });
});
