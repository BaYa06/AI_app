/**
 * RecommendedModeCard
 * @description Рекомендованная карточка режима "Flashcards" внутри StudyModeSheet
 */
import React, { memo } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { spacing, borderRadius, iconSize, alpha } from '@/constants';

type RateTone = 'ratingAgain' | 'ratingHard' | 'ratingGood' | 'ratingEasy';

// Те же оценки и цвета, что в классическом режиме (Снова / Сложно / Хорошо / Легко)
const RATE_LABELS: Array<{ label: string; tone: RateTone }> = [
  { label: 'Не знаю', tone: 'ratingAgain' },
  { label: 'Сомневаюсь', tone: 'ratingHard' },
  { label: 'Почти', tone: 'ratingEasy' },
  { label: 'Уверенно', tone: 'ratingGood' },
];

interface Props {
  onPress: () => void;
}

export const RecommendedModeCard = memo(function RecommendedModeCard({ onPress }: Props) {
  const colors = useThemeColors();
  // Текст оценок — «текстовые» токены: заливки (янтарь, зелёный) как текст нечитаемы
  const textTone: Record<RateTone, string> = {
    ratingAgain: colors.errorText,
    ratingHard: colors.warningText,
    ratingEasy: colors.info,
    ratingGood: colors.successText,
  };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Карточки. Рекомендуем. Классический режим"
      style={({ pressed }) => [
        styles.card,
        { borderColor: colors.primary, backgroundColor: colors.surface },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.badge, { backgroundColor: colors.primaryFill }]}>
        <Text variant="caption" style={[styles.bold, { color: colors.onPrimary }]}>
          Рекомендуем
        </Text>
      </View>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: alpha(colors.primary, 10) }]}>
          <Sparkles size={iconSize.s} color={colors.primary} />
        </View>
        <View style={styles.flex1}>
          <Text variant="body" style={[styles.bold, { color: colors.textPrimary }]}>
            Карточки
          </Text>
          <Text variant="caption" color="secondary">
            Переворот 180° • Классический режим
          </Text>
        </View>
      </View>
      <View style={[styles.preview, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
        <Text variant="body" style={[styles.bold, { color: colors.textPrimary }]}>
          scharf
        </Text>
        <Text variant="caption" color="secondary">
          Нажми, чтобы перевернуть
        </Text>
      </View>
      <View style={styles.rateRow}>
        {RATE_LABELS.map(({ label, tone }) => (
          <View
            key={label}
            style={[styles.ratePill, { borderColor: alpha(colors[tone], 20), backgroundColor: alpha(colors[tone], 10) }]}
          >
            <Text variant="caption" style={[styles.semibold, { color: textTone[tone] }]}>
              {label}
            </Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  bold: {
    fontWeight: '700',
  },
  semibold: {
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.85,
  },
  card: {
    borderWidth: 2,
    borderRadius: borderRadius.l,
    padding: spacing.m,
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    right: 0,
    top: 0,
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xxs,
    borderBottomLeftRadius: borderRadius.m,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    marginBottom: spacing.s,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: {
    borderWidth: 1,
    borderRadius: borderRadius.m,
    padding: spacing.m,
    alignItems: 'center',
    marginBottom: spacing.s,
  },
  rateRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  ratePill: {
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
});
