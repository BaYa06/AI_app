/**
 * Student Detail Screen
 * @description Статистика ученика для учителя (реальные данные из БД)
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, AlertTriangle } from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors, useSettingsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import { NeonService } from '@/services/NeonService';
import { supabase } from '@/services/supabaseClient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'StudentDetail'>;

// ── Types ─────────────────────────────────────────────────────────────────────

interface SetStat {
  setId: string;
  title: string;
  totalCards: number;
  learnedCards: number;
  seenCards: number;
}

interface StudentStats {
  seenCards: number;
  learnedCards: number;
  unlearnedCards: number;
  sets: SetStat[];
  streak: number;
  lastActiveDate: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pluralCards(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'карточек';
  if (mod10 === 1) return 'карточка';
  if (mod10 >= 2 && mod10 <= 4) return 'карточки';
  return 'карточек';
}

function setStatus(set: SetStat): 'done' | 'inProgress' | 'notStarted' {
  if (set.totalCards === 0) return 'notStarted';
  if (set.seenCards >= set.totalCards) return 'done';
  if (set.seenCards > 0) return 'inProgress';
  return 'notStarted';
}

function statusLabel(s: 'done' | 'inProgress' | 'notStarted'): string {
  if (s === 'done') return 'Завершен';
  if (s === 'inProgress') return 'В процессе';
  return 'Не начат';
}

// Та же логика, что и в TeacherStudentsScreen.tsx (getStudentStatus/formatLastActivity) —
// раньше здесь бейдж "Активен" был захардкожен независимо от реальной активности. См. план,
// пункт 31.
function activityStatus(lastActiveDate: string | null): 'online' | 'away' | 'offline' | 'inactive' {
  if (!lastActiveDate) return 'inactive';
  const now = new Date();
  const last = new Date(lastActiveDate + 'T12:00:00Z');
  const diffDays = Math.round((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 1) return 'online';
  if (diffDays <= 2) return 'away';
  if (diffDays <= 6) return 'offline';
  return 'inactive';
}

function formatLastActive(lastActiveDate: string | null): string {
  if (!lastActiveDate) return 'Нет активности';
  const now = new Date();
  const last = new Date(lastActiveDate + 'T12:00:00Z');
  const diffDays = Math.round((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'Сегодня';
  if (diffDays === 1) return 'Вчера';
  if (diffDays < 30) return `${diffDays} дн. назад`;
  const weeks = Math.floor(diffDays / 7);
  if (weeks < 5) return `${weeks} нед. назад`;
  const months = Math.floor(diffDays / 30);
  return `${months} мес. назад`;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function StudentDetailScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const isDark = resolvedTheme === 'dark';
  const insets = useSafeAreaInsets();

  const {
    studentName,
    studentInitials,
    courseId,
    courseTitle,
    studentId,
  } = route.params;

  const [stats, setStats] = useState<StudentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // useFocusEffect вместо обычного useEffect — данные перезагружаются при каждом возврате на
  // экран (например, после того как ученик позанимался, пока учитель смотрел другой экран),
  // а не только один раз при первом открытии. См. план, пункт 33.
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      setLoading(true);
      setError(false);
      NeonService.loadStudentCourseStats(courseId, studentId)
        .then((data) => { if (mounted) setStats(data); })
        .catch((e) => {
          console.error('Failed to load student stats:', e);
          if (mounted) setError(true);
        })
        .finally(() => { if (mounted) setLoading(false); });
      return () => { mounted = false; };
    }, [courseId, studentId]),
  );

  // Экран открывается напрямую по courseId/studentId из route.params — без этой проверки
  // сюда можно было попасть на чужой курс/ученика без единого запроса к серверу (статистика и
  // так теперь защищена на бэкенде, см. api/teacher.js action=student-stats, но без этого
  // гейта экран мог успеть отрендерить пустографик вместо сразу же уйти назад). См. план,
  // пункт 20.
  useEffect(() => {
    let mounted = true;
    const checkOwnership = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user?.id;
        if (!userId) { if (mounted) goBack(); return; }
        const isOwner = await NeonService.isCourseOwner(courseId, userId);
        if (mounted && !isOwner) goBack();
      } catch {
        if (mounted) goBack();
      }
    };
    checkOwnership();
    return () => { mounted = false; };
  }, [courseId]);

  // Свежие значения из backend (студент мог позаниматься после того, как учитель открыл
  // список) вместо застывшего снимка из route.params, с которым экран раньше жил всё время,
  // пока был открыт. См. план, пункт 34.
  const currentStreak = stats?.streak ?? 0;
  const activeStatus = activityStatus(stats?.lastActiveDate ?? null);
  const isActive = activeStatus === 'online' || activeStatus === 'away';

  const cardBg     = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';
  const divider    = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';
  const sectionLabel = isDark ? colors.textSecondary : '#6B7280';
  const avatarBg   = colors.primary + '22';

  const goBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.reset({
        index: 2,
        routes: [
          { name: 'Main' },
          { name: 'TeacherCourseStats', params: { courseId, courseTitle } },
          { name: 'TeacherStudents',    params: { courseId, courseTitle } },
        ],
      });
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          {
            paddingTop: 12,
            backgroundColor: isDark ? colors.background : 'rgba(255,255,255,0.92)',
            borderBottomColor: cardBorder,
            ...Platform.select({ web: { backdropFilter: 'blur(12px)' } }) as any,
          },
        ]}
      >
        <Pressable
          onPress={goBack}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={8}
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {studentName}
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : error ? (
        // Раньше сбой сети выглядел так же, как "нет данных" (просто нули) — теперь
        // отдельное состояние с кнопкой "Повторить". См. план, пункт 29.
        <View style={styles.loadingBox}>
          <AlertTriangle size={32} color={colors.textSecondary} />
          <Text style={[styles.errorText, { color: colors.textPrimary }]}>
            Не удалось загрузить данные
          </Text>
          <Pressable
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              setLoading(true);
              setError(false);
              NeonService.loadStudentCourseStats(courseId, studentId)
                .then(setStats)
                .catch((e) => { console.error('Failed to load student stats:', e); setError(true); })
                .finally(() => setLoading(false));
            }}
          >
            <Text style={styles.retryBtnText}>Повторить</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >

          {/* ── Profile card ── */}
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>

            {/* Avatar + name */}
            <View style={styles.profileRow}>
              <View style={[styles.avatar, { backgroundColor: avatarBg, borderColor: cardBorder }]}>
                <Text style={[styles.avatarText, { color: colors.primary }]}>
                  {studentInitials}
                </Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={[styles.profileName, { color: colors.textPrimary }]}>
                  {studentName}
                </Text>
                {isActive ? (
                  <View style={[styles.activeBadge, isDark && { backgroundColor: 'rgba(22,163,74,0.15)' }]}>
                    <Text style={[styles.activeBadgeText, isDark && { color: '#4ADE80' }]}>Активен</Text>
                  </View>
                ) : (
                  <View style={[styles.activeBadge, styles.inactiveBadge, isDark && { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                    <Text style={[styles.activeBadgeText, styles.inactiveBadgeText, isDark && { color: colors.textSecondary }]}>
                      Не в сети
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Stats row */}
            <View style={[styles.statsRow, { borderTopColor: divider }]}>
              <StatCell
                label="Серия"
                value={currentStreak > 0 ? `🔥 ${currentStreak}` : '—'}
                isLast={false}
                divider={divider}
                textColor={colors.textPrimary}
              />
              <StatCell
                label="Просмотрено"
                value={`${stats?.seenCards ?? 0}`}
                isLast={false}
                divider={divider}
                textColor={colors.textPrimary}
              />
              <StatCell
                label="Осталось"
                value={`${stats?.unlearnedCards ?? 0}`}
                isLast={false}
                divider={divider}
                textColor={colors.textPrimary}
              />
              <StatCell
                label="Вход"
                value={formatLastActive(stats?.lastActiveDate ?? null)}
                isLast
                divider={divider}
                textColor={colors.textPrimary}
              />
            </View>
          </View>

          {/* ── Progress section ── */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: sectionLabel }]}>
              Прогресс по наборам
            </Text>

            {stats && stats.sets.length > 0 ? (
              <View style={styles.setList}>
                {stats.sets.map((set) => (
                  <SetProgressRow
                    key={set.setId}
                    set={set}
                    cardBg={cardBg}
                    cardBorder={cardBorder}
                    colors={colors}
                    isDark={isDark}
                  />
                ))}
              </View>
            ) : (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Наборов в этом курсе ещё нет
              </Text>
            )}
          </View>

        </ScrollView>
      )}
    </View>
  );
}

// ── Stat cell ─────────────────────────────────────────────────────────────────

function StatCell({ label, value, isLast, divider, textColor }: {
  label: string;
  value: string;
  isLast: boolean;
  divider: string;
  textColor: string;
}) {
  return (
    <View
      style={[
        styles.statCell,
        !isLast && { borderRightWidth: 1, borderRightColor: divider },
      ]}
    >
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: textColor }]}>{value}</Text>
    </View>
  );
}

// ── Set progress row ──────────────────────────────────────────────────────────

function SetProgressRow({ set, cardBg, cardBorder, colors, isDark }: {
  set: SetStat;
  cardBg: string;
  cardBorder: string;
  colors: any;
  isDark: boolean;
}) {
  const status = setStatus(set);
  const trackColor = isDark ? 'rgba(255,255,255,0.10)' : '#F1F5F9';

  const seenPct = set.totalCards > 0
    ? Math.round((set.seenCards / set.totalCards) * 100)
    : 0;
  const learnedPct = set.totalCards > 0
    ? Math.round((set.learnedCards / set.totalCards) * 100)
    : 0;

  const badgeStyle =
    status === 'done'       ? styles.badgeDone
    : status === 'inProgress' ? styles.badgeProgress
    : styles.badgeNotStarted;

  const badgeTextStyle =
    status === 'done'       ? styles.badgeDoneText
    : status === 'inProgress' ? styles.badgeProgressText
    : styles.badgeNotStartedText;

  const barColor =
    status === 'done'       ? '#10B981'
    : status === 'inProgress' ? colors.primary
    : '#9CA3AF';

  return (
    <View style={[styles.setRow, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      <View style={styles.setRowHeader}>
        <Text style={[styles.setTitle, { color: colors.textPrimary }]} numberOfLines={2}>
          {set.title}
        </Text>
        <View style={badgeStyle}>
          <Text style={badgeTextStyle}>{statusLabel(status)}</Text>
        </View>
      </View>

      {/* Progress bar — seen cards */}
      <View style={[styles.track, { backgroundColor: trackColor }]}>
        <View style={[styles.fill, { backgroundColor: barColor, width: `${seenPct}%` as any }]} />
      </View>

      <Text style={[styles.setMeta, { color: isDark ? colors.textSecondary : '#6B7280' }]}>
        {set.seenCards} / {set.totalCards} {pluralCards(set.seenCards)} просмотрено · {seenPct}%
        {set.learnedCards > 0 ? `  ·  выучено: ${set.learnedCards} (${learnedPct}%)` : ''}
      </Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: spacing.s,
  },
  backBtn: {
    padding: spacing.xs,
    marginLeft: -spacing.xs,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    flex: 1,
  },

  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.l,
  },
  errorText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.l,
    paddingVertical: 10,
    borderRadius: borderRadius.m,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // Scroll
  scroll: {
    padding: spacing.m,
    gap: spacing.m,
  },

  // Card
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.l,
    padding: spacing.m,
  },

  // Profile
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    marginBottom: spacing.m,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
  },
  profileInfo: {
    gap: 6,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  activeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#16A34A',
  },
  inactiveBadge: {
    backgroundColor: '#F3F4F6',
  },
  inactiveBadgeText: {
    color: '#6B7280',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: spacing.m,
    marginTop: 4,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    gap: 2,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#6B7280',
  },
  statValue: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Section
  section: {
    gap: spacing.s,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    paddingHorizontal: 4,
  },
  setList: {
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '500',
    paddingHorizontal: 4,
    paddingTop: 4,
  },

  // Set progress row
  setRow: {
    borderWidth: 1,
    borderRadius: borderRadius.l,
    padding: spacing.m,
    gap: 8,
  },
  setRowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.s,
  },
  setTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },

  // Badges
  badgeDone: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    flexShrink: 0,
  },
  badgeDoneText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#16A34A',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  badgeProgress: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    flexShrink: 0,
  },
  badgeProgressText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#2563EB',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  badgeNotStarted: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    flexShrink: 0,
  },
  badgeNotStartedText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  // Progress bar
  track: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },
  setMeta: {
    fontSize: 11,
    fontWeight: '500',
  },
});
