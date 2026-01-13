/**
 * Отступы и размеры
 */

export const spacing = {
  xxs: 4,
  xs: 8,
  s: 12,
  m: 16,
  l: 24,
  xl: 32,
  xxl: 48,
} as const;

export const borderRadius = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 24,
  full: 9999,
} as const;

export const iconSize = {
  xs: 16,
  s: 20,
  m: 24,
  l: 32,
  xl: 48,
} as const;

// Размеры экранов для адаптивности
export const breakpoints = {
  phone: 0,
  tablet: 768,
  desktop: 1024,
} as const;

// Анимации
export const animation = {
  fast: 150,
  normal: 250,
  slow: 400,
} as const;

// Высота элементов
export const heights = {
  button: 48,
  buttonSmall: 36,
  input: 48,
  header: 56,
  tabBar: 64,
  card: 120,
} as const;
