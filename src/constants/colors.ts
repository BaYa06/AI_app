/**
 * Цветовая палитра приложения
 * @description Цвета для светлой и темной темы
 */

export const colors = {
  light: {
    // Основные
    primary: '#6467f2',
    primaryLight: '#818CF8',
    primaryDark: '#4F46E5',
    secondary: '#8B5CF6',
    
    // Семантические
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
    
    // Фон
    background: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceVariant: '#F3F4F6',
    
    // Текст
    textPrimary: '#111827',
    textSecondary: '#6B7280',
    textTertiary: '#9CA3AF',
    textInverse: '#FFFFFF',
    
    // Границы
    border: '#dbdbe6',
    borderLight: '#F3F4F6',
    
    // Карточки SRS
    cardNew: '#3B82F6',      // Синий - новые
    cardLearning: '#F59E0B', // Желтый - изучаются
    cardReview: '#EF4444',   // Красный - на повторение
    cardMastered: '#10B981', // Зеленый - выучены
    
    // Оценки
    ratingAgain: '#EF4444',
    ratingHard: '#F59E0B',
    ratingGood: '#10B981',
    ratingEasy: '#3B82F6',
    
    // Overlay
    overlay: 'rgba(0, 0, 0, 0.5)',
    
    // Тени
    shadow: 'rgba(0, 0, 0, 0.1)',
  },
  
  dark: {
    // Основные
    primary: '#818CF8',
    primaryLight: '#A5B4FC',
    primaryDark: '#6366F1',
    secondary: '#A78BFA',
    
    // Семантические
    success: '#34D399',
    warning: '#FBBF24',
    error: '#F87171',
    info: '#60A5FA',
    
    // Фон
    background: '#101122',
    surface: 'rgba(255, 255, 255, 0.05)',
    surfaceVariant: '#374151',
    
    // Текст
    textPrimary: '#F9FAFB',
    textSecondary: '#9CA3AF',
    textTertiary: '#6B7280',
    textInverse: '#111827',
    
    // Границы
    border: 'rgba(255, 255, 255, 0.1)',
    borderLight: '#4B5563',
    
    // Карточки SRS
    cardNew: '#60A5FA',
    cardLearning: '#FBBF24',
    cardReview: '#F87171',
    cardMastered: '#34D399',
    
    // Оценки
    ratingAgain: '#F87171',
    ratingHard: '#FBBF24',
    ratingGood: '#34D399',
    ratingEasy: '#60A5FA',
    
    // Overlay
    overlay: 'rgba(0, 0, 0, 0.7)',
    
    // Тени
    shadow: 'rgba(0, 0, 0, 0.3)',
  },
} as const;

export type ColorScheme = typeof colors.light;
export type ThemeMode = 'light' | 'dark';

// Accent colors for deck icons — consistently assigned by deck ID
export const DECK_ACCENT_COLORS = [
  '#FF6B6B', // coral
  '#F97316', // orange
  '#F59E0B', // amber
  '#10B981', // emerald
  '#0EA5E9', // sky
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#14B8A6', // teal
] as const;

/** Returns a stable accent color for a given deck id or index */
export function getDeckAccentColor(idOrIndex: string | number): string {
  if (typeof idOrIndex === 'number') {
    return DECK_ACCENT_COLORS[idOrIndex % DECK_ACCENT_COLORS.length];
  }
  let hash = 0;
  for (let i = 0; i < idOrIndex.length; i++) {
    hash = (hash * 31 + idOrIndex.charCodeAt(i)) >>> 0;
  }
  return DECK_ACCENT_COLORS[hash % DECK_ACCENT_COLORS.length];
}
