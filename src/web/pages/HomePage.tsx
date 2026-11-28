/**
 * «Обзор» (plan/new/web_cabinet.md, Web 6): что идёт сейчас, кому нужна помощь, ближайшие занятия, курсы.
 * Данные — те же, что на главной учителя в телефоне; ничего придуманного.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GraduationCap, Plus, Radio } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { borderRadius, spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Controls';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/components/ui/Toast';
import { getNextLesson } from '@/utils/nextLesson';
import { formatScheduleLabel } from '@/screens/teacherCourseStats/courseOverview';
import { navigate } from '../router';
import { useCourses } from '../data/CoursesContext';
import { TeacherData, type WebCourse } from '../data/teacher';
import { useLoad } from '../useLoad';
import {
  courseSummary,
  lastActivityLabel,
  needsHelp,
  studentsCountLabel,
  type Member,
} from '../teacherLogic';
import { Centered, ErrorPage, LoadingPage } from '../ui/states';
import { Avatar, PageHeader, SectionLabel, toneColor } from '../ui/kit';
import { NewCourseDialog } from '../courses/CourseDialogs';
import type { ScheduleItem } from '@/utils/nextLesson';

type CourseOverview = { course: WebCourse; members: Member[] | null; schedule: ScheduleItem[] };

/** Участники и расписание каждого курса; ошибка одного курса не ломает остальные */
async function loadOverviews(courses: WebCourse[]): Promise<CourseOverview[]> {
  return Promise.all(
    courses.map(async (course) => {
      const [members, schedule] = await Promise.allSettled([
        TeacherData.members(course.id),
        TeacherData.schedule(course.id),
      ]);
      return {
        course,
        members: members.status === 'fulfilled' ? members.value : null,
        schedule: schedule.status === 'fulfilled' ? schedule.value : [],
      };
    })
  );
}

export function HomePage() {
  const { courses, coursesError, reloadCourses, activeTests } = useCourses();
  const colors = useThemeColors();
  const [creating, setCreating] = useState(false);

  const overviews = useLoad(
    () => loadOverviews(courses ?? []),
    [courses?.map((c) => c.id).join(',')],
    { skip: !courses || courses.length === 0 }
  );

  const header = (
    <PageHeader
      title="Обзор"
      actions={
        courses && courses.length > 0 ? (
          <Button title="Новый курс" icon={Plus} size="s" onPress={() => setCreating(true)} />
        ) : null
      }
    />
  );

  const dialog = (
    <NewCourseDialog
      visible={creating}
      onClose={() => setCreating(false)}
      onCreated={(course) => {
        setCreating(false);
        reloadCourses();
        toast.success('Курс создан');
        navigate(`/courses/${course.id}`);
      }}
    />
  );

  if (!courses) {
    return (
      <View>
        {header}
        {coursesError ? (
          <ErrorPage error={coursesError} onRetry={reloadCourses} />
        ) : (
          <LoadingPage />
        )}
      </View>
    );
  }

  if (courses.length === 0) {
    return (
      <View>
        {header}
        <Centered>
          <EmptyState
            icon={GraduationCap}
            title="Пока нет ни одного курса"
            description="Создай курс и пригласи учеников по коду. Дальше всё — задания, тесты и экзамены — идёт внутри курса."
            action={{ label: 'Создать курс', onPress: () => setCreating(true) }}
          />
        </Centered>
        {dialog}
      </View>
    );
  }

  const items = overviews.data;
  const now = new Date();

  const help = (items ?? []).flatMap((o) =>
    needsHelp(o.members ?? [], now, 6).map((m) => ({ member: m, course: o.course }))
  );
  // Общий список: самые давние первыми — порядок внутри курса уже такой, поэтому просто обрезаем
  const helpTop = help.slice(0, 6);

  const lessons = (items ?? [])
    .map((o) => ({ course: o.course, next: getNextLesson(o.schedule, now) }))
    .filter(
      (l): l is { course: WebCourse; next: NonNullable<ReturnType<typeof getNextLesson>> } =>
        !!l.next
    )
    .sort((a, b) => a.next.date.getTime() - b.next.date.getTime())
    .slice(0, 4);

  return (
    <View>
      {header}

      {activeTests.length > 0 ? (
        <View style={styles.section}>
          {activeTests.map((t) => (
            <Card key={t.sessionId} tone="selected">
              <View style={styles.rowCenter}>
                <Radio size={24} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text variant="label">
                    {t.status === 'waiting' ? 'Тест ждёт учеников' : 'Идёт тест'}
                    {t.courseTitle ? ` · ${t.courseTitle}` : ''}
                  </Text>
                  <Text variant="bodySmall" color="secondary">
                    {[t.setTitle, `код ${t.code}`, `${t.participantCount} в тесте`]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <Badge label={t.status === 'waiting' ? 'Ожидание' : 'Идёт'} tone="primary" />
                <Button
                  variant="secondary"
                  size="s"
                  title="Вернуться"
                  onPress={() =>
                    navigate(t.engine === 2 ? `/exams/${t.sessionId}` : `/tests/${t.sessionId}`)
                  }
                />
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      <View style={[styles.columns, styles.section]}>
        <View style={styles.column}>
          <SectionLabel>Кому нужна помощь</SectionLabel>
          <Card padding="none">
            {items === null ? (
              <Text variant="bodySmall" color="secondary" style={styles.pad}>
                Загружаем…
              </Text>
            ) : helpTop.length === 0 ? (
              <Text variant="body" color="secondary" style={styles.pad}>
                Все ученики занимались в последние дни.
              </Text>
            ) : (
              helpTop.map(({ member, course }, i) => (
                <HelpRow
                  key={`${course.id}-${member.id}`}
                  member={member}
                  course={course}
                  first={i === 0}
                />
              ))
            )}
          </Card>
        </View>
        <View style={styles.column}>
          <SectionLabel>Ближайшие занятия</SectionLabel>
          <Card padding="none">
            {items === null ? (
              <Text variant="bodySmall" color="secondary" style={styles.pad}>
                Загружаем…
              </Text>
            ) : lessons.length === 0 ? (
              <Text variant="body" color="secondary" style={styles.pad}>
                Расписание не задано. Его можно указать в приложении Flashly.
              </Text>
            ) : (
              lessons.map((l, i) => (
                <LessonRow
                  key={l.course.id}
                  course={l.course}
                  label={l.next.label}
                  first={i === 0}
                />
              ))
            )}
          </Card>
        </View>
      </View>

      <View style={styles.section}>
        <SectionLabel>Курсы</SectionLabel>
        <View style={styles.grid}>
          {courses.map((course) => {
            const o = items?.find((x) => x.course.id === course.id);
            return <CourseCard key={course.id} course={course} overview={o ?? null} now={now} />;
          })}
        </View>
      </View>
      {dialog}
    </View>
  );
}

function RowShell({
  onPress,
  first,
  children,
  label,
}: {
  onPress: () => void;
  first: boolean;
  children: React.ReactNode;
  label: string;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      style={(state) => [
        styles.row,
        !first && { borderTopWidth: 1, borderTopColor: colors.border },
        (state as { hovered?: boolean }).hovered && { backgroundColor: colors.surfaceMuted },
      ]}
    >
      {children}
    </Pressable>
  );
}

function HelpRow({ member, course, first }: { member: Member; course: WebCourse; first: boolean }) {
  const colors = useThemeColors();
  const last = lastActivityLabel(member.lastActiveDate);
  return (
    <RowShell
      first={first}
      label={`${member.displayName}, ${last.text}`}
      onPress={() => navigate(`/courses/${course.id}/students/${member.id}`)}
    >
      <Avatar name={member.displayName} size={36} />
      <View style={{ flex: 1 }}>
        <Text variant="body" numberOfLines={1}>
          {member.displayName}
        </Text>
        <Text variant="caption" color="secondary" numberOfLines={1}>
          {course.title}
        </Text>
      </View>
      <Text variant="bodySmall" style={{ color: toneColor(last.tone, colors) }}>
        {last.text}
      </Text>
    </RowShell>
  );
}

function LessonRow({ course, label, first }: { course: WebCourse; label: string; first: boolean }) {
  return (
    <RowShell
      first={first}
      label={`${course.title}, ${label}`}
      onPress={() => navigate(`/courses/${course.id}`)}
    >
      <View style={{ flex: 1 }}>
        <Text variant="body" numberOfLines={1}>
          {course.title}
        </Text>
      </View>
      <Text variant="bodySmall" color="secondary">
        {label}
      </Text>
    </RowShell>
  );
}

function CourseCard({
  course,
  overview,
  now,
}: {
  course: WebCourse;
  overview: CourseOverview | null;
  now: Date;
}) {
  const members = overview?.members ?? null;
  const summary = members ? courseSummary(members, now) : null;
  const schedule = overview ? formatScheduleLabel(overview.schedule) : null;
  return (
    <View style={styles.gridItem}>
      <Card
        onPress={() => navigate(`/courses/${course.id}`)}
        accessibilityLabel={`Курс ${course.title}`}
      >
        <View style={{ gap: spacing.xs }}>
          <Text variant="h3" numberOfLines={2}>
            {course.title}
          </Text>
          <Text variant="bodySmall" color="secondary">
            {summary
              ? summary.total === 0
                ? 'Пока никто не подключился'
                : `${studentsCountLabel(summary.total)} · сегодня занимались ${summary.activeToday}`
              : overview && !members
                ? 'Не удалось загрузить учеников'
                : 'Загружаем…'}
          </Text>
          {schedule ? (
            <Text variant="bodySmall" color="secondary">
              {schedule}
            </Text>
          ) : null}
          {summary && summary.away > 0 ? (
            <View style={{ flexDirection: 'row' }}>
              <Badge label={`Не заходят: ${summary.away}`} tone="warning" />
            </View>
          ) : null}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.s, marginBottom: spacing.l },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  columns: { flexDirection: 'row', gap: spacing.l, alignItems: 'flex-start' },
  column: { flex: 1, gap: spacing.s },
  pad: { padding: spacing.m },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.m,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.m },
  gridItem: { flexBasis: 320, flexGrow: 1, maxWidth: 480, borderRadius: borderRadius.l },
});
