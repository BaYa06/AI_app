/**
 * Неделя серии — как считает сервер (plan/new/streak_freeze_display.md, Freeze 3).
 * Случай из обращения 08.11.2026: дни с галочкой, которые серия не засчитала, и невидимая заморозка.
 */
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../NeonService', () => ({ NeonService: {}, NetworkLoadError: class {} }));
jest.mock('../localCache', () => ({ readCache: () => null, writeCache: () => {} }));
jest.mock('../auth/session', () => ({ getUserId: async () => null }));
jest.mock('@/utils/logger', () => ({
  log: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
}));

import { buildWeekStatus, weekNotes, type DailyActivity } from '../StreakService';

const TODAY = '2026-11-08'; // воскресенье: неделя 02.11–08.11
const day = (
  local_date: string,
  cards: number,
  over: Partial<DailyActivity> = {}
): DailyActivity => ({
  local_date,
  words_learned: cards,
  minutes_learned: 1,
  cards_studied: cards,
  streak_counted: false,
  frozen: false,
  ...over,
});

describe('buildWeekStatus — сервер решает, засчитан ли день', () => {
  const week = buildWeekStatus(
    [
      day('2026-11-03', 69, { streak_counted: true }),
      day('2026-11-04', 277), // только новые слова — не засчитан
      day('2026-11-05', 461), // итоги не дошли — не засчитан
      day('2026-11-06', 327, { streak_counted: true }),
      day('2026-11-07', 0, { frozen: true }),
      day('2026-11-08', 824, { streak_counted: true }),
    ],
    TODAY
  );
  const byDate = Object.fromEntries(week.map((d) => [d.date, d.status]));

  it('неделя Пн–Вс по todayKey', () => {
    expect(week.map((d) => d.date)).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
    ]);
    expect(week[0].dayLabel).toBe('Пн');
    expect(week[6].dayNumber).toBe(8);
  });

  it('галочка только за засчитанные, жёлтые — занимался без зачёта, снежинка — заморозка', () => {
    expect(byDate).toEqual({
      '2026-11-02': 'missed',
      '2026-11-03': 'counted',
      '2026-11-04': 'studied',
      '2026-11-05': 'studied',
      '2026-11-06': 'counted',
      '2026-11-07': 'frozen',
      '2026-11-08': 'counted',
    });
    expect(week[6].isToday).toBe(true);
  });

  it('пояснения: одна снежинка и последний жёлтый день, по порядку дат', () => {
    expect(weekNotes(week)).toEqual([
      expect.objectContaining({
        kind: 'studied',
        date: '2026-11-05',
        text: expect.stringMatching(/^Чт — /),
      }),
      { kind: 'frozen', date: '2026-11-07', text: 'Сб — заморозка спасла серию' },
    ]);
  });
});

describe('buildWeekStatus — сегодня и будущее', () => {
  it('сегодня ещё не засчитан → today; дни после — future', () => {
    const week = buildWeekStatus([day('2026-11-11', 4)], '2026-11-11');
    expect(week.map((d) => d.status)).toEqual([
      'missed',
      'missed',
      'today',
      'future',
      'future',
      'future',
      'future',
    ]);
    expect(weekNotes(week)).toEqual([]);
  });
});

describe('buildWeekStatus — старый сервер без новых полей', () => {
  it('прежнее правило ≥ 10 карточек, без снежинок и жёлтых', () => {
    const old = (local_date: string, cards: number): DailyActivity => ({
      local_date,
      words_learned: cards,
      minutes_learned: 1,
      cards_studied: cards,
    });
    const week = buildWeekStatus([old('2026-11-03', 12), old('2026-11-04', 5)], TODAY);
    expect(week[1].status).toBe('counted');
    expect(week[2].status).toBe('missed');
    expect(weekNotes(week)).toEqual([]);
  });
});
