/**
 * Итоги первого урока (plan/new/new_user_activation.md, Start 2.5–2.6): «Ты выучил 5 слов»,
 * выученные слова чипами, что дальше. Серию честно не обещаем: день засчитывается сервером
 * за 10 слов (DAILY_REVIEW_TARGET), а в первом уроке их 5 — поэтому «ещё 5 слов — и день в серии».
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Flame } from 'lucide-react-native';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, iconSize, spacing } from '@/constants';
import type { Card } from '@/types';
import { FIRST_LESSON_SIZE, FirstLessonLayout } from './FirstLessonLayout';

/** Столько слов за день засчитывает день в серию (api/_handlers/data/streak.js) */
const DAY_TARGET = 10;

export function FirstResultsScreen({
  cards,
  questionsLeft,
  onContinue,
}: {
  cards: Card[];
  /** Сколько вопросов будет после итогов (имя, цель, норма…) */
  questionsLeft: number;
  onContinue: () => void;
}) {
  const colors = useThemeColors();
  const words = cards.slice(0, FIRST_LESSON_SIZE);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (shown >= words.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), 140);
    return () => clearTimeout(t);
  }, [shown, words.length]);

  const left = Math.max(0, DAY_TARGET - words.length);
  return (
    <FirstLessonLayout
      footer={
        <>
          <Button title="Продолжить" onPress={onContinue} fullWidth />
          {questionsLeft > 0 ? (
            <Text variant="bodySmall" align="center" style={{ color: colors.textSecondary }}>
              Дальше {questionsLeft} коротких вопроса для плана. Их можно пропустить.
            </Text>
          ) : null}
        </>
      }
    >
      <View style={styles.center} accessibilityLiveRegion="polite">
        <View style={[styles.ring, { borderColor: colors.primaryFill }]}>
          <Text variant="display" style={[styles.num, { color: colors.textPrimary }]}>
            {shown}
          </Text>
        </View>
        <Text
          variant="h1"
          align="center"
          accessibilityRole="header"
          style={{ color: colors.textPrimary }}
        >
          Ты выучил {words.length} слов
        </Text>
        <Text variant="body" align="center" style={{ color: colors.textSecondary }}>
          Завтра напомним их повторить, так они запомнятся.
        </Text>
        <View style={styles.chips}>
          {words.map((c) => (
            <View key={c.id} style={[styles.chip, { backgroundColor: colors.surfaceMuted }]}>
              <Text variant="bodySmall" style={{ color: colors.textPrimary }}>
                {c.frontText}
              </Text>
            </View>
          ))}
        </View>
        {left > 0 ? (
          <View style={[styles.streak, { backgroundColor: alpha(colors.warning, 10) }]}>
            <Flame size={iconSize.s} color={colors.warning} fill={colors.warning} />
            <Text variant="label" style={{ color: colors.warningText }}>
              Ещё {left} слов сегодня — и первый день серии
            </Text>
          </View>
        ) : null}
      </View>
    </FirstLessonLayout>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
  },
  ring: {
    width: 140,
    height: 140,
    borderRadius: borderRadius.full,
    borderWidth: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.m,
  },
  num: {
    fontVariant: ['tabular-nums'],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  chip: {
    borderRadius: borderRadius.s,
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xxs,
  },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xs,
    marginTop: spacing.s,
  },
});
