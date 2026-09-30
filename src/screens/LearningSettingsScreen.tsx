/**
 * Learning Settings Screen
 * @description Настройки обучения: новые слова в уроке дня, размер порции и обратный режим
 */
import React, { useCallback } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useThemeColors, useSettingsStore } from '@/store';
import { DatabaseService } from '@/services';
import { Text } from '@/components/common';
import { Card, Screen, ScreenHeader, Switch } from '@/components/ui';
import { spacing, borderRadius, heights } from '@/constants';
import { NEW_PER_DAY_OPTIONS } from '@/services/LessonService';
import { pluralize } from '@/utils';

const CARD_LIMIT_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: 10, label: '10' },
  { value: 20, label: '20' },
  { value: 30, label: '30' },
  { value: null, label: 'Все' },
];

export function LearningSettingsScreen({ navigation }: any) {
  const colors = useThemeColors();
  const lessonNewPerDay = useSettingsStore((s) => s.settings.lessonNewPerDay);
  const studyCardLimit = useSettingsStore((s) => s.settings.studyCardLimit);
  const reverseCards = useSettingsStore((s) => s.settings.reverseCards);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const handleSelectLimit = useCallback(
    (value: number | null) => {
      updateSettings({ studyCardLimit: value });
      DatabaseService.saveSettings();
    },
    [updateSettings],
  );

  const handleSelectNewPerDay = useCallback(
    (value: number) => {
      updateSettings({ lessonNewPerDay: value });
      DatabaseService.saveSettings();
    },
    [updateSettings],
  );

  const handleToggleReverse = useCallback(
    (value: boolean) => {
      updateSettings({ reverseCards: value });
      DatabaseService.saveSettings();
    },
    [updateSettings],
  );

  return (
    <Screen
      header={<ScreenHeader title="Настройки обучения" onBack={() => navigation.goBack()} bordered />}
      contentStyle={st.content}
    >
      {/* ======== Урок дня ======== */}
      <Text variant="overline" color="secondary" style={st.groupLabel}>Урок дня</Text>
      <Card style={st.card}>
        <Text variant="body" style={[st.cardTitle, { color: colors.textPrimary }]}>Новых слов в день</Text>
        <Text variant="bodySmall" color="secondary" style={st.cardHint}>
          Сколько новых слов добавлять в урок на главной. Больше — быстрее пройдёшь наборы, но урок дольше.
        </Text>
        <View style={st.chipsRow} accessibilityRole="radiogroup">
          {NEW_PER_DAY_OPTIONS.map((value) => {
            const active = lessonNewPerDay === value;
            return (
              <Pressable
                key={value}
                onPress={() => handleSelectNewPerDay(value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={`${value} ${pluralize(value, 'новое слово', 'новых слова', 'новых слов')} в день`}
                style={[st.chip, { backgroundColor: active ? colors.primaryFill : colors.surfaceMuted }]}
              >
                <Text variant="button" style={[st.chipText, { color: active ? colors.onPrimary : colors.textPrimary }]}>
                  {value}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* ======== Card Limit ======== */}
      <Text variant="overline" color="secondary" style={[st.groupLabel, st.groupLabelSpaced]}>Тренировка</Text>
      <Card style={st.card}>
        <Text variant="body" style={[st.cardTitle, { color: colors.textPrimary }]}>Слов за одну тренировку</Text>
        <Text variant="bodySmall" color="secondary" style={st.cardHint}>
          Сколько карточек в одной порции. Остальные будут в следующей.
        </Text>
        <View style={st.chipsRow} accessibilityRole="radiogroup">
          {CARD_LIMIT_OPTIONS.map((opt) => {
            const active = studyCardLimit === opt.value;
            return (
              <Pressable
                key={opt.label}
                onPress={() => handleSelectLimit(opt.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                style={[st.chip, { backgroundColor: active ? colors.primaryFill : colors.surfaceMuted }]}
              >
                <Text variant="button" style={[st.chipText, { color: active ? colors.onPrimary : colors.textPrimary }]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* ======== Reverse ======== */}
      <Card style={st.card}>
        <View style={st.toggleRow}>
          <View style={st.toggleInfo}>
            <Text variant="body" style={[st.cardTitle, { color: colors.textPrimary }]}>Обратный режим</Text>
            <Text variant="bodySmall" color="secondary">
              Показывать перевод, а вспоминать слово
            </Text>
          </View>
          <Switch value={reverseCards} onValueChange={handleToggleReverse} accessibilityLabel="Обратный режим" />
        </View>
      </Card>
    </Screen>
  );
}

// ==================== СТИЛИ ====================

const st = StyleSheet.create({
  content: {
    paddingTop: spacing.l,
  },
  groupLabel: {
    marginBottom: spacing.xs,
    marginLeft: spacing.xxs,
  },
  groupLabelSpaced: {
    marginTop: spacing.l,
  },
  card: {
    marginBottom: spacing.s,
  },
  cardTitle: {
    fontWeight: '600',
    marginBottom: spacing.xxs,
  },
  cardHint: {
    marginBottom: spacing.m,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  chip: {
    flex: 1,
    height: heights.touch,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontWeight: '700',
    letterSpacing: 0,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
  },
  toggleInfo: {
    flex: 1,
  },
});
