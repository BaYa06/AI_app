import { describe, expect, it } from '@jest/globals';
import type { LessonPlan } from '@/services/LessonService';
import { isLessonStartable, lessonComposition, lessonHint, lessonTitle } from '../lessonText';

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

  it('всё сделано — запускать нечего', () => {
    expect(isLessonStartable(plan({ state: 'done' }))).toBe(false);
    expect(lessonHint(plan({ state: 'done' }))).toBeNull();
  });
});
