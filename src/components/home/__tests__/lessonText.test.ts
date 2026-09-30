import { describe, expect, it } from '@jest/globals';
import type { LessonPlan } from '@/services/LessonService';
import {
  isLessonStartable,
  lessonCardContent,
  lessonComposition,
  lessonHint,
  lessonTitle,
  streakRiskHoursLeft,
  finishDateText,
} from '../lessonText';

const opts = { streakDays: 8, extraNewStep: 10 };

const ids = (n: number, p = 'c') => Array.from({ length: n }, (_, i) => `${p}${i}`);

function plan(extra: Partial<LessonPlan>): LessonPlan {
  return {
    state: 'lesson',
    reviewIds: [],
    newIds: [],
    mistakeIds: [],
    focusSetId: 's1',
    focusSetTitle: 'Английский B1',
    focusSetSeen: 18,
    focusSetTotal: 30,
    minutes: 6,
    waitingTotal: 0,
    fadingCount: 0,
    tomorrowCount: 0,
    newLeftTotal: 100,
    newQuota: 10,
    doneToday: 0,
    newSets: [
      { setId: 's1', title: 'Английский B1', newLeft: 12 },
      { setId: 's2', title: 'Глаголы', newLeft: 30 },
    ],
    focusManual: false,
    newDaysLeft: 0,
    ...extra,
  };
}

describe('тексты урока', () => {
  it('обычный день', () => {
    const p = plan({ reviewIds: ids(10), newIds: ids(10, 'n'), waitingTotal: 10 });
    expect(lessonTitle(p)).toBe('Урок дня · 10 повторить + 10 новых · ~6 мин');
    expect(lessonHint(p)).toBe('Английский B1 · 18 из 30');
  });

  it('первый день', () => {
    const p = plan({ state: 'first', newIds: ids(10), minutes: 4, focusSetSeen: 0 });
    expect(lessonTitle(p)).toBe('Урок дня · 10 новых слов · ~4 мин');
    expect(lessonHint(p)).toBe('Начинаем с «Английский B1»');
  });

  it('накопилось', () => {
    const p = plan({ state: 'overdue', reviewIds: ids(30), minutes: 8, waitingTotal: 45 });
    expect(lessonTitle(p)).toBe('Урок дня · 30 повторить · ~8 мин');
    expect(lessonHint(p)).toBe('Новые слова вернутся завтра · ещё ждут 15');
  });

  it('угасающие слова — первая причина', () => {
    const p = plan({ reviewIds: ids(12), newIds: ids(10, 'n'), fadingCount: 4, waitingTotal: 12 });
    expect(lessonHint(p)).toBe('4 начинают забываться · Английский B1 · 18 из 30');
  });

  it('ошибки дня', () => {
    const p = plan({ state: 'mistakes', mistakeIds: ids(3), minutes: 1 });
    expect(lessonTitle(p)).toBe('Исправь ошибки · 3 слова · ~1 мин');
    expect(isLessonStartable(p)).toBe(true);
  });

  it('склонения', () => {
    expect(lessonComposition({ reviewIds: [], newIds: ids(1) })).toBe('1 новое слово');
    expect(lessonComposition({ reviewIds: [], newIds: ids(3) })).toBe('3 новых слова');
    expect(lessonComposition({ reviewIds: ids(2), newIds: ids(1) })).toBe('2 повторить + 1 новое');
  });

  it('карточка: обычный день — заливка, кольцо прогресса дня', () => {
    const c = lessonCardContent(plan({ reviewIds: ids(10), newIds: ids(10, 'n'), doneToday: 5 }), opts);
    expect(c).toMatchObject({
      calm: false,
      overline: 'Сегодня',
      title: 'Урок дня',
      meta: '10 повторить + 10 новых · ~6 мин',
      hint: 'Английский B1 · 18 из 30',
      action: 'Начать',
      kind: 'start',
      progress: { done: 5, total: 25 },
    });
  });

  it('карточка: первый день и накопилось', () => {
    expect(lessonCardContent(plan({ state: 'first', newIds: ids(10), minutes: 4 }), opts)?.overline).toBe('День 1');
    const overdue = lessonCardContent(plan({ state: 'overdue', reviewIds: ids(30), minutes: 8, waitingTotal: 30 }), opts);
    expect(overdue).toMatchObject({ overline: 'Накопилось повторение', meta: '30 повторить · ~8 мин', hint: 'Новые слова вернутся завтра' });
  });

  it('карточка: ошибки дня', () => {
    const c = lessonCardContent(plan({ state: 'mistakes', mistakeIds: ids(3), minutes: 1, doneToday: 20 }), opts);
    expect(c).toMatchObject({ title: 'Исправь ошибки', meta: '3 слова · ~1 мин', action: 'Повторить', progress: { done: 20, total: 23 } });
  });

  it('карточка: всё сделано — спокойная, «ещё 10 новых», серия и завтра', () => {
    const c = lessonCardContent(plan({ state: 'done', tomorrowCount: 14, doneToday: 20 }), opts);
    expect(c).toMatchObject({
      calm: true,
      title: 'Готово на сегодня',
      meta: 'Серия 8 дней',
      hint: 'Завтра 14 слов',
      action: 'Ещё 10 новых',
      kind: 'extraNew',
      progress: null,
    });
    expect(lessonCardContent(plan({ state: 'done' }), { streakDays: 0, extraNewStep: 10 })?.meta).toBeNull();
  });

  it('карточка: все слова пройдены — найти новый набор', () => {
    const c = lessonCardContent(plan({ state: 'finished', tomorrowCount: 1 }), opts);
    expect(c).toMatchObject({ calm: true, title: 'Все слова пройдены', hint: 'Завтра 1 слово', kind: 'findSet' });
  });

  it('серия под угрозой: только вечером, без выполненной цели, серия от 3 дней', () => {
    const at = (h: number, m = 0) => new Date(2026, 9, 1, h, m);
    expect(streakRiskHoursLeft(at(19, 30), 7, false)).toBe(4);
    expect(streakRiskHoursLeft(at(23, 20), 7, false)).toBe(0);
    expect(streakRiskHoursLeft(at(18, 59), 7, false)).toBeNull();
    expect(streakRiskHoursLeft(at(21), 7, true)).toBeNull();
    expect(streakRiskHoursLeft(at(21), 2, false)).toBeNull();
  });

  it('карточка: серия под угрозой — тот же урок, другой заголовок', () => {
    const base = plan({ reviewIds: ids(10), newIds: ids(10, 'n') });
    const c = lessonCardContent(base, { ...opts, streakDays: 7, streakRiskHours: 3 });
    expect(c).toMatchObject({
      calm: false,
      overline: 'Серия под угрозой',
      title: 'Сохрани серию: 7 дней',
      meta: '10 повторить + 10 новых · ~6 мин',
      hint: 'До полуночи 3 ч',
      action: 'Начать',
      kind: 'start',
    });
    expect(lessonCardContent(base, { ...opts, streakDays: 22, streakRiskHours: 0 })).toMatchObject({
      title: 'Сохрани серию: 22 дня',
      hint: 'До полуночи меньше часа',
    });
    // Ошибки и «всё сделано» — без серии: урок уже пройден
    expect(lessonCardContent(plan({ state: 'mistakes', mistakeIds: ids(2) }), { ...opts, streakRiskHours: 3 })?.title).toBe('Исправь ошибки');
    expect(lessonCardContent(plan({ state: 'done' }), { ...opts, streakRiskHours: 3 })?.title).toBe('Готово на сегодня');
  });

  it('карточка: склонения в серии и «завтра»', () => {
    expect(lessonCardContent(plan({ state: 'done', tomorrowCount: 2 }), { ...opts, streakDays: 1 })).toMatchObject({
      meta: 'Серия 1 день',
      hint: 'Завтра 2 слова',
    });
    expect(lessonCardContent(plan({ state: 'done', tomorrowCount: 21 }), { ...opts, streakDays: 3 })).toMatchObject({
      meta: 'Серия 3 дня',
      hint: 'Завтра 21 слово',
    });
  });

  it('«Сменить набор» — только когда в уроке есть новые и наборов с ними больше одного', () => {
    const withNew = plan({ reviewIds: ids(5), newIds: ids(10, 'n') });
    expect(lessonCardContent(withNew, opts)?.secondary).toBe('Сменить набор');
    expect(lessonCardContent(withNew, { ...opts, streakDays: 7, streakRiskHours: 2 })?.secondary).toBe('Сменить набор');
    expect(lessonCardContent(plan({ reviewIds: ids(5) }), opts)?.secondary).toBeNull();
    const oneSet = plan({ newIds: ids(10), newSets: [{ setId: 's1', title: 'Английский B1', newLeft: 12 }] });
    expect(lessonCardContent(oneSet, opts)?.secondary).toBeNull();
    expect(lessonCardContent(plan({ state: 'done' }), opts)?.secondary).toBeNull();
    expect(lessonCardContent(plan({ state: 'mistakes', mistakeIds: ids(2) }), opts)?.secondary).toBeNull();
  });

  it('дата «все слова к…»: 300 слов по 10 в день — через 29 дней после сегодня', () => {
    const now = new Date(2026, 9, 1, 10, 0);
    const p = plan({ state: 'first', newIds: ids(10), newLeftTotal: 300, newDaysLeft: 29 });
    expect(finishDateText(p, now)).toBe('Все слова — примерно к 30 октября');
    expect(lessonHint(p, now)).toBe('Начинаем с «Английский B1» · Все слова — примерно к 30 октября');
    // Переход через год — с годом
    expect(finishDateText(plan({ newLeftTotal: 300, newDaysLeft: 40 }), new Date(2026, 11, 1))).toBe(
      'Все слова — примерно к 10 января 2027',
    );
  });

  it('дата: не показываем, если слов мало, новых в уроке нет или подпись занята', () => {
    const now = new Date(2026, 9, 1);
    expect(finishDateText(plan({ newLeftTotal: 20, newDaysLeft: 2 }), now)).toBeNull();
    expect(finishDateText(plan({ newLeftTotal: 300, newDaysLeft: 0 }), now)).toBeNull();
    // Урок без новых — дата не к месту
    expect(lessonHint(plan({ reviewIds: ids(10), waitingTotal: 10, newLeftTotal: 300, newDaysLeft: 30 }), now)).toBeNull();
    // Две причины важнее даты
    const busy = plan({ reviewIds: ids(10), newIds: ids(10, 'n'), fadingCount: 3, waitingTotal: 10, newLeftTotal: 300, newDaysLeft: 29 });
    expect(lessonHint(busy, now)).toBe('3 начинают забываться · Английский B1 · 18 из 30');
  });

  it('карточка: нет карточек — не показываем', () => {
    expect(lessonCardContent(plan({ state: 'empty' }), opts)).toBeNull();
  });

  it('всё сделано — запускать нечего', () => {
    expect(isLessonStartable(plan({ state: 'done' }))).toBe(false);
    expect(lessonHint(plan({ state: 'done' }))).toBeNull();
  });
});
