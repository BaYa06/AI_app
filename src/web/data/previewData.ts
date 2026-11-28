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
