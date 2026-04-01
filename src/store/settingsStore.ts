/**
 * Store для настроек и темы
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { UserSettings, ThemeMode } from '@/types';
import { colors, ColorScheme } from '@/constants';
import { StreakService } from '@/services/StreakService';
import { supabase } from '@/services';

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
  
  // Сброс
  resetSettings: () => void;
}

const defaultSettings: UserSettings = {
  dailyNewCardsLimit: 20,
  dailyReviewLimit: 100,
  studyCardLimit: 20,
  reminderEnabled: false,
  reminderTime: '09:00',
  theme: 'system',
  language: 'ru',
  soundEnabled: true,
  hapticEnabled: true,
  reverseCards: false,
};

import { getLocalDateKey } from '@/services/StreakService';

const getTodayDate = () => getLocalDateKey();

export const useSettingsStore = create<SettingsState & SettingsActions>()(
  immer((set, get) => ({
    // Начальное состояние
    settings: defaultSettings,
    themeMode: 'light',
    resolvedTheme: 'light',
    colors: colors.light,
    todayStats: {
      cardsStudied: 0,
      streak: 0,
      longestStreak: 0,
      lastStudyDate: getTodayDate(),
    },
    streakCache: {
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: null,
      loaded: false,
    },

    // ==================== НАСТРОЙКИ ====================
    
    updateSettings: (updates) => {
      set((state) => {
        Object.assign(state.settings, updates);
      });
      
      // Обновляем тему если изменилась (вне Immer)
      if (updates.theme) {
        const newTheme = updates.theme === 'system' ? 'light' : updates.theme;
        const resolved = newTheme as 'light' | 'dark';
        set({ 
          themeMode: updates.theme,
          resolvedTheme: resolved,
          colors: colors[resolved] as any
        });
      }
    },

    // ==================== ТЕМА ====================
    
    setTheme: (mode) => {
      const resolved = (mode === 'system' ? 'light' : mode) as 'light' | 'dark';
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
          state.todayStats.lastStudyDate = today;
        }

        state.todayStats.cardsStudied++;
      });
    },

    finishStudySession: async () => {
      const { cardsStudied } = get().todayStats;
      if (cardsStudied <= 0) return { streakIncreased: false, newStreakCount: 0 };

      const lastActiveDate = get().streakCache.lastActiveDate;
      const today = getTodayDate();
      const wasAlreadyActiveToday = lastActiveDate === today;

      try {
        const success = await StreakService.recordActivity({
          cardsDelta: cardsStudied,
          wordsDelta: cardsStudied,
          minutesDelta: Math.max(1, Math.round(cardsStudied / 5)),
        });

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

          const milestones = [7, 14, 30, 60, 100];
          if (milestones.includes(newCount)) {
            supabase.auth.getSession().then(({ data }) => {
              fetch('/api/push?action=notify', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer ' + (process.env.EXPO_PUBLIC_NOTIFY_SECRET || ''),
                },
                body: JSON.stringify({
                  userId: data.session?.user?.id,
                  type: 'streak_milestone',
                  data: { days: newCount },
                }),
              }).catch(() => {});
            });
          }

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

    // ==================== СБРОС ====================
    
    resetSettings: () => {
      set((state) => {
        state.settings = defaultSettings;
        state.themeMode = 'light';
        state.resolvedTheme = 'light';
        state.colors = colors.light;
      });
    },
  }))
);

// Хук для получения цветов темы
export const useThemeColors = () => useSettingsStore((state) => state.colors);
