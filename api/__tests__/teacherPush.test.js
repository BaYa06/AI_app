/**
 * Пуши учителю (plan/new/teacher_cabinet.md, этап 4). SQL и Firebase подставные: проверяем
 * решение «пуш или только колокольчик», запись журнала с текстом и ссылкой, защиту от повторов.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const TEACHER = '11111111-1111-4111-8111-111111111111';
const COURSE = '33333333-3333-4333-8333-333333333333';

let mockQueries = [];
let mockRules = [];
function mockSql(strings, ...values) {
  const text = strings.join('?').replace(/\s+/g, ' ').trim();
  mockQueries.push({ text, values });
  const rule = mockRules.find(([re]) => re.test(text));
  return Promise.resolve(rule ? rule[1](values) : []);
}
const mockMulticast = jest.fn(async ({ tokens }) => ({
  successCount: tokens.length,
  failureCount: 0,
  responses: tokens.map(() => ({})),
}));

jest.mock('firebase-admin/app', () => ({
  initializeApp: () => {},
  getApps: () => [{}],
  cert: () => ({}),
}));
jest.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({ sendEachForMulticast: (m) => mockMulticast(m) }),
}));
jest.mock('../_log.js', () => ({
  log: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
}));

const {
  notifyTeacher,
  teacherPushDecision,
  TEACHER_PUSH_DAILY_LIMIT,
} = require('../push/_teacher.js');
const { buildPush, TEACHER_PUSH_MIN_APP_VERSION } = require('../push/_registry.js');

const lesson = {
  courseId: COURSE,
  course: 'A1-B',
  time: '10:30',
  ready: 7,
  total: 22,
  hardWords: ['görüşmek üzere', 'tekrar etmek', 'vedalaşmak', 'sinirli'],
};
const user = (over = {}) => [
  /FROM users u LEFT JOIN user_stats/,
  () => [
    {
      display_name: 'Айгуль',
      notif_enabled: true,
      notif_streak: true,
      notif_categories_off: [],
      local_hour: 9,
      sent_today: 0,
      ...over,
    },
  ],
];
const token = (version = TEACHER_PUSH_MIN_APP_VERSION) => [
  /FROM push_tokens/,
  () => [{ token: 't1', permission: 'granted', app_version: version }],
];
const logged = () => mockQueries.find((q) => /^INSERT INTO push_log/.test(q.text));
const loggedStatus = () =>
  logged().values.find(
    (v) =>
      typeof v === 'string' &&
      /^[a-z_]+$/.test(v) &&
      !['teacher_lesson_soon', 'teacher_lesson'].includes(v)
  );
const loggedPayload = () =>
  JSON.parse(logged().values.find((v) => typeof v === 'string' && v.startsWith('{')));

beforeEach(() => {
  mockQueries = [];
  mockRules = [];
  mockMulticast.mockClear();
  process.env.TEACHER_PUSH_ENABLED = 'true';
  delete process.env.PUSH_ALLOWLIST;
});

describe('teacherPushDecision (Teacher 45)', () => {
  const ok = {
    bellOnly: false,
    enabled: true,
    notifEnabled: true,
    categoryOff: false,
    sentToday: 0,
    localHour: 10,
    tokens: 1,
    freshTokens: 1,
  };

  it('всё в порядке — отправить', () => {
    expect(teacherPushDecision(ok)).toBe('send');
  });

  it('причины «только колокольчик» — по порядку важности', () => {
    expect(teacherPushDecision({ ...ok, bellOnly: true })).toBe('bell_only');
    expect(teacherPushDecision({ ...ok, enabled: false })).toBe('teacher_off');
    expect(teacherPushDecision({ ...ok, notifEnabled: false })).toBe('disabled');
    expect(teacherPushDecision({ ...ok, categoryOff: true })).toBe('category_off');
    expect(teacherPushDecision({ ...ok, tokens: 0, freshTokens: 0 })).toBe('no_token');
    expect(teacherPushDecision({ ...ok, freshTokens: 0 })).toBe('old_app');
    expect(teacherPushDecision({ ...ok, sentToday: TEACHER_PUSH_DAILY_LIMIT })).toBe(
      'teacher_limit'
    );
    expect(teacherPushDecision({ ...ok, localHour: 23 })).toBe('teacher_quiet');
    expect(teacherPushDecision({ ...ok, localHour: 7 })).toBe('teacher_quiet');
  });
});

describe('текст П1 (Teacher 46)', () => {
  it('урок, готовность и до трёх трудных слов', () => {
    const push = buildPush('teacher_lesson_soon', { userId: TEACHER, data: lesson });
    expect(push.title).toBe('Урок A1-B в 10:30');
    expect(push.body).toBe(
      'Готовы 7 из 22 · Трудные слова: görüşmek üzere, tekrar etmek, vedalaşmak'
    );
    expect(push.link).toBe(`flashly://teacher/prep/${COURSE}?from=push`);
  });
});

describe('notifyTeacher (Teacher 45)', () => {
  it('отправляет пуш и пишет в журнал текст, ссылку и ключ повтора', async () => {
    mockRules = [user(), token()];
    const res = await notifyTeacher(mockSql, TEACHER, 'teacher_lesson_soon', lesson, {
      dedupe: 'lesson:1',
    });
    expect(res.status).toBe('sent');
    expect(mockMulticast).toHaveBeenCalledTimes(1);
    expect(mockMulticast.mock.calls[0][0].notification.title).toBe('Урок A1-B в 10:30');
    expect(loggedStatus()).toBe('sent');
    expect(loggedPayload()).toMatchObject({
      title: 'Урок A1-B в 10:30',
      link: `flashly://teacher/prep/${COURSE}?from=push`,
      dedupe: 'lesson:1',
      courseId: COURSE,
    });
  });

  it('повтор с тем же ключом — ни пуша, ни записи', async () => {
    mockRules = [[/payload->>'dedupe'/, () => [{}]], user(), token()];
    const res = await notifyTeacher(mockSql, TEACHER, 'teacher_lesson_soon', lesson, {
      dedupe: 'lesson:1',
    });
    expect(res.status).toBe('duplicate');
    expect(mockMulticast).not.toHaveBeenCalled();
    expect(logged()).toBeUndefined();
  });

  it.each([
    ['выключено на сервере', () => (process.env.TEACHER_PUSH_ENABLED = ''), {}, 'teacher_off'],
    ['лимит 2 в день', () => {}, { sent_today: 2 }, 'teacher_limit'],
    ['тихие часы', () => {}, { local_hour: 23 }, 'teacher_quiet'],
    ['категория выключена', () => {}, { notif_categories_off: ['teacher_lesson'] }, 'category_off'],
  ])('%s — пуш не уходит, запись остаётся для колокольчика', async (_n, prepare, over, status) => {
    prepare();
    mockRules = [user(over), token()];
    const res = await notifyTeacher(mockSql, TEACHER, 'teacher_lesson_soon', lesson);
    expect(res.status).toBe(status);
    expect(mockMulticast).not.toHaveBeenCalled();
    expect(loggedStatus()).toBe(status);
    expect(loggedPayload().title).toBe('Урок A1-B в 10:30');
  });

  it('старая версия приложения — только колокольчик', async () => {
    mockRules = [user(), token('1.8.9')];
    expect((await notifyTeacher(mockSql, TEACHER, 'teacher_lesson_soon', lesson)).status).toBe(
      'old_app'
    );
    expect(mockMulticast).not.toHaveBeenCalled();
  });

  it('без цифр текст не собирается — нет ни пуша, ни записи', async () => {
    mockRules = [user(), token()];
    const res = await notifyTeacher(mockSql, TEACHER, 'teacher_lesson_soon', {
      courseId: COURSE,
      course: 'Группа',
    });
    expect(res.status).toBe('no_specifics');
    expect(logged()).toBeUndefined();
  });

  it('ученический тип этим путём не уходит', async () => {
    expect((await notifyTeacher(mockSql, TEACHER, 'teacher_review', { count: 3 })).status).toBe(
      'unknown_type'
    );
    expect(mockQueries).toEqual([]);
  });
});
