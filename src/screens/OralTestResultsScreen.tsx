/**
 * Oral Test Results Screen
 * @description Экран итогов устного теста
 */
import React from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/common';
import { useThemeColors, useSettingsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'OralTestResults'>;

const GREEN = '#10B981';
const RED = '#EF4444';
const ACCENT = '#F97316';

export function OralTestResultsScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const isDark = useSettingsStore((s) => s.resolvedTheme) === 'dark';
  const insets = useSafeAreaInsets();

  const { courseId, courseTitle, setTitle, total, known, unknown } = route.params;

  const knownPct = total > 0 ? Math.round((known / total) * 100) : 0;
  const unknownPct = total > 0 ? Math.round((unknown / total) * 100) : 0;

  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: isDark ? colors.background : 'rgba(255,255,255,0.85)',
            borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
            paddingTop: Platform.OS === 'web' ? 12 : insets.top + 8,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Результаты
        </Text>
        <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
          {setTitle}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 160 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary card */}
        <View style={[styles.summaryCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={styles.summaryEmoji}>🎉</Text>
          <Text style={[styles.summaryTitle, { color: colors.textPrimary }]}>
            Устный тест завершён
          </Text>

          {total === 0 ? (
            <Text style={[styles.emptyNote, { color: colors.textSecondary }]}>
              Ни одна карточка не была пройдена
            </Text>
          ) : (
            <>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                Пройдено карточек
              </Text>
              <Text style={[styles.summaryCount, { color: colors.textPrimary }]}>
                {total}
              </Text>
            </>
          )}
        </View>

        {total > 0 && (
          <>
            {/* Known / Unknown blocks */}
            <View style={styles.statsRow}>
              <View style={[styles.statBlock, { backgroundColor: GREEN + '12', borderColor: GREEN + '30' }]}>
                <Text style={[styles.statIcon]}>✓</Text>
                <Text style={[styles.statLabel, { color: GREEN }]}>Знает</Text>
                <Text style={[styles.statCount, { color: colors.textPrimary }]}>{known}</Text>
                <Text style={[styles.statPct, { color: GREEN }]}>{knownPct}%</Text>
              </View>

              <View style={[styles.statBlock, { backgroundColor: RED + '12', borderColor: RED + '30' }]}>
                <Text style={[styles.statIcon]}>✗</Text>
                <Text style={[styles.statLabel, { color: RED }]}>Не знает</Text>
                <Text style={[styles.statCount, { color: colors.textPrimary }]}>{unknown}</Text>
                <Text style={[styles.statPct, { color: RED }]}>{unknownPct}%</Text>
              </View>
            </View>

            {/* Progress bar */}
            <View style={styles.finalSection}>
              <Text style={[styles.finalLabel, { color: colors.textPrimary }]}>
                Итоговый результат
              </Text>
              <View style={[styles.progressBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB' }]}>
                <View
                  style={[
                    styles.progressFill,
                    { backgroundColor: GREEN, width: `${knownPct}%` as any },
                  ]}
                />
              </View>
              <Text style={[styles.finalPct, { color: GREEN }]}>{knownPct}%</Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Footer buttons */}
      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + 16,
            ...Platform.select({
              web: {
                background: isDark
                  ? 'linear-gradient(to top, #101122 60%, transparent)'
                  : 'linear-gradient(to top, #f6f6f8 60%, transparent)',
              },
            }) as any,
            backgroundColor: Platform.OS !== 'web' ? colors.background : undefined,
          },
        ]}
      >
        <Pressable
          onPress={() =>
            navigation.replace('OralTestLobby', { courseId, courseTitle })
          }
          style={({ pressed }) => [
            styles.outlineBtn,
            { borderColor: colors.textSecondary },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Text style={[styles.outlineText, { color: colors.textSecondary }]}>
            Провести ещё один тест
          </Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: ACCENT },
            pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
          ]}
        >
          <Text style={styles.primaryText}>Готово</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.l,
    paddingBottom: 14,
    borderBottomWidth: 1,
    alignItems: 'center',
    ...Platform.select({
      web: { backdropFilter: 'blur(12px)' },
    }) as any,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  scroll: {
    padding: spacing.l,
    gap: 16,
  },
  summaryCard: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
    gap: 8,
  },
  summaryEmoji: {
    fontSize: 40,
    marginBottom: 4,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  summaryLabel: {
    fontSize: 14,
    marginTop: 8,
  },
  summaryCount: {
    fontSize: 48,
    fontWeight: '700',
    lineHeight: 56,
  },
  emptyNote: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statBlock: {
    flex: 1,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    padding: spacing.m,
    alignItems: 'center',
    gap: 4,
  },
  statIcon: {
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  statCount: {
    fontSize: 36,
    fontWeight: '700',
    lineHeight: 44,
  },
  statPct: {
    fontSize: 18,
    fontWeight: '600',
  },
  finalSection: {
    gap: 10,
  },
  finalLabel: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  finalPct: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.l,
    paddingTop: spacing.l,
    gap: 10,
  },
  outlineBtn: {
    borderWidth: 1.5,
    borderRadius: borderRadius.l,
    paddingVertical: 14,
    alignItems: 'center',
  },
  outlineText: {
    fontSize: 15,
    fontWeight: '600',
  },
  primaryBtn: {
    borderRadius: borderRadius.l,
    paddingVertical: 16,
    alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0 4px 16px rgba(249,115,22,0.3)' },
    }) as any,
    shadowColor: ACCENT,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
