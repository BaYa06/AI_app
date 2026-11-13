/**
 * Подготовка к уроку, сервер (plan/new/teacher_cabinet.md, этап 3). SQL не выполняется (подставной
 * `sql`, как в homework.test.js) — проверяем код вокруг: права, границы параметров, форму ответа.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const ME = '11111111-1111-4111-8111-111111111111';
const COURSE = '33333333-3333-4333-8333-333333333333';
const CARD_A = '44444444-4444-4444-8444-444444444444';
const SET = '66666666-6666-4666-8666-666666666666';

let mockQueries = [];
let mockRules = [];
function mockSql(strings, ...values) {
  const text = strings.join('?').replace(/\s+/g, ' ').trim();
  mockQueries.push({ text, values });
  const rule = mockRules.find(([re]) => re.test(text));
  return Promise.resolve(rule ? rule[1](values) : []);
}
let mockUser = null;
const mockSent = [];

jest.mock('@neondatabase/serverless', () => ({ neon: () => mockSql }));
jest.mock('../_db-init.js', () => ({ ensureDatabaseInitialized: async () => {} }));
jest.mock('../_realtime.js', () => ({ notifyCoursesChanged: async () => {} }));
jest.mock('../_log.js', () => ({
  log: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
}));
jest.mock('../_auth.js', () => ({
  getAuthedUser: async () => mockUser,
  getAuthedUserId: async () => mockUser?.id ?? null,
  hasBearerSecret: () => false,
}));
jest.mock('../push.js', () => ({
  sendNotification: async (_sql, userId, type, data) => {
    mockSent.push({ userId, type, data });
    return { ok: true };
  },
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
    end() {
      return this;
    },
  };
}

const teacher = () => require('../teacher.js').default;
const call = async (method, action, body = {}, query = {}) => {
  const res = mockRes();
  await teacher()({ method, query: { action, ...query }, body }, res);
  return res;
};
const ownCourse = [/FROM courses/, () => [{ id: COURSE, teacher: 'Айгуль', recent: false }]];

beforeEach(() => {
  mockQueries = [];
  mockRules = [];
  mockSent.length = 0;
  mockUser = { id: ME };
});

describe('course-hard-cards (Teacher 33)', () => {
  it('без входа — 401, чужой курс — 403 и ответы не читаются', async () => {
    mockUser = null;
    expect((await call('GET', 'course-hard-cards', {}, { courseId: COURSE })).statusCode).toBe(401);
    mockUser = { id: ME };
    const res = await call('GET', 'course-hard-cards', {}, { courseId: COURSE });
    expect(res.statusCode).toBe(403);
    expect(mockQueries.some((q) => /FROM answers/.test(q.text))).toBe(false);
  });

  it('нет courseId — 400', async () => {
    expect((await call('GET', 'course-hard-cards')).statusCode).toBe(400);
  });

  it('по умолчанию 14 дней и 20 слов; границы параметров; правило «≥ 5 ответов, ≥ 3 учеников»', async () => {
    mockRules = [ownCourse];
    await call('GET', 'course-hard-cards', {}, { courseId: COURSE });
    let q = mockQueries.find((x) => /FROM answers/.test(x.text));
    expect(q.values[0]).toBe(14);
    expect(q.values[q.values.length - 1]).toBe(20);
    expect(q.values).toEqual(expect.arrayContaining([5, 3]));
    expect(q.text).toMatch(/rejected_reason IS NULL/);
    expect(q.text).toMatch(/role = 'student'/);

    mockQueries = [];
    await call('GET', 'course-hard-cards', {}, { courseId: COURSE, days: '999', limit: '0' });
    q = mockQueries.find((x) => /FROM answers/.test(x.text));
    expect(q.values[0]).toBe(90);
    expect(q.values[q.values.length - 1]).toBe(1);
  });

  it('форма ответа: доля ошибок, сколько учеников ошибались, набор', async () => {
    mockRules = [
      ownCourse,
      [
        /FROM answers/,
        () => [
          {
            card_id: CARD_A,
            front: 'kahvaltı',
            back: 'завтрак',
            set_id: SET,
            set_title: 'Ünite 4',
            answers: 12,
            wrong: 5,
            wrong_users: 4,
          },
        ],
      ],
    ];
    const res = await call('GET', 'course-hard-cards', {}, { courseId: COURSE });
    expect(res.body).toEqual({
      ok: true,
      days: 14,
      cards: [
        {
          cardId: CARD_A,
          front: 'kahvaltı',
          back: 'завтрак',
          setId: SET,
          setTitle: 'Ünite 4',
          errorRate: 0.42,
          wrongUsers: 4,
          answers: 12,
        },
      ],
    });
  });
});
