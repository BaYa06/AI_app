/**
 * Teacher Course Stats Screen
 * @description Статистика курса для учителя
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, X, GraduationCap, FileText, Mic, Clock, AlertTriangle, BookOpen, Trophy, Flame } from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, alpha, iconSize } from '@/constants';
import { NeonService } from '@/services/NeonService';
import { supabase } from '@/services/supabaseClient';
import type { RootStackParamList } from '@/types/navigation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<RootStackParamList, 'TeacherCourseStats'>;

// ==================== TYPES ====================

type StudentStatus = 'online' | 'away' | 'offline' | 'inactive';

interface CourseMember {
  id: string;
  name: string;
  initials: string;
  status: StudentStatus;
  streak: number;
  lastActiveDate: string | null;
}

// ==================== HELPERS ====================

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getStudentStatus(lastActiveDate: string | null): StudentStatus {
  if (!lastActiveDate) return 'inactive';
  const now = new Date();
  const last = new Date(lastActiveDate + 'T12:00:00Z');
  const diffDays = Math.round((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 1) return 'online';
  if (diffDays <= 2) return 'away';
  if (diffDays <= 6) return 'offline';
  return 'inactive';
}

function formatLastActive(lastActiveDate: string | null, colors: ReturnType<typeof useThemeColors>): { text: string; color: string } | null {
  if (!lastActiveDate) return null;
  const now = new Date();
  const last = new Date(lastActiveDate + 'T12:00:00Z');
  const diffDays = Math.round((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return { text: 'Сегодня', color: colors.successText };
  if (diffDays === 1) return { text: 'Вчера', color: colors.warningText };
  if (diffDays <= 6) return { text: `${diffDays} дн. назад`, color: colors.errorText };
  return { text: `${diffDays} дн. назад`, color: colors.textTertiary };
}

// ==================== CHART HELPER ====================

const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTH_NAMES = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

function buildChartDays(
  raw: { date: string; count: number }[],
  days: number,
  totalStudents: number,
): { day: string; pct: number; count: number }[] {
  const map = new Map(raw.map(r => [r.date, r.count]));

  if (days === 7) {
    const result: { day: string; pct: number; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];
      const count = map.get(dateKey) ?? 0;
      const pct = totalStudents > 0 ? count / totalStudents : 0;
      result.push({ day: DAY_NAMES[d.getDay()], pct, count });
    }
    return result;
  }

  // 30д — группируем по 5 дней (6 столбцов)
  const CHUNK = 5;
  const chunks: { day: string; pct: number; count: number }[] = [];

  for (let c = 0; c < 6; c++) {
    const startOffset = 29 - c * CHUNK;
    let total = 0;
    let daysInChunk = 0;
    let firstDate: Date | null = null;
    let lastDate: Date | null = null;

    for (let j = 0; j < CHUNK; j++) {
      const offset = startOffset - j;
      if (offset < 0) break;
      const d = new Date();
      d.setDate(d.getDate() - offset);
      const dateKey = d.toISOString().split('T')[0];
      total += map.get(dateKey) ?? 0;
      daysInChunk++;
      if (!firstDate) firstDate = d;
      lastDate = d;
    }

    const avg = daysInChunk > 0 ? total / daysInChunk : 0;
    const pct = totalStudents > 0 ? avg / totalStudents : 0;
    const label = firstDate && lastDate
      ? `${firstDate.getDate()}–${lastDate.getDate()} ${MONTH_NAMES[lastDate.getMonth()]}`
      : '';

    chunks.push({ day: label, pct: Math.min(pct, 1), count: Math.round(avg) });
  }

  return chunks;
}

// ==================== COMPONENTS ====================

function AvatarPlaceholder({ member, colors }: { member: CourseMember; colors: any }) {
  const isInactive = member.status === 'inactive';
  const dotColor =
    member.status === 'online'   ? colors.success :
    member.status === 'away'     ? colors.warning :
    member.status === 'offline'  ? colors.error : colors.textTertiary;
  const lastActive = formatLastActive(member.lastActiveDate, colors);

  return (
    <View style={styles.studentItem}>
      <View style={styles.avatarWrap}>
        <View style={[styles.avatar, { backgroundColor: isInactive ? (colors.border) : alpha(colors.primary, 20) }]}>
          <Text style={[styles.avatarInitials, { color: isInactive ? colors.textSecondary : colors.primary }]}>
            {member.initials}
          </Text>
        </View>
        <View
          style={[
            styles.onlineDot,
            { backgroundColor: dotColor, borderColor: colors.background },
          ]}
        />
      </View>
      <Text style={[styles.studentName, { color: colors.textPrimary }]} numberOfLines={1}>
        {member.name}
      </Text>
      {lastActive && (
        <Text style={[styles.studentLastActive, { color: lastActive.color }]}>
          {lastActive.text}
        </Text>
      )}
    </View>
  );
}

// ==================== SCREEN ====================

export function TeacherCourseStatsScreen({ navigation, route }: Props) {
  const { courseTitle } = route.params;
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const [chartPeriod, setChartPeriod] = useState<'7d' | '30d'>('7d');
  const [lobbyModal, setLobbyModal] = useState(false);
  const [studentModal, setStudentModal] = useState<'active' | 'inactive' | null>(null);
  const [chartTooltip, setChartTooltip] = useState<{
    index: number;
    day: string;
    count: number;
  } | null>(null);

  // Владение курсом — null пока не проверено. Данные грузятся только после подтверждения,
  // чтобы не было гонки "сначала данные, потом дверь" (см. план, пункт 21).
  const [isOwner, setIsOwner] = useState<boolean | null>(null);

  // Реальные участники
  const [members, setMembers] = useState<CourseMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState(false);

  // Chart data
  const [chartData, setChartData] = useState<{ day: string; pct: number; count: number }[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState(false);

  // Sets stats
  const [setsStats, setSetsStats] = useState<Awaited<ReturnType<typeof NeonService.loadCourseSetStats>>>([]);
  const [setsLoading, setSetsLoading] = useState(true);
  const [setsError, setSetsError] = useState(false);

  // Дёргается кнопками "Повторить" при ошибке загрузки — заставляет соответствующий эффект
  // ниже перезапуститься. См. план, пункт 29.
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (!isOwner || !route.params.courseId) return;
    setSetsLoading(true);
    setSetsError(false);
    NeonService.loadCourseSetStats(route.params.courseId)
      .then(setSetsStats)
      .catch((e) => { console.error('Failed to load set stats:', e); setSetsError(true); })
      .finally(() => setSetsLoading(false));
  }, [isOwner, route.params.courseId, retryTick]);

  useEffect(() => {
    if (!isOwner) return;
    let mounted = true;
    setMembersLoading(true);
    setMembersError(false);
    NeonService.loadCourseMembers(route.params.courseId)
      .then((raw) => {
        if (!mounted) return;
        setMembers(
          raw.map((m) => ({
            id: m.id,
            name: m.displayName,
            initials: getInitials(m.displayName),
            status: getStudentStatus(m.lastActiveDate),
            streak: m.streak,
            lastActiveDate: m.lastActiveDate,
          })),
        );
      })
      .catch((e) => {
        console.error('Failed to load members:', e);
        if (mounted) setMembersError(true);
      })
      .finally(() => { if (mounted) setMembersLoading(false); });
    return () => { mounted = false; };
  }, [isOwner, route.params.courseId, retryTick]);

  const activeStudents = members.filter((s) => s.status === 'online' || s.status === 'away');
  const inactiveStudents = members.filter((s) => s.status === 'inactive');
  const modalStudents = studentModal === 'active' ? activeStudents : inactiveStudents;
  const modalTitle = studentModal === 'active' ? 'Активны сегодня' : 'Не заходили 7д+';

  useEffect(() => {
    if (!isOwner || !route.params.courseId || members.length === 0) return;
    setChartLoading(true);
    setChartError(false);
    const days = chartPeriod === '7d' ? 7 : 30;
    NeonService.loadCourseActivityChart(route.params.courseId, days)
      .then((raw) => {
        setChartData(buildChartDays(raw, days, members.length));
      })
      .catch((e) => {
        console.error('Failed to load activity chart:', e);
        setChartError(true);
      })
      .finally(() => setChartLoading(false));
  }, [isOwner, chartPeriod, members.length, route.params.courseId, retryTick]);

  // Проверка владения курсом — блокирующая: остальные эффекты выше гейтятся на `isOwner` и
  // не грузят данные, пока она не пройдёт. Раньше проверка и загрузка шли параллельно — чужие
  // данные (хоть теперь и не отдаются сервером, см. план, пп. 19-20) могли в теории
  // отрендериться на долю секунды до срабатывания редиректа. См. план, пункт 21.
  useEffect(() => {
    let mounted = true;
    const checkOwnership = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user?.id;
        if (!userId || !NeonService.isEnabled()) {
          // Проверить нечем (не авторизован / Neon не сконфигурирован) — не блокируем, как и раньше.
          if (mounted) setIsOwner(true);
          return;
        }
        const owner = await NeonService.isCourseOwner(route.params.courseId, userId);
        if (!mounted) return;
        if (!owner) {
          navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main' as any);
          return;
        }
        setIsOwner(true);
      } catch {
        if (mounted) {
          navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main' as any);
        }
      }
    };
    checkOwnership();
    return () => { mounted = false; };
  }, [route.params.courseId]);

  const cardBg = colors.surface;
  const cardBorder = colors.border;

  const CHART_HEIGHT = 96;
  const handleBarPress = (index: number, day: string, count: number) => {
    setChartTooltip({ index, day, count });
  };

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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={8}
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {courseTitle || 'Статистика курса'}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Test Lobby Button */}
        <Pressable
          style={({ pressed }) => [
            styles.testLobbyBtn,
            {
              backgroundColor: alpha(colors.primary, 10),
              borderColor: alpha(colors.primary, 10),
            },
            pressed && { opacity: 0.75, transform: [{ scale: 0.985 }] },
          ]}
          onPress={() => setLobbyModal(true)}
        >
          <View style={[styles.testLobbyIcon, { backgroundColor: colors.primary }]}>
            <GraduationCap size={18} color={colors.onPrimary} />
          </View>
          <Text style={[styles.testLobbyText, { color: colors.textPrimary }]}>
            Живой тест
          </Text>
          <ArrowLeft
            size={16}
            color={colors.textSecondary}
            style={{ transform: [{ rotate: '180deg' }] }}
          />
        </Pressable>

        {/* История тестов */}
        <Pressable
          style={({ pressed }) => [
            styles.testLobbyBtn,
            {
              backgroundColor: alpha(colors.primary, 10),
              borderColor: alpha(colors.primary, 10),
            },
            pressed && { opacity: 0.75, transform: [{ scale: 0.985 }] },
          ]}
          onPress={() => navigation.navigate('TestHistory', {
            courseId: route.params.courseId,
            courseTitle: route.params.courseTitle,
          })}
        >
          <View style={[styles.testLobbyIcon, { backgroundColor: colors.primary }]}>
            <Clock size={18} color={colors.onPrimary} />
          </View>
          <Text style={[styles.testLobbyText, { color: colors.textPrimary }]}>
            История тестов
          </Text>
          <ArrowLeft
            size={16}
            color={colors.textSecondary}
            style={{ transform: [{ rotate: '180deg' }] }}
          />
        </Pressable>

        {/* Рейтинг недели (план, этап 4): места учеников, награды, включение рейтинга */}
        <Pressable
          style={({ pressed }) => [
            styles.testLobbyBtn,
            {
              backgroundColor: alpha(colors.primary, 10),
              borderColor: alpha(colors.primary, 10),
            },
            pressed && { opacity: 0.75, transform: [{ scale: 0.985 }] },
          ]}
          onPress={() => navigation.navigate('CourseLeaderboard', {
            courseId: route.params.courseId,
            courseTitle: route.params.courseTitle,
          })}
        >
          <View style={[styles.testLobbyIcon, { backgroundColor: colors.warning }]}>
            <Trophy size={18} color={colors.onPrimary} />
          </View>
          <Text style={[styles.testLobbyText, { color: colors.textPrimary }]}>
            Рейтинг недели
          </Text>
          <ArrowLeft
            size={16}
            color={colors.textSecondary}
            style={{ transform: [{ rotate: '180deg' }] }}
          />
        </Pressable>

        {/* Учебники курса (каталог книг): план юнитов этой группы */}
        <Pressable
          style={({ pressed }) => [
            styles.testLobbyBtn,
            {
              backgroundColor: alpha(colors.primary, 10),
              borderColor: alpha(colors.primary, 10),
            },
            pressed && { opacity: 0.75, transform: [{ scale: 0.985 }] },
          ]}
          onPress={() => navigation.navigate('CourseBooks', {
            courseId: route.params.courseId,
            courseTitle: route.params.courseTitle,
          })}
        >
          <View style={[styles.testLobbyIcon, { backgroundColor: colors.primary }]}>
            <BookOpen size={18} color={colors.onPrimary} />
          </View>
          <Text style={[styles.testLobbyText, { color: colors.textPrimary }]}>
            Учебники курса
          </Text>
          <ArrowLeft
            size={16}
            color={colors.textSecondary}
            style={{ transform: [{ rotate: '180deg' }] }}
          />
        </Pressable>

        {/* Metric tiles */}
        <View style={styles.metricsGrid}>
          {/* Active today */}
          <Pressable
            style={[styles.metricCard, { backgroundColor: cardBg, borderColor: cardBorder }]}
            onPress={() => setStudentModal('active')}
          >
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>АКТИВНЫХ СЕГОДНЯ</Text>
            {membersLoading ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />
            ) : membersError ? (
              <Text style={[styles.metricValue, { color: colors.textSecondary }]}>—</Text>
            ) : (
              <Text style={[styles.metricValue, { color: colors.primary }]}>{activeStudents.length}</Text>
            )}
          </Pressable>

          {/* Inactive 7d+ */}
          <Pressable
            style={[styles.metricCard, { backgroundColor: cardBg, borderColor: cardBorder }]}
            onPress={() => setStudentModal('inactive')}
          >
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>НЕ ЗАХОДИЛИ 7Д+</Text>
            {membersLoading ? (
              <ActivityIndicator size="small" color={colors.error} style={{ marginTop: 8 }} />
            ) : membersError ? (
              <Text style={[styles.metricValue, { color: colors.textSecondary }]}>—</Text>
            ) : (
              <Text style={[styles.metricValue, { color: colors.error }]}>{inactiveStudents.length}</Text>
            )}
          </Pressable>
        </View>

        {/* Activity Chart */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Активность группы</Text>
            <View style={[styles.togglePill, { backgroundColor: colors.surfaceMuted }]}>
              <Pressable
                style={[
                  styles.toggleBtn,
                  chartPeriod === '7d' && { backgroundColor: colors.background,
                     },
                ]}
                onPress={() => setChartPeriod('7d')}
              >
                <Text style={[styles.toggleText, { color: chartPeriod === '7d' ? colors.textPrimary : colors.textSecondary }]}>
                  7д
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.toggleBtn,
                  chartPeriod === '30d' && { backgroundColor: colors.background,
                     },
                ]}
                onPress={() => setChartPeriod('30d')}
              >
                <Text style={[styles.toggleText, { color: chartPeriod === '30d' ? colors.textPrimary : colors.textSecondary }]}>
                  30д
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Bar chart */}
          {chartLoading ? (
            <View style={{ height: CHART_HEIGHT + 20, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : chartError ? (
            // Раньше сбой графика выглядел как пустой график без каких-либо данных — теперь
            // видно, что это ошибка, а не "активности не было". См. план, пункт 29.
            <View style={{ height: CHART_HEIGHT + 20, justifyContent: 'center', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={20} color={colors.textSecondary} />
              <Text style={[styles.emptyMembers, { color: colors.textSecondary }]}>Не удалось загрузить график</Text>
              <Pressable onPress={() => setRetryTick((t) => t + 1)}>
                <Text style={[styles.viewAll, { color: colors.primary }]}>Повторить</Text>
              </Pressable>
            </View>
          ) : (
          <View style={[styles.chartWrap, { height: CHART_HEIGHT + 20 }]}>
            {chartData.map((item, idx) => (
              <View key={idx} style={styles.barCol}>
                <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
                  {chartTooltip?.index === idx && (
                    <View style={[styles.chartTooltip, { backgroundColor: colors.textPrimary }]}
                    >
                      <Text style={[styles.chartTooltipText, { color: colors.onPrimary }]}>
                        {chartTooltip.day}: {chartTooltip.count}
                      </Text>
                      <View style={[styles.chartTooltipArrow, { borderTopColor: colors.textPrimary }]} />
                    </View>
                  )}
                  <Pressable
                    onPress={() => handleBarPress(idx, item.day, item.count)}
                    hitSlop={8}
                  >
                    <View
                      style={[
                        styles.bar,
                        {
                          height: item.pct * CHART_HEIGHT,
                          backgroundColor: colors.primary,
                        },
                      ]}
                    />
                  </Pressable>
                </View>
                <Text style={[styles.barLabel, { color: colors.textSecondary }]}>{item.day}</Text>
              </View>
            ))}
          </View>
          )}
        </View>

        {/* Students carousel */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Ученики{!membersLoading && ` (${members.length})`}
            </Text>
            <Pressable onPress={() => navigation.navigate('TeacherStudents', { courseId: route.params.courseId, courseTitle: route.params.courseTitle })}>
              <Text style={[styles.viewAll, { color: colors.primary }]}>Все →</Text>
            </Pressable>
          </View>
          {membersLoading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: spacing.m }} />
          ) : membersError ? (
            <View style={{ alignItems: 'flex-start', gap: 6, marginVertical: spacing.s }}>
              <Text style={[styles.emptyMembers, { color: colors.textSecondary }]}>
                Не удалось загрузить учеников
              </Text>
              <Pressable onPress={() => setRetryTick((t) => t + 1)}>
                <Text style={[styles.viewAll, { color: colors.primary }]}>Повторить</Text>
              </Pressable>
            </View>
          ) : members.length === 0 ? (
            <Text style={[styles.emptyMembers, { color: colors.textSecondary }]}>
              Пока нет учеников. Отправь ссылку-приглашение.
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.studentsRow}
            >
              {members.map((m) => (
                <AvatarPlaceholder key={m.id} member={m} colors={colors} />
              ))}
            </ScrollView>
          )}
        </View>

        {/* Sets list */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Наборы{setsStats.length > 0 ? ` (${setsStats.length})` : ''}
          </Text>
          {setsLoading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: spacing.m }} />
          ) : setsError ? (
            <View style={{ alignItems: 'flex-start', gap: 6, marginVertical: spacing.s }}>
              <Text style={[styles.emptyMembers, { color: colors.textSecondary }]}>
                Не удалось загрузить наборы
              </Text>
              <Pressable onPress={() => setRetryTick((t) => t + 1)}>
                <Text style={[styles.viewAll, { color: colors.primary }]}>Повторить</Text>
              </Pressable>
            </View>
          ) : setsStats.length === 0 ? (
            <Text style={[styles.emptyMembers, { color: colors.textSecondary }]}>
              Нет данных — ученики ещё не начали учить
            </Text>
          ) : (
            <View style={styles.setsList}>
              {setsStats.map((set) => (
                <View
                  key={set.setId}
                  style={[styles.setCard, { backgroundColor: cardBg, borderColor: cardBorder }]}
                >
                  {set.isOfficial && (
                    <View style={styles.unitTag}>
                      <BookOpen size={12} color={colors.primary} />
                      <Text style={[styles.unitTagText, { color: colors.primary }]} numberOfLines={1}>
                        {[set.bookTitle, set.unitOpen === false ? 'закрыт' : 'открыт'].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  )}
                  <View style={styles.setCardHeader}>
                    <Text style={[styles.setCardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {set.title}
                    </Text>
                    <Text style={[styles.setCardWords, { color: colors.textSecondary }]}>
                      {set.totalCards} слов
                    </Text>
                  </View>

                  {/* Progress bar */}
                  <View style={[styles.progressBg, { backgroundColor: colors.surfaceMuted }]}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${Math.min(set.progressPct, 100)}%` as any, backgroundColor: colors.primary },
                      ]}
                    />
                  </View>

                  <View style={styles.setCardMeta}>
                    <Text style={[styles.setCardMetaText, { color: colors.textSecondary }]}>
                      {set.studentsStarted} из {members.length} начали
                      {members.length > set.studentsStarted ? ` · ${members.length - set.studentsStarted} не начинали` : ''}
                      {` · ${set.studentsCompleted} завершили`}
                    </Text>
                    <Text style={[styles.setCardAccuracy, { color: colors.primary }]}>
                      {set.progressPct}%
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Student List Modal */}
      <Modal
        visible={studentModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setStudentModal(null)}
      >
        <Pressable style={[styles.modalOverlay, { backgroundColor: colors.overlay }]} onPress={() => setStudentModal(null)}>
          <Pressable
            style={[styles.modalContent, { backgroundColor: colors.surface }]}
            onPress={() => {}}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{modalTitle}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Закрыть" onPress={() => setStudentModal(null)} hitSlop={8}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
              {modalStudents.length === 0 ? (
                <Text style={[styles.emptyMembers, { color: colors.textSecondary, paddingVertical: spacing.l }]}>
                  Нет учеников
                </Text>
              ) : (
                modalStudents.map((s) => {
                  const dotColor =
                    s.status === 'online'   ? colors.success :
                    s.status === 'away'     ? colors.warning :
                    s.status === 'offline'  ? colors.error : colors.textTertiary;
                  const lastActive = formatLastActive(s.lastActiveDate, colors);
                  return (
                    <View key={s.id} style={[styles.modalStudentRow, { borderBottomColor: colors.border }]}>
                      <View style={styles.modalAvatarWrap}>
                        <View style={[styles.avatar, { backgroundColor: alpha(colors.primary, 20) }]}>
                          <Text style={[styles.avatarInitials, { color: colors.primary }]}>
                            {s.initials}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.onlineDot,
                            {
                              backgroundColor: dotColor,
                              borderColor: colors.border,
                            },
                          ]}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.modalStudentName, { color: colors.textPrimary }]}>{s.name}</Text>
                        {lastActive && (
                          <Text style={{ fontSize: 12, color: lastActive.color, marginTop: 1 }}>
                            {lastActive.text}
                          </Text>
                        )}
                      </View>
                      {s.streak > 0 && (
                        <View style={[styles.modalStreakBadge, { backgroundColor: alpha(colors.streak, 10) }]}>
                          <Flame size={iconSize.xs} color={colors.streak} />
                          <Text style={[styles.modalStreakText, { color: colors.warningText }]}>{s.streak}</Text>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Test Lobby Bottom Sheet */}
      <Modal
        visible={lobbyModal}
        transparent
        animationType="slide"
        onRequestClose={() => setLobbyModal(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setLobbyModal(false)}>
          <Pressable
            style={[
              styles.sheetContent,
              {
                backgroundColor: colors.surface,
                paddingBottom: insets.bottom + 16,
              },
            ]}
            onPress={() => {}}
          >
            <View style={[styles.sheetHandle, { backgroundColor: alpha(colors.textTertiary, 40) }]} />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
              Выбери тип теста
            </Text>

            {/* Exam option */}
            <Pressable
              style={({ pressed }) => [
                styles.sheetOption,
                {
                  backgroundColor: alpha(colors.primary, 10),
                  borderColor: alpha(colors.primary, 10),
                },
                pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] },
              ]}
              onPress={() => {
                setLobbyModal(false);
                navigation.navigate('ExamLobby', { courseId: route.params.courseId, courseTitle: route.params.courseTitle });
              }}
            >
              <View style={[styles.sheetOptionIcon, { backgroundColor: colors.primaryFill }]}>
                <FileText size={20} color={colors.onPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetOptionTitle, { color: colors.textPrimary }]}>
                  Экзамен
                </Text>
                <Text style={[styles.sheetOptionDesc, { color: colors.textSecondary }]}>
                  Письменный тест с вопросами
                </Text>
              </View>
              <ArrowLeft
                size={16}
                color={colors.textSecondary}
                style={{ transform: [{ rotate: '180deg' }] }}
              />
            </Pressable>

            {/* Oral test option */}
            <Pressable
              style={({ pressed }) => [
                styles.sheetOption,
                {
                  backgroundColor: alpha(colors.streak, 10),
                  borderColor: alpha(colors.streak, 10),
                },
                pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] },
              ]}
              onPress={() => {
                setLobbyModal(false);
                navigation.navigate('OralTestLobby', { courseId: route.params.courseId, courseTitle: route.params.courseTitle });
              }}
            >
              <View style={[styles.sheetOptionIcon, { backgroundColor: colors.streak }]}>
                <Mic size={20} color={colors.onPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetOptionTitle, { color: colors.textPrimary }]}>
                  Устный тренажёр
                </Text>
                <Text style={[styles.sheetOptionDesc, { color: colors.textSecondary }]}>
                  Тренировка произношения — результат не сохраняется
                </Text>
              </View>
              <ArrowLeft
                size={16}
                color={colors.textSecondary}
                style={{ transform: [{ rotate: '180deg' }] }}
              />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ==================== STYLES ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    paddingBottom: 12,
    borderBottomWidth: 1,
    ...Platform.select({
      web: { backdropFilter: 'blur(12px)' },
    }) as any,
  },
  backBtn: {
    padding: spacing.xs,
    marginLeft: -spacing.xs,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.3,
    marginLeft: spacing.m,
    flex: 1,
  },
  scroll: {
    padding: spacing.m,
    gap: spacing.xl,
  },

  // Test Lobby
  testLobbyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.m,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    gap: 12,
  },
  testLobbyIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.s,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testLobbyText: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
    flex: 1,
  },

  // Metrics
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s,
  },
  metricCard: {
    width: '48%',
    flexGrow: 1,
    minHeight: 100,
    borderRadius: borderRadius.l,
    padding: spacing.m,
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },

  // Section
  section: {
    gap: spacing.m,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  viewAll: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Toggle
  togglePill: {
    flexDirection: 'row',
    borderRadius: borderRadius.m,
    padding: 4,
    gap: 2,
  },
  toggleBtn: {
    paddingHorizontal: spacing.m,
    paddingVertical: 4,
    borderRadius: borderRadius.s,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Chart
  chartWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: spacing.s,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    height: '100%',
  },
  bar: {
    width: 18,
    borderRadius: borderRadius.full,
  },
  barLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  chartTooltip: {
    position: 'absolute',
    bottom: 22,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    zIndex: 5,
  },
  chartTooltipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  chartTooltipArrow: {
    position: 'absolute',
    bottom: -6,
    left: '50%',
    marginLeft: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },

  // Students
  studentsRow: {
    gap: spacing.l,
    paddingVertical: spacing.xs,
  },
  studentItem: {
    alignItems: 'center',
    gap: 6,
    minWidth: 56,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 20,
    fontWeight: '700',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 13,
    height: 13,
    borderRadius: borderRadius.s,
    borderWidth: 2,
  },
  studentName: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 56,
  },
  studentLastActive: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 1,
  },
  emptyMembers: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Sets
  setsList: {
    gap: spacing.m,
  },
  setCard: {
    borderRadius: borderRadius.l,
    padding: spacing.m,
    borderWidth: 1,
    gap: spacing.s,
  },
  setCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  setCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: spacing.s,
  },
  setCardWords: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressBg: {
    height: 4,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  unitTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  unitTagText: {
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  setCardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  setCardMetaText: {
    fontSize: 12,
    fontWeight: '600',
  },
  setCardAccuracy: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalContent: {
    width: '100%',
    maxHeight: '70%',
    borderRadius: borderRadius.l,
    padding: spacing.l,
    
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.m,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  modalList: {
    flexGrow: 0,
  },
  modalStudentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  modalAvatarWrap: {
    position: 'relative',
  },
  modalStudentName: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalStreakBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.s,
  },
  modalStreakText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Bottom Sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  sheetContent: {
    borderTopLeftRadius: borderRadius.l,
    borderTopRightRadius: borderRadius.l,
    paddingHorizontal: spacing.l,
    paddingTop: 12,
    
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: borderRadius.full,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 16,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  sheetOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  sheetOptionDesc: {
    fontSize: 12,
    fontWeight: '400',
    marginTop: 2,
  },
});
