/**
 * Цветовая палитра приложения
 * @description Цвета для светлой и темной темы
 */

export const colors = {
  light: {
    // Основные
    primary: '#6467F2',
    primaryPressed: '#4F46E5', // нажатая главная кнопка
    primaryFill: '#6467F2',    // заливка главных кнопок
    onPrimary: '#FFFFFF',      // текст и иконки на primaryFill
    primaryLight: '#818CF8',
    primaryDark: '#4F46E5',
    secondary: '#8B5CF6',
    
    // Семантические: заливка (фон, иконка, прогресс)
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
    // Семантические: текст на фоне (контраст ≥ 4,5)
    successText: '#047857',
    warningText: '#B45309',
    errorText: '#DC2626',
    
    // Фон
    background: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceMuted: '#F1F5F9',   // чипы, «назад», поиск, неактивные элементы
    surfaceVariant: '#F3F4F6', // вложенные блоки внутри карточек
    
    // Текст
    textPrimary: '#111827',
    textSecondary: '#6B7280',
    textTertiary: '#8A8F99',   // только плейсхолдеры, неактивное, мелкие мета-данные
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
    
    // Игровые
    streak: '#F97316',  // серия
    diamond: '#10B981', // алмазы
    star: '#F59E0B',    // звёзды оценки, золото в рейтинге
    silver: '#8A94A6',  // серебро (2-е место)
    bronze: '#C2703D',  // бронза (3-е место)
    // Мини-игры на главной — заливка карточек под белый текст (контраст ≥ 5,3)
    gameViolet: '#7C3AED', // «Быстрый раунд»
    gameRose: '#BE123C',   // «Снайпер»
    gameTeal: '#0E7490',   // «Вспомни забытое»
    gameGreen: '#047857',  // выполненная мини-игра
    
    // Overlay
    overlay: 'rgba(0, 0, 0, 0.5)',
    
    // Тени
    shadow: 'rgba(0, 0, 0, 0.1)',
  },
  
  dark: {
    // Основные
    primary: '#818CF8',
    primaryPressed: '#6366F1',
    primaryFill: '#6366F1', // #818CF8 слишком светлый под белый текст (2,98) — заливаем #6366F1 (4,47)
    onPrimary: '#FFFFFF',
    primaryLight: '#A5B4FC',
    primaryDark: '#6366F1',
    secondary: '#A78BFA',
    
    // Семантические: заливка
    success: '#34D399',
    warning: '#FBBF24',
    error: '#F87171',
    info: '#60A5FA',
    // Семантические: текст на фоне
    successText: '#34D399',
    warningText: '#FBBF24',
    errorText: '#F87171',
    
    // Фон — поверхности сплошные, чтобы окно поверх окна не «грязнело»
    background: '#101122',
    surface: '#1A1B30',
    surfaceMuted: '#232540',
    surfaceVariant: '#2A2C47',
    
    // Текст
    textPrimary: '#F9FAFB',
    textSecondary: '#9CA3AF',
    textTertiary: '#8A8F99',
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
    
    // Игровые
    streak: '#F97316',
    diamond: '#10B981',
    star: '#F59E0B',
    silver: '#8A94A6',
    bronze: '#C2703D',
    gameViolet: '#7C3AED',
    gameRose: '#BE123C',
    gameTeal: '#0E7490',
    gameGreen: '#047857',
    
    // Overlay
    overlay: 'rgba(0, 0, 0, 0.7)',
    
    // Тени
    shadow: 'rgba(0, 0, 0, 0.3)',
  },
} as const;

export type ColorToken = keyof typeof colors.light;
export type ColorScheme = Record<ColorToken, string>;
export type ThemeMode = 'light' | 'dark';

/** Три допустимые ступени прозрачности подложек (брендбук, 2.1). */
export type AlphaStep = 10 | 20 | 40;
const ALPHA_HEX: Record<AlphaStep, string> = { 10: '1A', 20: '33', 40: '66' };

/**
 * Цвет токена с прозрачностью 10 / 20 / 40 % — вместо `color + '15'`.
 * @example alpha(colors.primary, 10) // фон иконки, выделенная строка
 */
export function alpha(color: string, step: AlphaStep): string {
  const hex = color.trim();
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    const r = hex[1], g = hex[2], b = hex[3];
    return `#${r}${r}${g}${g}${b}${b}${ALPHA_HEX[step]}`;
  }
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) {
    return hex.slice(0, 7) + ALPHA_HEX[step];
  }
  const rgb = hex.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${step / 100})`;
  }
  return color;
}

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
