/**
 * Карточка ученика (plan/new/web_cabinet.md, Web 9): вывод, цифры, юниты, календарь за 4 недели, тесты;
 * листание «предыдущий / следующий» по списку курса. Правила и тексты — те же, что в телефоне
 * (screens/studentDetail/studentInsight.ts).
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BellRing, ChevronLeft, ChevronRight, UserMinus } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeTone } from '@/components/ui/Controls';
import { Card } from '@/components/ui/Card';
import { toast } from '@/components/ui/Toast';
import {
  calendarCells,
  calendarSummary,
  longDate,
  remindTitle,
  studentBadge,
  studentFigures,
  studentInsight,
  testsRow,
  unitRows,
  dayKey,
  type Tone,
} from '@/screens/studentDetail/studentInsight';
import { describeApiError } from '../api';
import { navigate } from '../router';
import { useCourses } from '../data/CoursesContext';
import { TeacherData } from '../data/teacher';
import { useLoad } from '../useLoad';
import { sortMembers } from '../teacherLogic';
import { ConfirmDialog } from '../ui/dialogs';
import { ErrorPage, LoadingPage, NotFoundPage } from '../ui/states';
import { Avatar, PageHeader, SectionLabel, StatTile } from '../ui/kit';

const toBadge = (tone: Tone): BadgeTone =>
  tone === 'success' ? 'success' : tone === 'warning' ? 'warning' : 'neutral';

export function StudentPage({ courseId, studentId }: { courseId: string; studentId: string }) {
  const colors = useThemeColors();
  const { courses } = useCourses();
  const members = useLoad(() => TeacherData.members(courseId), [courseId]);
  const stats = useLoad(() => TeacherData.studentStats(courseId, studentId), [courseId, studentId]);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reminding, setReminding] = useState(false);

  const course = courses?.find((c) => c.id === courseId);
  const order = useMemo(
    () => (members.data ? sortMembers(members.data, 'name', 'asc') : []),
    [members.data]
  );
  const index = order.findIndex((m) => m.id === studentId);
  const member = index >= 0 ? order[index] : null;

  if (stats.error && !stats.data) return <ErrorPage error={stats.error} onRetry={stats.reload} />;
  if (!stats.data || !members.data || !courses) return <LoadingPage />;
  if (!course || !member) return <NotFoundPage />;

  const data = stats.data;
  const name = data.name || member.displayName;
  const badge = studentBadge(data.lastActiveDate ?? member.lastActiveDate);
  const insight = studentInsight(data);
  const figures = studentFigures(data);
  const cells = calendarCells(data.days, data.joinedAt);
  const units = unitRows(data);
  const tests = testsRow(data, course.title);

  const go = (offset: number) => {
    const next = order[index + offset];
    if (next) navigate(`/courses/${courseId}/students/${next.id}`);
  };

  const remind = async () => {
    setReminding(true);
    try {
      const r = await TeacherData.remind(courseId, studentId);
      if (r === 'rate_limited') toast.info('Этому ученику уже напоминали. Подожди немного');
      else toast.success(r.sent > 0 ? 'Напоминание отправлено' : 'У ученика выключены уведомления');
    } catch (e) {
      toast.error(describeApiError(e));
    }
    setReminding(false);
  };

  const remove = async () => {
    setBusy(true);
    try {
      await TeacherData.removeStudent(courseId, studentId);
      toast.success('Ученик убран из курса');
      navigate(`/courses/${courseId}`, { replace: true });
    } catch (e) {
      toast.error(describeApiError(e));
      setBusy(false);
    }
  };

  const insightColor =
    insight.tone === 'success'
      ? colors.successText
      : insight.tone === 'warning'
        ? colors.warningText
        : colors.textPrimary;

  return (
    <View style={{ gap: spacing.l }}>
      <PageHeader
        title={name}
        subtitle={`${course.title}${data.joinedAt ? ` · с ${longDate(dayKey(new Date(data.joinedAt)))}` : ''}`}
        back={{ label: course.title, path: `/courses/${courseId}` }}
        leading={<Avatar name={name} size={56} />}
        actions={
          <>
            <Text variant="bodySmall" color="secondary">
              {index + 1} из {order.length}
            </Text>
            <Button
              variant="icon"
              icon={ChevronLeft}
              accessibilityLabel="Предыдущий ученик"
              onPress={() => go(-1)}
              disabled={index <= 0}
            />
            <Button
              variant="icon"
              icon={ChevronRight}
              accessibilityLabel="Следующий ученик"
              onPress={() => go(1)}
              disabled={index >= order.length - 1}
            />
          </>
        }
      />

      <View style={styles.rowWrap}>
        <Badge label={badge.label} tone={toBadge(badge.tone)} />
        {data.streak > 0 ? <Badge label={`Серия ${data.streak}`} tone="neutral" /> : null}
      </View>

      <Card tone={insight.tone === 'warning' ? 'default' : 'muted'}>
        <View style={{ gap: spacing.xxs }}>
          <Text variant="h3" style={{ color: insightColor }}>
            {insight.title}
          </Text>
          <Text variant="body" color="secondary">
            {insight.text}
          </Text>
        </View>
      </Card>

      <View style={styles.rowWrap}>
        {figures.map((f) => (
          <StatTile
            key={f.label}
            value={f.value}
            label={f.label}
            tone={f.tone === 'warning' ? 'warning' : 'neutral'}
          />
        ))}
      </View>

      <View style={styles.twoCols}>
        <View style={styles.col}>
          <SectionLabel>Юниты</SectionLabel>
          <Card padding="none">
            {[...units, tests].map((u, i) => (
              <View
                key={u.key}
                style={[
                  styles.unitRow,
                  i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="body" numberOfLines={1}>
                    {u.title}
                  </Text>
                  <Text variant="caption" color="secondary" numberOfLines={1}>
                    {u.sub}
                  </Text>
                </View>
                <Badge label={u.badge} tone={toBadge(u.tone)} />
              </View>
            ))}
          </Card>
        </View>
        <View style={styles.col}>
          <SectionLabel>Занятия за 4 недели</SectionLabel>
          <Card>
            <View style={{ gap: spacing.s }}>
              <View style={styles.calendar}>
                {cells.map((c) => (
                  <View
                    key={c.date}
                    accessibilityLabel={`${c.date}: ${c.level < 0 ? 'ещё не в курсе' : c.level === 0 ? 'не занимался' : 'занимался'}`}
                    style={[
                      styles.cell,
                      c.level === -1
                        ? { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border }
                        : {
                            backgroundColor:
                              c.level === 0
                                ? colors.surfaceMuted
                                : c.level === 1
                                  ? alpha(colors.primary, 20)
                                  : c.level === 2
                                    ? alpha(colors.primary, 40)
                                    : colors.primary,
                          },
                    ]}
                  />
                ))}
              </View>
              <Text variant="bodySmall" color="secondary">
                {calendarSummary(cells)}
              </Text>
            </View>
          </Card>
        </View>
      </View>

      <View style={styles.rowWrap}>
        <Button
          variant="secondary"
          icon={BellRing}
          title={remindTitle(data)}
          onPress={remind}
          loading={reminding}
        />
        <Button
          variant="danger"
          icon={UserMinus}
          title="Убрать из курса"
          onPress={() => setRemoving(true)}
        />
      </View>

      <ConfirmDialog
        visible={removing}
        title="Убрать ученика из курса?"
        message={`${name} потеряет доступ к курсу ${course.title}. Его прогресс сохранится, если он вернётся по коду.`}
        confirmText="Убрать"
        destructive
        busy={busy}
        onConfirm={remove}
        onClose={() => setRemoving(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s, alignItems: 'center' },
  twoCols: { flexDirection: 'row', gap: spacing.l, alignItems: 'flex-start' },
  col: { flex: 1, gap: spacing.s },
  unitRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.m,
  },
  // 7 клеток в ряд: 7 × 36 + 6 × 8
  calendar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, width: 300 },
  cell: { width: 36, height: 36, borderRadius: borderRadius.s },
});
