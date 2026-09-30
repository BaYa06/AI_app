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
import { useThemeColors } from '@/store';
import { spacing, borderRadius, alpha, type ColorToken } from '@/constants';
import { toast } from '@/components/ui';
import { supabase } from '@/services/supabaseClient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';

import { API_BASE } from '@/config/apiBase';
import { describeTestError } from '@/utils/testApiErrors';
import { pluralize } from '@/utils';

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

// Медали и аватары — имена токенов, значения берутся из темы
const PODIUM_TOKENS: Record<'first' | 'second' | 'third', ColorToken> = {
  first: 'star',
  second: 'silver',
  third: 'bronze',
};

const AVATAR_TOKENS: ColorToken[] = ['primaryFill', 'like', 'success', 'warning', 'streak'];

export function TestResultsTeacherScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { sessionId, courseId, courseTitle } = route.params;

  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchResults = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: authData } = await supabase.auth.getSession();
      const token = authData.session?.access_token;
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${API_BASE}/test?action=results&sessionId=${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json: ResultsData = await res.json();
      setData(json);
    } catch (e: any) {
      setError(describeTestError(e, 'Не удалось загрузить результаты.'));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const handleExportCSV = useCallback(async () => {
    if (!data) return;

    const header = 'Место,Имя,Результат (%),Верно,Всего,Завершил';
    const rows = data.participants.map((p, idx) =>
      `${idx + 1},"${p.name}",${p.score},${p.correct},${p.total},${p.finished ? 'Да' : 'Нет'}`
    );
    const hardHeader = '\n\nСамые трудные слова\nСлово,Подсказка,Ошибок,Всего';
    const hardRows = data.hardestCards.map(c =>
      `"${c.word}","${c.hint}",${c.missed},${c.total}`
    );

    const csv = [
      `Результаты теста: ${data.setTitle}`,
      `Дата: ${new Date(data.date).toLocaleDateString('ru-RU')}`,
      `Средний результат: ${data.avgScore}%`,
      `Вопросов: ${data.totalQuestions}`,
      '',
      header,
      ...rows,
      hardHeader,
      ...hardRows,
    ].join('\n');

    try {
      await Share.share({
        message: csv,
        title: `Результаты теста — ${data.setTitle}`,
      });
    } catch {
      toast.error('Не удалось выгрузить результаты');
    }
  }, [data]);

  const cardBg = colors.surface;
  const cardBorder = colors.border;

  // Loading state
  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Загружаем результаты…
        </Text>
      </View>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <AlertTriangle size={40} color={colors.error} />
        <Text style={[styles.errorText, { color: colors.textPrimary }]}>
          {error || 'Нет данных'}
        </Text>
        <Pressable accessibilityRole="button"
          style={({ pressed }) => [
            styles.retryBtn,
            { backgroundColor: colors.primaryFill },
            pressed && { opacity: 0.8 },
          ]}
          onPress={fetchResults}
        >
          <Text style={[styles.retryText, { color: colors.onPrimary }]}>Повторить</Text>
        </Pressable>
      </View>
    );
  }

  const { participants, hardestCards, setTitle, avgScore, totalQuestions } = data;

  // Podium: 2nd, 1st, 3rd
  const podium = [participants[1] || null, participants[0] || null, participants[2] || null];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={{ height: 12 }} />
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.background,
          },
        ]}
      >
        <Pressable hitSlop={spacing.xs}
          accessibilityRole="button"
          accessibilityLabel="Закрыть"
          style={({ pressed }) => [
            styles.closeBtn,
            { backgroundColor: colors.surfaceMuted },
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => navigation.navigate('TeacherCourseStats', { courseId, courseTitle })}
        >
          <X size={18} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Результаты теста
        </Text>
        <Pressable accessibilityRole="button"
          style={({ pressed }) => [
            styles.exportHeaderBtn,
            { borderColor: colors.primary },
            pressed && { opacity: 0.7 },
          ]}
          onPress={handleExportCSV}
        >
          <Text style={[styles.exportHeaderText, { color: colors.primary }]}>Выгрузить</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Card */}
        <View style={[styles.summaryCard, { backgroundColor: colors.primaryFill }]}>
          <View style={styles.summaryTop}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.summaryLabel, { color: colors.onPrimary }]}>Тест завершён</Text>
              <Text style={[styles.summaryTitle, { color: colors.onPrimary }]}>{setTitle}</Text>
            </View>
          </View>
          <View style={styles.summaryBottom}>
            <View>
              <Text style={[styles.summaryScore, { color: colors.onPrimary }]}>{avgScore}%</Text>
              <Text style={[styles.summaryScoreLabel, { color: colors.onPrimary }]}>Средний результат</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.summaryStudents, { color: colors.onPrimary }]}>{participants.length} {pluralize(participants.length, 'ученик', 'ученика', 'учеников')}</Text>
              <Text style={[styles.summaryQuestions, { color: colors.onPrimary }]}>Всего {totalQuestions} {pluralize(totalQuestions, 'вопрос', 'вопроса', 'вопросов')}</Text>
            </View>
          </View>
        </View>

        {/* Podium */}
        {participants.length >= 2 && (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Trophy size={20} color={colors.warning} />
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Лучшие</Text>
            </View>

            <View style={styles.podiumRow}>
              {podium.map((student, idx) => {
                if (!student) return <View key={idx} style={styles.podiumCol} />;
                const place = idx === 0 ? 2 : idx === 1 ? 1 : 3;
                const isFirst = place === 1;
                const avatarSize = isFirst ? 68 : 56;
                const pedestalHeight = isFirst ? 88 : place === 2 ? 56 : 40;
                const borderColor = place === 1
                  ? colors[PODIUM_TOKENS.first]
                  : place === 2 ? colors[PODIUM_TOKENS.second] : colors[PODIUM_TOKENS.third];
                const pedestalBg = isFirst
                  ? (alpha(colors.primary, 10))
                  : (colors.surfaceMuted);
                const placeLabel = place === 1 ? 'Победитель' : place === 2 ? '2-е место' : '3-е место';
                const globalIdx = participants.indexOf(student);

                return (
                  <View key={student.name + place} style={styles.podiumCol}>
                    {isFirst && (
                      <Crown
                        size={24}
                        color={colors.warning}
                        fill={colors.warning}
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
                          backgroundColor: alpha(colors[AVATAR_TOKENS[globalIdx % AVATAR_TOKENS.length]], 20),
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.podiumInitial,
                          {
                            fontSize: isFirst ? 22 : 18,
                            color: colors[AVATAR_TOKENS[globalIdx % AVATAR_TOKENS.length]],
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
            Рейтинг
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
                    { backgroundColor: alpha(colors[AVATAR_TOKENS[idx % AVATAR_TOKENS.length]], 20) },
                  ]}
                >
                  <Text
                    style={[
                      styles.leaderAvatarText,
                      { color: colors[AVATAR_TOKENS[idx % AVATAR_TOKENS.length]] },
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
              <AlertTriangle size={20} color={colors.error} />
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                Самые трудные слова
              </Text>
            </View>
            <View style={styles.hardList}>
              {hardestCards.map((card, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.hardCard,
                    {
                      backgroundColor: alpha(colors.error, 10),
                      borderColor: alpha(colors.error, 10),
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
                        backgroundColor: alpha(colors.error, 10),
                      },
                    ]}
                  >
                    <Text style={[styles.missedText, { color: colors.errorText }]}>
                      Ошибок: {card.missed} из {card.total}
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
                background: `linear-gradient(to top, ${colors.background} 70%, transparent)`,
              },
            }) as any,
            backgroundColor: Platform.OS !== 'web' ? colors.background : undefined,
          },
        ]}
      >
        <View style={styles.footerRow}>
          <Pressable accessibilityRole="button"
            style={({ pressed }) => [
              styles.backBtn,
              { borderColor: colors.border },
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => navigation.navigate('TeacherCourseStats', { courseId, courseTitle })}
          >
            <Text style={[styles.backBtnText, { color: colors.textPrimary }]}>К курсу</Text>
          </Pressable>
          <Pressable accessibilityRole="button"
            style={({ pressed }) => [
              styles.ctaBtn,
              { backgroundColor: colors.primaryFill },
              pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
            ]}
            onPress={handleExportCSV}
          >
            <Download size={18} color={colors.onPrimary} />
            <Text style={[styles.ctaText, { color: colors.onPrimary }]}>Выгрузить</Text>
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
    fontWeight: '600',
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
    fontSize: 16,
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
    fontSize: 14,
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
  },
  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: '700',
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
    fontWeight: '700',
  },
  summaryScoreLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  summaryStudents: {
    fontSize: 16,
    fontWeight: '600',
  },
  summaryQuestions: {
    fontSize: 12,
    fontWeight: '600',
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
    fontSize: 16,
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
    fontSize: 12,
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
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderAvatarText: {
    fontSize: 16,
    fontWeight: '700',
  },
  leaderName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  leaderScore: {
    fontSize: 16,
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
    fontSize: 16,
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
    fontSize: 12,
    fontWeight: '700',
  },

  // Header close button
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.l,
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
    fontSize: 16,
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
    
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
