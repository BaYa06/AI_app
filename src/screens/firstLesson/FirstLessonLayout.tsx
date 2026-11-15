/**
 * Каркас экранов первого урока в онбординге (plan/new/new_user_activation.md, Start 2.5):
 * подпись и полоска сверху, содержимое, закреплённый низ. Экраны живут вне навигатора, как
 * остальные шаги онбординга, поэтому safe area снизу считаем сами.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/common/Text';
import { ProgressBar } from '@/components/ui';
import { useThemeColors } from '@/store';
import { screenPadding, spacing } from '@/constants';
import type { Card } from '@/types';
import { ProgressService } from '@/services/ProgressService';
import { useLessonStore, useSettingsStore } from '@/store';

/** Сколько слов в первом уроке */
export const FIRST_LESSON_SIZE = 5;

export function FirstLessonLayout({
  label,
  counter,
  progress,
  children,
  footer,
}: {
  label?: string;
  counter?: string;
  /** 0–100; нет — полоски нет */
  progress?: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {progress !== undefined ? (
        <View style={styles.top}>
          <View style={styles.topRow}>
            <Text variant="bodySmall" style={{ color: colors.primary }}>
              {label}
            </Text>
            <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
              {counter}
            </Text>
          </View>
          <ProgressBar progress={progress} accessibilityLabel={`${label} ${counter ?? ''}`} />
        </View>
      ) : null}
      <View style={styles.body}>{children}</View>
      {footer ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.l) }]}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Слово первого урока выучено: тот же учёт, что в обычном уроке — уровень карточки (сервер),
 * счётчик дня и «новые слова» урока дня (первый урок засчитывается в норму, Start 2.7).
 */
export function recordFirstLessonWord(card: Card): void {
  ProgressService.recordAnswer(card, { mode: 'flashcard', correct: true, selfRating: 3 });
  useSettingsStore.getState().incrementTodayCards();
  useLessonStore.getState().recordAnswer('new', card.id);
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  top: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.m,
    gap: spacing.xs,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  body: {
    flex: 1,
    paddingHorizontal: screenPadding,
    paddingTop: spacing.l,
    gap: spacing.m,
  },
  footer: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.m,
    gap: spacing.s,
  },
});
