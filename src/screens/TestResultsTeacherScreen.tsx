/**
 * Test Results Teacher Screen
 * @description Результаты теста для учителя — подиум, лидерборд, сложные карточки
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Trophy,
  AlertTriangle,
  Download,
  Crown,
  X,
} from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors, useSettingsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';

const API_BASE = __DEV__ ? 'http://localhost:3000/api' : '/api';

type Props = NativeStackScreenProps<RootStackParamList, 'TestResultsTeacher'>;

type Participant = {
  name: string;
  initial: string;
  score: number;
  correct: number;
  total: number;
  finished: boolean;
};

type HardCard = {
  word: string;
  hint: string;
  missed: number;
  total: number;
};

type ResultsData = {
  setTitle: string;
  date: string;
  totalQuestions: number;
  avgScore: number;
  participants: Participant[];
  hardestCards: HardCard[];
};

const PODIUM_COLORS = {
  first: '#F59E0B',
  second: '#94A3B8',
  third: '#D97706',
};

const AVATAR_COLORS = ['#6366F1', '#EC4899', '#10B981', '#F59E0B', '#F97316'];

export function TestResultsTeacherScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const isDark = useSettingsStore((s) => s.resolvedTheme) === 'dark';
  const insets = useSafeAreaInsets();
  const { sessionId, courseId, courseTitle } = route.params;

  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchResults = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/test?action=results&sessionId=${sessionId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json: ResultsData = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message || 'Failed to load results');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const handleExportCSV = useCallback(async () => {
    if (!data) return;

    const header = 'Rank,Name,Score (%),Correct,Total,Finished';
    const rows = data.participants.map((p, idx) =>
      `${idx + 1},"${p.name}",${p.score},${p.correct},${p.total},${p.finished ? 'Yes' : 'No'}`
    );
    const hardHeader = '\n\nHardest Cards\nWord,Hint,Missed,Total';
    const hardRows = data.hardestCards.map(c =>
      `"${c.word}","${c.hint}",${c.missed},${c.total}`
    );

    const csv = [
      `Test Results: ${data.setTitle}`,
      `Date: ${new Date(data.date).toLocaleDateString()}`,
      `Average Score: ${data.avgScore}%`,
      `Total Questions: ${data.totalQuestions}`,
      '',
      header,
      ...rows,
      hardHeader,
      ...hardRows,
    ].join('\n');

    try {
      await Share.share({
        message: csv,
        title: `Test Results - ${data.setTitle}`,
      });
    } catch {
      Alert.alert('Export Error', 'Could not export results');
    }
  }, [data]);

  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9';

  // Loading state
  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Loading results...
        </Text>
      </View>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <AlertTriangle size={40} color="#F43F5E" />
        <Text style={[styles.errorText, { color: colors.textPrimary }]}>
          {error || 'No data'}
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.retryBtn,
            { backgroundColor: colors.primary },
            pressed && { opacity: 0.8 },
          ]}
          onPress={fetchResults}
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const { participants, hardestCards, setTitle, avgScore, totalQuestions } = data;

  // Podium: 2nd, 1st, 3rd
  const podium = [participants[1] || null, participants[0] || null, participants[2] || null];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={{ height: Platform.OS === 'web' ? 12 : insets.top }} />
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: isDark ? colors.background : 'rgba(255,255,255,0.85)',
          },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.closeBtn,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9' },
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => navigation.navigate('TeacherCourseStats', { courseId, courseTitle })}
        >
          <X size={18} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Test Results
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.exportHeaderBtn,
            { borderColor: colors.primary },
            pressed && { opacity: 0.7 },
          ]}
          onPress={handleExportCSV}
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
              <Text style={styles.summaryTitle}>{setTitle}</Text>
            </View>
          </View>
          <View style={styles.summaryBottom}>
            <View>
              <Text style={styles.summaryScore}>{avgScore}%</Text>
              <Text style={styles.summaryScoreLabel}>Average score</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.summaryStudents}>{participants.length} students</Text>
              <Text style={styles.summaryQuestions}>{totalQuestions} questions total</Text>
            </View>
          </View>
        </View>

        {/* Podium */}
        {participants.length >= 2 && (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Trophy size={20} color="#F59E0B" />
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Podium</Text>
            </View>

            <View style={styles.podiumRow}>
              {podium.map((student, idx) => {
                if (!student) return <View key={idx} style={styles.podiumCol} />;
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
                const placeLabel = place === 1 ? 'Winner' : place === 2 ? '2nd' : '3rd';
                const globalIdx = participants.indexOf(student);

                return (
                  <View key={student.name + place} style={styles.podiumCol}>
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
                          backgroundColor: AVATAR_COLORS[globalIdx % AVATAR_COLORS.length] + '25',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.podiumInitial,
                          {
                            fontSize: isFirst ? 22 : 18,
                            color: AVATAR_COLORS[globalIdx % AVATAR_COLORS.length],
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
        )}

        {/* Leaderboard */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Leaderboard
          </Text>
          <View style={styles.leaderList}>
            {participants.map((student, idx) => (
              <View
                key={student.name + idx}
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
        {hardestCards.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <AlertTriangle size={20} color="#F43F5E" />
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                Hardest Cards
              </Text>
            </View>
            <View style={styles.hardList}>
              {hardestCards.map((card, idx) => (
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
        )}
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
        <View style={styles.footerRow}>
          <Pressable
            style={({ pressed }) => [
              styles.backBtn,
              { borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#E2E8F0' },
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => navigation.navigate('TeacherCourseStats', { courseId, courseTitle })}
          >
            <Text style={[styles.backBtnText, { color: colors.textPrimary }]}>Back to Course</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.ctaBtn,
              { backgroundColor: colors.primary },
              pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
            ]}
            onPress={handleExportCSV}
          >
            <Download size={18} color="#FFFFFF" />
            <Text style={styles.ctaText}>Export</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: borderRadius.m,
    marginTop: 8,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
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

  // Header close button
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
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
  footerRow: {
    flexDirection: 'row',
    gap: spacing.s,
    alignItems: 'center',
  },
  backBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: borderRadius.l,
    borderWidth: 1,
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  ctaBtn: {
    flex: 1,
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
    fontSize: 15,
    fontWeight: '700',
  },
});
