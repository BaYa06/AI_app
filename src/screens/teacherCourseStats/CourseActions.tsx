/**
 * Действия курса (plan/new/teacher_cabinet.md, Teacher 8): вместо шести одинаковых строк —
 * плитки главных действий (Живой тест, Задание, Код подключения, Учебники курса) с живыми
 * подписями и короткий список (История тестов, Рейтинг недели, Расписание).
 * Плитка «Задание» — только при TEACHER_HOMEWORK_ENABLED (этап 2).
 */
import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import {
  BookOpen,
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  Clock,
  GraduationCap,
  Trophy,
  UserPlus,
  Zap,
} from 'lucide-react-native';
import { Text } from '@/components/common';
import type { IconComponent } from '@/components/ui';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, heights, iconSize, spacing } from '@/constants';
import { TEACHER_HOMEWORK_ENABLED, TEACHER_LESSON_PREP_ENABLED } from '@/config/features';
import type { RootStackParamList } from '@/types/navigation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { pluralize } from '@/utils';
import { Analytics } from '@/services/analytics';
import type { TeacherAction } from '@/services/analyticsEvents/teacher';
import { formatShortDate, type TestHistorySummary } from './courseOverview';

/** Подписи плиток и списка; undefined — ещё грузится (подпись не показываем) */
export interface CourseOverview {
  tests?: TestHistorySummary | null;
  membersCount?: number;
  /** null — учебника нет */
  openUnits?: number | null;
  /** «пн–пт 10:30»; null — расписания нет */
  scheduleLabel?: string | null;
}

type Props = {
  colors: ReturnType<typeof useThemeColors>;
  navigation: NativeStackScreenProps<RootStackParamList, 'TeacherCourseStats'>['navigation'];
  route: NativeStackScreenProps<RootStackParamList, 'TeacherCourseStats'>['route'];
  setJoinCodeDialog: React.Dispatch<React.SetStateAction<boolean>>;
  /** «Живой тест» — сразу настройка теста (Teacher 32) */
  onLiveTest: () => void;
  setScheduleSheet: React.Dispatch<React.SetStateAction<boolean>>;
  overview: CourseOverview;
  /** Этап 2: «Задание» */
  onAssignHomework?: () => void;
  /** «сдали 7 из 22» — есть текущее задание; без него «с дедлайном» */
  homeworkCaption?: string;
};

export function CourseActions({
  colors,
  navigation,
  route,
  setJoinCodeDialog,
  onLiveTest,
  setScheduleSheet,
  overview,
  onAssignHomework,
  homeworkCaption,
}: Props) {
  const { courseId, courseTitle } = route.params;
  // Нажатие + запись в аналитику (Teacher 12)
  const tap = (action: TeacherAction, fn?: () => void) => () => {
    Analytics.teacherAction(action, 'course');
    fn?.();
  };
  const { tests, membersCount, openUnits, scheduleLabel } = overview;

  const testCaption =
    tests === undefined || tests === null
      ? undefined
      : tests.count === 0
        ? 'ещё ни одного'
        : tests.lastFinishedAt
          ? `последний ${formatShortDate(tests.lastFinishedAt)}`
          : undefined;
  const membersCaption =
    membersCount === undefined
      ? undefined
      : `${membersCount} ${pluralize(membersCount, 'ученик', 'ученика', 'учеников')} в курсе`;
  const booksCaption =
    openUnits === undefined
      ? undefined
      : openUnits === null
        ? 'подключить учебник'
        : `открыто ${openUnits} ${pluralize(openUnits, 'юнит', 'юнита', 'юнитов')}`;

  return (
    <View style={st.wrap}>
      <View style={st.grid}>
        <Tile
          colors={colors}
          filled
          icon={GraduationCap}
          title="Живой тест"
          caption={testCaption}
          onPress={tap('live_test', onLiveTest)}
        />
        {TEACHER_HOMEWORK_ENABLED && (
          <Tile
            colors={colors}
            icon={ClipboardCheck}
            title="Задание"
            caption={homeworkCaption ?? 'с дедлайном'}
            onPress={tap('homework', onAssignHomework)}
          />
        )}
        <Tile
          colors={colors}
          icon={UserPlus}
          title="Код подключения"
          caption={membersCaption}
          onPress={tap('join_code', () => setJoinCodeDialog(true))}
        />
        <Tile
          colors={colors}
          icon={BookOpen}
          title="Учебники курса"
          caption={booksCaption}
          onPress={tap('books', () =>
            navigation.navigate('CourseBooks', { courseId, courseTitle })
          )}
        />
      </View>

      <View style={[st.list, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {TEACHER_LESSON_PREP_ENABLED && (
          <Row
            colors={colors}
            icon={Zap}
            title="Подготовка к уроку"
            value="трудные слова"
            onPress={tap('lesson_prep', () =>
              navigation.navigate('TeacherLessonPrep', { courseId, courseTitle })
            )}
          />
        )}
        <Row
          colors={colors}
          icon={Clock}
          divider={TEACHER_LESSON_PREP_ENABLED}
          title="История тестов"
          value={tests ? String(tests.count) : undefined}
          onPress={() => navigation.navigate('TestHistory', { courseId, courseTitle })}
        />
        <Row
          colors={colors}
          icon={Trophy}
          title="Рейтинг недели"
          onPress={() => navigation.navigate('CourseLeaderboard', { courseId, courseTitle })}
          divider
        />
        <Row
          colors={colors}
          icon={CalendarClock}
          title="Расписание"
          value={scheduleLabel === undefined ? undefined : (scheduleLabel ?? 'не задано')}
          onPress={tap('schedule', () => setScheduleSheet(true))}
          divider
        />
      </View>
    </View>
  );
}

function Tile({
  colors,
  icon: Icon,
  title,
  caption,
  filled,
  onPress,
}: {
  colors: ReturnType<typeof useThemeColors>;
  icon: IconComponent;
  title: string;
  caption?: string;
  filled?: boolean;
  onPress?: () => void;
}) {
  const fg = filled ? colors.onPrimary : colors.textPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={caption ? `${title}, ${caption}` : title}
      onPress={onPress}
      style={({ pressed }) => [
        st.tile,
        filled
          ? { backgroundColor: colors.primaryFill, borderColor: colors.primaryFill }
          : { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && st.pressed,
      ]}
    >
      <View
        style={[
          st.tileIcon,
          { backgroundColor: filled ? alpha(colors.onPrimary, 20) : alpha(colors.primary, 10) },
        ]}
      >
        <Icon size={iconSize.s} color={filled ? colors.onPrimary : colors.primary} />
      </View>
      <View>
        <Text variant="label" style={{ color: fg }} numberOfLines={1}>
          {title}
        </Text>
        <Text
          variant="caption"
          numberOfLines={1}
          style={{
            color: filled ? colors.onPrimary : colors.textSecondary,
            opacity: caption ? 0.9 : 0,
          }}
        >
          {caption ?? ' '}
        </Text>
      </View>
    </Pressable>
  );
}

function Row({
  colors,
  icon: Icon,
  title,
  value,
  onPress,
  divider,
}: {
  colors: ReturnType<typeof useThemeColors>;
  icon: IconComponent;
  title: string;
  value?: string;
  onPress: () => void;
  divider?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${title}: ${value}` : title}
      onPress={onPress}
      style={({ pressed }) => [
        st.row,
        divider && { borderTopWidth: 1, borderTopColor: colors.border },
        pressed && st.pressed,
      ]}
    >
      <Icon size={iconSize.s} color={colors.textSecondary} />
      <Text variant="body" style={[st.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
        {title}
      </Text>
      {value !== undefined && (
        <Text variant="bodySmall" style={{ color: colors.textSecondary }} numberOfLines={1}>
          {value}
        </Text>
      )}
      <ChevronRight size={iconSize.s} color={colors.textTertiary} />
    </Pressable>
  );
}

const st = StyleSheet.create({
  wrap: {
    gap: spacing.s,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    borderWidth: 1,
    borderRadius: borderRadius.l,
    padding: spacing.s,
    gap: spacing.xs,
  },
  tileIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    borderWidth: 1,
    borderRadius: borderRadius.l,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    minHeight: heights.listRow,
    paddingHorizontal: spacing.m,
  },
  rowTitle: {
    flex: 1,
  },
  pressed: {
    opacity: 0.85,
  },
});
