import { describe, expect, it } from '@jest/globals';
import {
  absentTitle,
  answeredText,
  assignHardLabel,
  bestStudents,
  hardWarmupCards,
  needHelpStudents,
  notAnswered,
  sortCardStats,
  studentScoreText,
  warmupCorrectRate,
  warmupMinutesSpent,
  warmupSummaryLine,
  wordStatus,
  type CardStat,
} from '../warmup';

const card = (word: string, answers: number, correct: number): CardStat => ({
  cardId: word,
  word,
  hint: '',
  answers,
  correct,
  correctRate: answers > 0 ? Math.round((correct / answers) * 100) : null,
});
const p = (name: string, correct: number, total = 6) => ({ name, correct, total });

describe('монитор разминки', () => {
  it('статус слова: усвоили с 80 %, без ответов — ждём', () => {
    expect(wordStatus(card('a', 10, 8))).toBe('learned');
    expect(wordStatus(card('a', 10, 7))).toBe('hard');
    expect(wordStatus(card('a', 0, 0))).toBe('waiting');
  });

  it('трудные слова сверху, без ответов — в конце', () => {
    const sorted = sortCardStats([card('b', 0, 0), card('c', 10, 9), card('a', 10, 5)]);
    expect(sorted.map((c) => c.word)).toEqual(['a', 'c', 'b']);
  });

  it('«ответили» и «ещё не ответил»', () => {
    expect(answeredText(card('a', 14, 8), 15)).toBe('14 из 15 ответили');
    const students = [
      { name: 'Чингиз', answered: 0, done: false },
      { name: 'Аяна', answered: 2, done: false },
      { name: 'Вышел', answered: 0, done: true },
    ];
    expect(notAnswered(students).map((s) => s.name)).toEqual(['Чингиз']);
  });
});

describe('итоги разминки', () => {
  const cards = [card('a', 10, 5), card('b', 10, 9)];

  it('доля верных, минуты, строка сводки', () => {
    expect(warmupCorrectRate(cards)).toBe(70);
    expect(warmupCorrectRate([])).toBe(0);
    const r = {
      byCard: cards,
      participants: [p('A', 1), p('B', 2)],
      startedAt: '2026-11-13T10:31:00Z',
      finishedAt: '2026-11-13T10:36:10Z',
    };
    expect(warmupMinutesSpent(r)).toBe(5);
    expect(warmupSummaryLine(r)).toBe('2 ученика · 2 слова · 5 минут');
    expect(warmupSummaryLine({ participants: [] })).toBe('0 учеников · 0 слов');
  });

  it('лучшие и «нужна помощь» не пересекаются; все молодцы — помощь никому', () => {
    const list = [p('A', 6), p('B', 5), p('C', 6), p('D', 2), p('E', 3)];
    expect(bestStudents(list).map((x) => x.name)).toEqual(['A', 'C', 'B']);
    expect(needHelpStudents(list).map((x) => x.name)).toEqual(['D', 'E']);
    expect(needHelpStudents([p('A', 6), p('B', 6)])).toEqual([]);
    expect(studentScoreText(p('Asel', 5))).toBe('Asel · 5/6');
  });

  it('трудные слова и подписи кнопок', () => {
    expect(hardWarmupCards(cards).map((c) => c.word)).toEqual(['a']);
    expect(absentTitle(7)).toBe('7 не были на разминке');
    expect(absentTitle(1)).toBe('1 не был на разминке');
    expect(assignHardLabel(3, new Date(2026, 10, 16))).toBe('Задать 3 трудных слова к пн');
    expect(assignHardLabel(1, null)).toBe('Задать 1 трудное слово');
  });
});
