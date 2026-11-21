import { describe, expect, it } from '@jest/globals';
import {
  calendarCells,
  calendarSummary,
  focusSet,
  initials,
  remindTitle,
  studentBadge,
  studentFigures,
  studentInsight,
  studentSubtitle,
  testsRow,
  unitRows,
  type StudentDetailData,
} from '../studentInsight';

const NOW = new Date(2026, 10, 12, 18, 0);
const set = (over = {}) => ({
  setId: 's4',
  title: 'Ünite 4',
  totalCards: 48,
  learnedCards: 10,
  seenCards: 48,
  answers: 300,
  correctPct: 70,
  groupCorrectPct: 87,
  ...over,
});
const data = (over: Partial<StudentDetailData> = {}): StudentDetailData => ({
  seenCards: 48,
  learnedCards: 10,
  unlearnedCards: 0,
  sets: [set()],
  streak: 0,
  lastActiveDate: '2026-11-05',
  name: 'Кубат Аскарбеков',
  joinedAt: new Date(2026, 9, 30, 12).toISOString(),
  totalAnswers: 601,
  days: [
    { date: '2026-10-30', answers: 138 },
    { date: '2026-11-01', answers: 22 },
    { date: '2026-11-02', answers: 359 },
    { date: '2026-11-04', answers: 2 },
    { date: '2026-11-05', answers: 80 },
  ],
  tests: [],
  homework: null,
  ...over,
});

describe('шапка ученика', () => {
  it('подзаголовок, инициалы, бейдж статуса', () => {
    expect(studentSubtitle('A1-B', data().joinedAt)).toBe('Группа A1-B · с 30 октября');
    expect(studentSubtitle('A1-B', null)).toBe('Группа A1-B');
    expect(initials('Кубат Аскарбеков')).toBe('КА');
    expect(initials('Sezim')).toBe('SE');
    expect(studentBadge('2026-11-05', NOW)).toEqual({
      label: 'Не заходит 7 дней',
      tone: 'warning',
    });
    expect(studentBadge('2026-11-12', NOW).label).toBe('Занимался сегодня');
    expect(studentBadge('2026-11-09', NOW)).toEqual({ label: 'Был 3 дня назад', tone: 'neutral' });
    expect(studentBadge(null, NOW).label).toBe('Ещё не занимался');
  });
});

describe('карточка-вывод', () => {
  it('прошёл с ошибками: ниже порога', () => {
    expect(studentInsight(data())).toEqual({
      tone: 'warning',
      title: 'Прошёл Ünite 4, но с ошибками',
      text: 'Все 48 слов открыл, верно — 70%. У группы — 87%. Последний раз занимался 5 ноября.',
    });
  });

  it('порог задания важнее порога по умолчанию', () => {
    const d = data({
      homework: {
        id: 'h',
        title: 'Ünite 4',
        minScore: 60,
        dueAt: '',
        status: 'submitted',
        score: 70,
      },
    });
    expect(studentInsight(d).title).toBe('Прошёл Ünite 4');
    expect(studentInsight(d).tone).toBe('success');
  });

  it('проходит и ещё не начинал', () => {
    expect(studentInsight(data({ sets: [set({ seenCards: 12 })] })).title).toBe('Проходит Ünite 4');
    const none = studentInsight(
      data({ sets: [set({ seenCards: 0, correctPct: null })], lastActiveDate: null })
    );
    expect(none).toEqual({
      tone: 'warning',
      title: 'Ещё не начинал',
      text: 'Не открыл ни одного слова из Ünite 4.',
    });
  });

  it('набор для вывода — последний открытый', () => {
    const sets = [
      set({ setId: 'a', title: 'Ünite 3' }),
      set({ setId: 'b', title: 'Ünite 5', seenCards: 0 }),
    ];
    expect(focusSet(sets)?.title).toBe('Ünite 3');
    expect(remindTitle(data({ sets }))).toBe('Попросить повторить Ünite 3');
  });
});

describe('календарь и строки', () => {
  it('28 клеток: до вступления — пунктир, дальше — ступени по числу ответов', () => {
    const cells = calendarCells(data().days, data().joinedAt, NOW);
    expect(cells).toHaveLength(28);
    expect(cells[0]).toEqual({ date: '2026-10-16', level: -1 });
    expect(cells.find((c) => c.date === '2026-10-30')?.level).toBe(3);
    expect(cells.find((c) => c.date === '2026-11-01')?.level).toBe(2);
    expect(cells.find((c) => c.date === '2026-11-04')?.level).toBe(1);
    expect(cells[27]).toEqual({ date: '2026-11-12', level: 0 });
    expect(calendarSummary(cells)).toBe('5 из 14 дней в курсе');
  });

  it('три цифры', () => {
    expect(studentFigures(data())).toEqual([
      { value: '601', label: 'ответ всего', tone: 'neutral' },
      { value: '70%', label: 'Ünite 4', tone: 'warning' },
      { value: '5', label: 'дней занятий', tone: 'neutral' },
    ]);
  });

  it('юниты и тесты', () => {
    expect(unitRows(data())[0]).toEqual({
      key: 's4',
      title: 'Ünite 4',
      sub: '48 из 48 слов',
      badge: '70% · ниже порога',
      tone: 'warning',
    });
    expect(unitRows(data({ sets: [set({ correctPct: null })] }))[0].badge).toBe('—');
    expect(testsRow(data(), 'A1-B').sub).toBe('в A1-B ещё не проводились');
    const withTest = data({
      tests: [
        {
          sessionId: 't',
          title: 'Ünite 4',
          finishedAt: null,
          purpose: null,
          score: 83,
          correct: 5,
          total: 6,
        },
      ],
    });
    expect(testsRow(withTest, 'A1-B')).toMatchObject({
      sub: '1 тест · последний: Ünite 4',
      badge: '83%',
      tone: 'success',
    });
  });
});
