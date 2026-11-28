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
        sessionId: 'f1',
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
    return wait({
      ...ensureDraft(),
      ...BUILD,
      counts: { choice: 4, write: 2, scramble: 1, match: 3, gap: 2 },
    });
  },
  draft: () => wait(ensureDraft()),
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
  smart: () =>
    new Promise<import('../exam/smartLogic').SmartResult>((resolve) =>
      setTimeout(
        () =>
          resolve({
            suggestions: [
              {
                itemId: 'it6',
                kind: 'gap',
                before: {
                  prompt: 'She was _____ to leave the party early.',
                  options: ['eager', 'happy', 'ready'],
                },
                after: {
                  prompt: 'The boy was _____ to speak in front of the whole class.',
                  options: ['careful', 'curious', 'jealous'],
                },
                doubtful: false,
                reasons: [],
              },
              {
                itemId: 'it0',
                kind: 'choice',
                before: { prompt: 'reluctant', options: ['щедрый', 'быстрый', 'тихий'] },
                after: { prompt: 'reluctant', options: ['нерешительный', 'весёлый', 'суровый'] },
                doubtful: true,
                reasons: [
                  { code: 'model', text: 'ИИ отметил: «нерешительный» тоже может подойти' },
                ],
              },
              {
                itemId: 'it1',
                kind: 'choice',
                before: { prompt: 'although', options: ['щедрый', 'быстрый', 'тихий'] },
                after: { prompt: 'although', options: ['поэтому', 'потому что', 'вместо'] },
                doubtful: false,
                reasons: [],
              },
            ],
            skipped: [{ itemId: 'it7', reason: 'long_answer' }],
            usage: { used: 1, limit: 10, resetAt: new Date(Date.now() + 3_600_000).toISOString() },
          }),
        2500
      )
    ),
};
