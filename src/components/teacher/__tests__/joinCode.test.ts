import { describe, expect, it, jest } from '@jest/globals';

jest.mock('react-native', () => ({ Clipboard: {}, Platform: { OS: 'ios' }, Share: {} }));
jest.mock('@/utils/logger', () => ({ log: { error: () => {} } }));
jest.mock('@/services/NeonService', () => ({ NeonService: {} }));
jest.mock('@/services/auth/session', () => ({ getSession: async () => null }));

import { membersCountLabel, recentJoiners } from '../useCourseJoinCode';

describe('membersCountLabel', () => {
  it('склоняет «ученик»', () => {
    expect(membersCountLabel(1)).toBe('В курсе 1 ученик');
    expect(membersCountLabel(3)).toBe('В курсе 3 ученика');
    expect(membersCountLabel(11)).toBe('В курсе 11 учеников');
    expect(membersCountLabel(21)).toBe('В курсе 21 ученик');
    expect(membersCountLabel(22)).toBe('В курсе 22 ученика');
    expect(membersCountLabel(0)).toBe('В курсе 0 учеников');
  });
});

describe('recentJoiners', () => {
  const at = (name: string, y: number, m: number, d: number) => ({
    displayName: name,
    joinedAt: new Date(y, m, d, 12).getTime(),
  });

  it('новые первыми, не больше трёх, с короткой датой', () => {
    const list = recentJoiners([
      at('Batyr', 2026, 9, 19),
      at('Fatima', 2026, 10, 2),
      at('Asel', 2026, 9, 23),
      at('Anvar', 2026, 10, 2),
      at('Aziza', 2026, 9, 30),
    ]);
    expect(list.map((j) => j.name)).toEqual(['Fatima', 'Anvar', 'Aziza']);
    expect(list[0].date).toBe('2 ноя');
    expect(list[2].date).toBe('30 окт');
  });

  it('пустой список — пусто', () => {
    expect(recentJoiners([])).toEqual([]);
  });
});
