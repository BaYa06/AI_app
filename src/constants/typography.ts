/**
 * Типографика — шкала брендбука (plan/brandbook.md, раздел 3).
 * Размеры только 12/14/16/18/20/24/32/40, веса только 400/600/700.
 */
import { Platform, TextStyle } from 'react-native';

const fontFamily = Platform.select({
  ios: 'System',
  android: 'Roboto',
  default: 'System',
});

export const typography = {
  // Крупные цифры: код игры, счёт, результат теста
  display: {
    fontFamily,
    fontSize: 40,
    fontWeight: '700',
    lineHeight: 48,
    letterSpacing: -0.5,
  } as TextStyle,

  // Заголовки
  h1: {
    fontFamily,
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 40,
    letterSpacing: -0.5,
  } as TextStyle,
  
  h2: {
    fontFamily,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
    letterSpacing: -0.3,
  } as TextStyle,
  
  h3: {
    fontFamily,
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 28,
    letterSpacing: 0,
  } as TextStyle,
  
  // Основной текст
  bodyLarge: {
    fontFamily,
    fontSize: 18,
    fontWeight: '400',
    lineHeight: 26,
  } as TextStyle,
  
  body: {
    fontFamily,
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
  } as TextStyle,
  
  bodySmall: {
    fontFamily,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  } as TextStyle,
  
  // Подписи
  caption: {
    fontFamily,
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  } as TextStyle,
  
  // Кнопки
  button: {
    fontFamily,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
    letterSpacing: 0.5,
  } as TextStyle,
  
  buttonSmall: {
    fontFamily,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    letterSpacing: 0.5,
  } as TextStyle,
  
  // Карточки - крупный текст для удобного чтения
  cardText: {
    fontFamily,
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 32,
  } as TextStyle,
  
  // Лейблы
  label: {
    fontFamily,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    letterSpacing: 0.2,
  } as TextStyle,

  // Подписи разделов («АККАУНТ», «ОБУЧЕНИЕ») — единственный вариант капсом
  overline: {
    fontFamily,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  } as TextStyle,
} as const;

export type TypographyVariant = keyof typeof typography;
