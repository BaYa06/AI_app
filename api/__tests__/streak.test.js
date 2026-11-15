/**
 * Серия: какой день засчитан и какой спасён заморозкой (plan/new/streak_freeze_display.md, Freeze 1).
 * SQL подставной: проверяем, какие запросы уходят и с какими значениями.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const ME = '11111111-1111-4111-8111-111111111111';

let mockQueries = [];
let mockRules = [];
function mockSql(strings, ...values) {
  const text = strings.join('?').replace(/\s+/g, ' ').trim();
  mockQueries.push({ text, values });
  const rule = mockRules.find(([re]) => re.test(text));
  return Promise.resolve(rule ? rule[1](values) : []);
}

jest.mock('../_log.js', () => ({
  log: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
}));
const mockPush = jest.fn(async () => {});
jest.mock('../push.js', () => ({ sendNotification: (...a) => mockPush(...a) }));

const {
  updateUserStatsStreak,
  getUserStats,
  getWeekActivity,
} = require('../_handlers/data/streak.js');

const dayKey = (offset) =>
  new Date(Date.parse(new Date().toISOString().slice(0, 10) + 'T12:00:00Z') + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);
const TODAY = dayKey(0);
const YESTERDAY = dayKey(-1);

const stats = (over = {}) => [
  /SELECT current_streak, longest_streak, last_active_date/,
  () => [
    { current_streak: 4, longest_streak: 9, last_active_date: YESTERDAY, timezone: 'UTC', ...over },
  ],
];
const day = (counts) => [/FROM answers/, () => [counts]];
const COUNTED = { active: 30, reviewed: 12, waiting: 5 };
const NOT_COUNTED = { active: 277, reviewed: 0, waiting: 40 };

const markQueries = () =>
  mockQueries.filter((q) => /INSERT INTO daily_activity .*streak_counted/.test(q.text));

beforeEach(() => {
  mockQueries = [];
  mockRules = [];
  mockPush.mockClear();
});

describe('updateUserStatsStreak — отметка засчитанного дня', () => {
  const call = () =>
    updateUserStatsStreak(mockSql, ME, { localDate: TODAY, yesterdayDate: YESTERDAY, deltas: {} });

  it('день засчитан → streak_counted за сегодня', async () => {
    mockRules = [stats(), day(COUNTED)];
    const res = await call();
    expect(res).toMatchObject({ counted: true, increased: true, currentStreak: 5 });
    const marks = markQueries();
    expect(marks).toHaveLength(1);
    expect(marks[0].values).toEqual([ME, TODAY]);
    // Повтор не трогает уже отмеченный день
    expect(marks[0].text).toMatch(/WHERE daily_activity\.streak_counted = false/);
  });

  it('только новые слова при ждущих → день не засчитан, отметки нет', async () => {
    mockRules = [stats(), day(NOT_COUNTED)];
    const res = await call();
    expect(res.counted).toBe(false);
    expect(markQueries()).toHaveLength(0);
  });

  it('повторный вызов в тот же день: серия не растёт, отметка та же', async () => {
    mockRules = [stats({ current_streak: 5, last_active_date: TODAY }), day(COUNTED)];
    const res = await call();
    expect(res).toMatchObject({ counted: true, increased: false, currentStreak: 5 });
    expect(markQueries()).toHaveLength(1);
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('getUserStats — заморозка помечает вчерашний день', () => {
  const row = (over = {}) => [
    /FROM user_stats us JOIN users u/,
    () => [
      {
        current_streak: 5,
        longest_streak: 9,
        last_active_date: dayKey(-2),
        timezone: 'UTC',
        streak_freezes: 1,
        ...over,
      },
    ],
  ];

  it('пропущен один день и есть заморозка → frozen за вчера в том же запросе', async () => {
    mockRules = [row(), [/WITH f AS/, () => [{ left: 0 }]]];
    const res = await getUserStats(mockSql, ME);
    expect(res).toMatchObject({
      freeze_used: true,
      streak_freezes: 0,
      last_active_date: YESTERDAY,
    });
    const q = mockQueries.find((x) => /WITH f AS/.test(x.text));
    expect(q.text).toMatch(/INSERT INTO daily_activity \(user_id, local_date, frozen\)/);
    expect(q.text).toMatch(/ON CONFLICT \(user_id, local_date\) DO UPDATE SET frozen = true/);
    expect(q.values).toContain(YESTERDAY);
  });

  it('заморозки нет → серия сброшена, frozen не пишется', async () => {
    mockRules = [row({ streak_freezes: 0 })];
    const res = await getUserStats(mockSql, ME);
    expect(res).toMatchObject({ freeze_used: false, current_streak: 0 });
    expect(mockQueries.some((x) => /frozen/.test(x.text))).toBe(false);
  });

  it('пропущено два дня → заморозка не тратится', async () => {
    mockRules = [row({ last_active_date: dayKey(-3) })];
    const res = await getUserStats(mockSql, ME);
    expect(res).toMatchObject({ freeze_used: false, current_streak: 0, streak_freezes: 1 });
    expect(mockQueries.some((x) => /WITH f AS/.test(x.text))).toBe(false);
  });
});

describe('getWeekActivity', () => {
  it('отдаёт streak_counted и frozen', async () => {
    await getWeekActivity(mockSql, ME, { days: 7 });
    expect(mockQueries[0].text).toMatch(/streak_counted, frozen/);
  });
});
