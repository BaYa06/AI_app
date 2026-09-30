/**
 * Live Test Monitor Screen
 * @description Экран мониторинга теста в реальном времени для учителя
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Users, Check, StopCircle, ClipboardList } from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, alpha, type ColorToken, iconSize } from '@/constants';
import { supabase } from '@/services/supabaseClient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';

import { API_BASE } from '@/config/apiBase';

// Цвета аватаров участников — имена токенов, значения берутся из темы
const AVATAR_TOKENS: ColorToken[] = ['primaryFill', 'warning', 'like', 'success', 'streak'];

type Props = NativeStackScreenProps<RootStackParamList, 'LiveTest'>;

interface StudentProgress {
  userId: string;
  name: string;
  initial: string;
  answered: number;
  total: number;
  done: boolean;
}

export function LiveTestScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { sessionId } = route.params;

  const [students, setStudents] = useState<StudentProgress[]>([]);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [ending, setEnding] = useState(false);
  const [questionCount, setQuestionCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasNavigated = useRef(false);

  const goToResults = useCallback(() => {
    if (hasNavigated.current) return;
    hasNavigated.current = true;
    navigation.replace('TestResultsTeacher', {
      courseId: route.params.courseId,
      courseTitle: route.params.courseTitle,
      sessionId,
    });
  }, [sessionId, route.params]);

  // Загрузить данные через monitor — сразу и затем каждые 4с как fallback поверх Realtime
  // (раньше был только один вызов при монтировании + подписка; если broadcast пропадёт —
  // например, реконнект сокета — экран замирал до следующего realtime-события). См. план,
  // пункт 44.
  const fetchMonitor = useCallback(async (mountedRef: { current: boolean }) => {
    try {
      const { data: authData } = await supabase.auth.getSession();
      const token = authData.session?.access_token;
      if (!token) return;
      const resp = await fetch(`${API_BASE}/test?action=monitor&sessionId=${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (!mountedRef.current) return;

      if (data.status === 'finished') { goToResults(); return; }

      setQuestionCount(data.questionCount || 0);
      setStudents(data.participants || []);

      // Вычислить оставшееся время
      if (data.timePerQuestion > 0 && data.startedAt && data.questionCount) {
        const totalSec = data.timePerQuestion * data.questionCount;
        const elapsed = Math.floor((Date.now() - new Date(data.startedAt).getTime()) / 1000);
        setTimeLeft(Math.max(0, totalSec - elapsed));
      }
    } catch (e) {
      console.error('Monitor fetch error:', e);
    }
  }, [sessionId, goToResults]);

  useEffect(() => {
    const mountedRef = { current: true };
    fetchMonitor(mountedRef);
    const interval = setInterval(() => fetchMonitor(mountedRef), 4000);
    return () => { mountedRef.current = false; clearInterval(interval); };
  }, [fetchMonitor]);

  // Таймер обратного отсчёта
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t === null || t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timeLeft !== null && timeLeft > 0]);

  // Auto-finish: время вышло
  useEffect(() => {
    if (timeLeft === 0 && !hasNavigated.current) {
      handleEndTest();
    }
  }, [timeLeft]);

  // Auto-finish: все ученики завершили
  useEffect(() => {
    if (students.length > 0 && students.every(s => s.done) && !hasNavigated.current) {
      handleEndTest();
    }
  }, [students]);

  // Realtime: progress_update — сопоставление по userId, а не по displayName (два "Гостя" в
  // одной сессии раньше перезаписывали друг друга, т.к. имена не уникальны). См. план, пункт 43.
  useEffect(() => {
    const channel = supabase.channel(`test:${sessionId}`);
    channel
      .on('broadcast', { event: 'progress_update' }, ({ payload }) => {
        if (!payload) return;
        setStudents(prev =>
          prev.map(s =>
            s.userId === payload.userId
              ? { ...s, answered: payload.answered, total: payload.total, done: payload.done }
              : s,
          ),
        );
      })
      .on('broadcast', { event: 'student_joined' }, ({ payload }) => {
        if (!payload) return;
        setStudents(prev => {
          if (prev.some(s => s.userId === payload.userId)) return prev;
          return [...prev, {
            userId: payload.userId,
            name: payload.displayName,
            initial: (payload.displayName || '?')[0].toUpperCase(),
            answered: 0,
            total: questionCount,
            done: false,
          }];
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId, questionCount]);

  const handleEndTest = useCallback(async () => {
    if (ending || hasNavigated.current) return;
    setEnding(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      await fetch(`${API_BASE}/test?action=finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionId }),
      });
      goToResults();
    } catch (e: any) {
      console.error('End test error:', e);
      setEnding(false);
    }
  }, [ending, sessionId, goToResults]);

  const displayTime = timeLeft !== null && timeLeft >= 0 ? timeLeft : null;
  const minutes = displayTime !== null ? String(Math.floor(displayTime / 60)).padStart(2, '0') : '--';
  const seconds = displayTime !== null ? String(displayTime % 60).padStart(2, '0') : '--';

  const totalQuestions = questionCount || (students[0]?.total || 0);
  const totalAnswered = students.reduce((s, st) => s + st.answered, 0);
  const classPct = students.length > 0 && totalQuestions > 0
    ? Math.round((totalAnswered / (students.length * totalQuestions)) * 100)
    : 0;
  const avgQuestion = students.length > 0 ? Math.round(totalAnswered / students.length) : 0;

  const cardBg = colors.surface;
  const cardBorder = colors.border;
  const barBg = colors.surfaceMuted;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.background,
            paddingTop: 12,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={8}
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Тест идёт
        </Text>
        <Pressable
          style={({ pressed }) => [pressed && { opacity: 0.6 }]}
          onPress={handleEndTest}
          disabled={ending}
        >
          <Text style={[styles.endHeaderBtn, { color: colors.errorText }]}>{ending ? '...' : 'Завершить'}</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Timer */}
        <View style={styles.timerRow}>
          <View style={[styles.timerBox, { backgroundColor: alpha(colors.primary, 10), borderColor: alpha(colors.primary, 20) }]}>
            <Text style={[styles.timerValue, { color: colors.primary }]}>{minutes}</Text>
          </View>
          <View style={[styles.timerBox, { backgroundColor: alpha(colors.primary, 10), borderColor: alpha(colors.primary, 20) }]}>
            <Text style={[styles.timerValue, { color: colors.primary }]}>{seconds}</Text>
          </View>
        </View>
        <View style={styles.timerLabels}>
          <Text style={[styles.timerLabel, { color: colors.textSecondary }]}>Мин</Text>
          <Text style={[styles.timerLabel, { color: colors.textSecondary }]}>Сек</Text>
        </View>

        {/* Live Status Card */}
        <View style={[styles.statusCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          {/* Gradient banner placeholder */}
          <View style={[styles.statusBanner, { backgroundColor: alpha(colors.primary, 10) }]}>
            <View style={styles.bannerContent}>
              <ClipboardList size={iconSize.l} color={colors.primary} />
              <Text style={[styles.bannerLabel, { color: colors.primary }]}>Тест идёт</Text>
            </View>
          </View>

          <View style={styles.statusBody}>
            <View style={styles.statusTopRow}>
              <Text style={[styles.statusQuestions, { color: colors.textPrimary }]}>
                {avgQuestion} / {totalQuestions} questions
              </Text>
              <View style={[styles.liveBadge, { backgroundColor: alpha(colors.success, 10) }]}>
                <Text style={[styles.liveBadgeText, { color: colors.successText }]}>В эфире</Text>
              </View>
            </View>

            <View style={styles.participantsRow}>
              <Users size={14} color={colors.primary} />
              <Text style={[styles.participantsText, { color: colors.textSecondary }]}>
                {students.length} students participating
              </Text>
            </View>

            {/* Class completion */}
            <View style={styles.completionSection}>
              <View style={styles.completionHeader}>
                <Text style={[styles.completionLabel, { color: colors.textSecondary }]}>
                  Прогресс класса
                </Text>
                <Text style={[styles.completionPct, { color: colors.primary }]}>
                  {classPct}%
                </Text>
              </View>
              <View style={[styles.progressBar, { backgroundColor: barBg }]}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${classPct}%` as any, backgroundColor: colors.primary },
                  ]}
                />
              </View>
            </View>
          </View>
        </View>

        {/* Student Progress */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          Ученики
        </Text>

        <View style={styles.studentsList}>
          {students.map((st, idx) => {
            const pct = st.total > 0 ? Math.round((st.answered / st.total) * 100) : 0;
            const accentColor = colors[AVATAR_TOKENS[idx % AVATAR_TOKENS.length]];
            const avatarBg = st.done
              ? (alpha(colors.success, 10))
              : (alpha(accentColor, 10));
            const avatarTextColor = st.done ? colors.success : accentColor;

            return (
              <View
                key={st.userId}
                style={[styles.studentCard, { backgroundColor: cardBg, borderColor: cardBorder }]}
              >
                <View style={styles.studentTopRow}>
                  <View style={styles.studentLeft}>
                    <View style={[styles.studentAvatar, { backgroundColor: avatarBg }]}>
                      {st.done ? (
                        <Check size={18} color={colors.success} strokeWidth={3} />
                      ) : (
                        <Text style={[styles.studentInitial, { color: avatarTextColor }]}>
                          {st.initial}
                        </Text>
                      )}
                    </View>
                    <Text style={[styles.studentName, { color: colors.textPrimary }]}>
                      {st.name}
                    </Text>
                  </View>
                  {st.done ? (
                    <View style={styles.doneRow}>
                      <Text style={[styles.doneText, { color: colors.successText }]}>Готово</Text>
                    </View>
                  ) : (
                    <Text style={[styles.studentProgress, { color: colors.textSecondary }]}>
                      {st.answered}/{st.total}
                    </Text>
                  )}
                </View>
                <View
                  style={[
                    styles.studentBar,
                    { backgroundColor: st.done ? (alpha(colors.success, 10)) : barBg },
                  ]}
                >
                  <View
                    style={[
                      styles.studentBarFill,
                      { width: `${pct}%` as any, backgroundColor: st.done ? colors.success : accentColor },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Footer */}
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
          style={({ pressed }) => [
            styles.endBtn,
            pressed && { opacity: 0.6, backgroundColor: alpha(colors.error, 10) },
          ]}
          onPress={handleEndTest}
          disabled={ending}
        >
          {ending ? (
            <ActivityIndicator color={colors.error} />
          ) : (
            <>
              <StopCircle size={22} color={colors.error} />
              <Text style={[styles.endBtnText, { color: colors.errorText }]}>Завершить досрочно</Text>
            </>
          )}
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
  backBtn: {
    padding: spacing.xs,
    marginLeft: -spacing.xs,
    width: 48,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
    textAlign: 'center',
    flex: 1,
  },
  endHeaderBtn: {
    fontSize: 16,
    fontWeight: '700',
    width: 48,
    textAlign: 'right',
  },

  scroll: {
    paddingHorizontal: spacing.m,
    gap: spacing.m,
  },

  // Timer
  timerRow: {
    flexDirection: 'row',
    gap: spacing.m,
    marginTop: spacing.xs,
  },
  timerBox: {
    flex: 1,
    height: 64,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  timerLabels: {
    flexDirection: 'row',
    gap: spacing.m,
    marginTop: -8,
  },
  timerLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Status card
  statusCard: {
    borderRadius: borderRadius.l,
    borderWidth: 1,
    overflow: 'hidden',
    
  },
  statusBanner: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerContent: {
    alignItems: 'center',
    gap: 4,
  },
  bannerEmoji: {
    lineHeight: 40,
  },
  bannerLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusBody: {
    padding: spacing.m,
    gap: spacing.s,
  },
  statusTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusQuestions: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  liveBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  liveBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  participantsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  participantsText: {
    fontSize: 14,
    fontWeight: '600',
  },
  completionSection: {
    marginTop: 4,
    gap: 6,
  },
  completionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  completionLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  completionPct: {
    fontSize: 12,
    fontWeight: '700',
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

  // Section title
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginTop: spacing.xs,
  },

  // Students
  studentsList: {
    gap: spacing.s,
  },
  studentCard: {
    borderRadius: borderRadius.l,
    borderWidth: 1,
    padding: spacing.m,
    gap: spacing.s,
  },
  studentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  studentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  studentAvatar: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentInitial: {
    fontSize: 16,
    fontWeight: '700',
  },
  studentName: {
    fontSize: 16,
    fontWeight: '600',
  },
  studentProgress: {
    fontSize: 14,
    fontWeight: '600',
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  doneText: {
    fontSize: 14,
    fontWeight: '700',
  },
  studentBar: {
    height: 6,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  studentBarFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.l,
    paddingTop: spacing.l,
  },
  endBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: borderRadius.l,
    gap: 8,
  },
  endBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
