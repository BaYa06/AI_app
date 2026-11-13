/**
 * Экран сдачи задания учителя (plan/new/teacher_cabinet.md, Teacher 21; макет 12).
 * Кольцо «сдали / в процессе / не начали», срок, список учеников со статусами и оценкой,
 * «закреплено» (через 7 дней), «Напомнить N». Нажатие на ученика → StudentDetail.
 * Правила — teacherHomework/homeworkStatus.ts.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Clock, Download, Send } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button, ScreenHeader, toast } from '@/components/ui';
import { alpha, borderRadius, spacing } from '@/constants';
import { NeonService } from '@/services/NeonService';
import { Analytics } from '@/services/analytics';
import { dueRelative, formatDue, type HomeworkStatusData } from '@/services/homework';
import type { RootStackParamList } from '@/types/navigation';
import { useCourseTitle } from '@/components/teacher/useCourseTitle';
import { formatLastActivity, getInitials } from './teacherStudents/helpers';
import {
  fixedText,
  homeworkCounts,
  homeworkHeaderSubtitle,
  homeworkHeaderTitle,
  remindButtonText,
  remindableIds,
  sortHomeworkRows,
  statusLabel,
  type RowTone,
} from './teacherHomework/homeworkStatus';
import { NotSubmittedSheet } from './teacherHomework/NotSubmittedSheet';
import { exportHomeworkGrades } from './teacherHomework/exportHomework';

type Props = NativeStackScreenProps<RootStackParamList, 'TeacherHomework'>;

const RING = 96;
const STROKE = 10;

/** Кольцо из трёх дуг: сдали (success), в процессе (warning), не начали (трек) */
function StatusRing({
  submitted,
  inProgress,
  total,
}: {
  submitted: number;
  inProgress: number;
  total: number;
}) {
  const colors = useThemeColors();
  const r = (RING - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const part = (n: number) => (total > 0 ? (n / total) * c : 0);
  const done = part(submitted);
  const progress = part(inProgress);
  return (
    <View style={st.ring}>
      <Svg width={RING} height={RING} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={r}
          stroke={colors.surfaceMuted}
          strokeWidth={STROKE}
          fill="none"
        />
        {progress > 0 && (
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={r}
            stroke={colors.warning}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={`${progress} ${c}`}
            strokeDashoffset={-done}
          />
        )}
        {done > 0 && (
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={r}
            stroke={colors.success}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={`${done} ${c}`}
          />
        )}
      </Svg>
      <View style={st.ringCenter}>
        <Text variant="h3">{`${submitted}/${total}`}</Text>
        <Text variant="caption" color="secondary">
          сдали
        </Text>
      </View>
    </View>
  );
}

export function TeacherHomeworkScreen({ navigation, route }: Props) {
  const { homeworkId, courseId } = route.params;
  // По ссылке из пуша названия курса в параметрах нет — берём из списка курсов
  const courseTitle = useCourseTitle(courseId, route.params.courseTitle);
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<HomeworkStatusData | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await NeonService.loadHomeworkStatus(homeworkId);
    if (res) {
      setData(res);
      setFailed(false);
    } else {
      setFailed(true);
    }
  }, [homeworkId]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => (data ? sortHomeworkRows(data.students) : []), [data]);
  const counts = useMemo(() => homeworkCounts(data?.students ?? []), [data]);
  const toRemind = useMemo(() => remindableIds(data?.students ?? []), [data]);
  const fixed = data ? fixedText(data.students, data.homework.words) : null;

  const tone = (t: RowTone) =>
    t === 'success'
      ? { fg: colors.successText, bg: alpha(colors.success, 10) }
      : t === 'warning'
        ? { fg: colors.warningText, bg: alpha(colors.warning, 10) }
        : { fg: colors.textSecondary, bg: colors.surfaceMuted };

  // «Напомнить N» — окно «Кто не сдал» (12а): там видно, кому, и можно снять галочки
  const [remindOpen, setRemindOpen] = useState(false);

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    if (!data || exporting) return;
    setExporting(true);
    Analytics.teacherAction('homework_export', 'course');
    const ok = await exportHomeworkGrades(data, courseTitle);
    setExporting(false);
    if (!ok) toast.error('Не получилось выгрузить оценки. Проверь интернет');
  };

  const openStudent = (id: string, name: string, lastActiveDate: string | null) =>
    navigation.navigate('StudentDetail', {
      courseId,
      courseTitle,
      studentId: id,
      studentName: name,
      studentInitials: getInitials(name),
      streak: 0,
      todayCards: 0,
      lastActivity: formatLastActivity(lastActiveDate, colors).text,
    });

  return (
    <View style={[st.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScreenHeader
        onBack={() => navigation.goBack()}
        center={
          <View>
            <Text variant="h3" numberOfLines={1}>
              {data ? homeworkHeaderTitle(data) : 'Задание'}
            </Text>
            <Text variant="caption" color="secondary" numberOfLines={1}>
              {homeworkHeaderSubtitle(courseTitle, data?.homework.minScore ?? null)}
            </Text>
          </View>
        }
      />
      {!data ? (
        <View style={st.center}>
          {failed ? (
            <>
              <Text color="secondary">Не получилось загрузить задание</Text>
              <Button title="Повторить" variant="secondary" onPress={load} />
            </>
          ) : (
            <ActivityIndicator color={colors.primary} />
          )}
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={st.content}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={async () => {
                  setRefreshing(true);
                  await load();
                  setRefreshing(false);
                }}
                tintColor={colors.primary}
              />
            }
          >
            <View
              style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <StatusRing
                submitted={counts.submitted}
                inProgress={counts.inProgress}
                total={counts.total}
              />
              <View style={st.legend}>
                {[
                  { c: colors.success, t: `Сдали — ${counts.submitted}` },
                  { c: colors.warning, t: `В процессе — ${counts.inProgress}` },
                  { c: colors.textTertiary, t: `Не начали — ${counts.notStarted}` },
                ].map((l) => (
                  <View key={l.t} style={st.legendRow}>
                    <View style={[st.dot, { backgroundColor: l.c }]} />
                    <Text variant="caption">{l.t}</Text>
                  </View>
                ))}
                <View style={st.legendRow}>
                  <Clock size={14} color={colors.homeworkText} />
                  <Text variant="caption" style={{ color: colors.homeworkText, fontWeight: '600' }}>
                    {`до: ${formatDue(data.homework.dueAt)} · ${dueRelative(data.homework.dueAt)}`}
                  </Text>
                </View>
              </View>
            </View>

            {fixed ? (
              <Text variant="caption" color="secondary">
                {fixed}
              </Text>
            ) : null}

            <Text variant="h3">Ученики</Text>
            {rows.length === 0 ? (
              <Text color="secondary">В курсе пока нет учеников</Text>
            ) : (
              <View
                style={[st.list, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                {rows.map((s, i) => {
                  const label = statusLabel(s, data.homework.words, data.homework.minScore);
                  const t = tone(label.tone);
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => openStudent(s.id, s.displayName, s.lastActiveDate)}
                      accessibilityRole="button"
                      accessibilityLabel={`${s.displayName}, ${label.text}`}
                      style={({ pressed }) => [
                        st.row,
                        i < rows.length - 1 && {
                          borderBottomColor: colors.border,
                          borderBottomWidth: StyleSheet.hairlineWidth,
                        },
                        pressed && st.pressed,
                      ]}
                    >
                      <View style={[st.avatar, { backgroundColor: colors.surfaceMuted }]}>
                        <Text variant="caption" color="secondary" style={st.bold}>
                          {getInitials(s.displayName)}
                        </Text>
                      </View>
                      <Text style={st.name} numberOfLines={1}>
                        {s.displayName}
                      </Text>
                      <View style={[st.badge, { backgroundColor: t.bg }]}>
                        <Text variant="caption" style={[st.bold, { color: t.fg }]}>
                          {label.text}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>
          <View
            style={[
              st.footer,
              {
                backgroundColor: colors.surface,
                borderTopColor: colors.border,
                paddingBottom: Math.max(insets.bottom, spacing.m),
              },
            ]}
          >
            <Button
              title={toRemind.length > 0 ? remindButtonText(toRemind.length) : 'Всем уже напомнили'}
              icon={Send}
              onPress={() => setRemindOpen(true)}
              disabled={toRemind.length === 0}
              fullWidth
            />
            <Button
              title="Оценки в Excel"
              icon={Download}
              variant="secondary"
              onPress={handleExport}
              loading={exporting}
              fullWidth
            />
          </View>
        </>
      )}
      <NotSubmittedSheet
        visible={remindOpen}
        homeworkId={homeworkId}
        courseTitle={courseTitle}
        onClose={() => {
          setRemindOpen(false);
          load();
        }}
        onOpenStudent={(id, name) => {
          const row = data?.students.find((s) => s.id === id);
          openStudent(id, name, row?.lastActiveDate ?? null);
        }}
      />
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.m },
  content: { padding: spacing.m, gap: spacing.m, paddingBottom: spacing.xl },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    padding: spacing.m,
    borderRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  legend: { flex: 1, gap: spacing.xxs },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: borderRadius.full },
  list: { borderRadius: borderRadius.l, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.m,
    minHeight: 56,
  },
  pressed: { opacity: 0.85 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { flex: 1 },
  badge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.s,
  },
  bold: { fontWeight: '600' },
  footer: {
    paddingHorizontal: spacing.m,
    paddingTop: spacing.s,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
});
