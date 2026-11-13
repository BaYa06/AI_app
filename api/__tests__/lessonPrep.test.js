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

describe('remind-review выбранным (Teacher 36)', () => {
  const STUDENT = '22222222-2222-4222-8222-222222222222';
  const STUDENT_B = '77777777-7777-4777-8777-777777777777';
  const writes = () => mockQueries.filter((q) => /^(INSERT|UPDATE|DELETE)\b/i.test(q.text));

  it('кривой studentIds — 400; чужой курс — 403 и ни одного пуша', async () => {
    expect(
      (await call('POST', 'remind-review', { courseId: COURSE, studentIds: ['x'] })).statusCode
    ).toBe(400);
    expect(
      (await call('POST', 'remind-review', { courseId: COURSE, studentIds: [] })).statusCode
    ).toBe(400);
    const res = await call('POST', 'remind-review', { courseId: COURSE, studentIds: [STUDENT] });
    expect(res.statusCode).toBe(403);
    expect(mockSent).toEqual([]);
  });

  it('напоминает тем, кого вернул запрос, и записывает лимит на каждого; лимит курса не трогает', async () => {
    mockRules = [
      [/FROM courses/, () => [{ id: COURSE, teacher: 'Айгуль', recent: true }]],
      [/FROM course_members cm/, () => [{ user_id: STUDENT, waiting: 0 }]],
    ];
    const res = await call('POST', 'remind-review', {
      courseId: COURSE,
      studentIds: [STUDENT, STUDENT_B, STUDENT],
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, students: 1, sent: 1, skipped: 1 });
    expect(mockSent).toEqual([
      { userId: STUDENT, type: 'teacher_review', data: { teacher: 'Айгуль', count: 0 } },
    ]);
    const w = writes();
    expect(w).toHaveLength(1);
    expect(w[0].text).toMatch(/^INSERT INTO review_reminders/);
    const q = mockQueries.find((x) => /FROM course_members cm/.test(x.text));
    expect(q.text).toMatch(/review_reminders rr/);
  });

  it('без studentIds — как раньше: лимит курса 429', async () => {
    mockRules = [[/FROM courses/, () => [{ id: COURSE, teacher: 'Айгуль', recent: true }]]];
    const res = await call('POST', 'remind-review', { courseId: COURSE });
    expect(res.statusCode).toBe(429);
  });

  it('текст пуша без слов на повторении — без «0 слов»', () => {
    const { PUSH_TYPES } = require('../push/_registry.js');
    const text = PUSH_TYPES.teacher_review.variants[0]({
      data: { teacher: 'Айгуль', count: 0 },
      secPerAnswer: 6,
    });
    expect(text.body).toBe('Открой курс и позанимайся перед уроком');
  });
});

describe('course-set-students (Teacher 37)', () => {
  const { setStudentStatus } = require('../_handlers/teacher/stats.js');

  it('статус ученика по набору', () => {
    expect(setStudentStatus({ seen: 48, total: 48 })).toBe('completed');
    expect(setStudentStatus({ seen: 3, total: 48 })).toBe('started');
    expect(setStudentStatus({ seen: 0, total: 48 })).toBe('not_opened');
    expect(setStudentStatus({ seen: 0, total: 0 })).toBe('not_opened');
  });

  it('чужой курс — 403; набор не из курса — 404', async () => {
    const q = { courseId: COURSE, setId: SET };
    expect((await call('GET', 'course-set-students', {}, q)).statusCode).toBe(403);
    mockRules = [ownCourse];
    expect((await call('GET', 'course-set-students', {}, q)).statusCode).toBe(404);
  });

  it('список учеников со статусами', async () => {
    mockRules = [
      ownCourse,
      [/^SELECT 1 WHERE/, () => [{}]],
      [/FROM course_members cm/, () => [{ id: 'u1', name: 'Бекжан', seen: 0, total: 5 }]],
    ];
    const res = await call('GET', 'course-set-students', {}, { courseId: COURSE, setId: SET });
    expect(res.body).toEqual({
      ok: true,
      students: [{ id: 'u1', name: 'Бекжан', status: 'not_opened' }],
    });
  });
});

describe('student-stats: данные экрана ученика (Teacher 51)', () => {
  const { setAccuracy, studentHomeworkStatus } = require('../_handlers/teacher/roster.js');
  const STUDENT = '22222222-2222-4222-8222-222222222222';
  const query = { courseId: COURSE, studentId: STUDENT };
  const member = [/^SELECT 1 FROM course_members/, () => [{}]];

  it('% верных ученика и группы; без ответов — null', () => {
    expect(setAccuracy({ answers: 10, correct: 7, group_answers: 100, group_correct: 87 })).toEqual(
      {
        answers: 10,
        correctPct: 70,
        groupCorrectPct: 87,
      }
    );
    expect(setAccuracy({ answers: 0, correct: 0, group_answers: 0, group_correct: 0 })).toEqual({
      answers: 0,
      correctPct: null,
      groupCorrectPct: null,
    });
  });

  it('статус задания у ученика', () => {
    expect(studentHomeworkStatus({ submitted_at: 'x', credited: 5 })).toBe('submitted');
    expect(studentHomeworkStatus({ submitted_at: null, credited: 2 })).toBe('in_progress');
    expect(studentHomeworkStatus({ submitted_at: null, credited: 0 })).toBe('not_started');
  });

  it('чужой курс — 403; ученик не из курса — 404', async () => {
    expect((await call('GET', 'student-stats', {}, query)).statusCode).toBe(403);
    mockRules = [ownCourse];
    expect((await call('GET', 'student-stats', {}, query)).statusCode).toBe(404);
  });

  it('старые поля на месте, новые добавлены', async () => {
    mockRules = [
      ownCourse,
      member,
      [
        /WITH course_sets AS/,
        () => [
          { set_id: SET, title: 'Ünite 4', total_cards: 48, cards_seen: 48, cards_learned: 20 },
        ],
      ],
      [/AS current_streak/, () => [{ current_streak: 3, last_active_date: '2026-11-05' }]],
      [
        /AS total_answers/,
        () => [
          {
            name: 'Кубат',
            joined_at: '2026-10-30T00:00:00Z',
            tz: 'Asia/Bishkek',
            total_answers: 601,
          },
        ],
      ],
      [/GROUP BY 1 ORDER BY 1/, () => [{ date: '2026-11-05', answers: 80 }]],
      [
        /GROUP BY c\.set_id/,
        () => [{ set_id: SET, answers: 100, correct: 70, group_answers: 1000, group_correct: 870 }],
      ],
      [/FROM test_participants tp/, () => []],
      [
        /FROM homework h/,
        () => [
          {
            id: 'h1',
            title: 'Ünite 4',
            min_score: 80,
            due_at: 'd',
            kind: 'learn',
            submitted_at: null,
            credited: 48,
            score: 70,
          },
        ],
      ],
    ];
    const res = await call('GET', 'student-stats', {}, query);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      seenCards: 48,
      learnedCards: 20,
      unlearnedCards: 0,
      streak: 3,
      lastActiveDate: '2026-11-05',
      name: 'Кубат',
      totalAnswers: 601,
      days: [{ date: '2026-11-05', answers: 80 }],
      tests: [],
      homework: { id: 'h1', status: 'in_progress', score: 70, minScore: 80 },
    });
    expect(res.body.sets[0]).toMatchObject({
      setId: SET,
      totalCards: 48,
      seenCards: 48,
      learnedCards: 20,
      correctPct: 70,
      groupCorrectPct: 87,
    });
  });

  it('сбой новых запросов не ломает старый ответ', async () => {
    mockRules = [
      ownCourse,
      member,
      [/WITH course_sets AS/, () => []],
      [/AS current_streak/, () => [{ current_streak: 0, last_active_date: null }]],
      [
        /AS total_answers/,
        () => {
          throw new Error('boom');
        },
      ],
    ];
    const res = await call('GET', 'student-stats', {}, query);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      seenCards: 0,
      learnedCards: 0,
      unlearnedCards: 0,
      sets: [],
      streak: 0,
      lastActiveDate: null,
    });
  });
});
