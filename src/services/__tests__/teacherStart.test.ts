/**
 * Первые шаги учителя (plan/new/new_user_activation.md, Start 6.3)
 */
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../localCache', () => ({ readCache: () => undefined, writeCache: jest.fn() }));

import { TEACHER_TASK_ORDER, isTeacherStartVisible } from '../teacherStart';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

describe('isTeacherStartVisible', () => {
  it('новый учитель — видно', () => {
    expect(isTeacherStartVisible({ startedAt: NOW - DAY, closed: false, done: [] }, NOW)).toBe(
      true
    );
  });
  it('старый учитель (не проходил новый онбординг) — нет', () => {
    expect(isTeacherStartVisible({ startedAt: null, closed: false, done: [] }, NOW)).toBe(false);
  });
  it('закрыто, прошло 14 дней или всё сделано — нет', () => {
    expect(isTeacherStartVisible({ startedAt: NOW, closed: true, done: [] }, NOW)).toBe(false);
    expect(isTeacherStartVisible({ startedAt: NOW - 15 * DAY, closed: false, done: [] }, NOW)).toBe(
      false
    );
    expect(
      isTeacherStartVisible({ startedAt: NOW, closed: false, done: [...TEACHER_TASK_ORDER] }, NOW)
    ).toBe(false);
  });
});
