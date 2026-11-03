import { describe, expect, it } from '@jest/globals';
import type { Card, CardSet } from '@/types';
import {
  addExtraNew,
  buildLessonPlan,
  buildSetSessionPlan,
  countWaitingReview,
  ensureLessonDay,
  estimateMinutes,
  recordLessonAnswer,
  newQuotaOf,
  setFocusSet,
  type LessonDay,
  type LessonInput,
  type SetSessionInput,
} from '../LessonService';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 1, 9, 0, 0);

let seq = 0;

function makeSet(id: string, extra: Partial<CardSet> = {}): CardSet {
  return {
    id,
    userId: 'u',
    title: `Набор ${id}`,
    category: 'other',
    tags: [],
    createdAt: NOW - 30 * DAY,
    updatedAt: NOW - 30 * DAY,
    cardCount: 0,
    newCount: 0,
    ...extra,
  } as CardSet;
}

/** Новое слово (шаг 0) */
function newCard(setId: string): Card {
  seq += 1;
  return {
    id: `${setId}-c${String(seq).padStart(3, '0')}`,
    setId,
    frontText: 'w',
    backText: 'п',
    createdAt: NOW - 20 * DAY + seq,
    updatedAt: NOW - 20 * DAY,
    learningStep: 0,
    nextReviewDate: 0,
    lastReviewDate: 0,
    status: 'new',
  };
}

/** Слово на повторении: dueIn < 0 — просрочено на столько мс, > 0 — придёт позже */
function studiedCard(setId: string, dueIn: number, step = 2): Card {
  return { ...newCard(setId), learningStep: step, nextReviewDate: NOW + dueIn, status: 'learning' };
}

type Fixture = { sets: CardSet[]; cards: Card[] };

function input(fx: Fixture, day: Partial<LessonDay> = {}, newPerDay = 10): LessonInput {
  const cardsBySet: Record<string, string[]> = {};
  const cards: Record<string, Card> = {};
  for (const c of fx.cards) {
    (cardsBySet[c.setId] ||= []).push(c.id);
    cards[c.id] = c;
  }
  const startWaiting = countWaitingReview(fx.sets, cardsBySet, cards, NOW);
  return {
    sets: fx.sets,
    cardsBySet,
    cards,
    newPerDay,
    now: NOW,
    day: { ...ensureLessonDay(null, '2026-10-01', startWaiting), ...day },
  };
}

/** n наборов по perSet новых слов */
function freshLibrary(n: number, perSet: number): Fixture {
  const sets = Array.from({ length: n }, (_, i) => makeSet(`s${i + 1}`));
  const cards = sets.flatMap((s) => Array.from({ length: perSet }, () => newCard(s.id)));
  return { sets, cards };
}

function due(setId: string, count: number): Card[] {
  return Array.from({ length: count }, (_, i) => studiedCard(setId, -(i + 1) * 60 * 60 * 1000));
}

describe('buildLessonPlan', () => {
  it('10 наборов × 30 новых — первый день: 10 новых из первого набора по порядку добавления', () => {
    const fx = freshLibrary(10, 30);
    const plan = buildLessonPlan(input(fx));
    expect(plan.state).toBe('first');
    expect(plan.reviewIds).toEqual([]);
    expect(plan.newIds).toHaveLength(10);
    expect(plan.focusSetId).toBe('s1');
    const expected = fx.cards.filter((c) => c.setId === 's1').slice(0, 10).map((c) => c.id);
    expect(plan.newIds).toEqual(expected);
    expect(plan.focusSetSeen).toBe(0);
    expect(plan.focusSetTotal).toBe(30);
    expect(plan.newLeftTotal).toBe(300);
    expect(plan.minutes).toBe(4);
    // 290 после сегодняшних 10, по 10 в день — ещё 29 дней
    expect(plan.newDaysLeft).toBe(29);
    expect(buildLessonPlan(input(fx, {}, 20)).newDaysLeft).toBe(14);
  });

  it('10 ждут + много новых — 10 повторить + 10 новых', () => {
    const fx = freshLibrary(3, 30);
    fx.cards.push(...due('s1', 10));
    const plan = buildLessonPlan(input(fx));
    expect(plan.state).toBe('lesson');
    expect(plan.reviewIds).toHaveLength(10);
    expect(plan.newIds).toHaveLength(10);
    expect(plan.minutes).toBe(6);
  });

  it('повторение — самые просроченные первыми', () => {
    const fx = freshLibrary(1, 5);
    const late = studiedCard('s1', -5 * DAY);
    const soon = studiedCard('s1', -60 * 1000);
    fx.cards.push(soon, late);
    const plan = buildLessonPlan(input(fx));
    expect(plan.reviewIds).toEqual([late.id, soon.id]);
    expect(plan.fadingCount).toBe(1);
  });

  it('25 ждут — 25 повторить + 5 новых', () => {
    const fx = freshLibrary(2, 30);
    fx.cards.push(...due('s1', 25));
    const plan = buildLessonPlan(input(fx));
    expect(plan.reviewIds).toHaveLength(25);
    expect(plan.newIds).toHaveLength(5);
    expect(plan.newQuota).toBe(5);
  });

  it('45 ждут — 30 самых просроченных, новых нет, состояние overdue', () => {
    const fx = freshLibrary(2, 30);
    fx.cards.push(...due('s1', 45));
    const plan = buildLessonPlan(input(fx));
    expect(plan.state).toBe('overdue');
    expect(plan.reviewIds).toHaveLength(30);
    expect(plan.newIds).toHaveLength(0);
    expect(plan.waitingTotal).toBe(45);
  });

  it('после 30 повторений из 45 новые не «возвращаются» — на сегодня всё', () => {
    const fx = freshLibrary(2, 30);
    const waiting = due('s1', 45);
    fx.cards.push(...waiting);
    const base = input(fx);
    // Ответили на 30: у них срок сдвинулся вперёд
    const reviewed = waiting.slice(0, 30);
    for (const c of reviewed) base.cards[c.id] = { ...c, learningStep: 3, nextReviewDate: NOW + 7 * DAY };
    const plan = buildLessonPlan({ ...base, day: { ...base.day, reviewedIds: reviewed.map((c) => c.id) } });
    expect(plan.newIds).toHaveLength(0);
    expect(plan.reviewIds).toHaveLength(0);
    expect(plan.state).toBe('done');
    expect(plan.waitingTotal).toBe(15);
  });

  it('текущий набор закончился посреди квоты — добор из следующего', () => {
    const fx: Fixture = { sets: [makeSet('a'), makeSet('b')], cards: [] };
    fx.cards.push(...Array.from({ length: 4 }, () => newCard('a')));
    fx.cards.push(...Array.from({ length: 30 }, () => newCard('b')));
    const plan = buildLessonPlan(input(fx));
    expect(plan.newIds).toHaveLength(10);
    expect(plan.newIds.filter((id) => id.startsWith('a-'))).toHaveLength(4);
    expect(plan.newIds.slice(4).every((id) => id.startsWith('b-'))).toBe(true);
    expect(plan.focusSetId).toBe('a');
  });

  it('настройка «Новых слов в день»: 5 и 20', () => {
    const fx = freshLibrary(2, 30);
    expect(buildLessonPlan(input(fx, {}, 5)).newIds).toHaveLength(5);
    expect(buildLessonPlan(input(fx, {}, 20)).newIds).toHaveLength(20);
  });

  it('все слова изучены и ничего не ждёт — finished', () => {
    const fx: Fixture = { sets: [makeSet('s1')], cards: Array.from({ length: 5 }, () => studiedCard('s1', 3 * DAY)) };
    const plan = buildLessonPlan(input(fx));
    expect(plan.state).toBe('finished');
    expect(plan.minutes).toBe(0);
    expect(plan.newLeftTotal).toBe(0);
  });

  it('квоты выполнены, новые слова ещё есть — done, с подсказкой на завтра', () => {
    const fx = freshLibrary(1, 30);
    const base = input(fx);
    const intro = fx.cards.slice(0, 10);
    for (const c of intro) base.cards[c.id] = { ...c, learningStep: 1, nextReviewDate: NOW + DAY - 60 * 60 * 1000 };
    const plan = buildLessonPlan({ ...base, day: { ...base.day, introducedIds: intro.map((c) => c.id) } });
    expect(plan.state).toBe('done');
    expect(plan.tomorrowCount).toBe(10);
    expect(plan.focusSetSeen).toBe(10);
  });

  it('ошибки сегодняшнего урока — состояние mistakes', () => {
    const fx = freshLibrary(1, 30);
    const base = input(fx);
    const intro = fx.cards.slice(0, 10);
    // 8 слов — «Уверенно», 2 — «Не знаю» (остались на шаге 0)
    for (const c of intro.slice(0, 8)) base.cards[c.id] = { ...c, learningStep: 1, nextReviewDate: NOW + DAY };
    const plan = buildLessonPlan({ ...base, day: { ...base.day, introducedIds: intro.map((c) => c.id) } });
    expect(plan.state).toBe('mistakes');
    expect(plan.mistakeIds).toEqual(intro.slice(8).map((c) => c.id));
    expect(plan.newIds).toHaveLength(0);
  });

  it('«Ещё 10 новых» после урока — следующие 10 слов', () => {
    const fx = freshLibrary(1, 30);
    const base = input(fx);
    const intro = fx.cards.slice(0, 10);
    for (const c of intro) base.cards[c.id] = { ...c, learningStep: 1, nextReviewDate: NOW + DAY };
    const plan = buildLessonPlan({
      ...base,
      day: { ...base.day, introducedIds: intro.map((c) => c.id), extraNew: 10 },
    });
    expect(plan.state).toBe('lesson');
    expect(plan.newIds).toEqual(fx.cards.slice(10, 20).map((c) => c.id));
  });

  it('текущий набор: выбранный вручную → последний изученный → первый в списке', () => {
    const fx = freshLibrary(3, 10);
    fx.sets[2] = { ...fx.sets[2], lastStudiedAt: NOW - DAY };
    expect(buildLessonPlan(input(fx)).focusSetId).toBe('s3');
    expect(buildLessonPlan(input(fx, { focusSetId: 's2' })).focusSetId).toBe('s2');
    // Выбранный набор без новых слов — не держимся за него
    const fx2 = freshLibrary(2, 10);
    fx2.cards = fx2.cards.filter((c) => c.setId !== 's2');
    fx2.cards.push(studiedCard('s2', 3 * DAY));
    expect(buildLessonPlan(input(fx2, { focusSetId: 's2' })).focusSetId).toBe('s1');
  });

  it('наборы с новыми словами — в порядке списка, показанные сегодня не считаются', () => {
    const fx = freshLibrary(3, 10);
    fx.cards = fx.cards.filter((c) => c.setId !== 's2');
    fx.cards.push(studiedCard('s2', 3 * DAY));
    const base = input(fx);
    const introduced = fx.cards.filter((c) => c.setId === 's1').slice(0, 4).map((c) => c.id);
    const plan = buildLessonPlan({ ...base, day: { ...base.day, introducedIds: introduced } });
    expect(plan.newSets).toEqual([
      { setId: 's1', title: 'Набор s1', newLeft: 6 },
      { setId: 's3', title: 'Набор s3', newLeft: 10 },
    ]);
    expect(plan.focusManual).toBe(false);
    expect(buildLessonPlan(input(fx, { focusSetId: 's3' })).focusManual).toBe(true);
  });

  it('считаются только переданные наборы (текущий курс)', () => {
    const fx = freshLibrary(2, 10);
    fx.cards.push(...due('s2', 5));
    const all = input(fx);
    const onlyFirst = buildLessonPlan({ ...all, sets: [fx.sets[0]] });
    expect(onlyFirst.reviewIds).toHaveLength(0);
    expect(onlyFirst.newLeftTotal).toBe(10);
  });

  it('новые — только из открытого курса (newFrom), повторение — из всех наборов', () => {
    const fx = freshLibrary(2, 10);
    fx.cards.push(...due('s2', 5));
    const plan = buildLessonPlan({ ...input(fx), newFrom: [fx.sets[0]] });
    expect(plan.reviewIds).toHaveLength(5);
    expect(plan.newIds).toHaveLength(10);
    expect(plan.newIds.every((id) => id.startsWith('s1-'))).toBe(true);
    expect(plan.focusSetId).toBe('s1');
    expect(plan.newLeftTotal).toBe(10);
  });

  it('нет карточек — empty', () => {
    const plan = buildLessonPlan(input({ sets: [makeSet('s1')], cards: [] }));
    expect(plan.state).toBe('empty');
    expect(plan.minutes).toBe(0);
  });
});

describe('ensureLessonDay', () => {
  it('сегодняшний день не трогает, вчерашний сбрасывает и сохраняет выбранный набор', () => {
    const today = ensureLessonDay(null, '2026-10-01', 12);
    const used = { ...today, reviewedIds: ['x'], focusSetId: 's2' };
    expect(ensureLessonDay(used, '2026-10-01', 40)).toBe(used);
    const next = ensureLessonDay(used, '2026-10-02', 7);
    expect(next).toEqual({
      date: '2026-10-02',
      startWaiting: 7,
      reviewedIds: [],
      introducedIds: [],
      extraNew: 0,
      focusSetId: 's2',
    });
  });
});

describe('переходы дня', () => {
  const day = ensureLessonDay(null, '2026-10-01', 5);

  it('ответ записывается в свою часть урока один раз', () => {
    const a = recordLessonAnswer(day, 'review', 'c1');
    expect(a.reviewedIds).toEqual(['c1']);
    const b = recordLessonAnswer(a, 'new', 'c2');
    expect(b.introducedIds).toEqual(['c2']);
    // Повторный ответ (например, исправление ошибки) — день не меняется
    expect(recordLessonAnswer(b, 'review', 'c2')).toBe(b);
    expect(recordLessonAnswer(b, 'review', 'c1')).toBe(b);
  });

  it('«Ещё 10 новых» и выбор набора', () => {
    expect(addExtraNew(addExtraNew(day)).extraNew).toBe(20);
    const focused = setFocusSet(day, 's3');
    expect(focused.focusSetId).toBe('s3');
    expect(setFocusSet(focused, 's3')).toBe(focused);
    expect(setFocusSet(focused, null).focusSetId).toBeNull();
  });
});

describe('estimateMinutes', () => {
  it('как в таблице плана', () => {
    expect(estimateMinutes(0, 10)).toBe(4);
    expect(estimateMinutes(10, 10)).toBe(6);
    expect(estimateMinutes(25, 5)).toBe(8);
    expect(estimateMinutes(30, 0)).toBe(8);
    expect(estimateMinutes(1, 0)).toBe(1);
    expect(estimateMinutes(0, 0)).toBe(0);
  });
});

describe('buildSetSessionPlan', () => {
  const LATER = 2 * DAY;
  const set = makeSet('s1');

  function session(cards: Card[], day: Partial<LessonDay> = {}, extra: Partial<SetSessionInput> = {}) {
    return buildSetSessionPlan({
      set,
      cards,
      newPerDay: 10,
      day: { ...ensureLessonDay(null, '2026-10-01', 0), ...day },
      now: NOW,
      ...extra,
    });
  }
  const fresh = (n: number) => Array.from({ length: n }, () => newCard('s1'));
  /** Изучали, повторять рано */
  const seen = (n: number, step = 1) => Array.from({ length: n }, () => studiedCard('s1', LATER, step));
  /** Ошиблись после «Уверенно»: шаг упал до 0, но ответ был */
  const failed = () => ({ ...newCard('s1'), lastReviewDate: NOW - DAY, nextReviewDate: NOW - DAY });

  it('пустой набор и меньше 4 слов', () => {
    expect(session([])).toMatchObject({ mode: 'empty', cardIds: [], stages: [], minutes: 0 });
    expect(session(fresh(3))).toMatchObject({ mode: 'tooFew', cardIds: [], missingCards: 1, totalCount: 3 });
  });

  it('новый набор: первые 5 слов по порядку добавления, 6 этапов, около 7 минут', () => {
    const cards = fresh(15);
    const plan = session(cards);
    expect(plan.mode).toBe('learn');
    expect(plan.cardIds).toEqual(cards.slice(0, 5).map((c) => c.id));
    expect(plan.newCount).toBe(5);
    expect(plan.stages).toEqual(['cards', 'pairs', 'test', 'listen', 'context', 'build']);
    expect(plan.minutes).toBe(7);
    expect(plan).toMatchObject({ totalCount: 15, studiedCount: 0 });
  });

  it('после сессии: изученные не возвращаются в «Изучить», берутся слова 6–10', () => {
    const first = seen(5);
    const rest = fresh(10);
    const plan = session([...first, ...rest]);
    expect(plan.mode).toBe('learn');
    expect(plan.cardIds).toEqual(rest.slice(0, 5).map((c) => c.id));
    expect(plan.studiedCount).toBe(5);
  });

  it('ошибка после «Уверенно»: слово слабое — «Повторить», а не новое', () => {
    const weak = failed();
    const plan = session([...seen(4), weak, ...fresh(5)]);
    expect(plan.mode).toBe('review');
    expect(plan.cardIds).toEqual([weak.id]);
    expect(plan.stages).toEqual(['test', 'listen', 'build']);
    expect(plan.studiedCount).toBe(5);
  });

  it('показано сегодня в уроке, ответ ещё не дошёл до сервера — тоже не новое', () => {
    const local = newCard('s1');
    const plan = session([local, ...seen(4)], { introducedIds: [local.id] });
    expect(plan.mode).toBe('review');
    expect(plan.cardIds).toEqual([local.id]);
  });

  it('повторение снизу вверх: сначала нижний уровень, внутри — самый просроченный', () => {
    const young = studiedCard('s1', -3 * DAY, 3);
    const learningLate = studiedCard('s1', -2 * DAY, 1);
    const learningSoon = studiedCard('s1', -60 * 1000, 1);
    const learning2 = studiedCard('s1', -5 * DAY, 2);
    const plan = session([young, learningSoon, learning2, learningLate, ...fresh(3)]);
    expect(plan.mode).toBe('review');
    expect(plan.cardIds).toEqual([learningLate.id, learningSoon.id, learning2.id, young.id]);
  });

  it('повторение — не больше 10 слов', () => {
    const cards = Array.from({ length: 14 }, (_, i) => studiedCard('s1', -(i + 1) * 60 * 60 * 1000));
    const plan = session(cards);
    expect(plan.cardIds).toHaveLength(10);
    expect(plan.minutes).toBe(4);
  });

  it('новых меньше 5 — добираем learning с самым низким шагом, young не берём', () => {
    const newOnes = fresh(3);
    const step2 = studiedCard('s1', LATER, 2);
    const step1 = studiedCard('s1', LATER + DAY, 1);
    const young = studiedCard('s1', LATER, 3);
    const plan = session([young, step2, ...newOnes, step1]);
    expect(plan.mode).toBe('learn');
    expect(plan.cardIds).toEqual([...newOnes.map((c) => c.id), step1.id, step2.id]);
    expect(plan.newCount).toBe(3);
  });

  it('квота дня общая с уроком: выбрана — «Изучить ещё 5», «ещё» по кнопке её добавляет', () => {
    const cards = [...seen(5), ...fresh(10)];
    const today = Array.from({ length: 10 }, (_, i) => `other-${i}`);
    expect(session(cards, { introducedIds: today }).mode).toBe('more');
    expect(session(cards, { introducedIds: today.slice(0, 9) }).mode).toBe('learn');
    expect(session(cards, { introducedIds: today, extraNew: 10 }).mode).toBe('learn');
    // Квота та же, что у урока дня
    expect(newQuotaOf({ ...ensureLessonDay(null, '2026-10-01', 25) }, 10)).toBe(5);
  });

  it('новых нет, повторять рано — «Повторить набор» из 5 самых слабых', () => {
    const step3 = seen(3, 3);
    const step1 = seen(2, 1);
    const step2 = seen(2, 2);
    const plan = session([...step3, ...step2, ...step1]);
    expect(plan.mode).toBe('again');
    expect(plan.cardIds).toEqual([...step1, ...step2, step3[0]].map((c) => c.id));
    expect(plan.stages).toEqual(['test', 'listen', 'build']);
  });

  it('предмет: Карточки → Пары → Тест, повторение только Тест', () => {
    const subject = makeSet('s1', { kind: 'subject' });
    expect(session(fresh(6), {}, { set: subject }).stages).toEqual(['cards', 'pairs', 'test']);
    expect(session([failed(), ...seen(4)], {}, { set: subject }).stages).toEqual(['test']);
  });
});
