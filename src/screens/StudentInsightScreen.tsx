/**
 * Экран ученика 13 (plan/new/teacher_cabinet.md, Teacher 52) — за флагом TEACHER_INSIGHTS_ENABLED
 * вместо прежнего StudentDetailScreen: шапка со статусом, карточка-вывод, три цифры, календарь
 * за 4 недели, юниты и тесты, «Попросить повторить» и «Отчёт для родителей».
 * Правила и подписи — studentDetail/studentInsight.ts. Цвета — только токены (обе темы).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, CheckCircle2, FileText, Info, Send } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button, ScreenHeader, toast } from '@/components/ui';
import { alpha, borderRadius, iconSize, spacing } from '@/constants';
import { NeonService } from '@/services/NeonService';
import { Analytics } from '@/services/analytics';
import { useCourseTitle } from '@/components/teacher/useCourseTitle';
import type { RootStackParamList } from '@/types/navigation';
import {
  calendarCells,
  calendarSummary,
  initials,
  remindTitle,
  shortDate,
  studentBadge,
  studentFigures,
  studentInsight,
  studentSubtitle,
  testsRow,
  unitRows,
  type CalendarCell,
  type StudentDetailData,
  type Tone,
  type UnitRow,
} from './studentDetail/studentInsight';

type Props = NativeStackScreenProps<RootStackParamList, 'StudentDetail'>;
type Colors = ReturnType<typeof useThemeColors>;

const toneFg = (colors: Colors, tone: Tone) =>
  tone === 'success'
    ? colors.successText
    : tone === 'warning'
      ? colors.warningText
      : colors.textSecondary;
const toneBg = (colors: Colors, tone: Tone) =>
  tone === 'success'
    ? alpha(colors.success, 10)
    : tone === 'warning'
      ? alpha(colors.warning, 10)
      : colors.surfaceMuted;

export function StudentInsightScreen({ navigation, route }: Props) {
  const { courseId, studentId } = route.params;
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  // По ссылке из пуша в параметрах только id — название курса и имя берём сами
  const courseTitle = useCourseTitle(courseId, route.params.courseTitle);
  const [data, setData] = useState<StudentDetailData | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [reminded, setReminded] = useState(false);

  const load = useCallback(async () => {
    try {
      setData((await NeonService.loadStudentCourseStats(courseId, studentId)) as StudentDetailData);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [courseId, studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const name = data?.name || route.params.studentName || 'Ученик';
  const cells = useMemo(() => (data ? calendarCells(data.days, data.joinedAt) : []), [data]);

  const remind = async () => {
    Analytics.teacherAction('student_remind', 'course');
    setReminding(true);
    const res = await NeonService.remindStudents(courseId, [studentId]);
    setReminding(false);
    if (!res) {
      toast.error('Не получилось напомнить. Проверь интернет');
      return;
    }
    setReminded(true);
    toast.success(res.students > 0 ? 'Напоминание отправлено' : 'Сегодня уже напоминали');
  };

  return (
    <View style={[st.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScreenHeader onBack={() => navigation.goBack()} title="" />
      {!data ? (
        <View style={st.center}>
          {failed ? (
            <>
              <Text color="secondary">Не получилось загрузить ученика</Text>
              <Button title="Повторить" variant="secondary" onPress={load} />
            </>
          ) : (
            <ActivityIndicator color={colors.primary} />
          )}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[st.content, { paddingBottom: insets.bottom + spacing.xl }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.primary}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
        >
          <Head colors={colors} name={name} courseTitle={courseTitle} data={data} />
          <InsightCard colors={colors} data={data} />

          <View style={st.figures}>
            {studentFigures(data).map((f) => (
              <View
                key={f.label}
                style={[st.figure, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Text
                  variant="h2"
                  style={f.tone === 'warning' ? { color: colors.warningText } : undefined}
                >
                  {f.value}
                </Text>
                <Text variant="caption" color="secondary" numberOfLines={1}>
                  {f.label}
                </Text>
              </View>
            ))}
          </View>

          <Calendar colors={colors} cells={cells} joinedAt={data.joinedAt ?? null} />

          <View style={st.section}>
            <Text variant="h3">Юниты</Text>
            <View
              style={[st.list, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              {[...unitRows(data), testsRow(data, courseTitle)].map((row, i) => (
                <Row key={row.key} colors={colors} row={row} divider={i > 0} />
              ))}
            </View>
          </View>

          <View style={st.buttons}>
            <Button
              title={remindTitle(data)}
              icon={Send}
              fullWidth
              loading={reminding}
              disabled={reminded}
              onPress={remind}
            />
            <Button
              title="Отчёт для родителей"
              icon={FileText}
              variant="secondary"
              fullWidth
              onPress={() => {
                Analytics.teacherAction('report', 'course');
                navigation.navigate('TeacherReport', {
                  courseId,
                  courseTitle,
                  studentId,
                  studentName: name,
                });
              }}
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function Head({
  colors,
  name,
  courseTitle,
  data,
}: {
  colors: Colors;
  name: string;
  courseTitle: string;
  data: StudentDetailData;
}) {
  const badge = studentBadge(data.lastActiveDate);
  return (
    <View style={st.head}>
      <View style={[st.avatar, { backgroundColor: toneBg(colors, badge.tone) }]}>
        <Text variant="h2" style={{ color: toneFg(colors, badge.tone) }}>
          {initials(name)}
        </Text>
      </View>
      <View style={st.flex}>
        <Text variant="h2" numberOfLines={2}>
          {name}
        </Text>
        <Text variant="bodySmall" color="secondary">
          {studentSubtitle(courseTitle, data.joinedAt)}
        </Text>
        <View style={[st.badge, { backgroundColor: toneBg(colors, badge.tone) }]}>
          <Text variant="caption" style={[st.bold, { color: toneFg(colors, badge.tone) }]}>
            {badge.label}
          </Text>
        </View>
      </View>
    </View>
  );
}

function InsightCard({ colors, data }: { colors: Colors; data: StudentDetailData }) {
  const insight = studentInsight(data);
  const Icon =
    insight.tone === 'warning' ? AlertTriangle : insight.tone === 'success' ? CheckCircle2 : Info;
  return (
    <View
      style={[st.card, st.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Icon size={iconSize.m} color={toneFg(colors, insight.tone)} />
      <View style={st.flex}>
        <Text variant="body" style={st.bold}>
          {insight.title}
        </Text>
        <Text variant="bodySmall" color="secondary">
          {insight.text}
        </Text>
      </View>
    </View>
  );
}

/** Календарь 4 недели: 4 ступени alpha(primary), до вступления — пунктир */
function Calendar({
  colors,
  cells,
  joinedAt,
}: {
  colors: Colors;
  cells: CalendarCell[];
  joinedAt: string | null;
}) {
  const fill = (level: CalendarCell['level']) =>
    level <= 0
      ? colors.surfaceMuted
      : level === 1
        ? alpha(colors.primary, 20)
        : level === 2
          ? alpha(colors.primary, 40)
          : colors.primaryFill;
  const first = cells[0] ? new Date(`${cells[0].date}T12:00:00`) : null;
  const joined = joinedAt ? new Date(joinedAt) : null;
  const joinedShown = !!joined && cells.some((c) => c.level === -1);
  return (
    <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={st.spread}>
        <Text variant="body" style={st.bold}>
          Занятия за 4 недели
        </Text>
        <Text variant="bodySmall" color="secondary">
          {calendarSummary(cells)}
        </Text>
      </View>
      <View style={st.grid} accessibilityLabel={`Занятия за 4 недели: ${calendarSummary(cells)}`}>
        {cells.map((c) => (
          <View key={c.date} style={st.cellWrap}>
            <View
              style={[
                st.cell,
                c.level === -1
                  ? { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border }
                  : { backgroundColor: fill(c.level) },
              ]}
            />
          </View>
        ))}
      </View>
      <View style={st.spread}>
        <Text variant="caption" color="secondary">
          {first ? shortDate(first) : ''}
        </Text>
        {joinedShown && joined ? (
          <Text variant="caption" color="secondary">{`вступил ${shortDate(joined)}`}</Text>
        ) : null}
        <Text variant="caption" color="secondary">
          сегодня
        </Text>
      </View>
    </View>
  );
}

function Row({ colors, row, divider }: { colors: Colors; row: UnitRow; divider: boolean }) {
  return (
    <View
      style={[
        st.listRow,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
      ]}
    >
      <View style={st.flex}>
        <Text variant="body" numberOfLines={1}>
          {row.title}
        </Text>
        <Text variant="caption" color="secondary" numberOfLines={1}>
          {row.sub}
        </Text>
      </View>
      <View style={[st.badge, st.badgeRight, { backgroundColor: toneBg(colors, row.tone) }]}>
        <Text variant="caption" style={[st.bold, { color: toneFg(colors, row.tone) }]}>
          {row.badge}
        </Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.m },
  content: { padding: spacing.m, gap: spacing.l },
  flex: { flex: 1, minWidth: 0 },
  bold: { fontWeight: '600' },
  section: { gap: spacing.s },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.m },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    alignSelf: 'flex-start',
    marginTop: spacing.xxs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.s,
  },
  badgeRight: { alignSelf: 'center', marginTop: 0 },
  card: {
    padding: spacing.m,
    gap: spacing.s,
    borderRadius: borderRadius.l,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: { flexDirection: 'row' },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  figures: { flexDirection: 'row', gap: spacing.xs },
  figure: {
    flex: 1,
    padding: spacing.s,
    gap: spacing.xxs,
    borderRadius: borderRadius.l,
    borderWidth: StyleSheet.hairlineWidth,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 },
  cellWrap: { width: `${100 / 7}%`, padding: 3 },
  cell: { height: 32, borderRadius: borderRadius.s },
  list: { borderRadius: borderRadius.l, borderWidth: StyleSheet.hairlineWidth },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
  },
  buttons: { gap: spacing.xs },
});
