/**
 * Chip, Badge, ProgressBar, Switch — мелкие элементы в цветах и размерах токенов.
 *
 * Chip — выбираемая «таблетка» (фильтр, вариант): выбранная — подложка primary 10 %, рамка 40 %.
 * Badge — метка-статус: подложка 20 % смыслового цвета, текст — «текстовый» токен.
 * ProgressBar — высота 8, скругление full, фон surfaceMuted, заливка primary.
 * Switch — переключатель: включён — primary, выключен — textTertiary 40 %.
 */
import React, { memo, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common/Text';
import { alpha, animation, borderRadius, iconSize, spacing } from '@/constants';
import { triggerHaptic } from '@/utils/haptic';
import type { IconComponent } from './types';

const useNativeDriver = Platform.OS !== 'web';

// ==================== Chip ====================

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconComponent;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const Chip = memo(function Chip({ label, selected = false, onPress, icon: Icon, disabled, style }: ChipProps) {
  const colors = useThemeColors();
  const textColor = selected ? colors.primary : colors.textPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled || !onPress}
      onPress={onPress}
      hitSlop={spacing.xxs}
      style={({ pressed }) => [
        styles.chip,
        selected
          ? { backgroundColor: alpha(colors.primary, 10), borderColor: alpha(colors.primary, 40) }
          : { backgroundColor: colors.surfaceMuted, borderColor: colors.surfaceMuted },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {Icon ? <Icon size={iconSize.xs} color={textColor} /> : null}
      <Text variant="label" numberOfLines={1} style={{ color: textColor }}>
        {label}
      </Text>
    </Pressable>
  );
});

// ==================== Badge ====================

export type BadgeTone = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  icon?: IconComponent;
  style?: StyleProp<ViewStyle>;
}

export const Badge = memo(function Badge({ label, tone = 'primary', icon: Icon, style }: BadgeProps) {
  const colors = useThemeColors();
  const palette: Record<BadgeTone, { fill: string; text: string }> = {
    primary: { fill: alpha(colors.primary, 20), text: colors.primary },
    success: { fill: alpha(colors.success, 20), text: colors.successText },
    warning: { fill: alpha(colors.warning, 20), text: colors.warningText },
    error: { fill: alpha(colors.error, 20), text: colors.errorText },
    info: { fill: alpha(colors.info, 20), text: colors.info },
    neutral: { fill: colors.surfaceMuted, text: colors.textSecondary },
  };
  const { fill, text } = palette[tone];

  return (
    <View style={[styles.badge, { backgroundColor: fill }, style]}>
      {Icon ? <Icon size={iconSize.xs} color={text} /> : null}
      <Text variant="caption" numberOfLines={1} style={[styles.badgeText, { color: text }]}>
        {label}
      </Text>
    </View>
  );
});

// ==================== ProgressBar ====================

export interface ProgressBarProps {
  /** 0–100 */
  progress: number;
  /** Цвет заливки (по умолчанию primary): success, streak и т.п. */
  color?: string;
  animated?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export const ProgressBar = memo(function ProgressBar({
  progress,
  color,
  animated = true,
  accessibilityLabel,
  style,
}: ProgressBarProps) {
  const colors = useThemeColors();
  const clamped = Math.min(100, Math.max(0, progress));
  const value = useRef(new Animated.Value(animated ? 0 : clamped)).current;

  useEffect(() => {
    if (!animated) {
      value.setValue(clamped);
      return;
    }
    Animated.timing(value, {
      toValue: clamped,
      duration: animation.slow,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // анимируем ширину
    }).start();
  }, [clamped, animated, value]);

  const width = value.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
      style={[styles.track, { backgroundColor: colors.surfaceMuted }, style]}
    >
      <Animated.View style={[styles.fill, { width, backgroundColor: color ?? colors.primary }]} />
    </View>
  );
});

// ==================== Switch ====================

export interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  /** Обязателен, если рядом нет подписи, связанной со строкой. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const TRACK_WIDTH = 48;
const TRACK_HEIGHT = 28;
const THUMB = 24;
const THUMB_OFFSET = TRACK_WIDTH - THUMB - 4;

export const Switch = memo(function Switch({ value, onValueChange, disabled, accessibilityLabel, style }: SwitchProps) {
  const colors = useThemeColors();
  const position = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(position, {
      toValue: value ? 1 : 0,
      duration: animation.fast,
      easing: Easing.out(Easing.quad),
      useNativeDriver,
    }).start();
  }, [value, position]);

  const translateX = position.interpolate({ inputRange: [0, 1], outputRange: [0, THUMB_OFFSET] });

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      hitSlop={spacing.xs}
      onPress={() => {
        triggerHaptic('selection');
        onValueChange(!value);
      }}
      style={[
        styles.switchTrack,
        { backgroundColor: value ? colors.primary : alpha(colors.textTertiary, 40) },
        disabled && styles.disabled,
        style,
      ]}
    >
      <Animated.View style={[styles.thumb, { backgroundColor: colors.onPrimary, transform: [{ translateX }] }]} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  chip: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.s,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: borderRadius.s,
  },
  badgeText: {
    fontWeight: '600',
  },
  track: {
    height: 8,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  switchTrack: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: borderRadius.full,
    padding: 2,
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: borderRadius.full,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
});
