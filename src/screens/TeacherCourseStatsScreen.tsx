/**
 * Teacher Course Stats Screen
 * @description Статистика курса для учителя
 */
import React, { useState, useEffect } from 'react';
import { View, ScrollView, Pressable, Modal, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  X,
  GraduationCap,
  FileText,
  Mic,
  Clock,
  AlertTriangle,
  BookOpen,
  Trophy,
  Flame,
  CalendarClock,
  UserPlus,
} from 'lucide-react-native';
import { CourseScheduleSheet } from '@/components/push/CourseScheduleSheet';
import { CourseJoinCodeDialog } from '@/components/CourseJoinCodeDialog';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { spacing, alpha, iconSize } from '@/constants';
import { NeonService } from '@/services/NeonService';
import { getSession } from '@/services/auth/session';
import type { RootStackParamList } from '@/types/navigation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { log } from '@/utils/logger';
import { styles } from './teacherCourseStats/styles';
import {
  type CourseMember,
  getInitials,
  getStudentStatus,
  formatLastActive,
  buildChartDays,
  AvatarPlaceholder,
} from './teacherCourseStats/helpers';

type Props = NativeStackScreenProps<RootStackParamList, 'TeacherCourseStats'>;

// ==================== TYPES ====================

export function TeacherCourseStatsScreen({ navigation, route }: Props) {
  const { courseTitle } = route.params;
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const [chartPeriod, setChartPeriod] = useState<'7d' | '30d'>('7d');
  const [lobbyModal, setLobbyModal] = useState(false);
  const [scheduleSheet, setScheduleSheet] = useState(false);
  const [joinCodeDialog, setJoinCodeDialog] = useState(false);
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
  const [setsStats, setSetsStats] = useState<
    Awaited<ReturnType<typeof NeonService.loadCourseSetStats>>
  >([]);
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
      .catch((e) => {
        log.error('TeacherCourseStats', 'Failed to load set stats', e);
        setSetsError(true);
      })
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
          }))
        );
      })
      .catch((e) => {
        log.error('TeacherCourseStats', 'Failed to load members', e);
        if (mounted) setMembersError(true);
      })
      .finally(() => {
        if (mounted) setMembersLoading(false);
      });
    return () => {
      mounted = false;
    };
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
        log.error('TeacherCourseStats', 'Failed to load activity chart', e);
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
        const authSession = await getSession();
        const userId = authSession?.user?.id;
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
    return () => {
      mounted = false;
    };
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
        {/* Действия курса — одним блоком, с плотным отступом (у ScrollView gap крупный, для секций) */}
        <View style={styles.actionList}>
          {/* Test Lobby Button */}
          <Pressable
            accessibilityRole="button"
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
            <View style={[styles.testLobbyIcon, { backgroundColor: colors.primaryFill }]}>
              <GraduationCap size={18} color={colors.onPrimary} />
            </View>
            <Text style={[styles.testLobbyText, { color: colors.textPrimary }]}>Живой тест</Text>
            <ArrowLeft
              size={16}
              color={colors.textSecondary}
              style={{ transform: [{ rotate: '180deg' }] }}
            />
          </Pressable>

          {/* Код подключения к курсу — тот же код, что в «Пригласить учеников» */}
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.testLobbyBtn,
              {
                backgroundColor: alpha(colors.primary, 10),
                borderColor: alpha(colors.primary, 10),
              },
              pressed && { opacity: 0.75, transform: [{ scale: 0.985 }] },
            ]}
            onPress={() => setJoinCodeDialog(true)}
          >
            <View style={[styles.testLobbyIcon, { backgroundColor: colors.primaryFill }]}>
              <UserPlus size={18} color={colors.onPrimary} />
            </View>
            <Text style={[styles.testLobbyText, { color: colors.textPrimary }]}>
              Код подключения к курсу
            </Text>
            <ArrowLeft
              size={16}
              color={colors.textSecondary}
              style={{ transform: [{ rotate: '180deg' }] }}
            />
          </Pressable>

          {/* История тестов */}
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.testLobbyBtn,
              {
                backgroundColor: alpha(colors.primary, 10),
                borderColor: alpha(colors.primary, 10),
              },
              pressed && { opacity: 0.75, transform: [{ scale: 0.985 }] },
            ]}
            onPress={() =>
              navigation.navigate('TestHistory', {
                courseId: route.params.courseId,
                courseTitle: route.params.courseTitle,
              })
            }
          >
            <View style={[styles.testLobbyIcon, { backgroundColor: colors.primaryFill }]}>
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
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.testLobbyBtn,
              {
                backgroundColor: alpha(colors.primary, 10),
                borderColor: alpha(colors.primary, 10),
              },
              pressed && { opacity: 0.75, transform: [{ scale: 0.985 }] },
            ]}
            onPress={() =>
              navigation.navigate('CourseLeaderboard', {
                courseId: route.params.courseId,
                courseTitle: route.params.courseTitle,
              })
            }
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

          {/* Расписание занятий (plan/new/push_notifications.md, 2.8): ученикам — «Скоро занятие» за 1–2 часа */}
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.testLobbyBtn,
              {
                backgroundColor: alpha(colors.primary, 10),
                borderColor: alpha(colors.primary, 10),
              },
              pressed && { opacity: 0.75, transform: [{ scale: 0.985 }] },
            ]}
            onPress={() => setScheduleSheet(true)}
          >
            <View style={[styles.testLobbyIcon, { backgroundColor: colors.primaryFill }]}>
              <CalendarClock size={18} color={colors.onPrimary} />
            </View>
            <Text style={[styles.testLobbyText, { color: colors.textPrimary }]}>
              Расписание занятий
            </Text>
            <ArrowLeft
              size={16}
              color={colors.textSecondary}
              style={{ transform: [{ rotate: '180deg' }] }}
            />
          </Pressable>

          {/* Учебники курса (каталог книг): план юнитов этой группы */}
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.testLobbyBtn,
              {
                backgroundColor: alpha(colors.primary, 10),
                borderColor: alpha(colors.primary, 10),
              },
              pressed && { opacity: 0.75, transform: [{ scale: 0.985 }] },
            ]}
            onPress={() =>
              navigation.navigate('CourseBooks', {
                courseId: route.params.courseId,
                courseTitle: route.params.courseTitle,
              })
            }
          >
            <View style={[styles.testLobbyIcon, { backgroundColor: colors.primaryFill }]}>
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
        </View>

        {/* Metric tiles */}
        <View style={styles.metricsGrid}>
          {/* Active today */}
          <Pressable
            accessibilityRole="button"
            style={[styles.metricCard, { backgroundColor: cardBg, borderColor: cardBorder }]}
            onPress={() => setStudentModal('active')}
          >
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
              АКТИВНЫХ СЕГОДНЯ
            </Text>
            {membersLoading ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />
            ) : membersError ? (
              <Text style={[styles.metricValue, { color: colors.textSecondary }]}>—</Text>
            ) : (
              <Text style={[styles.metricValue, { color: colors.primary }]}>
                {activeStudents.length}
              </Text>
            )}
          </Pressable>

          {/* Inactive 7d+ */}
          <Pressable
            accessibilityRole="button"
            style={[styles.metricCard, { backgroundColor: cardBg, borderColor: cardBorder }]}
            onPress={() => setStudentModal('inactive')}
          >
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
              НЕ ЗАХОДИЛИ 7Д+
            </Text>
            {membersLoading ? (
              <ActivityIndicator size="small" color={colors.error} style={{ marginTop: 8 }} />
            ) : membersError ? (
              <Text style={[styles.metricValue, { color: colors.textSecondary }]}>—</Text>
            ) : (
              <Text style={[styles.metricValue, { color: colors.error }]}>
                {inactiveStudents.length}
              </Text>
            )}
          </Pressable>
        </View>

        {/* Activity Chart */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Активность группы
            </Text>
            <View style={[styles.togglePill, { backgroundColor: colors.surfaceMuted }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: chartPeriod === '7d' }}
                style={[
                  styles.toggleBtn,
                  chartPeriod === '7d' && { backgroundColor: colors.background },
                ]}
                onPress={() => setChartPeriod('7d')}
              >
                <Text
                  style={[
                    styles.toggleText,
                    { color: chartPeriod === '7d' ? colors.textPrimary : colors.textSecondary },
                  ]}
                >
                  7д
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: chartPeriod === '30d' }}
                style={[
                  styles.toggleBtn,
                  chartPeriod === '30d' && { backgroundColor: colors.background },
                ]}
                onPress={() => setChartPeriod('30d')}
              >
                <Text
                  style={[
                    styles.toggleText,
                    { color: chartPeriod === '30d' ? colors.textPrimary : colors.textSecondary },
                  ]}
                >
                  30д
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Bar chart */}
          {chartLoading ? (
            <View
              style={{ height: CHART_HEIGHT + 20, justifyContent: 'center', alignItems: 'center' }}
            >
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : chartError ? (
            // Раньше сбой графика выглядел как пустой график без каких-либо данных — теперь
            // видно, что это ошибка, а не "активности не было". См. план, пункт 29.
            <View
              style={{
                height: CHART_HEIGHT + 20,
                justifyContent: 'center',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <AlertTriangle size={20} color={colors.textSecondary} />
              <Text style={[styles.emptyMembers, { color: colors.textSecondary }]}>
                Не удалось загрузить график
              </Text>
              <Pressable accessibilityRole="button" onPress={() => setRetryTick((t) => t + 1)}>
                <Text style={[styles.viewAll, { color: colors.primary }]}>Повторить</Text>
              </Pressable>
            </View>
          ) : (
            <View style={[styles.chartWrap, { height: CHART_HEIGHT + 20 }]}>
              {chartData.map((item, idx) => (
                <View key={idx} style={styles.barCol}>
                  <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
                    {chartTooltip?.index === idx && (
                      <View style={[styles.chartTooltip, { backgroundColor: colors.textPrimary }]}>
                        <Text style={[styles.chartTooltipText, { color: colors.onPrimary }]}>
                          {chartTooltip.day}: {chartTooltip.count}
                        </Text>
                        <View
                          style={[styles.chartTooltipArrow, { borderTopColor: colors.textPrimary }]}
                        />
                      </View>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${item.day}: ${item.count}`}
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
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                navigation.navigate('TeacherStudents', {
                  courseId: route.params.courseId,
                  courseTitle: route.params.courseTitle,
                })
              }
            >
              <Text style={[styles.viewAll, { color: colors.primary }]}>Все →</Text>
            </Pressable>
          </View>
          {membersLoading ? (
            <ActivityIndicator
              size="small"
              color={colors.primary}
              style={{ marginVertical: spacing.m }}
            />
          ) : membersError ? (
            <View style={{ alignItems: 'flex-start', gap: 6, marginVertical: spacing.s }}>
              <Text style={[styles.emptyMembers, { color: colors.textSecondary }]}>
                Не удалось загрузить учеников
              </Text>
              <Pressable accessibilityRole="button" onPress={() => setRetryTick((t) => t + 1)}>
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
            <ActivityIndicator
              size="small"
              color={colors.primary}
              style={{ marginVertical: spacing.m }}
            />
          ) : setsError ? (
            <View style={{ alignItems: 'flex-start', gap: 6, marginVertical: spacing.s }}>
              <Text style={[styles.emptyMembers, { color: colors.textSecondary }]}>
                Не удалось загрузить наборы
              </Text>
              <Pressable accessibilityRole="button" onPress={() => setRetryTick((t) => t + 1)}>
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
                      <Text
                        style={[styles.unitTagText, { color: colors.primary }]}
                        numberOfLines={1}
                      >
                        {[set.bookTitle, set.unitOpen === false ? 'закрыт' : 'открыт']
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                  )}
                  <View style={styles.setCardHeader}>
                    <Text
                      style={[styles.setCardTitle, { color: colors.textPrimary }]}
                      numberOfLines={1}
                    >
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
                        {
                          width: `${Math.min(set.progressPct, 100)}%` as any,
                          backgroundColor: colors.primary,
                        },
                      ]}
                    />
                  </View>

                  <View style={styles.setCardMeta}>
                    <Text style={[styles.setCardMetaText, { color: colors.textSecondary }]}>
                      {set.studentsStarted} из {members.length} начали
                      {members.length > set.studentsStarted
                        ? ` · ${members.length - set.studentsStarted} не начинали`
                        : ''}
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
        <Pressable
          accessible={false}
          style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
          onPress={() => setStudentModal(null)}
        >
          <Pressable
            accessible={false}
            style={[styles.modalContent, { backgroundColor: colors.surface }]}
            onPress={() => {}}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{modalTitle}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Закрыть"
                onPress={() => setStudentModal(null)}
                hitSlop={8}
              >
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
              {modalStudents.length === 0 ? (
                <Text
                  style={[
                    styles.emptyMembers,
                    { color: colors.textSecondary, paddingVertical: spacing.l },
                  ]}
                >
                  Нет учеников
                </Text>
              ) : (
                modalStudents.map((s) => {
                  const dotColor =
                    s.status === 'online'
                      ? colors.success
                      : s.status === 'away'
                        ? colors.warning
                        : s.status === 'offline'
                          ? colors.error
                          : colors.textTertiary;
                  const lastActive = formatLastActive(s.lastActiveDate, colors);
                  return (
                    <View
                      key={s.id}
                      style={[styles.modalStudentRow, { borderBottomColor: colors.border }]}
                    >
                      <View style={styles.modalAvatarWrap}>
                        <View
                          style={[styles.avatar, { backgroundColor: alpha(colors.primary, 20) }]}
                        >
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
                        <Text style={[styles.modalStudentName, { color: colors.textPrimary }]}>
                          {s.name}
                        </Text>
                        {lastActive && (
                          <Text style={{ fontSize: 12, color: lastActive.color, marginTop: 1 }}>
                            {lastActive.text}
                          </Text>
                        )}
                      </View>
                      {s.streak > 0 && (
                        <View
                          style={[
                            styles.modalStreakBadge,
                            { backgroundColor: alpha(colors.streak, 10) },
                          ]}
                        >
                          <Flame size={iconSize.xs} color={colors.streak} />
                          <Text style={[styles.modalStreakText, { color: colors.warningText }]}>
                            {s.streak}
                          </Text>
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

      <CourseScheduleSheet
        visible={scheduleSheet}
        courseId={route.params.courseId}
        onClose={() => setScheduleSheet(false)}
      />

      <CourseJoinCodeDialog
        visible={joinCodeDialog}
        courseId={route.params.courseId}
        courseTitle={courseTitle}
        onClose={() => setJoinCodeDialog(false)}
      />

      {/* Test Lobby Bottom Sheet */}
      <Modal
        visible={lobbyModal}
        transparent
        animationType="slide"
        onRequestClose={() => setLobbyModal(false)}
      >
        <Pressable
          accessible={false}
          style={styles.sheetOverlay}
          onPress={() => setLobbyModal(false)}
        >
          <Pressable
            accessible={false}
            style={[
              styles.sheetContent,
              {
                backgroundColor: colors.surface,
                paddingBottom: insets.bottom + 16,
              },
            ]}
            onPress={() => {}}
          >
            <View
              style={[styles.sheetHandle, { backgroundColor: alpha(colors.textTertiary, 40) }]}
            />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Выбери тип теста</Text>

            {/* Exam option */}
            <Pressable
              accessibilityRole="button"
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
                navigation.navigate('ExamLobby', {
                  courseId: route.params.courseId,
                  courseTitle: route.params.courseTitle,
                });
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
              accessibilityRole="button"
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
                navigation.navigate('OralTestLobby', {
                  courseId: route.params.courseId,
                  courseTitle: route.params.courseTitle,
                });
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
