/**
 * Подсказки в момент нужды (plan/new/new_user_activation.md, Start 4.3)
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

let mockCache: unknown;
jest.mock('../localCache', () => ({
  readCache: () => mockCache,
  writeCache: (_: string, v: unknown) => {
    mockCache = v;
  },
}));

import { markHintShown, noteManualCard, noteStudyMode, sameModeStreak } from '../momentHints';

beforeEach(() => {
  mockCache = undefined;
});

describe('noteManualCard', () => {
  it('на 10-й карточке — один раз', () => {
    const results = Array.from({ length: 12 }, () => noteManualCard());
    expect(results.indexOf(true)).toBe(9);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe('sameModeStreak', () => {
  it('3 дня одним режимом — этот режим', () => {
    expect(
      sameModeStreak({ '2026-11-10': ['test'], '2026-11-11': ['test'], '2026-11-13': ['test'] })
    ).toBe('test');
  });
  it('в один из дней другой режим — нет', () => {
    expect(
      sameModeStreak({
        '2026-11-10': ['test'],
        '2026-11-11': ['test', 'match'],
        '2026-11-12': ['test'],
      })
    ).toBeNull();
  });
  it('меньше 3 дней — нет', () => {
    expect(sameModeStreak({ '2026-11-10': ['test'], '2026-11-11': ['test'] })).toBeNull();
  });
});

describe('noteStudyMode', () => {
  it('на третий день одного режима — подсказка, после показа — больше нет', () => {
    expect(noteStudyMode('2026-11-10', 'test')).toBeNull();
    expect(noteStudyMode('2026-11-11', 'test')).toBeNull();
    expect(noteStudyMode('2026-11-12', 'test')).toBe('test');
    markHintShown('another_game');
    expect(noteStudyMode('2026-11-13', 'test')).toBeNull();
  });
});
