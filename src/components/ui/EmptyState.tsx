/**
 * EmptyState и ErrorState — пустое и ошибочное состояния (брендбук, 7.8).
 *
 * Иконка 48 в круге primary 10 % → заголовок h3 → одно предложение bodySmall →
 * главная кнопка (+ вторичная). Тексты и кнопки — те, что уже есть на экране.
 */
import React, { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common/Text';
import { alpha, borderRadius, iconSize, spacing } from '@/constants';
import { Button } from './Button';
import type { IconComponent } from './types';

interface StateAction {
  label: string;
  onPress: () => void;
  icon?: IconComponent;
}

export interface EmptyStateProps {
  icon: IconComponent;
  title: string;
  description?: string;
  action?: StateAction;
  secondaryAction?: StateAction;
  /** Цвет иконки и круга (по умолчанию primary). */
  color?: string;
  /** Компактный вид внутри карточки или листа — без большого отступа сверху. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const EmptyState = memo(function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  color,
  compact = false,
  style,
}: EmptyStateProps) {
  const colors = useThemeColors();
  const accent = color ?? colors.primary;

  return (
    <View style={[styles.container, compact ? styles.compact : styles.full, style]}>
      <View style={[styles.iconCircle, { backgroundColor: alpha(accent, 10) }]}>
        <Icon size={iconSize.xl} color={accent} />
      </View>
      <Text variant="h3" align="center" accessibilityRole="header" style={{ color: colors.textPrimary }}>
        {title}
      </Text>
      {description ? (
        <Text variant="bodySmall" align="center" style={[styles.description, { color: colors.textSecondary }]}>
          {description}
        </Text>
      ) : null}
      {action || secondaryAction ? (
        <View style={styles.actions}>
          {action ? <Button title={action.label} icon={action.icon} onPress={action.onPress} fullWidth /> : null}
          {secondaryAction ? (
            <Button
              variant="secondary"
              title={secondaryAction.label}
              icon={secondaryAction.icon}
              onPress={secondaryAction.onPress}
              fullWidth
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

export interface ErrorStateProps {
  title?: string;
  description?: string;
  icon?: IconComponent;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** «Не удалось загрузить» + «Повторить». Технический текст ошибки не показываем. */
export const ErrorState = memo(function ErrorState({
  title = 'Не удалось загрузить',
  description,
  icon = WifiOff,
  onRetry,
  retryLabel = 'Повторить',
  compact,
  style,
}: ErrorStateProps) {
  const colors = useThemeColors();
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      color={colors.textSecondary}
      action={onRetry ? { label: retryLabel, onPress: onRetry } : undefined}
      compact={compact}
      style={style}
    />
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: spacing.m,
  },
  full: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.l,
  },
  compact: {
    paddingVertical: spacing.l,
  },
  iconCircle: {
    width: iconSize.xl * 2,
    height: iconSize.xl * 2,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.m,
  },
  description: {
    marginTop: spacing.xs,
    maxWidth: 320,
  },
  actions: {
    alignSelf: 'stretch',
    marginTop: spacing.l,
    gap: spacing.s,
  },
});
