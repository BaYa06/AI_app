import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Отправка активности — подмена: копим прибавки, которые ушли бы на сервер
const mockSent: number[] = [];
let mockSaved = true;
let mockToday = '2026-10-30';
jest.mock('@/services/StreakService', () => ({
  getLocalDateKey: () => mockToday,
  StreakService: {
    recordActivity: async ({ cardsDelta }: { cardsDelta: number }) => {
      if (mockSaved) mockSent.push(cardsDelta);
      return { saved: mockSaved, counted: false };
    },
    fetchUserStats: async () => null,
  },
}));
jest.mock('react-native', () => ({ Appearance: { getColorScheme: () => 'light', addChangeListener: () => {} } }));
jest.mock('@/constants', () => ({ colors: { light: {}, dark: {} } }));
jest.mock('@/services/localCache', () => ({ readCache: () => undefined }));
jest.mock('@/services/StorageService', () => ({ StorageService: { getObject: () => null }, STORAGE_KEYS: {} }));
jest.mock('@/services/NeonService', () => ({ NeonService: {} }));
jest.mock('@/services', () => ({ supabase: {} }));
jest.mock('@/services/LessonService', () => ({ DEFAULT_NEW_PER_DAY: 10 }));

import { useSettingsStore } from '../settingsStore';

const store = () => useSettingsStore.getState();
const study = (n: number) => {
  for (let i = 0; i < n; i++) store().incrementTodayCards();
};
const total = () => mockSent.reduce((a, b) => a + b, 0);

describe('settingsStore.finishStudySession', () => {
  beforeEach(() => {
    mockSent.length = 0;
    mockSaved = true;
    mockToday = '2026-10-30';
    store().resetTodayStats();
  });

  it('две сессии по 10 карточек со сворачиванием и «назад» — на сервер уходит ровно 20', async () => {
    study(10);
    await store().finishStudySession(); // уход в фон
    await store().finishStudySession(); // «назад»
    study(10);
    await store().finishStudySession(); // конец сессии
    expect(total()).toBe(20);
    expect(store().todayStats.cardsStudied).toBe(20);
  });

  it('«назад» и фон почти одновременно — карточки не отправляются дважды', async () => {
    study(7);
    await Promise.all([store().finishStudySession(), store().finishStudySession()]);
    expect(mockSent).toEqual([7]);
  });

  it('не записалось — карточки уходят со следующей отправкой', async () => {
    study(5);
    mockSaved = false;
    await store().finishStudySession();
    expect(total()).toBe(0);
    mockSaved = true;
    study(3);
    await store().finishStudySession();
    expect(mockSent).toEqual([8]);
  });

  it('новый день — счёт с нуля', async () => {
    study(4);
    await store().finishStudySession();
    mockToday = '2026-10-31';
    study(2);
    await store().finishStudySession();
    expect(mockSent).toEqual([4, 2]);
  });
});
