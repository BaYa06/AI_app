/**
 * «Мои экзамены» ученика (plan/new/live_exam.md, LiveExam 21): балл — когда учитель открыл
 * результаты, иначе «Результаты ещё не открыты».
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { ClipboardList } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text } from '@/components/common';
import {
  EmptyState,
  ErrorState,
  ListGroup,
  ListRow,
  Screen,
  ScreenHeader,
  SkeletonList,
} from '@/components/ui';
import { useThemeColors } from '@/store';
import { spacing } from '@/constants';
import type { RootStackParamList } from '@/types/navigation';
import { ExamApi, type MyExam } from '@/services/exam';

type Props = NativeStackScreenProps<RootStackParamList, 'MyExams'>;

function shortDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  } catch {
    return '';
  }
}

export function MyExamsScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const [list, setList] = useState<MyExam[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const res = await ExamApi.my();
    if (!res.ok) setError(true);
    else {
      setError(false);
      setList(res.data);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const header = <ScreenHeader title="Мои экзамены" onBack={() => navigation.goBack()} />;
  if (error) {
    return (
      <Screen header={header}>
        <ErrorState onRetry={load} />
      </Screen>
    );
  }
  if (!list) {
    return (
      <Screen header={header}>
        <SkeletonList />
      </Screen>
    );
  }
  if (list.length === 0) {
    return (
      <Screen header={header}>
        <EmptyState
          icon={ClipboardList}
          title="Экзаменов пока нет"
          description="Здесь появятся экзамены, которые ты сдал по коду учителя."
        />
      </Screen>
    );
  }
  return (
    <Screen header={header} contentStyle={styles.content}>
      <ListGroup>
        {list.map((e) => (
          <ListRow
            key={e.sessionId}
            title={e.setTitle}
            subtitle={[e.courseTitle, shortDate(e.date)].filter(Boolean).join(' · ')}
            onPress={() =>
              navigation.navigate('ExamResult', { sessionId: e.sessionId, setTitle: e.setTitle })
            }
            right={
              <Text
                variant="label"
                style={{ color: e.released ? colors.textPrimary : colors.textSecondary }}
              >
                {e.released ? `${e.score} / 100` : 'проверяется'}
              </Text>
            }
          />
        ))}
      </ListGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.m },
});
