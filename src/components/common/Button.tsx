/**
 * Button Component
 * @description Переиспользуемая кнопка с различными вариантами
 */
import React, { memo, useCallback } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  TouchableOpacityProps,
} from 'react-native';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, heights, typography } from '@/constants';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'small' | 'medium' | 'large';

interface ButtonProps extends Omit<TouchableOpacityProps, 'style'> {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Button = memo<ButtonProps>(function Button({
  title,
  variant = 'primary',
  size = 'medium',
  loading = false,
  disabled = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  style,
  textStyle,
  onPress,
  ...rest
}) {
  const colors = useThemeColors();
  
  const isDisabled = disabled || loading;

  const handlePress = useCallback(
    (event: any) => {
      if (!isDisabled && onPress) {
        onPress(event);
      }
    },
    [isDisabled, onPress]
  );

  // Стили контейнера
  const containerStyle: ViewStyle[] = [
    styles.base,
    styles[size],
    fullWidth && styles.fullWidth,
    getVariantStyle(variant, colors),
    isDisabled && styles.disabled,
    style,
  ].filter(Boolean) as ViewStyle[];

  // Стили текста
  const labelStyle: TextStyle[] = [
    styles.text,
    size === 'small' ? typography.buttonSmall : typography.button,
    getTextStyle(variant, colors),
    isDisabled && styles.textDisabled,
    textStyle,
  ].filter(Boolean) as TextStyle[];

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      disabled={isDisabled}
      onPress={handlePress}
      style={containerStyle}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? colors.textInverse : colors.primary}
        />
      ) : (
        <>
          {leftIcon}
          <Text style={labelStyle}>{title}</Text>
          {rightIcon}
        </>
      )}
    </TouchableOpacity>
  );
});

// ==================== СТИЛИ ====================

function getVariantStyle(variant: ButtonVariant, colors: any): ViewStyle {
  switch (variant) {
    case 'primary':
      return {
        backgroundColor: colors.primary,
      };
    case 'secondary':
      return {
        backgroundColor: colors.secondary,
      };
    case 'outline':
      return {
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderColor: colors.primary,
      };
    case 'ghost':
      return {
        backgroundColor: 'transparent',
      };
    case 'danger':
      return {
        backgroundColor: colors.error,
      };
  }
}

function getTextStyle(variant: ButtonVariant, colors: any): TextStyle {
  switch (variant) {
    case 'primary':
    case 'secondary':
    case 'danger':
      return {
        color: colors.textInverse,
      };
    case 'outline':
    case 'ghost':
      return {
        color: colors.primary,
      };
  }
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.m,
    gap: spacing.xs,
  },
  
  // Размеры
  small: {
    height: heights.buttonSmall,
    paddingHorizontal: spacing.m,
  },
  medium: {
    height: heights.button,
    paddingHorizontal: spacing.l,
  },
  large: {
    height: 56,
    paddingHorizontal: spacing.xl,
  },
  
  fullWidth: {
    width: '100%',
  },
  
  disabled: {
    opacity: 0.5,
  },
  
  text: {
    textAlign: 'center',
  },
  
  textDisabled: {
    opacity: 0.7,
  },
});
