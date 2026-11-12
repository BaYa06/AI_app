/**
 * Задания ученика (plan/new/teacher_cabinet.md, Teacher 16): my-homework и session-complete.
 * SQL подставной (как в access.test.js): проверяем вход, права через текущего пользователя
 * и что снимок сдачи считается только по тронутым заданиям.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const ME = '11111111-1111-4111-8111-111111111111';
const CARD_A = '44444444-4444-4444-8444-444444444444';
const CARD_B = '55555555-5555-4555-8555-555555555555';
const HW = '66666666-6666-4666-8666-666666666666';

let mockQueries = [];
let mockRules = [];
function mockSql(strings, ...values) {
  const text = strings.join('?').replace(/\s+/g, ' ').trim();
  mockQueries.push({ text, values });
  const rule = mockRules.find(([re]) => re.test(text));
  return Promise.resolve(rule ? rule[1](values) : []);
}
let mockUser = null;

jest.mock('@neondatabase/serverless', () => ({ neon: () => mockSql }));
jest.mock('../_db-init.js', () => ({ ensureDatabaseInitialized: async () => {} }));
jest.mock('../_log.js', () => ({
  log: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
}));
jest.mock('../_auth.js', () => ({
  getAuthedUserId: async () => mockUser?.id ?? null,
  hasBearerSecret: () => false,
}));

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}
const progress = () => require('../progress.js').default;
const call = async (method, action, body = {}) => {
  const res = mockRes();
  await progress()({ method, query: { action }, body }, res);
  return res;
};

beforeEach(() => {
  mockQueries = [];
  mockRules = [];
  mockUser = { id: ME };
});

describe('normalizeSessionCards', () => {
  const { normalizeSessionCards } = require('../_handlers/homework/student.js');
  it('убирает повторы — побеждает последний ответ', () => {
    expect(
      normalizeSessionCards([
        { cardId: CARD_A, firstTry: true },
        { cardId: CARD_B, firstTry: false },
        { cardId: CARD_A, firstTry: false },
      ])
    ).toEqual([
      { card_id: CARD_A, first_try: false },
      { card_id: CARD_B, first_try: false },
    ]);
  });
  it('пусто или кривой id — 400', () => {
    expect(() => normalizeSessionCards([])).toThrow('cards required');
    expect(() => normalizeSessionCards([{ cardId: 'x' }])).toThrow('uuid');
  });
});

describe('session-complete', () => {
  it('без входа — 401 и ни одного запроса', async () => {
    mockUser = null;
    const res = await call('POST', 'session-complete', {
      cards: [{ cardId: CARD_A, firstTry: true }],
    });
    expect(res.statusCode).toBe(401);
    expect(mockQueries).toEqual([]);
  });

  it('GET — 405', async () => {
    const res = await call('GET', 'session-complete');
    expect(res.statusCode).toBe(405);
  });

  it('кривые слова — 400 без записи', async () => {
    const res = await call('POST', 'session-complete', { cards: [{ cardId: 'drop' }] });
    expect(res.statusCode).toBe(400);
    expect(mockQueries).toEqual([]);
  });

  it('слова вне заданий — ничего не засчитано, снимок не считается', async () => {
    const res = await call('POST', 'session-complete', {
      cards: [{ cardId: CARD_A, firstTry: true }],
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ credited: 0, homework: [], submitted: [] });
    expect(mockQueries.some((q) => /INSERT INTO homework_results/.test(q.text))).toBe(false);
  });

  it('засчитано и сдано: снимок только по тронутому заданию и только для меня', async () => {
    mockRules = [
      [/INSERT INTO homework_credits/, () => [{ homework_id: HW }, { homework_id: HW }]],
      [
        /INSERT INTO homework_results/,
        () => [{ user_id: ME, late: false, score: 92, diamonds: 20 }],
      ],
    ];
    const res = await call('POST', 'session-complete', {
      cards: [
        { cardId: CARD_A, firstTry: true },
        { cardId: CARD_B, firstTry: false },
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      credited: 2,
      homework: [HW],
      submitted: [{ homeworkId: HW, late: false, score: 92, diamonds: 20 }],
    });
    const credit = mockQueries.find((q) => /INSERT INTO homework_credits/.test(q.text));
    expect(credit.values).toContain(ME);
    expect(credit.text).toMatch(/NOT EXISTS \(SELECT 1 FROM homework_results/);
    const settle = mockQueries.find((q) => /INSERT INTO homework_results/.test(q.text));
    expect(settle.values).toContainEqual([ME]);
  });
});

describe('my-homework', () => {
  it('оценка считается по засчитанным словам', async () => {
    mockRules = [
      [
        /FROM homework h JOIN courses c/,
        () => [
          {
            id: HW,
            title: 'Ünite 4',
            card_ids: [CARD_A, CARD_B],
            words: 2,
            credited_ids: [CARD_A, CARD_B],
            wrong_ids: [CARD_B],
            group_assigned: 22,
            group_submitted: 7,
          },
        ],
      ],
    ];
    const res = await call('GET', 'my-homework');
    expect(res.statusCode).toBe(200);
    expect(res.body.homework[0]).toMatchObject({
      id: HW,
      score: 50,
      submitted: null,
      group: { assigned: 22, submitted: 7 },
    });
  });
});
