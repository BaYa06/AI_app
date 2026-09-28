/**
 * Sound Settings Screen
 * @description Звуки ответов и вибрация
 */
import React, { useCallback } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Switch, Platform } from 'react-native';
import { useThemeColors, useSettingsStore } from '@/store';
import { DatabaseService } from '@/services';
import { Text } from '@/components/common';
import { spacing, borderRadius } from '@/constants';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { playCorrectSound } from '@/utils/sound';
import { triggerHaptic } from '@/utils/haptic';

export function SoundSettingsScreen({ navigation }: any) {
  const colors = useThemeColors();
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const soundEnabled = useSettingsStore((s) => s.settings.soundEnabled);
  const hapticEnabled = useSettingsStore((s) => s.settings.hapticEnabled);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const isDark = resolvedTheme === 'dark';

  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9';
  const dividerColor = isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9';

  const handleToggleSound = useCallback(
    (value: boolean) => {
      updateSettings({ soundEnabled: value });
      DatabaseService.saveSettings();
      // Даём услышать, как звучит
      if (value) playCorrectSound();
    },
    [updateSettings],
  );

  const handleToggleHaptic = useCallback(
    (value: boolean) => {
      updateSettings({ hapticEnabled: value });
      DatabaseService.saveSettings();
      if (value) triggerHaptic('impactMedium');
    },
    [updateSettings],
  );

  return (
    <View style={[st.container, { backgroundColor: colors.background }]}>
      {/* ======== Header ======== */}
      <View style={[st.header, { backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#FFFFFF', borderBottomColor: cardBorder }]}>
        <Pressable
          style={[st.backBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[st.headerTitle, { color: colors.textPrimary }]}>Звук и вибрация</Text>
        <View style={st.headerSpacer} />
      </View>

      <ScrollView
        style={st.scroll}
        contentContainerStyle={st.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[st.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          {/* Sound */}
          <View style={st.toggleRow}>
            <View style={st.toggleInfo}>
              <Text style={[st.cardTitle, { color: colors.textPrimary }]}>Звуки ответов</Text>
              <Text style={[st.cardHint, { color: colors.textTertiary }]}>
                Сигнал при правильном ответе в тренировках
              </Text>
            </View>
            <Switch
              value={soundEnabled}
              onValueChange={handleToggleSound}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Haptic — на вебе вибрации нет */}
          {Platform.OS !== 'web' && (
            <>
              <View style={[st.divider, { backgroundColor: dividerColor }]} />
              <View style={st.toggleRow}>
                <View style={st.toggleInfo}>
                  <Text style={[st.cardTitle, { color: colors.textPrimary }]}>Вибрация</Text>
                  <Text style={[st.cardHint, { color: colors.textTertiary }]}>
                    Отклик на нажатия и ответы
                  </Text>
                </View>
                <Switch
                  value={hapticEnabled}
                  onValueChange={handleToggleHaptic}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </>
          )}
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
  divider: {
    height: 1,
    marginVertical: spacing.m,
  },
});
