/**
 * Learning Settings Screen
 * @description Настройки обучения: размер порции и обратный режим
 */
import React, { useCallback } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useThemeColors, useSettingsStore } from '@/store';
import { DatabaseService } from '@/services';
import { Text } from '@/components/common';
import { Card, Screen, ScreenHeader, Switch } from '@/components/ui';
import { spacing, borderRadius, heights } from '@/constants';

const CARD_LIMIT_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: 10, label: '10' },
  { value: 20, label: '20' },
  { value: 30, label: '30' },
  { value: null, label: 'Все' },
];

export function LearningSettingsScreen({ navigation }: any) {
  const colors = useThemeColors();
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
      {/* ======== Card Limit ======== */}
      <Text variant="overline" color="secondary" style={st.groupLabel}>Тренировка</Text>
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
