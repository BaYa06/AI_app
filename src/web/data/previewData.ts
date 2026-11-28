/**
 * Вымышленные данные для предпросмотра кабинета без сервера (только dev, `?preview=teacher`).
 * Имена и цифры придуманы; худший случай для вёрстки — 40 учеников, длинные фамилии.
 */
import type { Member } from '../teacherLogic';

const pad = (n: number) => String(n).padStart(2, '0');
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const FIRST = [
  'Айгерим',
  'Тимур',
  'Алия',
  'Данияр',
  'Милана',
  'Руслан',
  'Самира',
  'Арман',
  'Дана',
  'Ержан',
];
const LAST = [
  'Нурмухамбетова',
  'Сулейменов',
  'Ибрагимова',
  'Жумабаев',
  'Ким',
  'Петрова',
  'Касымов',
  'Абдрахманова-Калиева',
];

function makeMembers(count: number, seed: number): Member[] {
  return Array.from({ length: count }, (_, i) => {
    const ago = [0, 0, 1, 0, 2, 4, 0, 9, 1, 3, 0, 15, 0, 1][(i + seed) % 14];
    return {
      id: `s${seed}-${i}`,
      displayName: `${FIRST[(i + seed) % FIRST.length]} ${LAST[(i * 3 + seed) % LAST.length]}`,
      email: null,
      streak: ago === 0 ? 3 + ((i * 7) % 40) : 0,
      lastActiveDate: i === 11 && seed === 0 ? null : daysAgo(ago),
      todayCards: ago === 0 ? 8 + ((i * 11) % 60) : 0,
      joinedAt: Date.now() - (20 + i) * 86_400_000,
      waitingReviews: ago >= 2 ? 6 + ((i * 5) % 30) : (i * 3) % 9,
    };
  });
}

const COURSES = [
  { id: 'c1', title: 'A2 · вечерняя группа', createdAt: Date.now() - 90 * 86_400_000, size: 40 },
  {
    id: 'c2',
    title: 'B1 Intermediate, понедельник и среда',
    createdAt: Date.now() - 60 * 86_400_000,
    size: 12,
  },
  { id: 'c3', title: 'Новая группа', createdAt: Date.now() - 2 * 86_400_000, size: 0 },
];

const wait = <T>(value: T): Promise<T> => new Promise((r) => setTimeout(() => r(value), 250));

export const PreviewData = {
  courses: () => wait(COURSES.map(({ id, title, createdAt }) => ({ id, title, createdAt }))),
  members: (courseId: string) => {
    const course = COURSES.find((c) => c.id === courseId);
    return wait(course ? makeMembers(course.size, COURSES.indexOf(course)) : []);
  },
  schedule: (courseId: string) =>
    wait(
      courseId === 'c1'
        ? [
            { day: 'mon', time: '18:00' },
            { day: 'wed', time: '18:00' },
            { day: 'fri', time: '18:00' },
          ]
        : courseId === 'c2'
          ? [
              { day: 'mon', time: '10:30' },
              { day: 'wed', time: '10:30' },
            ]
          : []
    ),
  activity: () =>
    wait([14, 22, 19, 25, 9, 3, 11].map((count, i) => ({ date: daysAgo(6 - i), count }))),
  hardCards: () =>
    wait(
      ['reluctant', 'although', 'achievement', 'suggest', 'appointment'].map((front, i) => ({
        cardId: `h${i}`,
        front,
        back: ['неохотный', 'хотя', 'достижение', 'предлагать', 'встреча'][i],
        setId: 's1',
        setTitle: 'Unit 4',
        errorRate: 0.62 - i * 0.07,
        wrongUsers: 14 - i * 2,
        answers: 40 - i * 3,
      }))
    ),
  studentStats: (studentId: string) =>
    wait({
      name: 'Айгерим Нурмухамбетова',
      joinedAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
      seenCards: 62,
      learnedCards: 41,
      unlearnedCards: 21,
      streak: 12,
      lastActiveDate: daysAgo(0),
      totalAnswers: 412,
      sets: [
        {
          setId: 'a',
          title: 'Unit 3',
          totalCards: 24,
          learnedCards: 24,
          seenCards: 24,
          correctPct: 91,
          groupCorrectPct: 84,
        },
        {
          setId: 'b',
          title: 'Unit 4',
          totalCards: 38,
          learnedCards: 17,
          seenCards: 38,
          correctPct: 68,
          groupCorrectPct: 74,
        },
      ],
      days: [0, 1, 2, 4, 5, 6, 8, 9, 11, 12, 15, 16, 17, 20].map((n) => ({
        date: daysAgo(n),
        answers: 4 + ((n * 13 + studentId.length) % 90),
      })),
      tests: [
        {
          sessionId: 't1',
          title: 'Unit 3 · проверка',
          finishedAt: new Date(Date.now() - 6 * 86_400_000).toISOString(),
          purpose: null,
          score: 88,
          correct: 21,
          total: 24,
        },
      ],
      homework: null,
    }),
  activeTests: () =>
    wait([
      {
        sessionId: 'x1',
        courseId: 'c1',
        courseTitle: COURSES[0].title,
        setTitle: 'Unit 4',
        status: 'active' as const,
        code: '4821',
        testMode: 'mixed',
        purpose: null,
        engine: 2,
        questionCount: 20,
        timePerQuestion: 20,
        participantCount: 31,
      },
      {
        sessionId: 'quick2',
        courseId: 'c2',
        courseTitle: COURSES[1].title,
        setTitle: 'Unit 1',
        status: 'active' as const,
        code: '7305',
        testMode: 'multiple',
        purpose: null,
        engine: 1,
        questionCount: 12,
        timePerQuestion: 20,
        participantCount: 14,
      },
    ]),
  createCourse: (title: string) =>
    wait({ id: `c${Date.now()}`, title: title.trim(), createdAt: Date.now() }),
  invite: () => wait({ token: 'a'.repeat(64), joinCode: 'K7M2QX' }),
};

// ─── Экзамены (Web 12–17) ───────────────────────────────────────────────

import type { DraftItem, ExamDraft, ExamListItem } from '@/services/exam';

const WORDS: [string, string][] = [
  ['reluctant', 'неохотный'],
  ['although', 'хотя'],
  ['achievement', 'достижение'],
  ['suggest', 'предлагать'],
  ['appointment', 'встреча'],
  ['neighbour', 'сосед'],
  ['improve', 'улучшать'],
  ['protect', 'защищать'],
  ['confident', 'уверенный'],
  ['journey', 'путешествие'],
  ['borrow', 'занимать'],
  ['delicious', 'вкусный'],
];

function previewItems(): DraftItem[] {
  const formats: DraftItem['format'][] = [
    'choice',
    'choice',
    'choice',
    'choice',
    'write',
    'write',
    'gap',
    'gap',
    'scramble',
    'match',
    'match',
    'match',
  ];
  return WORDS.map(([front, back], i) => {
    const format = formats[i];
    const base = {
      itemId: `it${i}`,
      cardId: `cd${i}`,
      blockNo: format === 'match' ? 9 : i + 1,
      format,
      difficulty: (['easy', 'mid', 'hard'] as const)[i % 3],
      points: 100 / WORDS.length,
      extra: {} as Record<string, unknown>,
    };
    if (format === 'choice')
      return {
        ...base,
        direction: 'forward',
        prompt: front,
        answer: back,
        options: [back, 'щедрый', 'быстрый', 'тихий'],
      };
    if (format === 'gap')
      return {
        ...base,
        direction: 'gap',
        prompt: `She was _____ to leave the party early.`,
        answer: front,
        options: [front, 'eager', 'happy', 'ready'],
        extra: { baseForm: front, gapKind: 'exact' },
      };
    if (format === 'write')
      return { ...base, direction: 'back', prompt: back, answer: front, options: null };
    if (format === 'scramble')
      return { ...base, direction: 'back', prompt: back, answer: front, options: null };
    return { ...base, direction: 'pair', prompt: front, answer: back, options: null };
  });
}

let previewDraft: ExamDraft | null = null;
function ensureDraft(): ExamDraft {
  if (!previewDraft) {
    previewDraft = {
      sessionId: 'draft1',
      status: 'draft',
      durationSec: 7 * 60,
      config: { setIds: ['s1'], backKind: 'translation' },
      items: previewItems(),
      recommended: { baseSec: 280, sec: 336, minutes: 6 },
    };
  }
  return previewDraft;
}

const BUILD = {
  steps: [
    { key: 'pool', title: 'Берём слова набора', detail: 'В «Unit 4» 38 слов, из них подходят 36' },
    {
      key: 'levels',
      title: 'Считаем сложность по классу',
      detail: '14 учеников, 420 ответов: 12 лёгких, 14 средних, 10 сложных',
    },
    { key: 'pick', title: 'Подбираем 12 слов', detail: '4 лёгких, 4 средних, 4 сложных' },
    {
      key: 'formats',
      title: 'Раскладываем по форматам',
      detail: '4 выбор · 2 письмо · 2 вставь · 1 собери · 3 пары',
    },
    {
      key: 'options',
      title: 'Подбираем неверные варианты',
      detail: 'Для 6 вопросов по 3 варианта',
    },
  ],
  warnings: [
    { code: 'few_gaps', text: 'У 4 слов нет примеров — «вставь слово» взяли только для 2.' },
  ],
};

export const PreviewExam = {
  list: (): Promise<ExamListItem[]> =>
    wait([
      {
        sessionId: 'draft1',
        courseId: 'c1',
        courseTitle: COURSES[0].title,
        setTitle: 'Unit 4',
        status: 'draft',
        code: null,
        questionCount: 12,
        durationSec: 420,
        createdAt: new Date().toISOString(),
        finishedAt: null,
        participantCount: 0,
        avgScore: 0,
      },
      {
        sessionId: 'x1',
        courseId: 'c1',
        courseTitle: COURSES[0].title,
        setTitle: 'Unit 4',
        status: 'active',
        code: '4821',
        questionCount: 20,
        durationSec: 600,
        createdAt: new Date().toISOString(),
        finishedAt: null,
        participantCount: 31,
        avgScore: 0,
      },
      {
        sessionId: 'fin1',
        courseId: 'c1',
        courseTitle: COURSES[0].title,
        setTitle: 'Unit 3',
        status: 'finished',
        code: '1190',
        questionCount: 20,
        durationSec: 600,
        createdAt: new Date(Date.now() - 9 * 86_400_000).toISOString(),
        finishedAt: new Date(Date.now() - 9 * 86_400_000).toISOString(),
        participantCount: 38,
        avgScore: 74,
      },
      {
        sessionId: 'f2',
        courseId: 'c2',
        courseTitle: COURSES[1].title,
        setTitle: 'Unit 1',
        status: 'finished',
        code: '2210',
        questionCount: 15,
        durationSec: 480,
        createdAt: new Date(Date.now() - 20 * 86_400_000).toISOString(),
        finishedAt: new Date(Date.now() - 20 * 86_400_000).toISOString(),
        participantCount: 11,
        avgScore: 58,
      },
    ]),
  setStats: () =>
    wait([
      { setId: 's1', title: 'Unit 4', totalCards: 38 },
      { setId: 's2', title: 'Unit 3', totalCards: 24 },
      { setId: 's3', title: 'Irregular verbs', totalCards: 60 },
    ]),
  build: () => {
    previewDraft = null;
    const d = ensureDraft();
    // Как на сервере с aiGap: «вставь слово» — заготовки, предложения допишет ИИ
    d.items = d.items.map((i) =>
      i.format === 'gap'
        ? { ...i, prompt: '', options: null, extra: { ai: 'pending', baseForm: i.answer } }
        : i
    );
    return wait({
      ...d,
      ...BUILD,
      counts: { choice: 4, write: 2, scramble: 1, match: 3, gap: 2 },
      aiPending: 2,
    });
  },
  draft: (sessionId?: string) => {
    const d = ensureDraft();
    if (sessionId === 'wait1') return wait({ ...d, sessionId, status: 'waiting', code: '4821' });
    if (sessionId === 'act1') return wait({ ...d, sessionId, status: 'active', code: '4821' });
    if (sessionId === 'fin1') return wait({ ...d, sessionId, status: 'finished', code: '4821' });
    return wait(d);
  },
  replace: (itemId: string) => {
    const d = ensureDraft();
    d.items = d.items.map((i) =>
      i.itemId === itemId ? { ...i, prompt: i.format === 'choice' ? 'journey' : i.prompt } : i
    );
    return wait({ ...d, replacedItemId: itemId, sameLevel: true });
  },
  editItem: (
    itemId: string,
    patch: { distractors?: string[]; sentence?: string; source?: 'ai'; doubtful?: boolean }
  ) => {
    const d = ensureDraft();
    d.items = d.items.map((i) =>
      i.itemId !== itemId
        ? i
        : {
            ...i,
            prompt: patch.sentence ?? i.prompt,
            options: patch.distractors ? [i.answer, ...patch.distractors] : i.options,
            extra: {
              ...i.extra,
              edit: {
                edited: true,
                source: patch.source === 'ai' ? 'ai' : 'teacher',
                doubtful: patch.doubtful === true,
              },
            },
          }
    );
    return wait({ ...d, editedItemId: itemId });
  },
  create: () => {
    if (previewDraft) previewDraft.status = 'waiting';
    return wait({ sessionId: 'draft1', code: '4821', questionCount: 12, durationSec: 420 });
  },
  /** ИИ дописывает «вставь слово»: 2,5 с, потом заготовки становятся вопросами */
  gapAi: (fallback: boolean) =>
    new Promise((resolve) =>
      setTimeout(() => {
        const d = ensureDraft();
        let written = 0;
        let fb = 0;
        d.items = d.items.map((i) => {
          if (i.extra?.ai !== 'pending') return i;
          if (fallback || i.answer === 'protect') {
            fb++;
            return {
              ...i,
              format: 'write' as const,
              direction: 'back',
              prompt: 'защищать',
              options: null,
              extra: { ai: 'fallback' },
            };
          }
          written++;
          return {
            ...i,
            prompt: 'The new rules will _____ the lives of many people in our city.',
            answer: 'improve',
            options: ['improve', 'borrow', 'whisper', 'paint'],
            extra: { ai: 'done', baseForm: 'improve' },
          };
        });
        resolve({ written, fallback: fb, pending: 0 });
      }, 2500)
    ),
};

// ─── Лобби и монитор (Web 18–22) ────────────────────────────────────────

const liveStatus: Record<string, 'waiting' | 'active' | 'finished'> = {
  wait1: 'waiting',
  act1: 'active',
  quick1: 'waiting',
  quick2: 'active',
  quick3: 'finished',
};
const livePaused: Record<string, boolean> = {};
const liveStart: Record<string, number> = {
  act1: Date.now() - 4 * 60_000,
  quick2: Date.now() - 2 * 60_000,
};
const liveLeft = new Set<string>(['s1-5']);

const STUDENTS = makeMembers(14, 0).map((m, i) => ({ userId: m.id, name: m.displayName, i }));

export const PreviewLive = {
  monitor: (sessionId: string) => {
    const status = liveStatus[sessionId] ?? 'waiting';
    const t = Math.floor((Date.now() - (liveStart[sessionId] ?? Date.now())) / 1000);
    const joined =
      status === 'waiting'
        ? Math.min(STUDENTS.length, 6 + Math.floor((Date.now() / 4000) % 6))
        : STUDENTS.length;
    const participants = STUDENTS.slice(0, joined).map((s) => {
      const answered =
        status === 'waiting' ? 0 : Math.min(12, Math.floor(t / (14 + (s.i % 6) * 6)));
      const left = liveLeft.has(s.userId) && status !== 'waiting';
      return {
        userId: s.userId,
        name: s.name,
        answered,
        total: 12,
        done: answered >= 12,
        leftReason: left ? 'background' : null,
        awayCount: s.i === 2 ? 3 : 0,
        away: s.i === 8 && status === 'active',
      };
    });
    return wait({
      status,
      startedAt:
        status === 'waiting' ? null : new Date(liveStart[sessionId] ?? Date.now()).toISOString(),
      questionCount: 12,
      exitControl: true,
      engine: sessionId.startsWith('quick') ? 1 : 2,
      durationSec: sessionId.startsWith('quick') ? undefined : 420,
      timePerQuestion: sessionId.startsWith('quick') ? 20 : undefined,
      paused: livePaused[sessionId] === true,
      pausedAt: livePaused[sessionId] ? new Date().toISOString() : null,
      pausedTotalSec: 0,
      serverNow: new Date().toISOString(),
      participants,
    });
  },
  create: () => wait({ sessionId: 'quick1', code: '7305', questionCount: 12 }),
  history: () =>
    wait([
      {
        sessionId: 'quick3',
        setTitle: 'Unit 3',
        finishedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        participantCount: 9,
        avgScore: 72,
        questionCount: 15,
        testMode: 'multiple',
        purpose: null,
      },
      {
        sessionId: 'fin1',
        setTitle: 'Unit 4',
        finishedAt: new Date(Date.now() - 86_400_000).toISOString(),
        participantCount: 10,
        avgScore: 67,
        questionCount: 12,
        testMode: 'exam',
        purpose: null,
      },
    ]),
  quickResults: () =>
    wait({
      setTitle: 'Unit 3',
      date: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      totalQuestions: 15,
      avgScore: 72,
      participants: [
        {
          userId: 'u1',
          name: 'Айгерим Нурмухамбетова',
          score: 100,
          correct: 15,
          total: 15,
          finished: true,
          leftReason: null,
          awayCount: 0,
        },
        {
          userId: 'u2',
          name: 'Тимур Жумабаев',
          score: 87,
          correct: 13,
          total: 15,
          finished: true,
          leftReason: null,
          awayCount: 1,
        },
        {
          userId: 'u3',
          name: 'Алия Касымов',
          score: 87,
          correct: 13,
          total: 15,
          finished: true,
          leftReason: null,
          awayCount: 0,
        },
        {
          userId: 'u4',
          name: 'Данияр Сулейменов',
          score: 60,
          correct: 9,
          total: 15,
          finished: true,
          leftReason: null,
          awayCount: 0,
        },
        {
          userId: 'u5',
          name: 'Милана Ким',
          score: 40,
          correct: 6,
          total: 15,
          finished: false,
          leftReason: 'background',
          awayCount: 0,
        },
      ],
      hardestCards: [
        { word: 'reluctant', hint: 'неохотный', missed: 5, total: 5 },
        { word: 'achievement', hint: 'достижение', missed: 4, total: 5 },
        { word: 'appointment', hint: 'встреча', missed: 3, total: 5 },
      ],
      absent: [{ userId: 'a1', name: 'Мадина Ким' }],
    }),
  start: (id: string) => {
    liveStatus[id] = 'active';
    liveStart[id] = Date.now();
    return wait(undefined);
  },
  finish: (id: string) => {
    liveStatus[id] = 'finished';
    return wait(undefined);
  },
  reinstate: (_id: string, userId: string) => {
    liveLeft.delete(userId);
    return wait(undefined);
  },
  pause: (id: string, paused: boolean) => {
    livePaused[id] = paused;
    return wait(paused);
  },
  events: (_id: string) =>
    wait([
      {
        id: '5',
        kind: 'old_version',
        userId: 'late1',
        name: 'Мадина Ким',
        detail: {},
        at: new Date(Date.now() - 60_000).toISOString(),
      },
      {
        id: '4',
        kind: 'away',
        userId: STUDENTS[8].userId,
        name: STUDENTS[8].name,
        detail: { reason: 'background' },
        at: new Date(Date.now() - 20_000).toISOString(),
      },
      {
        id: '3',
        kind: 'back',
        userId: STUDENTS[2].userId,
        name: STUDENTS[2].name,
        detail: { sec: 2 },
        at: new Date(Date.now() - 90_000).toISOString(),
      },
      {
        id: '2',
        kind: 'extra_time',
        userId: STUDENTS[3].userId,
        name: STUDENTS[3].name,
        detail: { minutes: 2 },
        at: new Date(Date.now() - 120_000).toISOString(),
      },
    ] as import('@/services/exam').ExamEvent[]),
};

// ─── Итоги и разбор (Web 23–25) ─────────────────────────────────────────

import type { ExamResults, ExamStudentCard, QuestionReview } from '@/services/exam';

const R_NAMES = [
  'Айгерим Нурмухамбетова',
  'Тимур Жумабаев',
  'Алия Касымов',
  'Данияр Сулейменов',
  'Милана Ким',
  'Руслан Абдрахманова-Калиева',
  'Самира Ибрагимова',
  'Арман Петрова',
  'Дана Нурмухамбетова',
  'Ержан Жумабаев',
];
const R_COUNTS: ExamResults['students'][number]['counts'][] = [
  { correct: 12, wrong: 0, typo: 0, wrong_form: 0, none: 0 },
  { correct: 10, wrong: 1, typo: 1, wrong_form: 0, none: 0 },
  { correct: 9, wrong: 2, typo: 0, wrong_form: 1, none: 0 },
  { correct: 9, wrong: 3, typo: 0, wrong_form: 0, none: 0 },
  { correct: 7, wrong: 3, typo: 1, wrong_form: 0, none: 1 },
  { correct: 6, wrong: 4, typo: 0, wrong_form: 0, none: 2 },
  { correct: 11, wrong: 1, typo: 0, wrong_form: 0, none: 0 },
  { correct: 5, wrong: 5, typo: 1, wrong_form: 0, none: 1 },
  { correct: 8, wrong: 3, typo: 0, wrong_form: 1, none: 0 },
  { correct: 3, wrong: 6, typo: 0, wrong_form: 0, none: 3 },
];
let released = false;
const overrides: Record<string, { score: number; comment: string }> = {};
const decisionsByItem: Record<
  string,
  { logId: string; action: string; payload: Record<string, unknown>; at: string }[]
> = {};

function previewStudents(): ExamResults['students'] {
  return R_NAMES.map((name, i) => {
    const c = R_COUNTS[i];
    const computed = Math.round((c.correct / 12) * 100);
    const ov = overrides[`p${i}`];
    return {
      participantId: `p${i}`,
      userId: `u${i}`,
      name,
      initials: name[0],
      score: ov ? ov.score : computed,
      computedScore: computed,
      overridden: Boolean(ov),
      comment: ov?.comment ?? null,
      counts: c,
      finished: true,
      leftReason: i === 9 ? 'background' : null,
      awayCount: i === 3 ? 2 : 0,
      flags: i === 1 ? ['fast'] : [],
    };
  });
}

export const PreviewResults = {
  results: (): Promise<ExamResults> => {
    const students = previewStudents();
    const words = WORDS.map(([front, back], i) => {
      const dec = decisionsByItem[`w${i}`] ?? [];
      return {
        itemId: `w${i}`,
        cardId: `cd${i}`,
        format: (
          [
            'choice',
            'choice',
            'choice',
            'choice',
            'write',
            'write',
            'gap',
            'gap',
            'scramble',
            'match',
            'match',
            'match',
          ] as const
        )[i],
        prompt: front,
        answer: back,
        voided: dec.some((d) => d.action === 'void'),
        accepted: dec.filter((d) => d.action === 'accept').map((d) => String(d.payload.answer)),
        answered: 10,
        correct: [9, 8, 2, 7, 6, 8, 9, 5, 7, 9, 8, 6][i],
        wrong: 10 - [9, 8, 2, 7, 6, 8, 9, 5, 7, 9, 8, 6][i],
        suspicious: i === 2 && !dec.some((d) => d.action === 'keep' || d.action === 'void'),
      };
    });
    return wait({
      sessionId: 'fin1',
      status: 'finished',
      setTitle: 'Unit 4',
      date: new Date(Date.now() - 3600_000).toISOString(),
      released,
      durationSec: 420,
      totalQuestions: 12,
      avgScore: Math.round(students.reduce((a, s) => a + s.score, 0) / students.length),
      distribution: [
        { label: '90–100', n: 2 },
        { label: '75–89', n: 3 },
        { label: '50–74', n: 3 },
        { label: '0–49', n: 2 },
      ],
      students,
      words,
      absent: [
        { userId: 'a1', name: 'Мадина Ким' },
        { userId: 'a2', name: 'Нурлан Ибрагимов' },
      ],
    });
  },
  question: (itemId: string): Promise<QuestionReview> => {
    const dec = decisionsByItem[itemId] ?? [];
    const voided = dec.some((d) => d.action === 'void');
    const sim = {
      rows: [
        { participantId: 'p3', name: 'Данияр Сулейменов', from: 75, to: 82 },
        { participantId: 'p4', name: 'Милана Ким', from: 58, to: 67 },
        { participantId: 'p5', name: 'Руслан Абдрахманова-Калиева', from: 50, to: 58 },
      ],
      unchanged: ['Айгерим Нурмухамбетова', 'Тимур Жумабаев'],
      avgFrom: 70,
      avgTo: 72,
    };
    return wait({
      item: {
        itemId,
        format: 'choice',
        direction: 'forward',
        prompt: 'achievement',
        answer: 'достижение',
        options: ['достижение', 'успех', 'победа', 'награда'],
        voided,
        accepted: [],
        kept: false,
        number: 3,
      },
      stats: { answered: 10, correct: 2, wrong: 8 },
      groups: [
        {
          text: 'достижение',
          count: 2,
          names: ['Айгерим Нурмухамбетова', 'Тимур Жумабаев'],
          verdict: 'correct',
        },
        {
          text: 'успех',
          count: 5,
          names: [
            'Данияр Сулейменов',
            'Милана Ким',
            'Руслан Абдрахманова-Калиева',
            'Самира Ибрагимова',
            'Арман Петрова',
          ],
          verdict: 'wrong',
        },
        {
          text: 'победа',
          count: 2,
          names: ['Дана Нурмухамбетова', 'Ержан Жумабаев'],
          verdict: 'wrong',
        },
        { text: 'награда', count: 1, names: ['Алия Касымов'], verdict: 'wrong' },
      ],
      hints: [
        {
          code: 'question_issue',
          text: 'Верно ответили 2 из 10 — это намного ниже, чем по другим словам. Возможно, вопрос сформулирован неудачно.',
          suggest: 'void',
        },
        {
          code: 'near_answer',
          text: '5 учеников выбрали «успех» — близкое по смыслу слово.',
          suggest: 'accept',
          answer: 'успех',
        },
      ],
      actions: { void: voided ? null : sim, accept: { ...sim, answer: 'успех' } },
      decisions: dec,
    });
  },
  decide: (itemId: string, decision: 'void' | 'accept' | 'keep', answer?: string) => {
    const logId = `log${Date.now()}`;
    (decisionsByItem[itemId] ??= []).push({
      logId,
      action: decision,
      payload: answer ? { answer } : {},
      at: new Date().toISOString(),
    });
    return wait({ logId });
  },
  undo: (logId: string) => {
    for (const k of Object.keys(decisionsByItem))
      decisionsByItem[k] = decisionsByItem[k].filter((d) => d.logId !== logId);
    return wait(undefined);
  },
  override: (participantId: string, score: number | null, comment?: string) => {
    if (score === null) delete overrides[participantId];
    else overrides[participantId] = { score, comment: comment ?? '' };
    return wait(undefined);
  },
  release: () => {
    released = true;
    return wait(undefined);
  },
  retake: () => wait('draft1'),
  student: (participantId: string): Promise<ExamStudentCard> => {
    const i = Math.max(
      0,
      R_NAMES.findIndex((_, k) => `p${k}` === participantId)
    );
    const st = previewStudents()[i];
    const mistakes = WORDS.slice(0, st.counts.wrong + st.counts.typo + st.counts.none).map(
      ([front, back], k) => ({
        itemId: `w${k}`,
        cardId: `cd${k}`,
        format: (k % 2 ? 'write' : 'choice') as 'write' | 'choice',
        prompt: k % 2 ? back : front,
        answer: k % 2 ? front : back,
        given: k % 3 === 2 ? null : k % 2 ? 'recieve' : 'успех',
        verdict: (k % 3 === 2 ? 'none' : k % 2 ? 'typo' : 'wrong') as 'none' | 'typo' | 'wrong',
        accepted: false,
        voided: false,
        points: 8.33,
      })
    );
    return wait({
      participantId,
      userId: st.userId,
      name: st.name,
      override: overrides[participantId]?.score ?? null,
      comment: overrides[participantId]?.comment ?? null,
      leftReason: st.leftReason,
      awayCount: st.awayCount,
      finished: true,
      extraSec: 0,
      preparation: {
        days: 7,
        reviews: i < 4 ? 64 : 9,
        reviewDays: i < 4 ? 6 : 2,
        classReviews: 38,
        classReviewDays: 4,
      },
      released,
      setTitle: 'Unit 4',
      score: st.score,
      counts: st.counts,
      items: mistakes,
    });
  },
};
