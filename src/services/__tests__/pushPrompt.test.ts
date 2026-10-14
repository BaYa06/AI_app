import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../localCache', () => ({ readCache: () => undefined, writeCache: () => {} }));
jest.mock('../supabaseClient', () => ({ supabase: {} }));
jest.mock('@/config/apiBase', () => ({ API_BASE: '' }));

import { markPushPromptShown, shouldShowPushPrompt, suggestedSlot } from '../pushPrompt';

const ask = { permission: 'default', supported: true };

describe('pushPrompt', () => {
  it('первый урок — показываем, если разрешение ещё не спрашивали', () => {
    expect(shouldShowPushPrompt({ shownDays: [] }, '2026-10-14', ask)).toBe(true);
    expect(shouldShowPushPrompt({ shownDays: [] }, '2026-10-14', { ...ask, permission: 'granted' })).toBe(false);
    expect(shouldShowPushPrompt({ shownDays: [] }, '2026-10-14', { ...ask, permission: 'denied' })).toBe(false);
    expect(shouldShowPushPrompt({ shownDays: [] }, '2026-10-14', { ...ask, supported: false })).toBe(false);
  });

  it('«Не сейчас» — снова не раньше чем через 3 дня', () => {
    const state = markPushPromptShown({ shownDays: [] }, '2026-10-14');
    expect(shouldShowPushPrompt(state, '2026-10-14', ask)).toBe(false);
    expect(shouldShowPushPrompt(state, '2026-10-16', ask)).toBe(false);
    expect(shouldShowPushPrompt(state, '2026-10-17', ask)).toBe(true);
  });

  it('не больше 3 попыток', () => {
    const state = { shownDays: ['2026-10-01', '2026-10-05', '2026-10-09'] };
    expect(shouldShowPushPrompt(state, '2026-10-20', ask)).toBe(false);
  });

  it('время по умолчанию — близкое к текущему уроку', () => {
    expect(suggestedSlot(8)).toBe('morning');
    expect(suggestedSlot(14)).toBe('day');
    expect(suggestedSlot(21)).toBe('evening');
  });
});
