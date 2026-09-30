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
import { useThemeColors } from '@/store';
import { spacing, borderRadius, alpha } from '@/constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';
import { CelebrationIcon } from '@/components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'OralTestResults'>;


export function OralTestResultsScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  // Акцент устного теста — оранжевый (streak), знает / не знает — success / error
  const ACCENT = colors.streak;
  const GREEN = colors.success;
  const RED = colors.error;
  const insets = useSafeAreaInsets();

  const { courseId, courseTitle, setTitle, total, known, unknown } = route.params;

  const knownPct = total > 0 ? Math.round((known / total) * 100) : 0;
  const unknownPct = total > 0 ? Math.round((unknown / total) * 100) : 0;

  const cardBg = colors.surface;
  const cardBorder = colors.border;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
            paddingTop: 12,
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
          <CelebrationIcon kind="party" size="l" style={styles.summaryIcon} />
          <Text style={[styles.summaryTitle, { color: colors.textPrimary }]}>
            Тренировка завершена
          </Text>
          <Text style={[styles.emptyNote, { color: colors.textSecondary }]}>
            Это тренажёр — результат нигде не сохраняется
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
              <View style={[styles.statBlock, { backgroundColor: alpha(GREEN, 10), borderColor: alpha(GREEN, 20) }]}>
                <Text style={[styles.statIcon]}>✓</Text>
                <Text style={[styles.statLabel, { color: GREEN }]}>Знает</Text>
                <Text style={[styles.statCount, { color: colors.textPrimary }]}>{known}</Text>
                <Text style={[styles.statPct, { color: GREEN }]}>{knownPct}%</Text>
              </View>

              <View style={[styles.statBlock, { backgroundColor: alpha(RED, 10), borderColor: alpha(RED, 20) }]}>
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
              <View style={[styles.progressBar, { backgroundColor: colors.surfaceMuted }]}>
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
                background: `linear-gradient(to top, ${colors.background} 60%, transparent)`,
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
            Провести ещё раз
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
          <Text style={[styles.primaryText, { color: colors.onPrimary }]}>Готово</Text>
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
  summaryIcon: {
    marginBottom: spacing.s,
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
    fontSize: 40,
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
    fontSize: 14,
    fontWeight: '600',
  },
  statCount: {
    fontSize: 40,
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
    borderRadius: borderRadius.s,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: borderRadius.s,
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
    fontSize: 16,
    fontWeight: '600',
  },
  primaryBtn: {
    borderRadius: borderRadius.l,
    paddingVertical: 16,
    alignItems: 'center',
    
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
