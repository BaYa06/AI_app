import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@/services/api/client', () => ({ rawApiFetch: async () => ({ ok: false }) }));
jest.mock('@/services/auth/session', () => ({ getAccessToken: async () => null }));

import { activityInsight, formatScheduleLabel } from '../courseOverview';

const at = (day: string, time = '10:30') => ({ day, time });

describe('formatScheduleLabel', () => {
  it('пусто — null', () => {
    expect(formatScheduleLabel(null)).toBeNull();
    expect(formatScheduleLabel([])).toBeNull();
  });
  it('пн–пт сворачивается в диапазон', () => {
    expect(formatScheduleLabel(['mon', 'tue', 'wed', 'thu', 'fri'].map((d) => at(d)))).toBe(
      'пн–пт 10:30'
    );
  });
  it('через день — списком, в порядке недели', () => {
    expect(formatScheduleLabel([at('fri', '18:00'), at('mon', '18:00'), at('wed', '18:00')])).toBe(
      'пн, ср, пт 18:00'
    );
  });
  it('два дня подряд — не диапазон', () => {
    expect(formatScheduleLabel([at('sat'), at('sun')])).toBe('сб, вс 10:30');
  });
  it('разное время — оба', () => {
    expect(formatScheduleLabel([at('tue', '18:00'), at('thu', '09:00')])).toBe(
      'вт, чт 09:00 и 18:00'
    );
  });
});

describe('activityInsight', () => {
  const chart = (counts: number[]) => counts.map((count, i) => ({ day: `Д${i}`, count }));

  it('спад больше чем вдвое — строка', () => {
    expect(activityInsight(chart([18, 22, 7, 5, 1, 3, 2]))).toBe(
      'Д1 учились 22, сейчас 1–3 в день'
    );
  });
  it('нет спада — null', () => {
    expect(activityInsight(chart([5, 6, 4, 5, 4, 6, 5]))).toBeNull();
  });
  it('мало учеников на пике — null', () => {
    expect(activityInsight(chart([2, 1, 0, 2, 0, 0, 0]))).toBeNull();
  });
  it('одинаково в последние дни — одно число', () => {
    expect(activityInsight(chart([10, 12, 8, 6, 2, 2, 2]))).toBe('Д1 учились 12, сейчас 2 в день');
  });
});
