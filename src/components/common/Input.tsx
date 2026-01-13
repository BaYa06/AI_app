/**
 * Input Component
 * @description Переиспользуемое поле ввода
 */
import React, { memo, useState, useCallback, forwardRef } from 'react';
import {
  TextInput,
  View,
  Text,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, heights, typography } from '@/constants';

interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
}

export const Input = memo(
  forwardRef<TextInput, InputProps>(function Input(
    {
      label,
      error,
      hint,
      leftIcon,
      rightIcon,
      containerStyle,
      inputStyle,
      onFocus,
      onBlur,
      ...rest
    },
    ref
  ) {
    const colors = useThemeColors();
    const [isFocused, setIsFocused] = useState(false);

    const handleFocus = useCallback(
      (e: any) => {
        setIsFocused(true);
        onFocus?.(e);
      },
      [onFocus]
    );

    const handleBlur = useCallback(
      (e: any) => {
        setIsFocused(false);
        onBlur?.(e);
      },
      [onBlur]
    );

    const inputContainerStyle: ViewStyle[] = [
      styles.inputContainer,
      {
        backgroundColor: colors.surface,
        borderColor: error
          ? colors.error
          : isFocused
          ? colors.primary
          : colors.border,
      },
    ];

    return (
      <View style={[styles.container, containerStyle]}>
        {label && (
          <Text style={[styles.label, typography.label, { color: colors.textSecondary }]}>
            {label}
          </Text>
        )}

        <View style={inputContainerStyle}>
          {leftIcon && <View style={styles.iconLeft}>{leftIcon}</View>}

          <TextInput
            ref={ref}
            style={[
              styles.input,
              typography.body,
              { color: colors.textPrimary },
              leftIcon ? styles.inputWithLeftIcon : null,
              rightIcon ? styles.inputWithRightIcon : null,
              inputStyle,
            ]}
            placeholderTextColor={colors.textTertiary}
            onFocus={handleFocus}
            onBlur={handleBlur}
            {...rest}
          />

          {rightIcon && <View style={styles.iconRight}>{rightIcon}</View>}
        </View>

        {(error || hint) && (
          <Text
            style={[
              styles.helper,
              typography.caption,
              { color: error ? colors.error : colors.textTertiary },
            ]}
          >
            {error || hint}
          </Text>
        )}
      </View>
    );
  })
);

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.m,
  },

  label: {
    marginBottom: spacing.xs,
  },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: heights.input,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    overflow: 'hidden',
  },

  input: {
    flex: 1,
    height: '100%',
    paddingHorizontal: spacing.m,
  },

  inputWithLeftIcon: {
    paddingLeft: spacing.xs,
  },

  inputWithRightIcon: {
    paddingRight: spacing.xs,
  },

  iconLeft: {
    paddingLeft: spacing.m,
  },

  iconRight: {
    paddingRight: spacing.m,
  },

  helper: {
    marginTop: spacing.xs,
  },
});
