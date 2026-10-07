import { describe, expect, it } from '@jest/globals';
import type { Card, CardSet } from '@/types';
import { buildLessonPlan, ensureLessonDay, type LessonDay } from '../LessonService';
import {
  buildTimeline,
  buildWidgetSnapshot,
  pickPool,
  WIDGET_HORIZON_MS,
  WIDGET_POOL_MAX,
  type WidgetEntry,
  type WidgetPlanInput,
} from '../WidgetPlanner';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Среда, 7 октября 2026, 10:00 по времени устройства */
const NOW = new Date(2026, 9, 7, 10, 0, 0).getTime();
const TODAY = new Date(2026, 9, 7).getTime();

let seq = 0;

function card(extra: Partial<Card> = {}): Card {
  seq += 1;
  return {
    id: `c${String(seq).padStart(3, '0')}`,
    setId: 's1',
    frontText: `word${seq}`,
    backText: `слово${seq}`,
    createdAt: NOW - 30 * DAY + seq,
    updatedAt: NOW - 30 * DAY,
    learningStep: 0,
    nextReviewDate: 0,
    lastReviewDate: 0,
    status: 'new',
    ...extra,
  };
}

/** Слово на шаге step; срок повторения через dueIn мс; последний ответ lastAgo мс назад */
function studied(step: number, dueIn: number, lastAgo = 5 * DAY, extra: Partial<Card> = {}): Card {
  return card({ learningStep: step, nextReviewDate: NOW + dueIn, lastReviewDate: NOW - lastAgo, status: 'learning', ...extra });
}

const SET = { id: 's1', userId: 'u', title: 'Набор', category: 'other', tags: [], createdAt: 0, updatedAt: 0, cardCount: 0, newCount: 0 } as unknown as CardSet;

function input(cards: Card[], day: Partial<LessonDay> = {}, extra: Partial<WidgetPlanInput> = {}): WidgetPlanInput {
  const now = extra.now ?? NOW;
  const cardsMap = Object.fromEntries(cards.map((c) => [c.id, c]));
  const lessonDay = { ...ensureLessonDay(null, '2026-10-07', 0), ...day };
  const plan = buildLessonPlan({
    sets: [SET],
    cardsBySet: { s1: cards.map((c) => c.id) },
    cards: cardsMap,
    newPerDay: 10,
    day: lessonDay,
    now,
  });
  return { cards, day: lessonDay, plan, newPerDay: 10, streakDays: 0, goalReached: false, now, ...extra };
}

const noAnswers = { reviewed: new Set<string>(), introduced: new Set<string>() };
const wordsOf = (entries: WidgetEntry[]) => new Set(entries.filter((e) => e.cardId).map((e) => e.cardId));
const at = (h: number, m = 0, dayOffset = 0) => new Date(2026, 9, 7 + dayOffset, h, m).getTime();

describe('pickPool', () => {
  it('не берёт ждущие повторения, ещё не встреченные, уверенно выученные и длинные слова', () => {
    const waiting = studied(2, -HOUR);
    const unseen = card();
    const mature = studied(5, 10 * DAY);
    const long = studied(2, 5 * DAY, 5 * DAY, { frontText: 'a'.repeat(25) });
    const young = studied(3, 5 * DAY);
    const pool = pickPool([waiting, unseen, mature, long, young], noAnswers, TODAY, NOW);
    expect(pool.map((c) => c.id)).toEqual([young.id]);
  });

  it('порядок: ошибки сегодня → выученные сегодня → вчерашние → молодые', () => {
    const youngW = studied(3, 5 * DAY);
    const yesterday = studied(1, 0.5 * DAY, 20 * HOUR);
    const learnedToday = studied(1, DAY, HOUR);
    // Ошибка: повторил сегодня, ответил неверно — снова ждёт
    const mistake = studied(1, -HOUR, HOUR);
    const answered = { reviewed: new Set([mistake.id]), introduced: new Set([learnedToday.id]) };
    const pool = pickPool([youngW, yesterday, learnedToday, mistake], answered, TODAY, NOW);
    expect(pool.map((c) => c.id)).toEqual([mistake.id, learnedToday.id, yesterday.id, youngW.id]);
  });

  it('новое слово с «Не знаю» сегодня — ошибка, берём первым', () => {
    const failedNew = card();
    const pool = pickPool([failedNew], { reviewed: new Set(), introduced: new Set([failedNew.id]) }, TODAY, NOW);
    expect(pool.map((c) => c.id)).toEqual([failedNew.id]);
  });

  it('не больше 8 слов', () => {
    const cards = Array.from({ length: 12 }, () => studied(3, 5 * DAY));
    expect(pickPool(cards, noAnswers, TODAY, NOW)).toHaveLength(WIDGET_POOL_MAX);
  });
});

describe('buildTimeline', () => {
  it('урок не сделан — «урок ждёт», слова урока в виджете не появляются', () => {
    const due = Array.from({ length: 7 }, () => studied(2, -HOUR));
    const young = studied(3, 5 * DAY);
    const entries = buildTimeline(input([...due, young]));
    const first = entries.find((e) => e.at <= NOW && e.state !== 'night')!;
    expect(first.state).toBe('waiting');
    expect(first.waiting).toBe(7);
    expect(first.minutes).toBeGreaterThan(0);
    const today = entries.filter((e) => e.at < at(23));
    expect([...wordsOf(today)]).toEqual([young.id]);
  });

  it('урок сделан — закрепление: вопрос, через 20 минут ответ', () => {
    const learned = studied(1, DAY, HOUR);
    const entries = buildTimeline(input([learned], { reviewedIds: [], introducedIds: [learned.id] }));
    const q = entries.find((e) => e.at === NOW)!;
    const a = entries.find((e) => e.at === NOW + 20 * 60 * 1000)!;
    expect(q).toMatchObject({ state: 'review', phase: 'question', prompt: learned.frontText, cardId: learned.id });
    expect(a).toMatchObject({ state: 'review', phase: 'answer', prompt: learned.frontText, answer: learned.backText });
    expect(q.answer).toBe(learned.backText);
  });

  it('паузы между показами слова: ≥ 1 ч перед вторым, ≥ 3 ч перед следующими', () => {
    const pool = Array.from({ length: 3 }, () => studied(1, 2 * DAY, HOUR));
    const entries = buildTimeline(input(pool, { introducedIds: pool.map((c) => c.id) }));
    const shows = (id: string) =>
      entries.filter((e) => e.cardId === id && e.phase === 'question' && e.at < at(23)).map((e) => e.at);
    for (const c of pool) {
      const s = shows(c.id);
      expect(s.length).toBeGreaterThanOrEqual(3);
      expect(s[1] - s[0]).toBeGreaterThanOrEqual(HOUR);
      for (let i = 2; i < s.length; i++) expect(s[i] - s[i - 1]).toBeGreaterThanOrEqual(3 * HOUR);
    }
  });

  it('ни одно слово не готово к показу — запись без слова, а не то же слово подряд', () => {
    const only = studied(1, 2 * DAY, HOUR);
    const entries = buildTimeline(input([only], { introducedIds: [only.id] }));
    const slot = entries.find((e) => e.at === NOW + 30 * 60 * 1000)!;
    expect(slot.state).toBe('review');
    expect(slot.cardId).toBeUndefined();
  });

  it('шаг 2+: третий показ за день — «перевод → слово»', () => {
    const w = studied(2, 5 * DAY, 20 * HOUR);
    const entries = buildTimeline(input([w], { reviewedIds: [w.id] }));
    const qs = entries.filter((e) => e.phase === 'question' && e.at < at(23));
    expect(qs[0].prompt).toBe(w.frontText);
    expect(qs[2].prompt).toBe(w.backText);
    expect(qs[2].answer).toBe(w.frontText);
  });

  it('тихие часы: в 23:00 итог дня, до 07:00 слова не меняются', () => {
    const w = studied(3, 5 * DAY);
    const entries = buildTimeline(input([w], { reviewedIds: [w.id] }));
    const night = entries.filter((e) => e.at >= at(23) && e.at < at(7, 0, 1));
    expect(night).toHaveLength(1);
    expect(night[0]).toMatchObject({ at: at(23), state: 'night', done: 1 });
  });

  it('горизонт 72 часа, последняя запись — «давно не заходил» с угасающими словами', () => {
    const w = studied(1, DAY);
    const entries = buildTimeline(input([w]));
    const last = entries[entries.length - 1];
    expect(last).toMatchObject({ at: NOW + WIDGET_HORIZON_MS, state: 'stale' });
    expect(last.fading).toBe(1);
    expect(entries.every((e, i) => i === 0 || e.at >= entries[i - 1].at)).toBe(true);
  });

  it('завтра урок снова ждёт: слово, пришедшее на повторение, уходит из виджета', () => {
    // Выучено сегодня, повторение завтра в 10:00
    const w = studied(1, DAY, HOUR);
    const other = studied(3, 10 * DAY);
    const entries = buildTimeline(input([w, other], { introducedIds: [w.id] }));
    const tomorrow = entries.filter((e) => e.at >= at(7, 0, 1) && e.at < at(23, 0, 1));
    expect(tomorrow[0].state).toBe('waiting');
    expect(tomorrow.some((e) => e.cardId === w.id)).toBe(false);
    expect(wordsOf(tomorrow).has(other.id)).toBe(true);
  });

  it('вечером при серии и невыполненном уроке — «серия под угрозой»', () => {
    const due = studied(2, -HOUR);
    const entries = buildTimeline(input([due, studied(3, 5 * DAY)], {}, { streakDays: 14 }));
    const evening = entries.find((e) => e.at === at(21))!;
    expect(evening.state).toBe('streak');
    expect(evening.hoursLeft).toBe(3);
    expect(entries.find((e) => e.at === at(12))!.state).toBe('waiting');
  });

  it('ни одно слово не учили — «первый урок»', () => {
    const entries = buildTimeline(input([card(), card()]));
    expect(entries.find((e) => e.at === NOW)!.state).toBe('first');
  });

  it('ночью до 07:00 первая запись — итог, слова с 07:00', () => {
    const w = studied(3, 5 * DAY);
    const entries = buildTimeline(input([w], { reviewedIds: [w.id] }, { now: at(3) }));
    expect(entries[0]).toMatchObject({ at: at(3), state: 'night' });
    expect(entries[1].at).toBe(at(7));
  });

  it('настройки: слова из выбранного набора, направление, скрытие перевода', () => {
    const lessonWord = studied(3, 5 * DAY);
    const setWord = studied(1, 2 * DAY, 20 * HOUR, { setId: 's2' });
    const base = input([lessonWord], { reviewedIds: [lessonWord.id] });
    const fromSet = buildTimeline({ ...base, poolCards: [setWord] });
    expect([...wordsOf(fromSet.filter((e) => e.at < at(23)))]).toEqual([setWord.id]);

    const reversed = buildTimeline({ ...base, direction: 'reverse' }).find((e) => e.cardId)!;
    expect(reversed).toMatchObject({ reverse: true, prompt: lessonWord.backText, answer: lessonWord.frontText });
    const auto3 = buildTimeline({ ...base, direction: 'forward' }).filter((e) => e.phase === 'question' && e.at < at(23));
    expect(auto3.every((e) => !e.reverse)).toBe(true);

    expect(buildWidgetSnapshot({ ...base, hideAnswer: true }).hideAnswerLocked).toBe(true);
    expect(buildWidgetSnapshot(base).hideAnswerLocked).toBe(false);
  });

  it('снимок 150 карточек меньше 200 КБ', () => {
    const cards = Array.from({ length: 150 }, (_, i) => studied(1 + (i % 4), (i % 10) * DAY - HOUR));
    const json = JSON.stringify(buildWidgetSnapshot(input(cards)));
    expect(json.length).toBeLessThan(200 * 1024);
  });
});
