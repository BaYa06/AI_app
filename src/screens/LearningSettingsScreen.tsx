/**
 * Learning Settings Screen
 * @description Настройки обучения: размер порции и обратный режим
 */
import React, { useCallback } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Switch } from 'react-native';
import { useThemeColors, useSettingsStore } from '@/store';
import { DatabaseService } from '@/services';
import { Text } from '@/components/common';
import { spacing, borderRadius } from '@/constants';
import Ionicons from 'react-native-vector-icons/Ionicons';

const CARD_LIMIT_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: 10, label: '10' },
  { value: 20, label: '20' },
  { value: 30, label: '30' },
  { value: null, label: 'Все' },
];

export function LearningSettingsScreen({ navigation }: any) {
  const colors = useThemeColors();
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const studyCardLimit = useSettingsStore((s) => s.settings.studyCardLimit);
  const reverseCards = useSettingsStore((s) => s.settings.reverseCards);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const isDark = resolvedTheme === 'dark';

  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9';
  const chipBg = isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9';

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
    <View style={[st.container, { backgroundColor: colors.background }]}>
      {/* ======== Header ======== */}
      <View style={[st.header, { backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#FFFFFF', borderBottomColor: cardBorder }]}>
        <Pressable
          style={[st.backBtn, { backgroundColor: chipBg }]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[st.headerTitle, { color: colors.textPrimary }]}>Настройки обучения</Text>
        <View style={st.headerSpacer} />
      </View>

      <ScrollView
        style={st.scroll}
        contentContainerStyle={st.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ======== Card Limit ======== */}
        <Text style={[st.groupLabel, { color: colors.textTertiary }]}>Тренировка</Text>
        <View style={[st.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[st.cardTitle, { color: colors.textPrimary }]}>Слов за одну тренировку</Text>
          <Text style={[st.cardHint, { color: colors.textTertiary }]}>
            Сколько карточек в одной порции. Остальные будут в следующей.
          </Text>
          <View style={st.chipsRow}>
            {CARD_LIMIT_OPTIONS.map((opt) => {
              const active = studyCardLimit === opt.value;
              return (
                <Pressable
                  key={opt.label}
                  onPress={() => handleSelectLimit(opt.value)}
                  style={[st.chip, { backgroundColor: active ? colors.primary : chipBg }]}
                >
                  <Text style={[st.chipText, { color: active ? '#FFFFFF' : colors.textPrimary }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ======== Reverse ======== */}
        <View style={[st.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={st.toggleRow}>
            <View style={st.toggleInfo}>
              <Text style={[st.cardTitle, { color: colors.textPrimary }]}>Обратный режим</Text>
              <Text style={[st.cardHint, { color: colors.textTertiary, marginBottom: 0 }]}>
                Показывать перевод, а вспоминать слово
              </Text>
            </View>
            <Switch
              value={reverseCards}
              onValueChange={handleToggleReverse}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ==================== СТИЛИ ====================

const st = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.l,
    paddingBottom: spacing.xxl + 40,
  },

  // Group label
  groupLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: spacing.s,
    paddingHorizontal: spacing.xxs,
  },

  // Card
  card: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.m,
    marginBottom: spacing.m,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardHint: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: spacing.m,
  },

  // Chips
  chipsRow: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  chip: {
    flex: 1,
    height: 44,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 15,
    fontWeight: '700',
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
  },
  toggleInfo: {
    flex: 1,
  },
});
