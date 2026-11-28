/**
 * Быстрый тест: настройка (plan/new/web_cabinet.md, Web 26). Те же настройки, что в приложении:
 * набор курса, число вопросов, время на вопрос, контроль выхода. Оценки в 100 баллов и разбора вопросов
 * у быстрого теста нет — для этого экзамен.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Zap } from 'lucide-react-native';
import { spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, Switch } from '@/components/ui/Controls';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/components/ui/Toast';
import { describeTestError } from '@/utils/testApiErrors';
import { describeApiError, WebApiError } from '../api';
import { navigate } from '../router';
import { useCourses } from '../data/CoursesContext';
import { ExamData } from '../data/exam';
import { QuickData } from '../data/live';
import { useLoad } from '../useLoad';
import { rememberQuick } from '../exam/quickCache';
import {
  QUICK_TIMES,
  clampQuestions,
  quickMaxQuestions,
  quickSetupProblem,
  totalTimeText,
} from '../exam/quickLogic';
import { useSingleFlight } from '../ui/useSingleFlight';
import { useUnloadGuard } from '../ui/useUnloadGuard';
import { Centered, ErrorPage, LoadingPage, NotFoundPage } from '../ui/states';
import { PageHeader, SectionLabel, Stepper } from '../ui/kit';

export function QuickSetupPage({ courseId }: { courseId: string }) {
  const { courses } = useCourses();
  const sets = useLoad(() => ExamData.sets(courseId), [courseId]);
  const once = useSingleFlight();

  const [setId, setSetId] = useState<string | null>(null);
  const [count, setCount] = useState(20);
  const [time, setTime] = useState(20);
  const [exitControl, setExitControl] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useUnloadGuard(creating);

  useEffect(() => {
    if (sets.data && sets.data.length > 0 && setId === null) setSetId(sets.data[0].setId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sets.data]);

  const course = courses?.find((c) => c.id === courseId);
  const selected = sets.data?.find((s) => s.setId === setId);
  const cards = selected?.totalCards ?? 0;
  // Набор поменяли — число вопросов подтягиваем под его размер
  useEffect(() => {
    if (cards > 0) setCount((n) => clampQuestions(n, cards));
  }, [cards]);

  if (courses && !course) return <NotFoundPage />;
  if (sets.error && !sets.data) return <ErrorPage error={sets.error} onRetry={sets.reload} />;
  if (!sets.data || !course) return <LoadingPage />;

  const back = { label: course.title, path: `/courses/${courseId}?tab=exams` };
  if (sets.data.length === 0) {
    return (
      <View>
        <PageHeader title="Быстрый тест" back={back} />
        <Centered>
          <EmptyState
            icon={Zap}
            title="В курсе нет наборов со словами"
            description="Тест собирается из наборов курса. Добавь набор в приложении Flashly и вернись сюда."
          />
        </Centered>
      </View>
    );
  }

  const problem = quickSetupProblem({ setId, cards });
  const max = quickMaxQuestions(cards);

  const create = () =>
    once(async () => {
      if (problem || !setId) return;
      setCreating(true);
      setError(null);
      try {
        const res = await QuickData.create({
          courseId,
          setId,
          questionCount: count,
          timePerQuestion: time,
          exitControl,
        });
        rememberQuick(res.sessionId, { code: res.code, questionCount: res.questionCount ?? count });
        navigate(`/tests/${res.sessionId}`);
      } catch (e) {
        setError(
          e instanceof WebApiError && e.serverError
            ? describeTestError(e.serverError, describeApiError(e))
            : describeApiError(e)
        );
        toast.error('Не удалось создать тест');
        setCreating(false);
      }
    });

  return (
    <View style={{ maxWidth: 640 }}>
      <PageHeader title="Быстрый тест" subtitle={course.title} back={back} />
      <View style={{ gap: spacing.l }}>
        <View style={{ gap: spacing.s }}>
          <SectionLabel>Набор</SectionLabel>
          <View style={styles.chips}>
            {sets.data.map((s) => (
              <Chip
                key={s.setId}
                label={`${s.title} · ${s.totalCards}`}
                selected={setId === s.setId}
                onPress={() => setSetId(s.setId)}
              />
            ))}
          </View>
        </View>

        <Card>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text variant="label">Вопросов</Text>
              <Text variant="caption" color="secondary">
                {count} из {cards}
              </Text>
            </View>
            <Stepper
              label="Вопросов"
              value={count}
              onMinus={() => setCount((n) => clampQuestions(n - 1, cards))}
              onPlus={() => setCount((n) => clampQuestions(n + 1, cards))}
              minusDisabled={count <= 4}
              plusDisabled={count >= max}
            />
          </View>
        </Card>

        <View style={{ gap: spacing.s }}>
          <SectionLabel>Время на вопрос</SectionLabel>
          <View style={styles.chips}>
            {QUICK_TIMES.map((t) => (
              <Chip
                key={t.value}
                label={t.label}
                selected={time === t.value}
                onPress={() => setTime(t.value)}
              />
            ))}
          </View>
          <Text variant="caption" color="secondary">
            {totalTimeText(time, count)}
          </Text>
        </View>

        <Card>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text variant="label">Контроль выхода из приложения</Text>
              <Text variant="caption" color="secondary">
                Вышел дольше чем на 3 секунды — тест завершается
              </Text>
            </View>
            <Switch
              value={exitControl}
              onValueChange={setExitControl}
              accessibilityLabel="Контроль выхода"
            />
          </View>
        </Card>

        {problem ? (
          <Text variant="bodySmall" color="error" accessibilityRole="alert">
            {problem}
          </Text>
        ) : null}
        {error ? (
          <Text variant="bodySmall" color="error" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row' }}>
          <Button
            title="Создать тест"
            loading={creating}
            disabled={Boolean(problem)}
            onPress={create}
          />
        </View>
        <Text variant="caption" color="secondary">
          Быстрый тест — без оценки в 100 баллов и разбора вопросов. Для проверки знаний с оценкой
          собери экзамен.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.m },
});
