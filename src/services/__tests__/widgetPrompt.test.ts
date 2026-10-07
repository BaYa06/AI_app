import { describe, expect, it, jest } from '@jest/globals';

jest.mock('react-native', () => ({ Platform: { OS: 'ios', Version: '17.0' } }));
jest.mock('../localCache', () => ({ readCache: () => undefined, writeCache: () => {} }));
jest.mock('../widgetBridge', () => ({ isWidgetSupported: true }));

import { addLessonDay, markPromptShown, shouldShowWidgetPrompt, type WidgetPromptState } from '../widgetPrompt';

const ok = { supported: true, installed: false };
const empty: WidgetPromptState = { lessonDays: [], shownDays: [] };

describe('widgetPrompt', () => {
  it('не в первый день с уроком, а со второго', () => {
    const day1 = addLessonDay(empty, '2026-10-07');
    expect(shouldShowWidgetPrompt(day1, '2026-10-07', ok)).toBe(false);
    const day2 = addLessonDay(day1, '2026-10-08');
    expect(shouldShowWidgetPrompt(day2, '2026-10-08', ok)).toBe(true);
  });

  it('два урока в один день — всё ещё один день', () => {
    const state = addLessonDay(addLessonDay(empty, '2026-10-07'), '2026-10-07');
    expect(state.lessonDays).toEqual(['2026-10-07']);
  });

  it('не больше двух раз и не дважды в один день', () => {
    let state = addLessonDay(addLessonDay(empty, '2026-10-07'), '2026-10-08');
    state = markPromptShown(state, '2026-10-08');
    expect(shouldShowWidgetPrompt(state, '2026-10-08', ok)).toBe(false);
    expect(shouldShowWidgetPrompt(state, '2026-10-09', ok)).toBe(true);
    state = markPromptShown(state, '2026-10-09');
    expect(shouldShowWidgetPrompt(state, '2026-10-12', ok)).toBe(false);
  });

  it('не показываем, если виджет уже стоит или его нет на устройстве', () => {
    const state = addLessonDay(addLessonDay(empty, '2026-10-07'), '2026-10-08');
    expect(shouldShowWidgetPrompt(state, '2026-10-08', { supported: true, installed: true })).toBe(false);
    expect(shouldShowWidgetPrompt(state, '2026-10-08', { supported: false, installed: false })).toBe(false);
  });
});
