import { describe, expect, it } from '@jest/globals';
import { examCsv } from '../examCsv';

describe('итоги экзамена таблицей', () => {
  it('строка на ученика, кавычки в именах с запятой', () => {
    const csv = examCsv(
      {
        sessionId: 's',
        status: 'finished',
        setTitle: 'Unit 5',
        date: '2026-11-18T10:00:00Z',
        released: true,
        durationSec: 420,
        totalQuestions: 20,
        avgScore: 71,
        distribution: [],
        words: [],
        absent: [{ userId: 'u', name: 'Ерлан' }],
        students: [
          {
            participantId: 'p',
            userId: 'u1',
            name: 'Иванов, Пётр',
            initials: 'ИП',
            score: 55,
            computedScore: 45,
            overridden: true,
            comment: 'Устно хорошо',
            counts: { correct: 9, wrong: 10, typo: 1, wrong_form: 0, none: 0 },
            finished: true,
            leftReason: null,
            awayCount: 0,
            flags: [],
          },
        ],
      },
      '7 «Б»'
    );
    const lines = csv.split('\n');
    expect(lines[6]).toBe('"Иванов, Пётр",55,9,10,1,0,0,Да (было 45),Устно хорошо,Нет');
    expect(lines[7]).toBe('Ерлан,не пришёл');
  });
});
