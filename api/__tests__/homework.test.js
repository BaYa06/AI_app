/**
 * Задания учителя (plan/new/teacher_cabinet.md, Teacher 15): права, проверка входа, «Напомнить».
 * SQL здесь не выполняется (подставной `sql`, как в access.test.js) — проверяем код вокруг него:
 * чужой курс → 403 и ни одной записи; кривые данные → 400; слова только из курса; напоминание
 * не уходит тем, кто сдал или кому уже напоминали.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const ME = '11111111-1111-4111-8111-111111111111';
const STUDENT = '22222222-2222-4222-8222-222222222222';
const COURSE = '33333333-3333-4333-8333-333333333333';
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

const writes = () =>
  mockQueries.filter((q) => /^(WITH .*INSERT|INSERT|UPDATE|DELETE)\b/i.test(q.text));
const teacher = () => require('../teacher.js').default;
const call = async (method, action, body = {}, query = {}) => {
  const res = mockRes();
  await teacher()({ method, query: { action, ...query }, body }, res);
  return res;
};
const tomorrow = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString();

beforeEach(() => {
  mockQueries = [];
  mockRules = [];
  mockSent.length = 0;
  mockUser = { id: ME };
});

describe('validateHomeworkInput', () => {
  const { validateHomeworkInput } = require('../_homework.js');
  const ok = { title: 'Ünite 4', cardIds: [CARD_A], dueAt: tomorrow(), minScore: 80 };

  it('правильные данные', () => {
    expect(validateHomeworkInput(ok)).toBeNull();
    expect(validateHomeworkInput({ ...ok, minScore: null })).toBeNull();
  });
  it('пустое название, нет слов, срок в прошлом, кривой порог', () => {
    expect(validateHomeworkInput({ ...ok, title: '  ' })).toBe('title');
    expect(validateHomeworkInput({ ...ok, cardIds: [] })).toBe('cardIds');
    expect(validateHomeworkInput({ ...ok, dueAt: new Date(Date.now() - 1000).toISOString() })).toBe(
      'dueAt'
    );
    expect(validateHomeworkInput({ ...ok, dueAt: 'завтра' })).toBe('dueAt');
    expect(validateHomeworkInput({ ...ok, minScore: 30 })).toBe('minScore');
    expect(validateHomeworkInput({ ...ok, minScore: 85.5 })).toBe('minScore');
  });
});

describe('homework-create', () => {
  const body = () => ({
    courseId: COURSE,
    title: 'Ünite 4',
    cardIds: [CARD_A, CARD_B],
    dueAt: tomorrow(),
    minScore: 80,
  });

  it('без входа — 401 и ни одного запроса', async () => {
    mockUser = null;
    const res = await call('POST', 'homework-create', body());
    expect(res.statusCode).toBe(401);
    expect(mockQueries).toEqual([]);
  });

  it('чужой курс — 403, проверка по текущему пользователю, ничего не записано', async () => {
    const res = await call('POST', 'homework-create', body());
    expect(res.statusCode).toBe(403);
    const check = mockQueries.find((q) =>
      /FROM courses WHERE id = \?::uuid AND user_id/.test(q.text)
    );
    expect(check.values).toEqual([COURSE, ME]);
    expect(writes()).toEqual([]);
  });

  it('слово не из курса — 400, задание не создаётся', async () => {
    mockRules = [
      [/FROM courses WHERE id = \?::uuid AND user_id/, () => [{ id: COURSE }]],
      [/SELECT COUNT\(\*\)::int AS n FROM cards/, () => [{ n: 1 }]],
    ];
    const res = await call('POST', 'homework-create', body());
    expect(res.statusCode).toBe(400);
    expect(res.body.reason).toBe('cardIds');
    expect(writes()).toEqual([]);
  });

  it('кривой срок — 400 до запросов к БД', async () => {
    const res = await call('POST', 'homework-create', { ...body(), dueAt: 'вчера' });
    expect(res.statusCode).toBe(400);
    expect(mockQueries).toEqual([]);
  });

  it('создаётся: задание, «Знаю» засчитаны сразу, снимок без алмазов', async () => {
    mockRules = [
      [/FROM courses WHERE id = \?::uuid AND user_id/, () => [{ id: COURSE }]],
      [/SELECT COUNT\(\*\)::int AS n FROM cards/, () => [{ n: 2 }]],
      [/^INSERT INTO homework \(/, () => [{ id: HW, due_at: tomorrow() }]],
    ];
    const res = await call('POST', 'homework-create', body());
    expect(res.statusCode).toBe(200);
    expect(res.body.homework.id).toBe(HW);
    const texts = writes().map((q) => q.text);
    expect(texts[0]).toMatch(/^INSERT INTO homework \(/);
    expect(texts.some((t) => /INSERT INTO homework_credits/.test(t))).toBe(true);
    const settle = writes().find((q) => /INSERT INTO homework_results/.test(q.text));
    expect(settle.values).toContain(0); // reward = false: алмазы 0
  });
});

describe('homework-remind', () => {
  it('чужое задание — 403, пушей нет', async () => {
    const res = await call('POST', 'homework-remind', { homeworkId: HW, userIds: [STUDENT] });
    expect(res.statusCode).toBe(403);
    expect(mockSent).toEqual([]);
  });

  it('напоминает только отобранным запросом и записывает время', async () => {
    mockRules = [
      [
        /FROM homework h JOIN courses c/,
        () => [
          {
            id: HW,
            title: 'Ünite 4',
            teacher: 'Ильяз агай',
            card_ids: [CARD_A],
            canceled_at: null,
          },
        ],
      ],
      [/AS left_words/, () => [{ user_id: STUDENT, left_words: 26 }]],
    ];
    const res = await call('POST', 'homework-remind', { homeworkId: HW, userIds: [STUDENT, ME] });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ reminded: 1, sent: 1, skipped: 1 });
    expect(mockSent).toEqual([
      {
        userId: STUDENT,
        type: 'homework_reminder',
        data: expect.objectContaining({ count: 26, title: 'Ünite 4' }),
      },
    ]);
    const q = mockQueries.find((x) => /AS left_words/.test(x.text));
    expect(q.text).toMatch(/NOT EXISTS \(SELECT 1 FROM homework_results/);
    expect(q.text).toMatch(/INTERVAL '20 hours'/);
    expect(writes().some((w) => /INSERT INTO homework_reminders/.test(w.text))).toBe(true);
  });

  it('отменённое задание — 409', async () => {
    mockRules = [
      [
        /FROM homework h JOIN courses c/,
        () => [{ id: HW, card_ids: [CARD_A], canceled_at: new Date() }],
      ],
    ];
    const res = await call('POST', 'homework-remind', { homeworkId: HW, userIds: [STUDENT] });
    expect(res.statusCode).toBe(409);
  });
});

describe('homework-status / list / cancel', () => {
  it('статус чужого задания — 403', async () => {
    const res = await call('GET', 'homework-status', {}, { homeworkId: HW });
    expect(res.statusCode).toBe(403);
  });

  it('статусы учеников: сдал / в процессе / не начал', async () => {
    mockRules = [
      [
        /FROM homework h JOIN courses c/,
        () => [
          {
            id: HW,
            course_id: COURSE,
            title: 'Ünite 4',
            card_ids: [CARD_A, CARD_B],
            created_at: new Date(),
            canceled_at: null,
          },
        ],
      ],
      [/SELECT COUNT\(\*\)::int AS n FROM cards/, () => [{ n: 2 }]],
      [
        /WITH words AS/,
        () => [
          {
            id: 'a',
            display_name: 'A',
            credited: 2,
            score: 100,
            submitted_at: new Date(),
            late: false,
            result_score: 100,
          },
          { id: 'b', display_name: 'B', credited: 1, score: 0 },
          { id: 'c', display_name: 'C', credited: 0, score: null },
        ],
      ],
    ];
    const res = await call('GET', 'homework-status', {}, { homeworkId: HW });
    expect(res.statusCode).toBe(200);
    expect(res.body.homework.words).toBe(2);
    expect(res.body.students.map((s) => s.status)).toEqual([
      'submitted',
      'in_progress',
      'not_started',
    ]);
  });

  it('список: «в процессе» не включает сдавших', async () => {
    mockRules = [
      [/FROM courses WHERE id = \?::uuid AND user_id/, () => [{ id: COURSE }]],
      [
        /FROM homework h WHERE h.course_id/,
        () => [{ id: HW, title: 'Ünite 4', words: 48, assigned: 22, submitted: 7, started: 15 }],
      ],
    ];
    const res = await call('GET', 'homework-list', {}, { courseId: COURSE });
    expect(res.body.homework[0]).toMatchObject({ assigned: 22, submitted: 7, started: 8 });
  });

  it('отменить чужое — 403, без UPDATE', async () => {
    const res = await call('POST', 'homework-cancel', { homeworkId: HW });
    expect(res.statusCode).toBe(403);
    expect(writes()).toEqual([]);
  });
});
