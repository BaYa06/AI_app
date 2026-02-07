/**
 * Store для настроек и темы
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { UserSettings, ThemeMode } from '@/types';
import { colors, ColorScheme } from '@/constants';
import { StreakService } from '@/services/StreakService';

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

      // Записываем активность в БД когда достигнут порог для стрика
      // Минимум 10 карточек для продления стрика
      const currentCards = get().todayStats.cardsStudied;
      
      // Записываем при достижении 10, 20, 30... карточек
      if (currentCards === 10 || (currentCards > 10 && currentCards % 10 === 0)) {
        StreakService.recordActivity({
          cardsDelta: 10,
          wordsDelta: 10, // Примерно 1 слово = 1 карточка
          minutesDelta: 2, // Примерно 2 минуты на 10 карточек
        }).catch((e) => console.warn('Streak sync error:', e));
      }
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
      // Проверяем, не устарел ли стрик (пропущено 2+ дня)
      const todayKey = getTodayDate();
      let validStreak = data.currentStreak;
      
      if (data.lastActiveDate && data.currentStreak > 0) {
        // Вычисляем разницу в днях
        const lastDate = new Date(data.lastActiveDate + 'T00:00:00');
        const today = new Date(todayKey + 'T00:00:00');
        const diffDays = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays > 1) {
          // Пропущено больше 1 дня — стрик сброшен
          validStreak = 0;
          console.log(`🔄 Streak: сброс — пропущено ${diffDays} дней (последняя активность: ${data.lastActiveDate})`);
        }
        // diffDays === 1 — стрик ещё жив, но нужно позаниматься сегодня
        // diffDays === 0 — сегодня уже занимались
      }
      
      set((state) => {
        state.streakCache = {
          currentStreak: validStreak,
          longestStreak: data.longestStreak,
          lastActiveDate: data.lastActiveDate,
          loaded: true,
        };
        // Также обновляем todayStats для UI
        state.todayStats.streak = validStreak;
        state.todayStats.longestStreak = data.longestStreak;
      });
      console.log('✅ Streak: синхронизировано с сервером', { ...data, validStreak });
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
