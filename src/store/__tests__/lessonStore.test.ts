import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Хранилище устройства — в памяти; владелец кэша переключается, как при смене аккаунта
const mockMemory = new Map<string, unknown>();
let mockOwner = 'user-a';
jest.mock('@/services/localCache', () => ({
  readCache: (name: string) => mockMemory.get(`${mockOwner}:${name}`),
  writeCache: (name: string, value: unknown) => {
    mockMemory.set(`${mockOwner}:${name}`, value);
  },
}));

let mockToday = '2026-10-01';
jest.mock('../challengeStore', () => ({ localDay: () => mockToday }));

import { useLessonStore } from '../lessonStore';

const store = () => useLessonStore.getState();

describe('lessonStore', () => {
  beforeEach(() => {
    mockMemory.clear();
    mockOwner = 'user-a';
    mockToday = '2026-10-01';
  });

  it('утренний снимок берётся один раз за день', () => {
    expect(store().ensureToday(12).startWaiting).toBe(12);
    expect(store().ensureToday(3).startWaiting).toBe(12);
  });

  it('ответы и «ещё 10 новых» сохраняются на устройстве', () => {
    store().ensureToday(10);
    store().recordAnswer('review', 'c1');
    store().recordAnswer('new', 'c2');
    store().addExtraNew();
    const saved = mockMemory.get('user-a:lesson_day') as { reviewedIds: string[]; introducedIds: string[]; extraNew: number };
    expect(saved.reviewedIds).toEqual(['c1']);
    expect(saved.introducedIds).toEqual(['c2']);
    expect(saved.extraNew).toBe(10);
    expect(store().day?.introducedIds).toEqual(['c2']);
  });

  it('новый день — счётчики обнуляются, выбранный набор остаётся', () => {
    store().ensureToday(10);
    store().recordAnswer('review', 'c1');
    store().setFocusSet('s2');
    mockToday = '2026-10-02';
    const next = store().ensureToday(4);
    expect(next).toMatchObject({ date: '2026-10-02', startWaiting: 4, reviewedIds: [], focusSetId: 's2' });
  });

  it('другой аккаунт не видит чужой урок', () => {
    store().ensureToday(10);
    store().recordAnswer('review', 'c1');
    mockOwner = 'user-b';
    expect(store().ensureToday(0).reviewedIds).toEqual([]);
  });

  it('ответ после полуночи попадает в новый день', () => {
    store().ensureToday(10);
    store().recordAnswer('review', 'c1');
    mockToday = '2026-10-02';
    store().recordAnswer('review', 'c2');
    expect(store().day).toMatchObject({ date: '2026-10-02', reviewedIds: ['c2'] });
  });
});
