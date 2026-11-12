/**
 * Teacher Course Stats Screen
 * @description Статистика курса для учителя
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { CourseScheduleSheet } from '@/components/push/CourseScheduleSheet';
import { CourseJoinCodeDialog } from '@/components/CourseJoinCodeDialog';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { spacing } from '@/constants';
import { NeonService, type CourseScheduleItem } from '@/services/NeonService';
import { useTeacherHomework } from '@/components/teacher/useTeacherHomework';
import { homeworkTileCaption } from '@/components/teacher/teacherHomework';
import { BookService } from '@/services/BookService';
import { Analytics } from '@/services/analytics';
import { toast } from '@/components/ui';
import { getSession } from '@/services/auth/session';
import type { RootStackParamList } from '@/types/navigation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { log } from '@/utils/logger';
import { styles } from './teacherCourseStats/styles';
import {
  type CourseMember,
  getInitials,
  getStudentStatus,
  buildChartDays,
  AvatarPlaceholder,
} from './teacherCourseStats/helpers';
import { TestLobbySheet } from './teacherCourseStats/TestLobbySheet';
import { StudentListModal } from './teacherCourseStats/StudentListModal';
import { CourseSetsList } from './teacherCourseStats/CourseSetsList';
import { ActivityChart } from './teacherCourseStats/ActivityChart';
import { CourseActions, type CourseOverview } from './teacherCourseStats/CourseActions';
import {
  activityInsight,
  formatScheduleLabel,
  loadTestHistorySummary,
} from './teacherCourseStats/courseOverview';

type Props = NativeStackScreenProps<RootStackParamList, 'TeacherCourseStats'>;

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

  // Сводка для плиток и шапки (Teacher 8): тесты, учебники курса, расписание
  const [overview, setOverview] = useState<Omit<CourseOverview, 'membersCount'>>({});
  const [bookTitles, setBookTitles] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<CourseScheduleItem[] | null>(null);
  const loadSchedule = useCallback(() => {
    NeonService.getCourseSchedule(route.params.courseId).then((items) => {
      setSchedule(items);
      if (items) setOverview((o) => ({ ...o, scheduleLabel: formatScheduleLabel(items) }));
    });
  }, [route.params.courseId]);
  useEffect(() => {
    if (!isOwner) return;
    let mounted = true;
    loadTestHistorySummary(route.params.courseId).then((tests) => {
      if (mounted) setOverview((o) => ({ ...o, tests }));
    });
    BookService.getCoursePlan(route.params.courseId).then((plan) => {
      if (!mounted || !plan) return;
      const open = plan.books.reduce((n, b) => n + b.units.filter((u) => u.isOpen).length, 0);
      setOverview((o) => ({ ...o, openUnits: plan.books.length > 0 ? open : null }));
      setBookTitles(plan.books.map((b) => b.title).join(', ') || null);
    });
    loadSchedule();
    return () => {
      mounted = false;
    };
  }, [isOwner, route.params.courseId, retryTick, loadSchedule]);

  // «Напомнить» у «Не заходили 7д+» — то же, что на главной и в списке учеников
  const [reminding, setReminding] = useState(false);
  const [remindedToday, setRemindedToday] = useState(false);
  const handleRemind = async () => {
    if (reminding || remindedToday) return;
    Analytics.teacherAction('remind', 'course');
    setReminding(true);
    const result = await NeonService.remindCourseReview(route.params.courseId);
    setReminding(false);
    if (result === 'rate_limited') {
      setRemindedToday(true);
      toast.info('Уже напомнили: классу можно напоминать не чаще раза в сутки');
    } else if (!result) {
      toast.error('Не получилось. Проверь соединение и попробуй ещё раз');
    } else {
      setRemindedToday(true);
      toast.success(
        `Напоминание отправлено: ученикам с уведомлениями ${result.sent} из ${result.students}`
      );
    }
  };

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

  // Задание курса (этап 2): плитка «Задание», окна «Новое задание» и «Кто не сдал»
  const homeworkStudents = useMemo(
    () => (membersLoading ? null : members.map((m) => ({ id: m.id, displayName: m.name }))),
    [members, membersLoading]
  );
  const hw = useTeacherHomework({
    courseId: route.params.courseId,
    courseTitle: route.params.courseTitle,
    students: homeworkStudents,
    schedule,
    navigation,
  });

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
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {courseTitle || 'Статистика курса'}
          </Text>
          {(bookTitles || overview.scheduleLabel) && (
            <Text variant="caption" numberOfLines={1} style={{ color: colors.textSecondary }}>
              {[bookTitles, overview.scheduleLabel].filter(Boolean).join(' · ')}
            </Text>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Действия курса — одним блоком, с плотным отступом (у ScrollView gap крупный, для секций) */}
        <CourseActions
          colors={colors}
          navigation={navigation}
          route={route}
          setJoinCodeDialog={setJoinCodeDialog}
          setLobbyModal={setLobbyModal}
          setScheduleSheet={setScheduleSheet}
          overview={{
            ...overview,
            membersCount: membersLoading || membersError ? undefined : members.length,
          }}
          onAssignHomework={hw.openHomework}
          homeworkCaption={homeworkTileCaption(hw.current)}
        />

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
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                }}
              >
                <Text style={[styles.metricValue, { color: colors.errorText }]}>
                  {inactiveStudents.length}
                </Text>
                {inactiveStudents.length > 0 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: remindedToday || reminding }}
                    onPress={handleRemind}
                    disabled={remindedToday || reminding}
                    hitSlop={8}
                  >
                    <Text
                      variant="label"
                      style={{
                        color: colors.primary,
                        opacity: remindedToday || reminding ? 0.5 : 1,
                      }}
                    >
                      {remindedToday ? 'Напомнили' : 'Напомнить'}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </Pressable>
        </View>

        {/* Activity Chart */}
        <ActivityChart
          colors={colors}
          CHART_HEIGHT={CHART_HEIGHT}
          chartData={chartData}
          chartError={chartError}
          chartLoading={chartLoading}
          chartPeriod={chartPeriod}
          setChartPeriod={setChartPeriod}
          chartTooltip={chartTooltip}
          handleBarPress={handleBarPress}
          setRetryTick={setRetryTick}
          insight={
            // Только «7д»: в «30д» столбец — сумма за 5 дней, «учились N» было бы неверно
            chartPeriod !== '7d' || chartLoading || chartError ? null : activityInsight(chartData)
          }
        />

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
        <CourseSetsList
          colors={colors}
          cardBg={cardBg}
          cardBorder={cardBorder}
          members={members}
          setRetryTick={setRetryTick}
          setsError={setsError}
          setsLoading={setsLoading}
          setsStats={setsStats}
        />
      </ScrollView>

      {/* Student List Modal */}
      <StudentListModal
        colors={colors}
        modalStudents={modalStudents}
        modalTitle={modalTitle}
        studentModal={studentModal}
        setStudentModal={setStudentModal}
      />

      <CourseScheduleSheet
        visible={scheduleSheet}
        courseId={route.params.courseId}
        onClose={() => {
          setScheduleSheet(false);
          loadSchedule();
        }}
      />

      {hw.sheets}
      <CourseJoinCodeDialog
        visible={joinCodeDialog}
        courseId={route.params.courseId}
        courseTitle={courseTitle}
        onClose={() => setJoinCodeDialog(false)}
      />

      {/* Test Lobby Bottom Sheet */}
      <TestLobbySheet
        colors={colors}
        insets={insets}
        lobbyModal={lobbyModal}
        setLobbyModal={setLobbyModal}
        onSelect={(kind) =>
          navigation.navigate(kind === 'exam' ? 'ExamLobby' : 'OralTestLobby', {
            courseId: route.params.courseId,
            courseTitle: route.params.courseTitle,
          })
        }
      />
    </View>
  );
}
