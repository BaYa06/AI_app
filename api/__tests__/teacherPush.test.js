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
const STATUSES = [
  'sent',
  'failed',
  'bell_only',
  'teacher_off',
  'teacher_limit',
  'teacher_quiet',
  'category_off',
  'disabled',
  'no_token',
  'old_app',
  'not_allowlisted',
];
const loggedStatus = () => logged().values.find((v) => STATUSES.includes(v));
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

describe('П1 «Урок через 2 часа» (Teacher 46)', () => {
  const { lessonSoonData, sendLessonSoon } = require('../push/_teacherCron.js');
  const course = { course_id: COURSE, course: 'A1-B', time_label: '10:30' };

  it('данные пуша: готовность и до трёх трудных слов', () => {
    expect(
      lessonSoonData(course, { ready: 7, total: 22, readyLabel: 'Сдали задание' }, [
        'a',
        'b',
        'c',
        'd',
      ])
    ).toEqual({
      courseId: COURSE,
      course: 'A1-B',
      time: '10:30',
      ready: 7,
      total: 22,
      readyLabel: 'Сдали задание',
      hardWords: ['a', 'b', 'c'],
    });
  });

  it('цифр не набралось — пуш не собирается; хватает и одних трудных слов', () => {
    expect(lessonSoonData(course, null, [])).toBeNull();
    expect(lessonSoonData(course, { ready: 0, total: 0 }, [])).toBeNull();
    expect(lessonSoonData(course, null, ['a']).hardWords).toEqual(['a']);
  });

  it('один пуш на урок: ключ — курс, день и время урока; пояс — курса', async () => {
    mockRules = [
      [
        /WITH slots AS/,
        () => [
          {
            course_id: COURSE,
            teacher_id: TEACHER,
            course: 'A1-B',
            tz: 'Asia/Bishkek',
            time_label: '10:30',
            local_day: '2026-11-13',
          },
        ],
      ],
      [/FROM homework h/, () => [{ id: 'h1', assigned: 22, submitted: 7 }]],
      [/FROM answers a/, () => [{ front: 'görüşmek üzere' }]],
      user(),
      token(),
    ];
    const res = await sendLessonSoon(mockSql);
    expect(res).toEqual({ lessons: 1, lessonNotes: 1 });
    const dedupe = mockQueries.find((q) => /payload->>'dedupe'/.test(q.text));
    expect(dedupe.values).toContain(`lesson:${COURSE}:2026-11-13:10:30`);
    const message = mockMulticast.mock.calls[0][0].notification;
    expect(message).toEqual({
      title: 'Урок A1-B в 10:30',
      body: 'Сдали задание 7 из 22 · Трудные слова: görüşmek üzere',
    });
  });

  it('тестовый сервер без белого списка никому не шлёт', () => {
    const { teacherRecipientAllowed } = require('../push/_teacher.js');
    expect(teacherRecipientAllowed(TEACHER, { VERCEL_ENV: 'preview' })).toBe(false);
    expect(teacherRecipientAllowed(TEACHER, { VERCEL_ENV: 'production' })).toBe(true);
  });
});

describe('итоги недели, ученики и задания (Teacher 47)', () => {
  const {
    weekSummaryData,
    homeworkEvent,
    praiseStep,
    sendHomeworkEvents,
    writeBellNotes,
  } = require('../push/_teacherCron.js');
  const HW = '66666666-6666-4666-8666-666666666666';
  const STUDENT = '22222222-2222-4222-8222-222222222222';
  const text = (type, data) => buildPush(type, { userId: TEACHER, data });

  it('итоги недели: данные и текст', () => {
    expect(weekSummaryData({ total: 0 })).toBeNull();
    const data = weekSummaryData({
      total: 22,
      active: 18,
      answers: 1240,
      correct: 1042,
      inactive: 3,
    });
    expect(data).toEqual({ active: 18, total: 22, answers: 1240, correctPct: 84, inactive: 3 });
    const push = text('teacher_week_summary', data);
    expect(push.title).toBe('Итоги недели: занимались 18 из 22');
    expect(push.body).toBe('1240 ответов · 84% верных · 3 не заходят неделю');
    expect(push.link).toBe('flashly://teacher/home?from=push');
  });

  it('«не заходят»: два имени и «ещё N», ссылка — на учеников курса', () => {
    const push = text('teacher_inactive', {
      courseId: COURSE,
      course: 'A1-B',
      count: 5,
      names: ['Бекжан', 'Batyr', 'Fatima'],
    });
    expect(push.title).toBe('A1-B: 5 не заходят 7+ дней');
    expect(push.body).toBe('Бекжан, Batyr и ещё 3');
    expect(push.link).toBe(`flashly://teacher/students/${COURSE}?from=push`);
  });

  it('задание: что сообщить', () => {
    expect(homeworkEvent({ assigned: 22, submitted: 22, due_passed: false })).toBe('done');
    expect(homeworkEvent({ assigned: 22, submitted: 7, due_passed: true })).toBe('due');
    expect(homeworkEvent({ assigned: 22, submitted: 7, due_passed: false })).toBeNull();
    expect(homeworkEvent({ assigned: 0, submitted: 0, due_passed: true })).toBeNull();
    expect(
      text('teacher_homework_due', { submitted: 7, total: 22, title: 'Ünite 4', course: 'A1-B' })
        .title
    ).toBe('Срок задания прошёл: сдали 7 из 22');
  });

  it('«Срок прошёл» уходит один раз на задание и ведёт на экран сдачи', async () => {
    mockRules = [
      [
        /FROM homework h JOIN courses c/,
        () => [
          {
            id: HW,
            title: 'Ünite 4',
            course_id: COURSE,
            course: 'A1-B',
            teacher_id: TEACHER,
            tz: 'Asia/Bishkek',
            due_passed: true,
            assigned: 22,
            submitted: 7,
          },
        ],
      ],
      user(),
      token(),
    ];
    expect(await sendHomeworkEvents(mockSql)).toEqual({ homeworkNotes: 1 });
    const dedupe = mockQueries.find((q) => /payload->>'dedupe'/.test(q.text));
    expect(dedupe.values).toContain(`hw:${HW}:due`);
    expect(mockMulticast.mock.calls[0][0].data.link).toBe(
      `flashly://teacher/homework/${COURSE}/${HW}?from=push`
    );
  });

  it('похвала ученику — только колокольчик, одна запись на ступень серии', async () => {
    expect(praiseStep(11)).toBe(7);
    expect(praiseStep(14)).toBe(14);
    mockRules = [
      [
        /us\.current_streak AS streak/,
        () => [
          {
            course_id: COURSE,
            teacher_id: TEACHER,
            course: 'A1-B',
            student_id: STUDENT,
            student: 'Аяна',
            streak: 11,
          },
        ],
      ],
      user(),
      token(),
    ];
    expect(await writeBellNotes(mockSql)).toEqual({ bellNotes: 1 });
    expect(mockMulticast).not.toHaveBeenCalled();
    expect(loggedStatus()).toBe('bell_only');
    expect(loggedPayload()).toMatchObject({
      title: 'Аяна: 11 дней подряд',
      link: `flashly://teacher/student/${COURSE}/${STUDENT}?from=push`,
      dedupe: `streak:${STUDENT}:7`,
    });
  });
});
