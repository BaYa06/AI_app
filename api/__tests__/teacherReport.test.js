/**
 * Отчёты учителя (plan/new/teacher_cabinet.md, Teacher 53–54). SQL подставной: проверяем сборку
 * отчёта из строк, права, срок ссылки и публичную страницу (в ней только данные отчёта, текст
 * экранирован).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const ME = '11111111-1111-4111-8111-111111111111';
const STUDENT = '22222222-2222-4222-8222-222222222222';
const COURSE = '33333333-3333-4333-8333-333333333333';

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
jest.mock('../_realtime.js', () => ({ notifyCoursesChanged: async () => {} }));
jest.mock('../_log.js', () => ({
  log: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
}));
jest.mock('../_auth.js', () => ({
  getAuthedUser: async () => mockUser,
  getAuthedUserId: async () => mockUser?.id ?? null,
  hasBearerSecret: () => false,
}));
jest.mock('../push.js', () => ({ sendNotification: async () => ({ ok: true }) }));

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    send(body) {
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
  await teacher()(
    { method, query: { action, ...query }, body, headers: { host: 'x.vercel.app' } },
    res
  );
  return res;
};

const {
  composeReport,
  rangeLabel,
  reportRange,
  weekBars,
  generateReportCode,
} = require('../_report.js');
const {
  renderReportPage,
  renderReportErrorPage,
  reportFigures,
  unitLabel,
  groupDigits,
} = require('../_report-page.js');

const range = { from: new Date('2026-10-22T06:00:00Z'), to: new Date('2026-11-12T06:00:00Z') };
const parent = (over = {}) =>
  composeReport({
    kind: 'parent',
    period: 'all',
    range,
    tz: 'Asia/Bishkek',
    head: { course: 'A1-E', teacher: 'Ильяз агай', student: 'Aiperi Toktogulova', streak: 11 },
    totals: { answers: 2331, correct: 2005, active_days: 14 },
    weeks: [
      { week: '2026-11-02', answers: 1377 },
      { week: '2026-10-19', answers: 60 },
      { week: '2026-10-26', answers: 751 },
    ],
    units: [
      { title: 'Ünite 5', total: 50, seen: 50, answers: 100, correct: 85 },
      { title: 'Ünite 6', total: 40, seen: 0, answers: 0, correct: 0 },
    ],
    comment: '  Занимается каждый день  ',
    ...over,
  });

beforeEach(() => {
  mockQueries = [];
  mockRules = [];
  mockUser = { id: ME };
});

describe('сборка отчёта (Teacher 53)', () => {
  it('период и подписи недель', () => {
    expect(rangeLabel('2026-10-22', '2026-11-12')).toBe('22 окт – 12 ноя');
    expect(rangeLabel('2026-11-05', '2026-11-11')).toBe('5–11 ноя');
    const now = new Date('2026-11-12T06:00:00Z');
    expect(reportRange('week', null, now).from.toISOString()).toBe('2026-11-05T06:00:00.000Z');
    expect(reportRange('all', '2026-10-30T00:00:00Z', now).from.toISOString()).toBe(
      '2026-10-30T00:00:00.000Z'
    );
    // Нет даты начала — месяц
    expect(reportRange('all', null, now).from.toISOString()).toBe('2026-10-13T06:00:00.000Z');
  });

  it('столбики: по порядку недель, высота от самой большой', () => {
    expect(
      weekBars([
        { week: '2026-11-02', answers: 100 },
        { week: '2026-10-26', answers: 50 },
      ])
    ).toEqual([
      { label: '26 окт – 1 ноя', answers: 50, share: 50 },
      { label: '2–8 ноя', answers: 100, share: 100 },
    ]);
    expect(weekBars([])).toEqual([]);
  });

  it('родителям: цифры ученика, только открытые юниты, комментарий обрезан', () => {
    const r = parent();
    expect(r).toMatchObject({
      kind: 'parent',
      periodLabel: '22 окт – 12 ноя',
      student: 'Aiperi Toktogulova',
      course: 'A1-E',
      teacher: 'Ильяз агай',
      activeDays: 14,
      streak: 11,
      answers: 2331,
      correctPct: 86,
      comment: 'Занимается каждый день',
    });
    expect(r.units).toEqual([{ title: 'Ünite 5', seen: 50, total: 50, correctPct: 85 }]);
    expect(r.weeks.map((w) => w.answers)).toEqual([60, 751, 1377]);
  });

  it('группе: кто занимался, лучшие, кто не заходит', () => {
    const r = composeReport({
      kind: 'group',
      period: 'week',
      range,
      tz: 'Asia/Bishkek',
      head: { course: 'A1-B', teacher: 'Айгуль', students: 22 },
      totals: { answers: 400, correct: 300, active_users: 18 },
      weeks: [],
      best: [{ name: 'Аяна', answers: 120, correct: 110 }],
      inactive: [{ name: 'Бекжан' }],
    });
    expect(r).toMatchObject({
      students: 22,
      activeStudents: 18,
      correctPct: 75,
      best: [{ name: 'Аяна', answers: 120, correctPct: 92 }],
      inactive: ['Бекжан'],
    });
    expect(r.student).toBeUndefined();
  });

  it('код ссылки — 10 символов base62', () => {
    expect(generateReportCode()).toMatch(/^[0-9A-Za-z]{10}$/);
  });
});

describe('страница отчёта (Teacher 53)', () => {
  it('цифры и подписи', () => {
    expect(groupDigits(2331)).toBe('2 331');
    expect(reportFigures(parent()).map((f) => `${f[0]} ${f[1]}`)).toEqual([
      '14 дней занятий',
      '11 дней подряд без пропуска',
      '2 331 ответ на карточки',
      '86% верных ответов',
    ]);
    expect(unitLabel({ title: 'Ünite 5', seen: 50, total: 50 })).toBe('Ünite 5 · все 50 слов');
    expect(unitLabel({ title: 'Ünite 5', seen: 12, total: 50 })).toBe('Ünite 5 · 12 из 50 слов');
  });

  it('в странице — имя, период, цифры и комментарий; текст экранирован; в поиск не попадает', () => {
    const html = renderReportPage(parent({ comment: '<script>alert(1)</script>' }));
    expect(html).toContain('Aiperi Toktogulova');
    expect(html).toContain('22 окт – 12 ноя');
    expect(html).toContain('2 331');
    expect(html).toContain('Ünite 5 · все 50 слов');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('noindex');
    expect(html).toContain('prefers-color-scheme:dark');
  });

  it('просрочено или отозвано — «Ссылка больше не действует»', async () => {
    const { reportPage } = require('../share.js');
    const res = mockRes();
    await reportPage(res, mockSql, 'abcdefghij');
    expect(res.statusCode).toBe(404);
    expect(res.body).toBe(renderReportErrorPage());
    expect(res.body).toContain('Ссылка больше не действует');
    expect(mockQueries[0].text).toMatch(/revoked_at IS NULL AND expires_at > NOW\(\)/);

    mockRules = [[/FROM teacher_reports/, () => [{ data: parent() }]]];
    const ok = mockRes();
    await reportPage(ok, mockSql, 'abcdefghij');
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toContain('Aiperi Toktogulova');
    expect(ok.headers['Cache-Control']).toBe('private, no-store');
  });
});

describe('API отчётов (Teacher 53)', () => {
  const body = {
    courseId: COURSE,
    kind: 'parent',
    studentId: STUDENT,
    period: 'all',
    comment: 'ok',
  };
  const own = [/FROM courses WHERE id/, () => [{ id: COURSE }]];
  const head = [
    /FROM courses c JOIN users tu/,
    () => [
      {
        course: 'A1-E',
        teacher: 'Ильяз',
        tz: 'Asia/Bishkek',
        students: 21,
        course_created: '2026-10-01T00:00:00Z',
      },
    ],
  ];
  const student = [
    /cm\.joined_at, COALESCE\(us\.current_streak/,
    () => [{ name: 'Aiperi', joined_at: '2026-10-22T00:00:00Z', streak: 11 }],
  ];
  const writes = () => mockQueries.filter((q) => /^(INSERT|UPDATE|DELETE)\b/i.test(q.text));

  it('кривые данные — 400 и ни одного запроса', async () => {
    for (const bad of [
      { ...body, courseId: 'x' },
      { ...body, kind: 'center' },
      { ...body, period: 'year' },
      { ...body, studentId: undefined },
      { ...body, comment: 'a'.repeat(601) },
    ]) {
      mockQueries = [];
      expect((await call('POST', 'report-create', bad)).statusCode).toBe(400);
      expect(mockQueries).toEqual([]);
    }
  });

  it('чужой курс — 403; ученика нет в курсе — 404; ничего не пишется', async () => {
    expect((await call('POST', 'report-create', body)).statusCode).toBe(403);
    mockRules = [own, head];
    expect((await call('POST', 'report-create', body)).statusCode).toBe(404);
    expect(writes()).toEqual([]);
  });

  it('ссылка: снимок сохраняется, срок 30 дней, адрес /r/<код>', async () => {
    mockRules = [own, head, student, [/^INSERT INTO teacher_reports/, () => [{ expires_at: 'e' }]]];
    const res = await call('POST', 'report-create', body);
    expect(res.statusCode).toBe(201);
    expect(res.body.url).toBe(`https://x.vercel.app/r/${res.body.code}`);
    const insert = writes()[0];
    expect(insert.values).toContain(30);
    const snapshot = JSON.parse(
      insert.values.find((v) => typeof v === 'string' && v.startsWith('{'))
    );
    expect(snapshot).toMatchObject({
      kind: 'parent',
      student: 'Aiperi',
      course: 'A1-E',
      comment: 'ok',
    });
    // В снимке нет идентификаторов и почты
    expect(JSON.stringify(snapshot)).not.toContain(STUDENT);
  });

  it('превью — GET без записи; отзыв — только своей ссылки', async () => {
    mockRules = [own, head, student];
    const res = await call('GET', 'report-data', {}, body);
    expect(res.statusCode).toBe(200);
    expect(res.body.report.student).toBe('Aiperi');
    expect(writes()).toEqual([]);

    mockQueries = [];
    expect((await call('POST', 'report-revoke', { code: 'bad' })).statusCode).toBe(400);
    expect((await call('POST', 'report-revoke', { code: 'abcdefghij' })).statusCode).toBe(404);
    const upd = writes()[0];
    expect(upd.text).toMatch(/created_by = \?::uuid/);
    expect(upd.values).toEqual(['abcdefghij', ME]);
  });
});
