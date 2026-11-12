/**
 * Карточка урока на главной учителя (plan/new/teacher_cabinet.md, Teacher 2).
 * Заменяет баннер «Режим учителя», когда учитель в своём курсе.
 *
 * Есть логика: ближайший урок из расписания курса, быстрые действия (Teacher 3),
 * «Кому уделить внимание» — кто не заходит 7+ дней и «Напомнить» (Teacher 4).
 * Задание (этап 2, флаг TEACHER_HOMEWORK_ENABLED): «Задания пока нет» → окно «Новое задание»
 * или текущее задание «Сдали N из M» → экран сдачи и окно «Кто не сдал» (useTeacherHomework).
 * «Проверить на уроке» — этап 3, за флагом TEACHER_LESSON_PREP_ENABLED.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  GraduationCap,
  Play,
  Plus,
  UserPlus,
  Users,
} from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button, toast, type IconComponent } from '@/components/ui';
import { alpha, borderRadius, heights, iconSize, screenPadding, spacing } from '@/constants';
import { NeonService } from '@/services/NeonService';
import { Analytics } from '@/services/analytics';
import type { TeacherAction } from '@/services/analyticsEvents/teacher';
import { CourseScheduleSheet } from '@/components/push/CourseScheduleSheet';
import { CourseJoinCodeDialog } from '@/components/CourseJoinCodeDialog';
import { TEACHER_HOMEWORK_ENABLED, TEACHER_LESSON_PREP_ENABLED } from '@/config/features';
import { useTeacherHomework } from '@/components/teacher/useTeacherHomework';
import {
  homeworkCardSummary,
  type HomeworkCardSummary,
} from '@/components/teacher/teacherHomework';
import { getNextLesson, type ScheduleItem } from '@/utils/nextLesson';
import { pluralize } from '@/utils';
import { getStudentStatus } from '@/screens/teacherCourseStats/helpers';
import { TestLobbySheet } from '@/screens/teacherCourseStats/TestLobbySheet';
import type { TeacherCourseMember } from '../useTeacherCourseData';

type Props = {
  colors: ReturnType<typeof useThemeColors>;
  courseId: string;
  courseTitle: string;
  navigation: any;
  /** Ученики курса из useTeacherCourseData; null — ещё грузятся или не загрузились */
  courseMembers: TeacherCourseMember[] | null;
};

/** «Batyrov Batyr» → «Batyrov B.»; одно слово — как есть */
const shortName = (name: string) => {
  const [first, second] = name.trim().split(/\s+/);
  return second ? `${first} ${second.charAt(0)}.` : first;
};

export function TeacherLessonCard({
  colors,
  courseId,
  courseTitle,
  navigation,
  courseMembers,
}: Props) {
  const [schedule, setSchedule] = useState<ScheduleItem[] | null | undefined>(undefined);
  const [scheduleSheet, setScheduleSheet] = useState(false);
  const [codeDialog, setCodeDialog] = useState(false);
  const [testSheet, setTestSheet] = useState(false);
  const insets = useSafeAreaInsets();
  const [reminding, setReminding] = useState(false);
  const [remindedToday, setRemindedToday] = useState(false);

  const homeworkStudents = useMemo(
    () => courseMembers?.map((m) => ({ id: m.id, displayName: m.name })) ?? null,
    [courseMembers]
  );
  const hw = useTeacherHomework({
    courseId,
    courseTitle,
    students: homeworkStudents,
    schedule: schedule ?? null,
    navigation,
  });

  const loadSchedule = useCallback(() => {
    NeonService.getCourseSchedule(courseId).then(setSchedule);
  }, [courseId]);

  useEffect(() => {
    setSchedule(undefined);
    setRemindedToday(false);
    loadSchedule();
  }, [courseId, loadSchedule]);

  // Аналитика: главная учителя в этом курсе (раз на курс за показ)
  const viewedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!courseMembers || schedule === undefined || viewedFor.current === courseId) return;
    viewedFor.current = courseId;
    Analytics.teacherHomeViewed({
      hasSchedule: !!schedule && schedule.length > 0,
      students: courseMembers.length,
      inactive: courseMembers.filter((m) => getStudentStatus(m.lastActiveDate) === 'inactive')
        .length,
    });
  }, [courseId, courseMembers, schedule]);

  // Дольше всех не заходил — первым; ни разу не заходил — в самом начале
  const members = useMemo(
    () =>
      courseMembers && {
        total: courseMembers.length,
        inactive: courseMembers
          .filter((m) => getStudentStatus(m.lastActiveDate) === 'inactive')
          .sort((a, b) => (a.lastActiveDate ?? '').localeCompare(b.lastActiveDate ?? '')),
      },
    [courseMembers]
  );

  const track = (action: TeacherAction) => Analytics.teacherAction(action, 'home');

  const openCourse = () => {
    track('course');
    const rootNav = navigation?.getParent?.() ?? navigation;
    rootNav?.navigate('TeacherCourseStats', { courseId, courseTitle });
  };

  const openStudents = (filter?: 'away7d') => {
    track(filter ? 'inactive' : 'students');
    const rootNav = navigation?.getParent?.() ?? navigation;
    rootNav?.navigate('TeacherStudents', { courseId, courseTitle, filter });
  };

  const remind = async () => {
    if (reminding || remindedToday) return;
    track('remind');
    setReminding(true);
    const result = await NeonService.remindCourseReview(courseId);
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

  const next = schedule ? getNextLesson(schedule) : null;
  const onFill = colors.onPrimary;
  const softFill = alpha(colors.onPrimary, 20);

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, { backgroundColor: colors.primaryFill }]}>
        {/* Урок + переход в курс */}
        <View style={styles.topRow}>
          <View style={styles.topLeft}>
            <View style={[styles.iconBox, { backgroundColor: softFill }]}>
              <GraduationCap size={iconSize.s} color={onFill} />
            </View>
            {schedule === undefined ? (
              <ActivityIndicator size="small" color={onFill} />
            ) : (
              <Text variant="label" numberOfLines={1} style={[styles.shrink, { color: onFill }]}>
                {next
                  ? `Урок ${next.label.charAt(0).toLowerCase()}${next.label.slice(1)}`
                  : courseTitle}
              </Text>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Открыть курс ${courseTitle}`}
            onPress={openCourse}
            hitSlop={spacing.xs}
            style={({ pressed }) => [styles.courseLink, pressed && styles.pressed]}
          >
            <Text variant="label" style={{ color: onFill }}>
              Курс
            </Text>
            <ChevronRight size={iconSize.s} color={onFill} />
          </Pressable>
        </View>

        {/* Расписания нет — предлагаем указать (null — не загрузилось, тогда не предлагаем) */}
        {Array.isArray(schedule) && !next && (
          <View style={styles.block}>
            <Text variant="h3" style={{ color: onFill }}>
              Когда уроки?
            </Text>
            <Text variant="bodySmall" style={[styles.muted, { color: onFill }]}>
              Укажи дни — ученикам будет приходить «Скоро занятие» перед уроком
            </Text>
            <FillButton
              colors={colors}
              icon={CalendarClock}
              title="Указать расписание"
              onPress={() => {
                track('schedule');
                setScheduleSheet(true);
              }}
            />
          </View>
        )}

        {/* Задание — макет до этапа 2 */}
        {TEACHER_HOMEWORK_ENABLED && (
          <HomeworkBlock
            colors={colors}
            homework={hw.current ? homeworkCardSummary(hw.current) : null}
            onAssign={() => {
              track('homework');
              hw.openNew();
            }}
            onOpen={(id) => {
              track('homework');
              hw.openStatus(id);
            }}
            onCheck={() => {
              track('live_test');
              setTestSheet(true);
            }}
            onStatus={(id) => {
              track('homework');
              hw.openNotSubmitted(id);
            }}
          />
        )}

        {/* Учеников нет — предлагаем код курса */}
        {members && members.total === 0 && (
          <View style={[styles.studentsRow, { backgroundColor: softFill }]}>
            <Text variant="bodySmall" style={[styles.shrink, { color: onFill }]}>
              Пока нет учеников — отправь им код курса
            </Text>
            <SoftButton
              colors={colors}
              icon={UserPlus}
              title="Код курса"
              onPress={() => {
                track('join_code');
                setCodeDialog(true);
              }}
            />
          </View>
        )}
      </View>

      {/* Быстрые действия курса (Teacher 3): то, что раньше было только внутри курса */}
      <View style={styles.actions}>
        <QuickAction
          colors={colors}
          icon={Play}
          title="Живой тест"
          onPress={() => {
            track('live_test');
            setTestSheet(true);
          }}
        />
        {TEACHER_HOMEWORK_ENABLED && (
          <QuickAction
            colors={colors}
            icon={ClipboardCheck}
            title="Задание"
            onPress={() => {
              track('homework');
              hw.openHomework();
            }}
          />
        )}
        <QuickAction
          colors={colors}
          icon={UserPlus}
          title="Код курса"
          onPress={() => {
            track('join_code');
            setCodeDialog(true);
          }}
        />
        <QuickAction
          colors={colors}
          icon={Users}
          title={members ? `Ученики ${members.total}` : 'Ученики'}
          onPress={() => openStudents()}
        />
      </View>

      {/* Кому уделить внимание (Teacher 4): кто не заходит 7+ дней + «Напомнить» */}
      {members && members.inactive.length > 0 && (
        <View style={styles.attention}>
          <Text variant="h3" style={{ color: colors.textPrimary }}>
            Кому уделить внимание
          </Text>
          <View
            style={[
              styles.attentionCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              onPress={() => openStudents('away7d')}
              style={({ pressed }) => [styles.attentionRow, pressed && styles.pressed]}
            >
              <View style={[styles.attentionBadge, { backgroundColor: alpha(colors.error, 10) }]}>
                <Text variant="label" style={{ color: colors.errorText }}>
                  {members.inactive.length}
                </Text>
              </View>
              <View style={styles.shrink}>
                <Text variant="label" style={{ color: colors.textPrimary }}>
                  {`${pluralize(members.inactive.length, 'Не заходит', 'Не заходят', 'Не заходят')} 7+ дней`}
                </Text>
                <Text variant="bodySmall" numberOfLines={2} style={{ color: colors.textSecondary }}>
                  {members.inactive
                    .slice(0, 3)
                    .map((m) => shortName(m.name))
                    .join(', ') +
                    (members.inactive.length > 3 ? ` и ещё ${members.inactive.length - 3}` : '')}
                </Text>
              </View>
              <ChevronRight size={iconSize.s} color={colors.textTertiary} />
            </Pressable>
            <Button
              variant="secondary"
              size="s"
              title={remindedToday ? 'Напомнили сегодня' : 'Напомнить повторить слова'}
              onPress={remind}
              loading={reminding}
              disabled={remindedToday}
            />
          </View>
        </View>
      )}

      <TestLobbySheet
        colors={colors}
        insets={insets}
        lobbyModal={testSheet}
        setLobbyModal={setTestSheet}
        onSelect={(kind) => {
          const rootNav = navigation?.getParent?.() ?? navigation;
          rootNav?.navigate(kind === 'exam' ? 'ExamLobby' : 'OralTestLobby', {
            courseId,
            courseTitle,
          });
        }}
      />
      <CourseScheduleSheet
        visible={scheduleSheet}
        courseId={courseId}
        onClose={() => {
          setScheduleSheet(false);
          loadSchedule();
        }}
      />
      {hw.sheets}
      <CourseJoinCodeDialog
        visible={codeDialog}
        courseId={courseId}
        courseTitle={courseTitle}
        onClose={() => setCodeDialog(false)}
      />
    </View>
  );
}

/** Блок задания: 1б «Задания пока нет» / 1а «Сдали N из M» (макет, этап 2) */
function HomeworkBlock({
  colors,
  homework,
  onAssign,
  onOpen,
  onCheck,
  onStatus,
}: {
  colors: ReturnType<typeof useThemeColors>;
  homework: HomeworkCardSummary | null;
  onAssign: () => void;
  onOpen: (id: string) => void;
  onCheck: () => void;
  onStatus: (id: string) => void;
}) {
  const onFill = colors.onPrimary;
  if (!homework) {
    return (
      <View style={styles.block}>
        <Text variant="h3" style={{ color: onFill }}>
          Задания пока нет
        </Text>
        <FillButton colors={colors} icon={Plus} title="Задать задание" onPress={onAssign} />
      </View>
    );
  }
  const total = homework.done + homework.inProgress + homework.notStarted;
  return (
    <View style={styles.block}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Задание ${homework.title}: сдали ${homework.done} из ${total}`}
        onPress={() => onOpen(homework.id)}
        style={({ pressed }) => [styles.block, pressed && styles.pressed]}
      >
        <Text variant="overline" style={[styles.muted, { color: onFill }]}>
          {`Текущее задание · ${homework.title}`}
        </Text>
        <Text variant="h2" style={{ color: onFill }}>
          {`Сдали ${homework.done} из ${total}`}
        </Text>
        <Text variant="bodySmall" style={[styles.muted, { color: onFill }]}>
          {`до: ${homework.dueLabel} · в процессе ${homework.inProgress} · не начали ${homework.notStarted}`}
        </Text>
        <View style={[styles.bar, { backgroundColor: alpha(onFill, 20) }]}>
          <View style={{ flex: homework.done, backgroundColor: onFill }} />
          <View style={{ flex: homework.inProgress, backgroundColor: alpha(onFill, 40) }} />
          <View style={{ flex: homework.notStarted }} />
        </View>
      </Pressable>
      <View style={styles.buttonsRow}>
        {TEACHER_LESSON_PREP_ENABLED && (
          <FillButton
            colors={colors}
            icon={Play}
            title="Проверить на уроке"
            onPress={onCheck}
            grow
          />
        )}
        {total - homework.done > 0 && (
          <SoftButton colors={colors} title="Кто не сдал" onPress={() => onStatus(homework.id)} />
        )}
      </View>
    </View>
  );
}

/** Плитка быстрого действия под карточкой урока */
function QuickAction({
  colors,
  title,
  icon: Icon,
  onPress,
}: {
  colors: ReturnType<typeof useThemeColors>;
  title: string;
  icon: IconComponent;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <View style={[styles.actionIcon, { backgroundColor: alpha(colors.primary, 10) }]}>
        <Icon size={iconSize.m} color={colors.primary} />
      </View>
      <Text
        variant="caption"
        numberOfLines={1}
        style={[styles.actionLabel, { color: colors.textPrimary }]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

/** Белая кнопка на заливке primaryFill — главное действие карточки */
function FillButton({
  colors,
  title,
  icon: Icon,
  onPress,
  grow,
}: {
  colors: ReturnType<typeof useThemeColors>;
  title: string;
  icon?: IconComponent;
  onPress?: () => void;
  grow?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.fillButton,
        grow && styles.grow,
        { backgroundColor: colors.onPrimary },
        pressed && styles.pressed,
      ]}
    >
      {Icon && <Icon size={iconSize.s} color={colors.primaryFill} />}
      <Text variant="button" style={{ color: colors.primaryFill }}>
        {title}
      </Text>
    </Pressable>
  );
}

/** Полупрозрачная кнопка на заливке — второстепенное действие */
function SoftButton({
  colors,
  title,
  icon: Icon,
  onPress,
  loading,
  disabled,
}: {
  colors: ReturnType<typeof useThemeColors>;
  title: string;
  icon?: IconComponent;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.softButton,
        { backgroundColor: alpha(colors.onPrimary, 20) },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.onPrimary} />
      ) : (
        <>
          {Icon && <Icon size={iconSize.s} color={colors.onPrimary} />}
          <Text variant="label" style={{ color: colors.onPrimary }}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.m,
    paddingBottom: spacing.s,
  },
  card: {
    borderRadius: borderRadius.xl,
    padding: spacing.m,
    gap: spacing.m,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s,
  },
  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  courseLink: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: heights.touch,
  },
  block: {
    gap: spacing.xs,
  },
  muted: {
    opacity: 0.85,
  },
  shrink: {
    flexShrink: 1,
  },
  grow: {
    flex: 1,
  },
  bar: {
    height: 8,
    borderRadius: borderRadius.s,
    flexDirection: 'row',
    overflow: 'hidden',
    marginVertical: spacing.xxs,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  fillButton: {
    minHeight: heights.input,
    borderRadius: borderRadius.m,
    paddingHorizontal: spacing.m,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  studentsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s,
    borderRadius: borderRadius.m,
    paddingVertical: spacing.xs,
    paddingLeft: spacing.s,
    paddingRight: spacing.xs,
  },
  softButton: {
    minHeight: heights.touch,
    borderRadius: borderRadius.m,
    paddingHorizontal: spacing.s,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
  },
  disabled: {
    opacity: 0.5,
  },
  attention: {
    marginTop: spacing.l,
    gap: spacing.s,
  },
  attentionCard: {
    borderWidth: 1,
    borderRadius: borderRadius.l,
    padding: spacing.m,
    gap: spacing.s,
  },
  attentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  attentionBadge: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginTop: spacing.m,
  },
  action: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xxs,
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontWeight: '600',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
});
