/**
 * Общий таймер экзамена. Красный, когда осталось ≤ 3 минут (решение пользователя).
 * Время считает сервер: экран получает срок и смещение часов, здесь только показ.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Timer } from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, iconSize } from '@/constants';

export const URGENT_SEC = 180;

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function ExamTimer({
  remainingSec,
  paused,
}: {
  remainingSec: number | null;
  paused?: boolean;
}) {
  const colors = useThemeColors();
  if (remainingSec === null) return null;
  const urgent = remainingSec <= URGENT_SEC;
  const bg = urgent ? colors.error : colors.surfaceMuted;
  const fg = urgent ? colors.onPrimary : colors.textPrimary;
  const label = paused ? 'Пауза' : formatClock(remainingSec);
  return (
    <View
      accessibilityRole="timer"
      accessibilityLabel={
        paused
          ? 'Экзамен на паузе'
          : `Осталось ${formatClock(remainingSec)}${urgent ? ', меньше трёх минут' : ''}`
      }
      style={[styles.badge, { backgroundColor: bg }]}
    >
      <Timer size={iconSize.xs} color={fg} />
      <Text variant="label" style={[styles.text, { color: fg }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs + 2,
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  text: { fontVariant: ['tabular-nums'], fontWeight: '700' },
});
