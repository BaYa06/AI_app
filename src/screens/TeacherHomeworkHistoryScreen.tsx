/**
 * История заданий курса (plan/done/teacher_cabinet.md, Teacher 57): идут сейчас, прошедшие,
 * отменённые. Нажатие → экран сдачи задания (отменённое — только просмотр и «Оценки в Excel»).
 * Правила групп и подписей — components/teacher/teacherHomework.ts.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ban, ClipboardCheck, ClipboardList } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import {
  EmptyState,
  ErrorState,
  ListGroup,
  ListRow,
  ScreenHeader,
  SkeletonList,
} from '@/components/ui';
import { spacing } from '@/constants';
import { NeonService } from '@/services/NeonService';
import type { TeacherHomeworkSummary } from '@/services/homework';
import type { RootStackParamList } from '@/types/navigation';
import { historyRowSubtitle, homeworkHistory } from '@/components/teacher/teacherHomework';

type Props = NativeStackScreenProps<RootStackParamList, 'TeacherHomeworkHistory'>;

export function TeacherHomeworkHistoryScreen({ navigation, route }: Props) {
  const { courseId, courseTitle } = route.params;
  const colors = useThemeColors();
  const [list, setList] = useState<TeacherHomeworkSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await NeonService.loadCourseHomework(courseId, { history: true });
    if (res) {
      setList(res);
      setFailed(false);
    } else {
      setFailed(true);
    }
  }, [courseId]);

  // Вернулись с экрана задания после отмены или переноса — список свежий
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const groups = useMemo(() => (list ? homeworkHistory(list) : null), [list]);

  const open = (h: TeacherHomeworkSummary) =>
    navigation.navigate('TeacherHomework', { homeworkId: h.id, courseId, courseTitle });

  const section = (title: string, items: TeacherHomeworkSummary[], canceled = false) =>
    items.length === 0 ? null : (
      <ListGroup title={title}>
        {items.map((h) => (
          <ListRow
            key={h.id}
            title={h.title}
            subtitle={historyRowSubtitle(h)}
            icon={canceled ? Ban : ClipboardCheck}
            iconColor={canceled ? colors.textTertiary : colors.homeworkText}
            onPress={() => open(h)}
          />
        ))}
      </ListGroup>
    );

  return (
    <View style={[st.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        onBack={() => navigation.goBack()}
        center={
          <View>
            <Text variant="h3" numberOfLines={1}>
              История заданий
            </Text>
            {courseTitle ? (
              <Text variant="caption" color="secondary" numberOfLines={1}>
                {courseTitle}
              </Text>
            ) : null}
          </View>
        }
      />
      {!groups ? (
        failed ? (
          <ErrorState title="Не получилось загрузить задания" onRetry={load} />
        ) : (
          <View style={st.content}>
            <SkeletonList />
          </View>
        )
      ) : list!.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Заданий пока нет"
          description="Задай первое задание на странице курса, и оно появится здесь"
        />
      ) : (
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
          {section('Идут сейчас', groups.current)}
          {section('Прошедшие', groups.past)}
          {section('Отменённые', groups.canceled, true)}
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.m, gap: spacing.l, paddingBottom: spacing.xl },
});
