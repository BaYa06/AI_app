import { describe, expect, it } from '@jest/globals';
import type { Card } from '@/types';
import {
  buildHomeworkSessionPlan,
  dueRelative,
  formatDue,
  homeworkLeft,
  homeworkVolume,
  homeworkVolumeText,
  nearestActiveHomework,
  needsScoreRetry,
  wordsPerDay,
  type StudentHomework,
} from '../homework';

const DAY = 24 * 60 * 60 * 1000;
// Чт 12.11.2026 10:00 по времени устройства
const NOW = new Date(2026, 10, 12, 10, 0, 0).getTime();

function card(id: string, step: number, nextReviewDate = NOW + 10 * DAY): Card {
  return {
    id,
    setId: 's',
    frontText: id,
    backText: id,
    createdAt: 0,
    updatedAt: 0,
    learningStep: step,
    nextReviewDate,
    lastReviewDate: step > 0 ? NOW - DAY : 0,
    status: step === 0 ? 'new' : 'learning',
  };
}

function hw(over: Partial<StudentHomework> = {}): StudentHomework {
  return {
    id: 'h',
    courseId: 'c',
    courseTitle: 'A1-B',
    title: 'Ünite 4',
    teacher: 'Ильяз агай',
    cardIds: [],
    setIds: [],
    words: 0,
    creditedCardIds: [],
    wrongCardIds: [],
    score: null,
    minScore: 80,
    dueAt: new Date(NOW + 3 * DAY).toISOString(),
    createdAt: new Date(NOW).toISOString(),
    submitted: null,
    group: { assigned: 22, submitted: 7 },
    ...over,
  };
}

describe('объём и сроки', () => {
  it('48 слов ≈ 10 сессий ≈ 70 мин', () => {
    expect(homeworkVolume(48)).toEqual({ sessions: 10, minutes: 70 });
    expect(homeworkVolumeText(48)).toBe('≈ 10 сессий · ≈ 70 мин');
    expect(homeworkVolumeText(0)).toBe('');
  });

  it('формат срока и «через N дней»', () => {
    const due = new Date(2026, 10, 15, 20, 0, 0);
    expect(formatDue(due)).toBe('15.11.2026 20:00');
    expect(dueRelative(due, NOW)).toBe('через 3 дня');
    expect(dueRelative(new Date(2026, 10, 13, 9, 0), NOW)).toBe('завтра');
    expect(dueRelative(new Date(2026, 10, 12, 20, 0), NOW)).toBe('сегодня');
    expect(dueRelative(new Date(2026, 10, 12, 9, 0), NOW)).toBe('просрочено');
  });

  it('слов в день до срока', () => {
    expect(wordsPerDay(50, new Date(2026, 10, 15, 20, 0), NOW)).toBe(17);
    expect(wordsPerDay(10, new Date(2026, 10, 12, 20, 0), NOW)).toBe(10);
  });
});

describe('состояние задания', () => {
  it('осталось и повтор ради оценки', () => {
    const done = hw({ words: 2, cardIds: ['a', 'b'], creditedCardIds: ['a', 'b'], score: 50 });
    expect(homeworkLeft(done)).toBe(0);
    expect(needsScoreRetry(done)).toBe(true);
    expect(needsScoreRetry({ ...done, minScore: null })).toBe(false);
    expect(needsScoreRetry({ ...done, score: 90 })).toBe(false);
  });

  it('на главной — несданное с ближайшим сроком', () => {
    const later = hw({ id: 'later', dueAt: new Date(NOW + 5 * DAY).toISOString() });
    const sooner = hw({ id: 'sooner', dueAt: new Date(NOW + DAY).toISOString() });
    const done = hw({
      id: 'done',
      dueAt: new Date(NOW).toISOString(),
      submitted: { at: '', late: false, score: 90, diamonds: 20 },
    });
    expect(nearestActiveHomework([later, done, sooner])?.id).toBe('sooner');
    expect(nearestActiveHomework([done])).toBeNull();
  });
});

describe('план сессии по словам задания', () => {
  const cards = {
    a: card('a', 0),
    b: card('b', 0),
    c: card('c', 1),
    d: card('d', 0),
    e: card('e', 0),
    f: card('f', 0),
    g: card('g', 0),
  };

  it('без трудных — незасчитанные по 5, новые первыми, лимит дня не действует', () => {
    const plan = buildHomeworkSessionPlan(
      { cardIds: ['c', 'a', 'b', 'd', 'e', 'f', 'g'], creditedCardIds: [], wrongCardIds: [] },
      cards,
      { now: NOW }
    );
    expect(plan.kind).toBe('learn');
    expect(plan.cardIds).toEqual(['a', 'b', 'd', 'e', 'f']);
  });

  it('есть трудные — сначала «Повторить», но можно выбрать «Учить»', () => {
    const h = { cardIds: ['a', 'b', 'c'], creditedCardIds: ['a', 'c'], wrongCardIds: ['c'] };
    expect(buildHomeworkSessionPlan(h, cards, { now: NOW })).toEqual({
      kind: 'review',
      cardIds: ['c'],
    });
    expect(buildHomeworkSessionPlan(h, cards, { now: NOW, prefer: 'learn' })).toEqual({
      kind: 'learn',
      cardIds: ['b'],
    });
  });

  it('удалённые слова пропускаются; всё засчитано без ошибок — пусто', () => {
    const plan = buildHomeworkSessionPlan(
      { cardIds: ['a', 'gone'], creditedCardIds: ['a'], wrongCardIds: [] },
      cards,
      { now: NOW }
    );
    expect(plan.cardIds).toEqual([]);
  });
});

describe('задание «Повторить трудные» (Teacher 43)', () => {
  const cards = { a: card('a', 2), b: card('b', 0), c: card('c', 3) };

  it('незасчитанные слова идут сессией «Повторить», потом — засчитанные с ошибкой', () => {
    const plan = buildHomeworkSessionPlan(
      hw({ kind: 'review', cardIds: ['a', 'b', 'c'], creditedCardIds: ['c'], wrongCardIds: ['c'] }),
      cards,
      { now: NOW }
    );
    expect(plan).toEqual({ kind: 'review', cardIds: ['a', 'b', 'c'] });
  });

  it('всё засчитано без ошибок — запускать нечего', () => {
    const plan = buildHomeworkSessionPlan(
      hw({ kind: 'review', cardIds: ['a', 'b'], creditedCardIds: ['a', 'b'] }),
      cards,
      { now: NOW }
    );
    expect(plan.cardIds).toEqual([]);
  });
});
