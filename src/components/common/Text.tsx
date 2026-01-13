/**
 * Text Component
 * @description Типографика с автоматической темизацией
 */
import React, { memo } from 'react';
import { Text as RNText, TextProps as RNTextProps } from 'react-native';
import { useThemeColors } from '@/store';
import { typography, TypographyVariant } from '@/constants';

interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  color?: 'primary' | 'secondary' | 'tertiary' | 'inverse' | 'error' | 'success';
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
    error: colors.error,
    success: colors.success,
  }[color];

  return (
    <RNText
      style={[
        typography[variant],
        { color: textColor, textAlign: align },
        style,
      ]}
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
