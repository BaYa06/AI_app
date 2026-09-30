/**
 * Text Component
 * @description Типографика с автоматической темизацией
 */
import React, { memo } from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleSheet } from 'react-native';
import { useThemeColors } from '@/store';
import { typography, TypographyVariant } from '@/constants';

/**
 * Предел системного увеличения шрифта (брендбук, 6.4). Основной текст растёт до ×2, крупные
 * заголовки — меньше: они и так большие, а на самых крупных системных размерах (до ×3)
 * выталкивали вёрстку за экран. Экран может передать свой maxFontSizeMultiplier.
 */
const MAX_FONT_SCALE: Partial<Record<TypographyVariant, number>> = {
  display: 1.2,
  h1: 1.3,
  h2: 1.4,
  cardText: 1.4,
  h3: 1.5,
};
const MAX_FONT_SCALE_DEFAULT = 2;

interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  color?: 'primary' | 'secondary' | 'tertiary' | 'inverse' | 'error' | 'success' | 'warning' | 'accent';
  align?: 'left' | 'center' | 'right';
}

export const Text = memo<TextProps>(function Text({
  variant = 'body',
  color = 'primary',
  align = 'left',
  style,
  children,
  ...rest
}) {
  const colors = useThemeColors();

  const textColor = {
    primary: colors.textPrimary,
    secondary: colors.textSecondary,
    tertiary: colors.textTertiary,
    inverse: colors.textInverse,
    // Смысловой текст — «текстовые» токены: заливки #10B981/#F59E0B как текст нечитаемы
    error: colors.errorText,
    success: colors.successText,
    warning: colors.warningText,
    accent: colors.primary,
  }[color];

  // Вариант задаёт lineHeight под свой размер (body: 16/24). Если экран увеличил fontSize, а
  // lineHeight не указал, строка оставалась высотой 24 и iOS срезал верх крупного текста/эмодзи
  // (🎓 72px в лобби теста, код игры 44px, буквы аватара). Высоту строки подтягиваем под шрифт.
  const flat = StyleSheet.flatten(style) || {};
  const fontSize = flat.fontSize ?? typography[variant].fontSize ?? 16;
  const minLineHeight = Math.ceil(fontSize * 1.2);
  const lineHeightFix =
    flat.lineHeight === undefined && (typography[variant].lineHeight ?? 0) < minLineHeight
      ? { lineHeight: minLineHeight }
      : null;

  return (
    <RNText
      style={[
        typography[variant],
        { color: textColor, textAlign: align },
        style,
        lineHeightFix,
      ]}
      maxFontSizeMultiplier={MAX_FONT_SCALE[variant] ?? MAX_FONT_SCALE_DEFAULT}
      {...rest}
    >
      {children}
    </RNText>
  );
});

// Удобные компоненты для частых случаев
export const Heading1 = memo<Omit<TextProps, 'variant'>>(function Heading1(props) {
  return <Text variant="h1" {...props} />;
});

export const Heading2 = memo<Omit<TextProps, 'variant'>>(function Heading2(props) {
  return <Text variant="h2" {...props} />;
});

export const Heading3 = memo<Omit<TextProps, 'variant'>>(function Heading3(props) {
  return <Text variant="h3" {...props} />;
});

export const Body = memo<Omit<TextProps, 'variant'>>(function Body(props) {
  return <Text variant="body" {...props} />;
});

export const Caption = memo<Omit<TextProps, 'variant'>>(function Caption(props) {
  return <Text variant="caption" color="secondary" {...props} />;
});
