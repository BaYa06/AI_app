/**
 * Test Results Teacher Screen
 * @description Результаты теста для учителя — подиум, лидерборд, сложные карточки
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
import {
  Trophy,
  AlertTriangle,
  Download,
  Crown,
} from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors, useSettingsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'TestResultsTeacher'>;

// Mock data
const LEADERBOARD = [
  { id: '1', name: 'Alex Wong', initial: 'A', score: 95 },
  { id: '2', name: 'Sarah J.', initial: 'S', score: 88 },
  { id: '3', name: 'M. Chen', initial: 'M', score: 82 },
  { id: '4', name: 'Lucas P.', initial: 'L', score: 64 },
  { id: '5', name: 'Nina Rose', initial: 'N', score: 51 },
];

const HARDEST_CARDS = [
  { word: 'Ambivalent', hint: 'Having mixed feelings...', missed: 4, total: 5 },
  { word: 'Ephemeral', hint: 'Lasting for a short time...', missed: 3, total: 5 },
];

const PODIUM_COLORS = {
  first: '#F59E0B',
  second: '#94A3B8',
  third: '#D97706',
};

const AVATAR_COLORS = ['#6366F1', '#EC4899', '#10B981', '#F59E0B', '#F97316'];

export function TestResultsTeacherScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const isDark = useSettingsStore((s) => s.resolvedTheme) === 'dark';
  const insets = useSafeAreaInsets();

  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9';

  const avgScore = Math.round(LEADERBOARD.reduce((s, l) => s + l.score, 0) / LEADERBOARD.length);

  const podium = [LEADERBOARD[1], LEADERBOARD[0], LEADERBOARD[2]]; // 2nd, 1st, 3rd order

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: isDark ? colors.background : 'rgba(255,255,255,0.85)',
            paddingTop: insets.top + 8,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Test Results
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.exportHeaderBtn,
            { borderColor: colors.primary },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={[styles.exportHeaderText, { color: colors.primary }]}>Export</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryLabel}>LIVE SESSION COMPLETE</Text>
              <Text style={styles.summaryTitle}>English Vocabulary A2</Text>
            </View>
          </View>
          <View style={styles.summaryBottom}>
            <View>
              <Text style={styles.summaryScore}>{avgScore}%</Text>
              <Text style={styles.summaryScoreLabel}>Average score</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.summaryStudents}>{LEADERBOARD.length} students</Text>
              <Text style={styles.summaryQuestions}>20 questions total</Text>
            </View>
          </View>
        </View>

        {/* Podium */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Trophy size={20} color="#F59E0B" />
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Podium</Text>
          </View>

          <View style={styles.podiumRow}>
            {podium.map((student, idx) => {
              if (!student) return null;
              const place = idx === 0 ? 2 : idx === 1 ? 1 : 3;
              const isFirst = place === 1;
              const avatarSize = isFirst ? 68 : 56;
              const pedestalHeight = isFirst ? 88 : place === 2 ? 56 : 40;
              const borderColor = place === 1
                ? PODIUM_COLORS.first
                : place === 2 ? PODIUM_COLORS.second : PODIUM_COLORS.third + '80';
              const pedestalBg = isFirst
                ? (isDark ? colors.primary + '25' : colors.primary + '15')
                : (isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9');
              const placeLabel = place === 1 ? 'Winner' : `${place}nd`;

              return (
                <View key={student.id} style={styles.podiumCol}>
                  {isFirst && (
                    <Crown
                      size={24}
                      color="#F59E0B"
                      fill="#F59E0B"
                      style={{ marginBottom: -4 }}
                    />
                  )}
                  <View
                    style={[
                      styles.podiumAvatar,
                      {
                        width: avatarSize,
                        height: avatarSize,
                        borderRadius: avatarSize / 2,
                        borderColor,
                        backgroundColor: AVATAR_COLORS[LEADERBOARD.indexOf(student) % AVATAR_COLORS.length] + '25',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.podiumInitial,
                        {
                          fontSize: isFirst ? 22 : 18,
                          color: AVATAR_COLORS[LEADERBOARD.indexOf(student) % AVATAR_COLORS.length],
                        },
                      ]}
                    >
                      {student.initial}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.pedestal,
                      {
                        height: pedestalHeight,
                        backgroundColor: pedestalBg,
                        borderTopColor: isFirst ? colors.primary : 'transparent',
                        borderTopWidth: isFirst ? 2 : 0,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pedestalName,
                        {
                          color: colors.textPrimary,
                          fontSize: isFirst ? 13 : 11,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {student.name}
                    </Text>
                    <Text style={[styles.pedestalPlace, { color: colors.primary }]}>
                      {placeLabel}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Leaderboard */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Leaderboard
          </Text>
          <View style={styles.leaderList}>
            {LEADERBOARD.map((student, idx) => (
              <View
                key={student.id}
                style={[styles.leaderRow, { backgroundColor: cardBg, borderColor: cardBorder }]}
              >
                <Text style={[styles.leaderRank, { color: colors.textSecondary }]}>
                  {idx + 1}
                </Text>
                <View
                  style={[
                    styles.leaderAvatar,
                    { backgroundColor: AVATAR_COLORS[idx % AVATAR_COLORS.length] + '20' },
                  ]}
                >
                  <Text
                    style={[
                      styles.leaderAvatarText,
                      { color: AVATAR_COLORS[idx % AVATAR_COLORS.length] },
                    ]}
                  >
                    {student.initial}
                  </Text>
                </View>
                <Text style={[styles.leaderName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {student.name}
                </Text>
                <Text style={[styles.leaderScore, { color: colors.primary }]}>
                  {student.score}%
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Hardest Cards */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <AlertTriangle size={20} color="#F43F5E" />
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Hardest Cards
            </Text>
          </View>
          <View style={styles.hardList}>
            {HARDEST_CARDS.map((card, idx) => (
              <View
                key={idx}
                style={[
                  styles.hardCard,
                  {
                    backgroundColor: isDark ? 'rgba(244,63,94,0.08)' : '#FFF1F2',
                    borderColor: isDark ? 'rgba(244,63,94,0.15)' : '#FECDD3',
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.hardWord, { color: colors.textPrimary }]}>
                    {card.word}
                  </Text>
                  <Text style={[styles.hardHint, { color: colors.textSecondary }]}>
                    "{card.hint}"
                  </Text>
                </View>
                <View
                  style={[
                    styles.missedBadge,
                    {
                      backgroundColor: isDark ? 'rgba(244,63,94,0.15)' : '#FFE4E6',
                    },
                  ]}
                >
                  <Text style={styles.missedText}>
                    {card.missed}/{card.total} Missed
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Footer CTA */}
      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + 16,
            borderTopColor: cardBorder,
            ...Platform.select({
              web: {
                background: isDark
                  ? 'linear-gradient(to top, #101122 70%, transparent)'
                  : 'linear-gradient(to top, #f6f6f8 70%, transparent)',
              },
            }) as any,
            backgroundColor: Platform.OS !== 'web' ? colors.background : undefined,
          },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.ctaBtn,
            { backgroundColor: colors.primary },
            pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
          ]}
          onPress={() => {/* TODO: export */}}
        >
          <Download size={20} color="#FFFFFF" />
          <Text style={styles.ctaText}>Export All Results</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
    paddingBottom: spacing.s,
    ...Platform.select({
      web: { backdropFilter: 'blur(12px)' },
    }) as any,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  exportHeaderBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  exportHeaderText: {
    fontSize: 13,
    fontWeight: '700',
  },

  scroll: {
    paddingHorizontal: spacing.m,
    gap: spacing.l,
    paddingTop: spacing.s,
  },

  // Summary
  summaryCard: {
    borderRadius: borderRadius.l,
    padding: spacing.l,
    backgroundColor: '#6366F1',
    ...Platform.select({
      web: {
        backgroundImage: 'linear-gradient(135deg, #6467f2, #6467f299)',
        boxShadow: '0 8px 24px rgba(100,103,242,0.25)',
      },
    }) as any,
    shadowColor: '#6366F1',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 4,
    letterSpacing: -0.3,
  },
  summaryBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 20,
  },
  summaryScore: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  summaryScoreLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
  },
  summaryStudents: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  summaryQuestions: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },

  // Section
  section: {
    gap: spacing.m,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },

  // Podium
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: spacing.s,
    height: 200,
  },
  podiumCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  podiumAvatar: {
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podiumInitial: {
    fontWeight: '700',
  },
  pedestal: {
    width: '100%',
    borderTopLeftRadius: borderRadius.m,
    borderTopRightRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    gap: 2,
  },
  pedestalName: {
    fontWeight: '700',
    textAlign: 'center',
  },
  pedestalPlace: {
    fontSize: 10,
    fontWeight: '700',
  },

  // Leaderboard
  leaderList: {
    gap: spacing.xs,
  },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.s,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    gap: 12,
    ...Platform.select({
      web: { boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
    }) as any,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  leaderRank: {
    width: 24,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
  },
  leaderAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderAvatarText: {
    fontSize: 15,
    fontWeight: '700',
  },
  leaderName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  leaderScore: {
    fontSize: 15,
    fontWeight: '700',
  },

  // Hardest cards
  hardList: {
    gap: spacing.s,
  },
  hardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.m,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    gap: spacing.s,
  },
  hardWord: {
    fontSize: 15,
    fontWeight: '700',
  },
  hardHint: {
    fontSize: 12,
    fontWeight: '400',
    fontStyle: 'italic',
    marginTop: 2,
  },
  missedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.s,
  },
  missedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F43F5E',
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.m,
    paddingTop: spacing.l,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: borderRadius.l,
    gap: 8,
    ...Platform.select({
      web: { boxShadow: '0 4px 16px rgba(100,103,242,0.25)' },
    }) as any,
    shadowColor: '#6467F2',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
