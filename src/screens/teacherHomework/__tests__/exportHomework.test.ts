import { describe, expect, it, jest } from '@jest/globals';

jest.mock('react-native', () => ({ Platform: { OS: 'android' }, Share: { share: jest.fn() } }));
jest.mock('@/services/NeonService', () => ({ NeonService: {} }));
jest.mock('@/utils/logger', () => ({ log: { warn: () => {} } }));

import { homeworkCsv } from '../exportHomework';

describe('оценки текстом (Android)', () => {
  it('шапка и строки; запятые в имени экранируются', () => {
    const csv = homeworkCsv(
      {
        homework: {
          id: 'h',
          courseId: 'c',
          title: 'Ünite 4',
          words: 48,
          dueAt: new Date(2026, 10, 15, 20, 0).toISOString(),
          minScore: null,
          createdAt: '',
          canceled: false,
        },
        students: [
          {
            id: 's',
            displayName: 'Иванов, Иван',
            lastActiveDate: null,
            status: 'in_progress',
            credited: 22,
            score: 93,
            submittedAt: null,
            late: false,
            remindedAt: null,
            fixed: null,
          },
        ],
      },
      'A1-B'
    );
    const lines = csv.split('\n');
    expect(lines[2]).toBe('Срок: 15.11.2026 20:00');
    expect(lines[3]).toBe('Порог: без порога');
    expect(lines[6]).toBe('"Иванов, Иван",В процессе,22 из 48,93,,,');
  });
});
