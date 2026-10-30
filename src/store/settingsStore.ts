/**
 * Store для настроек и темы
 */
import { Appearance } from 'react-native';
import { readCache, writeCache } from '@/services/localCache';
import { StorageService, STORAGE_KEYS } from '@/services/StorageService';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { UserSettings, ThemeMode } from '@/types';
import { colors, ColorScheme } from '@/constants';
import { StreakService } from '@/services/StreakService';
import { NeonService } from '@/services/NeonService';
import { supabase } from '@/services';
import { DEFAULT_NEW_PER_DAY } from '@/services/LessonService';

interface SettingsState {
  // Настройки пользователя
  settings: UserSettings;
  
  // Тема
  themeMode: ThemeMode;
  resolvedTheme: ThemeMode; // Разрешенная тема (если system - то light/dark)
  colors: ColorScheme;
  
  // Статистика за сегодня (для быстрого доступа)
  todayStats: {
    cardsStudied: number;
    /** Сколько из cardsStudied уже отправлено на сервер — отправляем только разницу */
    cardsSynced: number;
    streak: number;
    longestStreak: number;
    lastStudyDate: string; // YYYY-MM-DD
  };
  
  // Кеш статистики из БД
  streakCache: {
    currentStreak: number;
    longestStreak: number;
    lastActiveDate: string | null;
    loaded: boolean;
  };

  // Является ли текущий пользователь учителем (null — ещё не загружено)
  isTeacher: boolean | null;
}

interface SettingsActions {
  // Настройки
  updateSettings: (updates: Partial<UserSettings>) => void;
  
  // Тема
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  
  // Статистика за сегодня
  incrementTodayCards: () => void;
  finishStudySession: () => Promise<{ streakIncreased: boolean; newStreakCount: number }>;
  updateStreak: (streak: number) => void;
  resetTodayStats: () => void;

  // Синхронизация стрика
  syncStreakFromServer: (data: { currentStreak: number; longestStreak: number; lastActiveDate: string | null }) => void;

  // Роль учителя — загружается заново при каждом фокусе Home, а не один раз за сессию
  fetchIsTeacher: (userId: string) => Promise<void>;

  // Сброс
  resetSettings: () => void;
}

const defaultSettings: UserSettings = {
  dailyNewCardsLimit: 20,
  lessonNewPerDay: DEFAULT_NEW_PER_DAY,
  widgetSetId: null,
  widgetDirection: 'auto',
  widgetHideAnswer: false,
  dailyReviewLimit: 100,
  studyCardLimit: 20,
  reminderEnabled: false,
  reminderTime: '09:00',
  theme: 'system',
  language: 'ru',
  soundEnabled: true,
  hapticEnabled: true,
  reverseCards: false,
  swipeHintsLeft: 3,
};

import { getLocalDateKey } from '@/services/StreakService';

const getTodayDate = () => getLocalDateKey();

/** 'system' → светлая/тёмная по настройке устройства */
function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

/**
 * Настройки с прошлого запуска. MMKV читается синхронно, поэтому выбранная тема применяется
 * с первого кадра, а не после загрузки данных в DatabaseService (раньше мигала светлая тема).
 */
function initialSettings(): UserSettings {
  try {
    const saved = StorageService.getObject<UserSettings>(STORAGE_KEYS.SETTINGS);
    return saved ? { ...defaultSettings, ...saved } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

const startSettings = initialSettings();
const startTheme = resolveTheme(startSettings.theme);

/** Серия, сохранённая при прошлом запуске (StreakService кэширует user_stats) */
function initialStreakCache() {
  const cached = readCache<{ current_streak?: number; longest_streak?: number; last_active_date?: string | null }>('user_stats');
  return {
    currentStreak: cached?.current_streak ?? 0,
    longestStreak: cached?.longest_streak ?? 0,
    lastActiveDate: cached?.last_active_date ?? null,
    loaded: !!cached,
  };
}

export const useSettingsStore = create<SettingsState & SettingsActions>()(
  immer((set, get) => ({
    // Начальное состояние
    settings: startSettings,
    themeMode: startSettings.theme,
    resolvedTheme: startTheme,
    colors: colors[startTheme] as any,
    todayStats: {
      cardsStudied: 0,
      cardsSynced: 0,
      streak: 0,
      longestStreak: 0,
      lastStudyDate: getTodayDate(),
    },
    // Серия с прошлого запуска — показываем сразу, сервер обновит (syncStreakFromServer)
    streakCache: initialStreakCache(),
    // Роль с прошлого запуска — блоки главной видны с первого кадра, сервер уточнит (fetchIsTeacher)
    isTeacher: readCache<boolean>('is_teacher') ?? null,

    // ==================== НАСТРОЙКИ ====================
    
    updateSettings: (updates) => {
      set((state) => {
        Object.assign(state.settings, updates);
      });
      
      // Обновляем тему если изменилась (вне Immer)
      if (updates.theme) {
        const resolved = resolveTheme(updates.theme);
        set({ 
          themeMode: updates.theme,
          resolvedTheme: resolved,
          colors: colors[resolved] as any
        });
      }
    },

    // ==================== ТЕМА ====================
    
    setTheme: (mode) => {
      const resolved = resolveTheme(mode);
      set((state) => {
        state.themeMode = mode;
        state.resolvedTheme = resolved;
        state.settings.theme = mode;
      });
      // Обновляем colors вне Immer
      set({ colors: colors[resolved] as any });
    },

    toggleTheme: () => {
      const current = get().resolvedTheme;
      const newTheme = current === 'light' ? 'dark' : 'light';
      get().setTheme(newTheme);
    },

    // ==================== СТАТИСТИКА ====================
    
    incrementTodayCards: () => {
      set((state) => {
        const today = getTodayDate();

        // Сбрасываем если новый день
        if (state.todayStats.lastStudyDate !== today) {
          state.todayStats.cardsStudied = 0;
          state.todayStats.cardsSynced = 0;
          state.todayStats.lastStudyDate = today;
        }

        state.todayStats.cardsStudied++;
      });
    },

    finishStudySession: async () => {
      // Отправляем только карточки с прошлой отправки: раньше каждый вызов («назад», уход в фон,
      // конец сессии) снова прибавлял все карточки дня (plan/new/card_rating.md, Cards 6)
      const { cardsStudied, cardsSynced } = get().todayStats;
      const cardsDelta = cardsStudied - cardsSynced;
      if (cardsDelta <= 0) return { streakIncreased: false, newStreakCount: 0 };

      // Отмечаем до await: «назад» и уход в фон вызывают это почти одновременно
      set((state) => {
        state.todayStats.cardsSynced += cardsDelta;
      });
      // Не записалось — вернём карточки, они уйдут со следующей отправкой
      const rollback = () =>
        set((state) => {
          state.todayStats.cardsSynced = Math.max(0, state.todayStats.cardsSynced - cardsDelta);
        });

      const lastActiveDate = get().streakCache.lastActiveDate;
      const today = getTodayDate();
      const wasAlreadyActiveToday = lastActiveDate === today;

      try {
        const { saved, counted: success } = await StreakService.recordActivity({
          cardsDelta,
          wordsDelta: cardsDelta,
          minutesDelta: Math.max(1, Math.round(cardsDelta / 5)),
        });
        if (!saved) rollback();

        if (success && !wasAlreadyActiveToday) {
          // Получаем актуальный стрик из БД после обновления
          const updatedStats = await StreakService.fetchUserStats();
          const newCount = updatedStats?.current_streak ?? (get().streakCache.currentStreak + 1);

          // Обновляем кеш актуальными данными
          set((state) => {
            state.streakCache.lastActiveDate = today;
            state.streakCache.currentStreak = newCount;
            if (updatedStats?.longest_streak) {
              state.streakCache.longestStreak = updatedStats.longest_streak;
            }
            state.todayStats.streak = newCount;
          });

          // Пуш о рекорде серии шлёт сервер (api/data.js, updateUserStatsStreak)

          // Логируем событие стрика для админ-панели
          supabase.auth.getSession().then(({ data }) => {
            const userId = data.session?.user?.id;
            if (userId) NeonService.logStreakEvent(userId, newCount).catch(() => {});
          });

          return { streakIncreased: true, newStreakCount: newCount };
        } else if (success) {
          set((state) => {
            state.streakCache.lastActiveDate = today;
          });
        }
      } catch (e) {
        console.warn('Streak sync error:', e);
      }
      return { streakIncreased: false, newStreakCount: 0 };
    },

    updateStreak: (streak) => {
      set((state) => {
        state.todayStats.streak = streak;
      });
    },

    resetTodayStats: () => {
      set((state) => {
        state.todayStats = {
          cardsStudied: 0,
          cardsSynced: 0,
          streak: 0,
          longestStreak: 0,
          lastStudyDate: getTodayDate(),
        };
      });
    },

    // ==================== СИНХРОНИЗАЦИЯ СТРИКА ====================
    
    syncStreakFromServer: (data) => {
      set((state) => {
        state.streakCache = {
          currentStreak: data.currentStreak,
          longestStreak: data.longestStreak,
          lastActiveDate: data.lastActiveDate,
          loaded: true,
        };
        state.todayStats.streak = data.currentStreak;
        state.todayStats.longestStreak = data.longestStreak;
      });
      console.log('✅ Streak: синхронизировано с сервером', data);
    },

    // ==================== РОЛЬ УЧИТЕЛЯ ====================

    fetchIsTeacher: async (userId) => {
      const isTeacher = await NeonService.getIsTeacher(userId);
      if (isTeacher === null) {
        // Нет ответа: оставляем роль из кэша; без кэша — экран ученика, а не вечная заготовка
        if (get().isTeacher === null) set((state) => { state.isTeacher = false; });
        return;
      }
      writeCache('is_teacher', isTeacher);
      set((state) => {
        state.isTeacher = isTeacher;
      });
    },

    // ==================== СБРОС ====================

    resetSettings: () => {
      set((state) => {
        state.settings = defaultSettings;
        state.themeMode = 'light';
        state.resolvedTheme = 'light';
        state.colors = colors.light;
        state.isTeacher = null;
      });
    },
  }))
);

// Хук для получения цветов темы
export const useThemeColors = () => useSettingsStore((state) => state.colors);

// В режиме 'system' тема меняется вместе с настройкой устройства
Appearance.addChangeListener(() => {
  const { themeMode, setTheme } = useSettingsStore.getState();
  if (themeMode === 'system') setTheme('system');
});
