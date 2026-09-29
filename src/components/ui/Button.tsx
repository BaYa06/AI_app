/**
 * Button — кнопка по брендбуку (раздел 7.1).
 *
 * primary   — заливка primaryFill, текст onPrimary. Главное действие экрана.
 * secondary — прозрачная, рамка 1.5 primary, текст primary.
 * quiet     — без фона и рамки: «Отмена», «Пропустить», ссылки.
 * danger    — текст errorText без заливки; `filled` — заливка error (только в окне подтверждения).
 * icon      — круг 44×44 с иконкой 24 на surfaceMuted: «назад», «ещё», «закрыть».
 *
 * Неактивная — прозрачность 0.5. Загрузка — спиннер вместо текста, ширина не меняется.
 */
import React, { memo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
  type GestureResponderEvent,
} from 'react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common/Text';
import { borderRadius, heights, iconSize, spacing, typography } from '@/constants';
import type { IconComponent } from './types';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

interface BaseProps extends Omit<PressableProps, 'style' | 'children' | 'onPress'> {
  onPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

interface TextButtonProps extends BaseProps {
  variant?: ButtonVariant;
  title: string;
  /** Иконка слева от текста (20). */
  icon?: IconComponent;
  /** Иконка справа от текста (20), например шеврон. */
  iconRight?: IconComponent;
  /** l — 52 (по умолчанию), s — 36 для компактных кнопок внутри карточек. */
  size?: 'l' | 's';
  /** На всю ширину контейнера. */
  fullWidth?: boolean;
  /** quiet: цвет текста — primary (по умолчанию) или textSecondary. */
  tone?: 'primary' | 'secondary';
  /** danger: заливка error — только в окне подтверждения. */
  filled?: boolean;
}

interface IconButtonProps extends BaseProps {
  variant: 'icon';
  icon: IconComponent;
  /** Обязателен: кнопка без текста должна быть озвучена. */
  accessibilityLabel: string;
  /** Фон круга: surfaceMuted (по умолчанию) или без фона. */
  background?: 'muted' | 'none';
  iconColor?: string;
  iconSize?: number;
}

export type ButtonProps = TextButtonProps | IconButtonProps;

export const Button = memo(function Button(props: ButtonProps) {
  const colors = useThemeColors();

  if (props.variant === 'icon') {
    const {
      icon: Icon,
      accessibilityLabel,
      background = 'muted',
      iconColor,
      iconSize: glyphSize = iconSize.m,
      disabled,
      loading,
      style,
      onPress,
      ...rest
    } = props;
    const isDisabled = disabled || loading;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
        disabled={isDisabled}
        onPress={onPress}
        hitSlop={spacing.xxs}
        style={({ pressed }) => [
          styles.iconButton,
          background === 'muted' && { backgroundColor: colors.surfaceMuted },
          pressed && styles.pressed,
          isDisabled && styles.disabled,
          style,
        ]}
        {...rest}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.textSecondary} />
        ) : (
          <Icon size={glyphSize} color={iconColor ?? colors.textPrimary} />
        )}
      </Pressable>
    );
  }

  const {
    variant = 'primary',
    title,
    icon: Icon,
    iconRight: IconRight,
    size = 'l',
    fullWidth = false,
    tone = 'primary',
    filled = false,
    disabled,
    loading,
    style,
    onPress,
    ...rest
  } = props;
  const isDisabled = disabled || loading;

  const filledDanger = variant === 'danger' && filled;
  const labelColor =
    variant === 'primary' || filledDanger
      ? colors.onPrimary
      : variant === 'danger'
        ? colors.errorText
        : variant === 'quiet' && tone === 'secondary'
          ? colors.textSecondary
          : colors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={onPress}
      hitSlop={size === 's' ? spacing.xxs : undefined}
      style={({ pressed }) => [
        styles.base,
        size === 's' ? styles.small : styles.large,
        fullWidth && styles.fullWidth,
        variant === 'primary' && { backgroundColor: pressed ? colors.primaryPressed : colors.primaryFill },
        variant === 'secondary' && [styles.outlined, { borderColor: colors.primary }],
        filledDanger && { backgroundColor: colors.error },
        (variant === 'quiet' || (variant === 'danger' && !filled)) && styles.bare,
        pressed && variant !== 'primary' && styles.pressed,
        pressed && variant === 'primary' && styles.pressedScale,
        isDisabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {/* Контент остаётся в разметке и при загрузке — ширина кнопки не прыгает */}
      <View style={[styles.content, loading && styles.hidden]}>
        {Icon ? <Icon size={iconSize.s} color={labelColor} /> : null}
        <Text
          numberOfLines={1}
          style={[size === 's' ? typography.label : typography.button, styles.label, { color: labelColor }]}
        >
          {title}
        </Text>
        {IconRight ? <IconRight size={iconSize.s} color={labelColor} /> : null}
      </View>
      {loading ? (
        <View style={styles.spinner} pointerEvents="none">
          <ActivityIndicator size="small" color={labelColor} />
        </View>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.m,
  },
  large: {
    minHeight: heights.button,
    paddingHorizontal: spacing.l,
  },
  small: {
    minHeight: heights.buttonSmall,
    paddingHorizontal: spacing.m,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  outlined: {
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  bare: {
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.s,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  label: {
    textAlign: 'center',
    letterSpacing: 0,
  },
  hidden: {
    opacity: 0,
  },
  spinner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: {
    width: heights.touch,
    height: heights.touch,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  pressedScale: {
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.5,
  },
});
