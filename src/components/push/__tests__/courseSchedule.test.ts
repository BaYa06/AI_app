import { describe, expect, it, jest } from '@jest/globals';

let mockSchedule: Array<{ day: string; time: string }> | null = null;
const mockSaved: unknown[] = [];
jest.mock('@/services/NeonService', () => ({
  NeonService: {
    getCourseSchedule: async () => mockSchedule,
    setCourseSchedule: async (id: string, items: unknown) => {
      mockSaved.push([id, items]);
      return true;
    },
  },
}));

import {
  DEFAULT_MINUTES,
  fromTime,
  loadScheduleForm,
  saveSchedule,
  toTime,
} from '../courseSchedule';

describe('время занятия', () => {
  it('туда и обратно', () => {
    expect(toTime(630)).toBe('10:30');
    expect(toTime(9 * 60)).toBe('09:00');
    expect(fromTime('10:30')).toBe(630);
  });
});

describe('форма расписания', () => {
  it('нет расписания — пустые дни и время по умолчанию', async () => {
    mockSchedule = null;
    expect(await loadScheduleForm('c1')).toEqual({ days: [], minutes: DEFAULT_MINUTES });
  });
  it('есть расписание — дни и время первого', async () => {
    mockSchedule = [
      { day: 'mon', time: '10:30' },
      { day: 'fri', time: '10:30' },
    ];
    expect(await loadScheduleForm('c1')).toEqual({ days: ['mon', 'fri'], minutes: 630 });
  });
  it('сохраняет одно время на все дни', async () => {
    await saveSchedule('c1', ['tue', 'thu'], 18 * 60);
    expect(mockSaved.pop()).toEqual([
      'c1',
      [
        { day: 'tue', time: '18:00' },
        { day: 'thu', time: '18:00' },
      ],
    ]);
  });
});
