/**
 * Когда видна стопка «Начало пути» (plan/new/new_user_activation.md, Start 3.1)
 */
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@/services/neon/core', () => ({ callDataApi: jest.fn() }));
jest.mock('@/services/localCache', () => ({ readCache: () => undefined, writeCache: jest.fn() }));
jest.mock('@/services/analytics', () => ({ Analytics: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../diamondStore', () => ({
  useDiamondStore: { getState: () => ({ setDiamonds: jest.fn() }) },
}));

import { START_TASK_ORDER, isStartTasksFinished, isStartTasksVisible } from '../startTasksStore';

const NOW = Date.parse('2026-11-15T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const base = { loaded: true, startedAt: NOW - DAY, closed: false, done: [] };

describe('isStartTasksVisible', () => {
  it('новый ученик в первые 14 дней — видна', () => {
    expect(isStartTasksVisible(base, NOW)).toBe(true);
  });
  it('нет стартового набора (старый пользователь) — нет', () => {
    expect(isStartTasksVisible({ ...base, startedAt: null }, NOW)).toBe(false);
  });
  it('закрыта крестиком — нет', () => {
    expect(isStartTasksVisible({ ...base, closed: true }, NOW)).toBe(false);
  });
  it('прошло больше 14 дней — нет', () => {
    expect(isStartTasksVisible({ ...base, startedAt: NOW - 15 * DAY }, NOW)).toBe(false);
  });
  it('всё выполнено — нет', () => {
    expect(isStartTasksVisible({ ...base, done: [...START_TASK_ORDER] }, NOW)).toBe(false);
  });
  it('ещё не загружено — нет', () => {
    expect(isStartTasksVisible({ ...base, loaded: false }, NOW)).toBe(false);
  });
});

describe('isStartTasksFinished', () => {
  it('всё выполнено и не закрыто — «Начало пути пройдено»', () => {
    expect(isStartTasksFinished({ ...base, done: [...START_TASK_ORDER] }, NOW)).toBe(true);
  });
  it('не всё выполнено — нет', () => {
    expect(isStartTasksFinished(base, NOW)).toBe(false);
  });
  it('закрыто — нет', () => {
    expect(isStartTasksFinished({ ...base, closed: true, done: [...START_TASK_ORDER] }, NOW)).toBe(
      false
    );
  });
});
