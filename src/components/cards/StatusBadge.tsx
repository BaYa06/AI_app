/**
 * Кружок статуса слова (plan/new/word_status_colors.md, Status 2).
 * new — пустой серый кружок; learning — жёлтая галочка, young — зелёная, mature — фиолетовая.
 * Различие только цветом, поэтому подпись статуса обязательна для VoiceOver (STATUS_LABEL).
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Check, Circle } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, iconSize, alpha, type ColorScheme } from '@/constants';
import type { CardStatus } from '@/types';

export const STATUS_LABEL: Record<CardStatus, string> = {
  new: 'Новое',
  learning: 'Учится',
  relearning: 'Учится',
  young: 'Знаю',
  mature: 'Выучено надолго',
};

/** Цвет статуса: заливка (фон, рамка, сегмент полоски) и галочка; у new цвета нет */
export function statusColors(colors: ColorScheme, status: CardStatus): { fill: string; ink: string } | null {
  switch (status) {
    case 'learning':
    case 'relearning':
      return { fill: colors.statusLearning, ink: colors.statusLearningInk };
    case 'young':
      return { fill: colors.statusYoung, ink: colors.statusYoung };
    case 'mature':
      return { fill: colors.statusMature, ink: colors.statusMature };
    default:
      return null;
  }
}

interface StatusBadgeProps {
  status: CardStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const colors = useThemeColors();
  const tone = statusColors(colors, status);

  return (
    <View
      accessible
      accessibilityLabel={STATUS_LABEL[status]}
      style={[
        styles.badge,
        tone
          ? { backgroundColor: alpha(tone.fill, 10), borderColor: alpha(tone.fill, 40) }
          : { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
      ]}
    >
      {tone ? (
        <Check size={iconSize.xs} color={tone.ink} strokeWidth={2.5} />
      ) : (
        <Circle size={14} color={colors.textTertiary} strokeWidth={2} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
});
