/**
 * TextField — поле ввода (брендбук, 7.2).
 *
 * Высота 48, скругление 12, рамка 1 border, фон surface (поиск — surfaceMuted без рамки).
 * Фокус — рамка primary. Ошибка — рамка error и текст caption errorText под полем.
 * Подпись над полем — label textSecondary, до поля 8. Плейсхолдер — textTertiary.
 * Клавиатура не открывается сама: autoFocus передаёт только экран, где это исключение (поиск, код).
 */
import React, { forwardRef, useState } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
  type NativeSyntheticEvent,
  type TextInputFocusEventData,
} from 'react-native';
import { Search } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common/Text';
import { borderRadius, heights, iconSize, spacing, typography } from '@/constants';
import type { IconComponent } from './types';

export interface TextFieldProps extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  label?: string;
  /** Текст ошибки — показывается под полем, рамка становится error. */
  error?: string | null;
  /** Подсказка под полем, когда нет ошибки. */
  hint?: string;
  /** search — фон surfaceMuted, иконка лупы слева, без рамки. */
  variant?: 'default' | 'search';
  /** Иконка слева (для search — лупа по умолчанию). */
  icon?: IconComponent;
  /** Элемент справа внутри поля (очистить, показать пароль). */
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  inputStyle?: TextInputProps['style'];
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label,
    error,
    hint,
    variant = 'default',
    icon,
    right,
    style,
    inputStyle,
    multiline,
    editable = true,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const colors = useThemeColors();
  const [focused, setFocused] = useState(false);
  const isSearch = variant === 'search';
  const Icon = icon ?? (isSearch ? Search : undefined);

  const borderColor = error
    ? colors.error
    : focused
      ? colors.primary
      : isSearch
        ? colors.surfaceMuted
        : colors.border;

  const handleFocus = (e: NativeSyntheticEvent<TextInputFocusEventData>) => {
    setFocused(true);
    onFocus?.(e);
  };
  const handleBlur = (e: NativeSyntheticEvent<TextInputFocusEventData>) => {
    setFocused(false);
    onBlur?.(e);
  };

  return (
    <View style={style}>
      {label ? (
        <Text variant="label" style={[styles.label, { color: colors.textSecondary }]}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.field,
          multiline && styles.multiline,
          {
            backgroundColor: isSearch ? colors.surfaceMuted : colors.surface,
            borderColor,
          },
          !editable && styles.disabled,
        ]}
      >
        {Icon ? <Icon size={iconSize.s} color={colors.textTertiary} /> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.primary}
          editable={editable}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={[multiline ? typography.body : singleLineFont, styles.input, { color: colors.textPrimary }, inputStyle]}
          {...rest}
        />
        {right}
      </View>
      {error ? (
        <Text variant="caption" accessibilityLiveRegion="polite" style={[styles.helper, { color: colors.errorText }]}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" style={[styles.helper, { color: colors.textSecondary }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

// lineHeight в однострочном TextInput на iOS сдвигает текст вниз — берём только шрифт
const singleLineFont = {
  fontFamily: typography.body.fontFamily,
  fontSize: typography.body.fontSize,
  fontWeight: typography.body.fontWeight,
};

const styles = StyleSheet.create({
  label: {
    marginBottom: spacing.xs,
  },
  field: {
    minHeight: heights.input,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.s,
    borderWidth: 1,
    borderRadius: borderRadius.m,
  },
  multiline: {
    alignItems: 'flex-start',
    paddingVertical: spacing.s,
    minHeight: heights.input * 2,
  },
  input: {
    flex: 1,
    alignSelf: 'stretch',
    paddingVertical: 0,
  },
  helper: {
    marginTop: spacing.xxs,
  },
  disabled: {
    opacity: 0.5,
  },
});
