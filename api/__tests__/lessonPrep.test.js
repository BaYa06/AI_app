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

describe('живой тест по списку слов (Teacher 34)', () => {
  const { createTest, parseTestCardIds, mainSetId } = require('../_handlers/test/teacher.js');
  const CARD_B = '55555555-5555-4555-8555-555555555555';
  const SET_B = '88888888-8888-4888-8888-888888888888';
  const create = async (body) => {
    const res = mockRes();
    await createTest({ method: 'POST', body }, res, mockSql, ME);
    return res;
  };
  const insert = () => mockQueries.find((q) => /^INSERT INTO test_sessions/.test(q.text));
  const ownedCards = [
    /FROM cards WHERE id = ANY/,
    () => [
      { id: CARD_A, set_id: SET },
      { id: CARD_B, set_id: SET },
    ],
  ];
  const inserted = [/^INSERT INTO test_sessions/, () => [{ id: 's1' }]];

  it('parseTestCardIds: нет списка — null, кривой — invalid, повторы убираются', () => {
    expect(parseTestCardIds(undefined)).toBeNull();
    expect(parseTestCardIds([])).toBeNull();
    expect(parseTestCardIds('x')).toBe('invalid');
    expect(parseTestCardIds(['not-a-uuid'])).toBe('invalid');
    expect(parseTestCardIds([CARD_A, CARD_A])).toEqual([CARD_A]);
  });

  it('mainSetId: набор, в котором больше всего слов', () => {
    expect(mainSetId([{ set_id: SET }, { set_id: SET_B }, { set_id: SET_B }])).toBe(SET_B);
    expect(mainSetId([])).toBeNull();
  });

  it('старый клиент: тест по набору — card_ids и purpose NULL', async () => {
    mockRules = [ownCourse, inserted];
    const res = await create({ setId: SET, courseId: COURSE, questionCount: 10 });
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ sessionId: 's1', exitControl: false });
    expect(insert().values.slice(-2)).toEqual([null, null]);
    expect(insert().values[1]).toBe(SET);
  });

  it('без setId и без cardIds — 400', async () => {
    expect((await create({ courseId: COURSE, questionCount: 5 })).statusCode).toBe(400);
  });

  it('чужой курс — 403, тест не создаётся', async () => {
    const res = await create({ courseId: COURSE, cardIds: [CARD_A] });
    expect(res.statusCode).toBe(403);
    expect(insert()).toBeUndefined();
  });

  it('слово не из курса — 400, тест не создаётся', async () => {
    mockRules = [ownCourse, [/FROM cards WHERE id = ANY/, () => [{ id: CARD_A, set_id: SET }]]];
    const res = await create({ courseId: COURSE, cardIds: [CARD_A, CARD_B] });
    expect(res.statusCode).toBe(400);
    expect(insert()).toBeUndefined();
  });

  it('разминка: слова, набор и число вопросов — из списка, purpose = warmup', async () => {
    mockRules = [ownCourse, ownedCards, inserted];
    const res = await create({ courseId: COURSE, cardIds: [CARD_A, CARD_B], purpose: 'warmup' });
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ questionCount: 2, purpose: 'warmup' });
    const v = insert().values;
    expect(v[1]).toBe(SET);
    expect(v.slice(-2)).toEqual([[CARD_A, CARD_B], 'warmup']);
  });

  it('неизвестный purpose не пишется; questionCount не больше списка', async () => {
    mockRules = [ownCourse, ownedCards, inserted];
    const res = await create({
      courseId: COURSE,
      cardIds: [CARD_A, CARD_B],
      purpose: 'exam',
      questionCount: 50,
    });
    expect(res.body).toMatchObject({ questionCount: 2, purpose: null });
  });
});

describe('итоги по словам (Teacher 35)', () => {
  const { getResults, monitorTest } = require('../_handlers/test/teacher.js');
  const { cardStat } = require('../_handlers/test/_shared.js');
  const SESSION = '99999999-9999-4999-8999-999999999999';
  const STUDENT = '22222222-2222-4222-8222-222222222222';
  const session = (extra = {}) => [
    /FROM test_sessions/,
    () => [{ teacher_id: ME, course_id: COURSE, question_count: 2, status: 'active', ...extra }],
  ];
  const stats = [
    /LEFT JOIN test_answers/,
    () => [{ card_id: CARD_A, front: 'kahvaltı', back: 'завтрак', answers: 4, correct: 3 }],
  ];
  const run = async (fn, me = ME) => {
    const res = mockRes();
    await fn({ method: 'GET', query: { sessionId: SESSION } }, res, mockSql, me);
    return res;
  };

  it('cardStat: доля верных; без ответов — null', () => {
    expect(cardStat({ card_id: CARD_A, front: 'a', back: 'b', answers: 4, correct: 3 })).toEqual({
      cardId: CARD_A,
      word: 'a',
      hint: 'b',
      answers: 4,
      correct: 3,
      correctRate: 75,
    });
    expect(cardStat({ answers: 0, correct: 0 }).correctRate).toBeNull();
  });

  it('results: byCard и absent добавлены, старые поля на месте', async () => {
    mockRules = [
      session({ purpose: 'warmup', set_title: 'Ünite 4' }),
      stats,
      [/FROM course_members cm/, () => [{ user_id: STUDENT, name: 'Бекжан' }]],
    ];
    const res = await run(getResults);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      setTitle: 'Ünite 4',
      totalQuestions: 2,
      avgScore: 0,
      participants: [],
      hardestCards: [],
      purpose: 'warmup',
      courseId: COURSE,
      absent: [{ userId: STUDENT, name: 'Бекжан' }],
    });
    expect(res.body.byCard[0]).toMatchObject({ cardId: CARD_A, correctRate: 75 });
  });

  it('monitor: слова — только учителю и только у теста по списку', async () => {
    mockRules = [session({ card_ids: [CARD_A], purpose: 'warmup' }), stats];
    const res = await run(monitorTest);
    expect(res.body.purpose).toBe('warmup');
    expect(res.body.byCard).toHaveLength(1);

    mockQueries = [];
    mockRules = [session(), stats];
    const plain = await run(monitorTest);
    expect(plain.body.byCard).toBeUndefined();
    expect(mockQueries.some((q) => /LEFT JOIN test_answers/.test(q.text))).toBe(false);

    mockQueries = [];
    mockRules = [
      [/FROM test_sessions/, () => [{ teacher_id: ME, card_ids: [CARD_A], status: 'active' }]],
      [/FROM test_participants WHERE session_id/, () => [{ id: 'p1' }]],
      stats,
    ];
    const student = await run(monitorTest, STUDENT);
    expect(student.statusCode).toBe(200);
    expect(student.body.byCard).toBeUndefined();
    expect(student.body.purpose).toBeUndefined();
  });
});
