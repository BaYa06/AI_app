/**
 * Прогресс в словах (plan/new/new_user_activation.md, Start 5.3)
 */
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@/store', () => ({ useCardsStore: { getState: () => ({ cards: {} }) } }));

import { chaptersComparison, studyDay } from '../knownWords';

describe('chaptersComparison', () => {
  it('меньше 20 слов — без сравнения', () => {
    expect(chaptersComparison(15)).toBeNull();
  });
  it('около 25 — первая глава', () => {
    expect(chaptersComparison(27)).toBe('Это как первая глава учебника');
  });
  it('47 слов — первые 2 главы', () => {
    expect(chaptersComparison(47)).toBe('Это как первые 2 главы учебника');
  });
  it('130 слов — первые 5 глав', () => {
    expect(chaptersComparison(130)).toBe('Это как первые 5 глав учебника');
  });
});

describe('studyDay', () => {
  const DAY = 24 * 60 * 60 * 1000;
  it('день выдачи — 1, через неделю — 8', () => {
    expect(studyDay(0, 1000)).toBe(1);
    expect(studyDay(0, 7 * DAY + 1)).toBe(8);
    expect(studyDay(null)).toBeNull();
  });
});
