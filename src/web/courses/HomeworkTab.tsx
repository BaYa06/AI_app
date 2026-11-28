/**
 * Вкладка «Задания» курса: идут сейчас, прошедшие, отменённые и «Новое задание».
 * Группы и подписи — те же правила, что у телефона (components/teacher/teacherHomework.ts).
 */
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ban, ChevronRight, ClipboardCheck, ClipboardList, Plus } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Controls';
import { EmptyState } from '@/components/ui/EmptyState';
import type { TeacherHomeworkSummary } from '@/services/homework';
import { dueRelative } from '@/services/homework';
import { historyRowSubtitle, homeworkHistory } from '@/components/teacher/teacherHomework';
import { navigate } from '../router';
import { HomeworkData } from '../data/homework';
import { useLoad } from '../useLoad';
import { SectionLabel } from '../ui/kit';
import { Centered, ErrorPage, LoadingPage } from '../ui/states';
import { useShowMore } from '../ui/useShowMore';

export function HomeworkTab({ courseId }: { courseId: string }) {
  const list = useLoad(() => HomeworkData.list(courseId), [courseId]);
  const groups = useMemo(() => (list.data ? homeworkHistory(list.data) : null), [list.data]);

  if (list.error && !list.data) return <ErrorPage error={list.error} onRetry={list.reload} />;
  if (!list.data || !groups) return <LoadingPage />;

  const create = () => navigate(`/courses/${courseId}/homework/new`);

  return (
    <View style={{ gap: spacing.l }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Button size="s" icon={Plus} title="Новое задание" onPress={create} />
      </View>
      {list.data.length === 0 ? (
        <Centered>
          <EmptyState
            icon={ClipboardList}
            title="Заданий пока нет"
            description="Выбери слова из наборов курса и срок — ученики увидят задание в приложении Flashly и получат напоминание."
          />
        </Centered>
      ) : (
        <>
          <Group title="Идут сейчас" items={groups.current} courseId={courseId} live />
          <Group title="Прошедшие" items={groups.past} courseId={courseId} />
          <Group title="Отменённые" items={groups.canceled} courseId={courseId} canceled />
        </>
      )}
    </View>
  );
}

function Group({
  title,
  items,
  courseId,
  live,
  canceled,
}: {
  title: string;
  items: TeacherHomeworkSummary[];
  courseId: string;
  live?: boolean;
  canceled?: boolean;
}) {
  const more = useShowMore(items.length);
  if (items.length === 0) return null;
  return (
    <View style={{ gap: spacing.s }}>
      <SectionLabel>{title}</SectionLabel>
      <Card padding="none">
        {items.slice(0, more.shown).map((h, i) => (
          <Row
            key={h.id}
            item={h}
            courseId={courseId}
            first={i === 0}
            live={live}
            canceled={canceled}
          />
        ))}
      </Card>
      {more.hasMore ? (
        <Button
          variant="quiet"
          size="s"
          title={`Показать ещё ${more.next}`}
          onPress={more.showMore}
        />
      ) : null}
    </View>
  );
}

function Row({
  item,
  courseId,
  first,
  live,
  canceled,
}: {
  item: TeacherHomeworkSummary;
  courseId: string;
  first: boolean;
  live?: boolean;
  canceled?: boolean;
}) {
  const colors = useThemeColors();
  const Icon = canceled ? Ban : ClipboardCheck;
  const done = Math.min(item.submitted, item.assigned);
  const rel = dueRelative(item.dueAt);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${item.title}. ${historyRowSubtitle(item)}`}
      onPress={() => navigate(`/courses/${courseId}/homework/${item.id}`)}
      style={(state) => [
        styles.row,
        !first && { borderTopWidth: 1, borderTopColor: colors.border },
        (state as { hovered?: boolean }).hovered && { backgroundColor: colors.surfaceMuted },
      ]}
    >
      <Icon size={20} color={canceled ? colors.textTertiary : colors.homeworkText} />
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text variant="body" numberOfLines={1}>
          {item.title}
        </Text>
        <Text variant="caption" color="secondary" numberOfLines={1}>
          {historyRowSubtitle(item)}
        </Text>
      </View>
      {live ? (
        <Badge
          label={
            item.assigned > 0 && done >= item.assigned
              ? 'Сдали все'
              : rel === 'просрочено'
                ? 'Срок прошёл'
                : `Срок ${rel}`
          }
          tone={
            item.assigned > 0 && done >= item.assigned
              ? 'success'
              : rel === 'просрочено'
                ? 'warning'
                : 'primary'
          }
        />
      ) : null}
      <ChevronRight size={16} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
  },
});
