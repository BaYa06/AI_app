/**
 * Store для настроек и темы
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { UserSettings, ThemeMode } from '@/types';
import { colors, ColorScheme } from '@/constants';

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
    lastStudyDate: string; // YYYY-MM-DD
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

const getTodayDate = () => new Date().toISOString().split('T')[0];

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
      lastStudyDate: getTodayDate(),
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
          lastStudyDate: getTodayDate(),
        };
      });
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
