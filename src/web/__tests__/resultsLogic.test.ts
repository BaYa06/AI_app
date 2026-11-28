import { describe, expect, it } from '@jest/globals';
import type { ExamResults, ResultStudent, ResultWord } from '@/services/exam';
import {
  choiceViews,
  csvFilename,
  decisionNote,
  decisionTitle,
  defaultChoice,
  distributionMax,
  errorCount,
  homeworkDue,
  lowPreparation,
  mistakes,
  parseScore,
  resultsCsv,
  scoreTone,
  simulationFor,
  sortWords,
  studentsWithErrors,
  suspiciousWords,
} from '../exam/resultsLogic';

const st = (over: Partial<ResultStudent> = {}): ResultStudent => ({
  participantId: 'p1',
  userId: 'u1',
  name: 'Анна',
  initials: 'А',
  score: 80,
  computedScore: 80,
  overridden: false,
  comment: null,
  counts: { correct: 8, wrong: 1, typo: 1, wrong_form: 0, none: 0 },
  finished: true,
  leftReason: null,
  awayCount: 0,
  flags: [],
  ...over,
});

const word = (over: Partial<ResultWord> = {}): ResultWord => ({
  itemId: 'i1',
  cardId: 'c1',
  format: 'choice',
  prompt: 'apple',
  answer: 'яблоко',
  voided: false,
  accepted: [],
  answered: 10,
  correct: 5,
  wrong: 5,
  suspicious: false,
  ...over,
});

const results = (over: Partial<ExamResults> = {}): ExamResults => ({
  sessionId: 's1',
  status: 'finished',
  setTitle: 'Unit 4',
  date: '2026-11-28T10:00:00Z',
  released: false,
  durationSec: 600,
  totalQuestions: 10,
  avgScore: 74,
  distribution: [
    { label: '90–100', n: 3 },
    { label: '0–49', n: 0 },
  ],
  students: [st()],
  words: [],
  absent: [{ userId: 'x', name: 'Борис' }],
  ...over,
});

describe('баллы и ошибки', () => {
  it('цвет по порогам 75 и 50', () => {
    expect(scoreTone(100)).toBe('success');
    expect(scoreTone(75)).toBe('success');
    expect(scoreTone(74)).toBe('neutral');
    expect(scoreTone(50)).toBe('neutral');
    expect(scoreTone(49)).toBe('error');
  });
  it('ошибки — всё, что не «верно»', () => {
    expect(errorCount(st())).toBe(2);
    expect(
      errorCount(st({ counts: { correct: 10, wrong: 0, typo: 0, wrong_form: 0, none: 0 } }))
    ).toBe(0);
    expect(
      studentsWithErrors({
        students: [
          st(),
          st({ counts: { correct: 10, wrong: 0, typo: 0, wrong_form: 0, none: 0 } }),
        ],
      })
    ).toBe(1);
  });
  it('слова: трудные выше, подозрительные отдельно, распределение без деления на ноль', () => {
    const list = [
      word({ itemId: 'a', prompt: 'b', correct: 9 }),
      word({ itemId: 'b', prompt: 'a', correct: 2, suspicious: true }),
      word({ itemId: 'c', prompt: 'c', answered: 0, correct: 0 }),
    ];
    expect(sortWords(list).map((w) => w.itemId)).toEqual(['c', 'b', 'a']);
    expect(suspiciousWords(list).map((w) => w.itemId)).toEqual(['b']);
    expect(distributionMax([{ n: 0 }])).toBe(1);
    expect(distributionMax([{ n: 3 }, { n: 7 }])).toBe(7);
  });
});

describe('CSV', () => {
  it('BOM, разделитель «;», строки через CRLF', () => {
    const csv = resultsCsv(results(), 'A2');
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('Ученик;Балл из 100;Верно');
    expect(csv).toContain('Анна;80;8;1;1;0;0;Нет;;Нет');
    expect(csv).toContain('Борис;не пришёл');
    expect(csv.split('\r\n').length).toBeGreaterThan(5);
  });
  it('запятые в тексте не ломают столбцы, «;» и кавычки экранируются', () => {
    const csv = resultsCsv(results({ students: [st({ name: 'Ким, Анна; "Ан"' })] }), '');
    expect(csv).toContain('"Ким, Анна; ""Ан"""');
    expect(csv).not.toContain('Курс:');
  });
  it('имя, начинающееся с «=», не станет формулой в Excel', () => {
    expect(resultsCsv(results({ students: [st({ name: '=1+1' })] }), 'A2')).toContain("'=1+1;80");
    // число с минусом — не формула
    expect(resultsCsv(results({ students: [st({ score: -5 as number })] }), 'A2')).toContain(
      ';-5;'
    );
  });
  it('изменённый балл и выход из приложения', () => {
    const csv = resultsCsv(
      results({
        students: [
          st({ overridden: true, computedScore: 60, leftReason: 'background' }),
          st({ participantId: 'p2', awayCount: 3 }),
        ],
      }),
      'A2'
    );
    expect(csv).toContain('Да (было 60)');
    expect(csv).toContain(';Да');
    expect(csv).toContain('Выходил ×3');
  });
  it('имя файла без опасных символов', () => {
    expect(csvFilename('Unit 4/5: "тест"', '2026-11-28T10:00:00Z')).toBe(
      'экзамен-Unit-4-5-тест-2026-11-28.csv'
    );
    expect(csvFilename('', 'мусор')).toBe('экзамен-без-названия-итоги.csv');
  });
});

describe('разбор вопроса', () => {
  const item = {
    itemId: 'i',
    format: 'choice' as const,
    direction: null,
    prompt: 'p',
    answer: 'a',
    options: null,
    voided: false,
    accepted: [],
    kept: false,
    number: 3,
  };
  const sim = {
    rows: [{ participantId: 'p', name: 'А', from: 50, to: 60 }],
    unchanged: [],
    avgFrom: 50,
    avgTo: 60,
  };
  it('по умолчанию — совет подсказок', () => {
    const actions = { void: sim, accept: { ...sim, answer: 'b' } };
    expect(defaultChoice({ hints: [{ code: 'x', text: '', suggest: 'accept' }], actions })).toBe(
      'accept'
    );
    expect(defaultChoice({ hints: [{ code: 'x', text: '', suggest: 'keep' }], actions })).toBe(
      'keep'
    );
    expect(defaultChoice({ hints: [], actions })).toBe('void');
    expect(defaultChoice({ hints: [], actions: { void: null, accept: null } })).toBe('keep');
    // советуют засчитать, но засчитывать нечего — не выбираем недоступное
    expect(
      defaultChoice({
        hints: [{ code: 'x', text: '', suggest: 'accept' }],
        actions: { void: sim, accept: null },
      })
    ).toBe('void');
  });
  it('расчёт баллов только для аннулирования и «засчитать»', () => {
    const actions = { void: sim, accept: { ...sim, answer: 'b' } };
    expect(simulationFor({ actions }, 'keep')).toBeNull();
    expect(simulationFor({ actions }, 'void')).toBe(sim);
    expect(simulationFor({ actions }, 'accept')).toEqual({ ...sim, answer: 'b' });
  });
  it('варианты: недоступные отключены, тексты с числом учеников', () => {
    const v = choiceViews({ item, actions: { void: sim, accept: null } });
    expect(v.map((c) => [c.key, c.disabled])).toEqual([
      ['void', false],
      ['accept', true],
      ['keep', false],
    ]);
    expect(v[0].detail).toMatch(/у 1\./);
    const v2 = choiceViews({
      item: { ...item, voided: true },
      actions: { void: null, accept: { ...sim, answer: 'b' } },
    });
    expect(v2[0].title).toBe('Вопрос уже аннулирован');
    expect(v2[1].title).toBe('Засчитать «b»');
  });
  it('журнал решений', () => {
    expect(decisionTitle('void', {})).toBe('Вопрос аннулирован');
    expect(decisionTitle('accept', { answer: 'x' })).toBe('Ответ «x» засчитан');
    expect(decisionTitle('keep', {})).toMatch(/оставлен/);
    expect(decisionTitle('new', {})).toBe('Решение учителя');
    expect(decisionNote('void')).toMatch(/аннулирован/);
    expect(decisionNote('???')).toBe('');
  });
});

describe('карточка ученика', () => {
  it('балл: 0–100, запятая, целое', () => {
    expect(parseScore('85')).toBe(85);
    expect(parseScore(' 72,6 ')).toBe(73);
    expect(parseScore('0')).toBe(0);
    expect(parseScore('100')).toBe(100);
    expect(parseScore('101')).toBeNull();
    expect(parseScore('-5')).toBeNull();
    expect(parseScore('')).toBeNull();
    expect(parseScore('abc')).toBeNull();
    expect(parseScore('1e2')).toBeNull();
  });
  it('ошибки без аннулированных вопросов', () => {
    const items = [
      {
        itemId: '1',
        cardId: null,
        format: 'choice' as const,
        prompt: '',
        answer: '',
        given: null,
        verdict: 'wrong' as const,
        accepted: false,
        voided: false,
        points: 5,
      },
      {
        itemId: '2',
        cardId: null,
        format: 'choice' as const,
        prompt: '',
        answer: '',
        given: null,
        verdict: 'wrong' as const,
        accepted: false,
        voided: true,
        points: 5,
      },
      {
        itemId: '3',
        cardId: null,
        format: 'choice' as const,
        prompt: '',
        answer: '',
        given: 'x',
        verdict: 'correct' as const,
        accepted: false,
        voided: false,
        points: 5,
      },
    ];
    expect(mistakes({ items }).map((i) => i.itemId)).toEqual(['1']);
    expect(mistakes({})).toEqual([]);
  });
  it('мало готовился — меньше трети от среднего по классу', () => {
    expect(
      lowPreparation({ days: 7, reviews: 3, reviewDays: 1, classReviews: 30, classReviewDays: 4 })
    ).toBe(true);
    expect(
      lowPreparation({ days: 7, reviews: 10, reviewDays: 3, classReviews: 30, classReviewDays: 4 })
    ).toBe(false);
  });
  it('срок домашки — через 3 дня в 20:00', () => {
    const due = homeworkDue(new Date(2026, 10, 28, 9, 30));
    expect([
      due.getFullYear(),
      due.getMonth(),
      due.getDate(),
      due.getHours(),
      due.getMinutes(),
    ]).toEqual([2026, 11, 1, 20, 0]);
  });
});
