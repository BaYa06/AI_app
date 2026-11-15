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
  log: {
    error: (_scope, msg) => mockLogErrors.push(msg),
    warn: () => {},
    info: () => {},
    debug: () => {},
  },
}));
// push.js грузится через import(): в jest без --experimental-vm-modules он падает, и sendPush
// пишет «push <type> failed». По этим строкам и считаем, какие пуши сервер пытался отправить.
let mockLogErrors = [];
const pushes = () => mockLogErrors.map((m) => /^push (\w+) failed$/.exec(m)?.[1]).filter(Boolean);

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
  mockLogErrors = [];
});

describe('updateUserStatsStreak — отметка засчитанного дня', () => {
  const call = () =>
    updateUserStatsStreak(mockSql, ME, { localDate: TODAY, yesterdayDate: YESTERDAY, deltas: {} });

  it('день засчитан → streak_counted за сегодня', async () => {
    mockRules = [
      stats(),
      day(COUNTED),
      [/UPDATE user_stats SET current_streak/, () => [{ current_streak: 5 }]],
    ];
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
    expect(pushes()).toEqual([]);
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

describe('countDayFromAnswers — сервер засчитывает день сам (Freeze 2)', () => {
  const { countDayFromAnswers } = require('../_handlers/data/streak.js');
  const me = (over = {}) => [
    /FROM users u LEFT JOIN user_stats us/,
    () => [
      {
        has_stats: true,
        current_streak: 4,
        longest_streak: 9,
        last_active_date: YESTERDAY,
        timezone: 'UTC',
        streak_freezes: 1,
        ...over,
      },
    ],
  ];
  const advance = (ok = true) => [
    /UPDATE user_stats SET current_streak/,
    () => (ok ? [{ current_streak: 5 }] : []),
  ];

  it('ответов хватает, итогов клиента нет → день засчитан, серия +1', async () => {
    mockRules = [me(), day(COUNTED), advance()];
    const res = await countDayFromAnswers(mockSql, ME);
    expect(res).toMatchObject({ counted: true, increased: true, currentStreak: 5 });
    const upd = mockQueries.find((q) => /UPDATE user_stats SET current_streak/.test(q.text));
    // Сравнить-и-заменить: только если last_active_date всё ещё вчерашний
    expect(upd.text).toMatch(/last_active_date IS NOT DISTINCT FROM/);
    expect(upd.values).toContain(YESTERDAY);
    expect(markQueries()).toHaveLength(1);
  });

  it('день уже засчитан → один запрос, ничего не меняется', async () => {
    mockRules = [me({ last_active_date: TODAY })];
    expect(await countDayFromAnswers(mockSql, ME)).toBeNull();
    expect(mockQueries).toHaveLength(1);
  });

  it('ответов мало → серия не трогается', async () => {
    mockRules = [me(), day(NOT_COUNTED)];
    expect(await countDayFromAnswers(mockSql, ME)).toEqual({ counted: false });
    expect(mockQueries.some((q) => /UPDATE user_stats/.test(q.text))).toBe(false);
  });

  it('разрыв в день и есть заморозка → она тратится, серия продолжается', async () => {
    mockRules = [
      me({ last_active_date: dayKey(-2) }),
      day(COUNTED),
      [/WITH f AS/, () => [{ left: 0 }]],
      advance(),
    ];
    const res = await countDayFromAnswers(mockSql, ME);
    expect(res).toMatchObject({ counted: true, freezeUsed: true, currentStreak: 5 });
    const upd = mockQueries.find((q) => /UPDATE user_stats SET current_streak/.test(q.text));
    expect(upd.values).toContain(YESTERDAY); // после заморозки последний день — вчера
  });

  it('гонка: итоги клиента успели первыми → серия не растёт второй раз, пуша нет', async () => {
    mockRules = [
      me({ current_streak: 6, last_active_date: YESTERDAY }),
      day(COUNTED),
      advance(false),
      [
        /SELECT current_streak, longest_streak FROM user_stats/,
        () => [{ current_streak: 7, longest_streak: 9 }],
      ],
    ];
    const res = await countDayFromAnswers(mockSql, ME);
    expect(res).toMatchObject({ counted: true, increased: false, currentStreak: 7 });
    expect(pushes()).toEqual([]);
  });

  it('серия дошла до 7 → пуш streak_milestone один раз', async () => {
    mockRules = [me({ current_streak: 6 }), day(COUNTED), advance()];
    await countDayFromAnswers(mockSql, ME);
    expect(pushes()).toEqual(['streak_milestone']);
  });

  it('затем итоги клиента: серия та же, только итоги', async () => {
    mockRules = [stats({ current_streak: 5, last_active_date: TODAY }), day(COUNTED)];
    const res = await updateUserStatsStreak(mockSql, ME, {
      localDate: TODAY,
      yesterdayDate: YESTERDAY,
      deltas: { cardsDelta: 20 },
    });
    expect(res).toMatchObject({ counted: true, increased: false, currentStreak: 5 });
    expect(mockQueries.some((q) => /UPDATE user_stats SET current_streak/.test(q.text))).toBe(
      false
    );
    expect(mockQueries.some((q) => /total_cards_studied/.test(q.text))).toBe(true);
  });
});
