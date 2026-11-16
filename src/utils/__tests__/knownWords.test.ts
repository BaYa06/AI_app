/**
 * Прогресс в словах (plan/new/new_user_activation.md, Start 5.3)
 */
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@/store', () => ({ useCardsStore: { getState: () => ({ cards: {} }) } }));

import { chaptersComparison, goalProgressLine, studyDay } from '../knownWords';

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

describe('goalProgressLine', () => {
  it('путешествия — что уже можно сказать', () => {
    const cards = [{ frontText: 'Hello' }, { frontText: 'Coffee' }, { frontText: 'Where' }];
    expect(goalProgressLine('travel', 3, cards)).toBe(
      'Ты уже можешь поздороваться, заказать кофе и спросить дорогу'
    );
  });
  it('путешествия, но таких слов нет — ничего', () => {
    expect(goalProgressLine('travel', 2, [{ frontText: 'Apple' }])).toBeNull();
  });
  it('учёба — ближайший рубеж', () => {
    expect(goalProgressLine('studies', 47)).toBe('До 50 слов — ещё 3');
    expect(goalProgressLine('courses', 120)).toBe('До 250 слов — ещё 130');
  });
  it('для себя — ничего', () => {
    expect(goalProgressLine('self', 47)).toBeNull();
  });
});
