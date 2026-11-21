/**
 * «Мой результат» — разбор экзамена у ученика (plan/new/live_exam.md, LiveExam 21).
 * Балл из 100, по форматам, комментарий учителя, ошибки (с верным ответом), засчитанные
 * учителем ответы и аннулированные вопросы с пометкой.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Lock } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text } from '@/components/common';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Screen,
  ScreenHeader,
  SkeletonCard,
} from '@/components/ui';
import { useThemeColors } from '@/store';
import { spacing, borderRadius } from '@/constants';
import type { RootStackParamList } from '@/types/navigation';
import { ExamApi, type ExamFormat, type ReviewItem, type StudentReview } from '@/services/exam';

type Props = NativeStackScreenProps<RootStackParamList, 'ExamResult'>;

export const FORMAT_NAMES: Record<ExamFormat, string> = {
  choice: 'Выбор',
  write: 'Письмо',
  scramble: 'Собери слово',
  match: 'Пары',
  gap: 'Вставь слово',
};

export function ExamResultScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const { sessionId, setTitle } = route.params;
  const [data, setData] = useState<StudentReview | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    const res = await ExamApi.myOne(sessionId);
    if (!res.ok) setError(true);
    else setData(res.data);
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  const header = (
    <ScreenHeader
      title={data?.setTitle || setTitle || 'Мой результат'}
      onBack={() => navigation.goBack()}
    />
  );

  if (error) {
    return (
      <Screen header={header}>
        <ErrorState onRetry={load} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen header={header} contentStyle={styles.content}>
        <SkeletonCard height={120} />
        <SkeletonCard height={200} />
      </Screen>
    );
  }
  if (!data.released) {
    return (
      <Screen header={header}>
        <EmptyState
          icon={Lock}
          title="Результаты ещё не открыты"
          description="Учитель откроет их после проверки — придёт уведомление."
        />
      </Screen>
    );
  }

  const score = data.score ?? 0;
  const scoreColor =
    score >= 75 ? colors.successText : score >= 50 ? colors.textPrimary : colors.errorText;
  const items = data.items || [];
  const mistakes = items.filter((i) => !i.voided && i.verdict !== 'correct');
  const accepted = items.filter((i) => i.accepted);
  const voided = items.filter((i) => i.voided);

  return (
    <Screen header={header} contentStyle={styles.content}>
      <Card style={styles.scoreCard}>
        <Text variant="label" style={{ color: colors.textSecondary }}>
          Балл
        </Text>
        <View style={styles.scoreRow}>
          <Text variant="display" style={{ color: scoreColor }}>
            {score}
          </Text>
          <Text variant="h3" style={{ color: colors.textSecondary }}>
            / 100
          </Text>
        </View>
        <View style={styles.formats}>
          {Object.entries(data.byFormat || {}).map(([f, v]) =>
            v ? (
              <View key={f} style={[styles.formatCell, { backgroundColor: colors.surfaceMuted }]}>
                <Text variant="label">
                  {v.correct} / {v.total}
                </Text>
                <Text variant="caption" style={{ color: colors.textSecondary }}>
                  {FORMAT_NAMES[f as ExamFormat]}
                </Text>
              </View>
            ) : null
          )}
        </View>
      </Card>

      {data.comment ? (
        <Card tone="muted">
          <Text variant="label" style={{ color: colors.textSecondary }}>
            Комментарий учителя
          </Text>
          <Text variant="body">{data.comment}</Text>
        </Card>
      ) : null}

      <View style={styles.section}>
        <Text variant="h3" accessibilityRole="header">
          {mistakes.length ? `Ошибки · ${mistakes.length}` : 'Ошибок нет'}
        </Text>
        {mistakes.map((it) => (
          <ReviewRow key={it.itemId} item={it} />
        ))}
      </View>

      {accepted.length ? (
        <View style={styles.section}>
          <Text variant="h3" accessibilityRole="header">
            Засчитано учителем · {accepted.length}
          </Text>
          {accepted.map((it) => (
            <ReviewRow key={it.itemId} item={it} />
          ))}
        </View>
      ) : null}

      <Text variant="caption" style={{ color: colors.textSecondary }}>
        Учитель видит, сколько ты повторял слова экзамена в последние две недели.
      </Text>

      {voided.length ? (
        <View style={styles.section}>
          <Text variant="h3" accessibilityRole="header">
            Не считаются · {voided.length}
          </Text>
          {voided.map((it) => (
            <ReviewRow key={it.itemId} item={it} />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function ReviewRow({ item }: { item: ReviewItem }) {
  const colors = useThemeColors();
  const badge = item.voided
    ? { label: 'вопрос аннулирован учителем', tone: 'neutral' as const }
    : item.accepted
      ? { label: 'ответ засчитан учителем', tone: 'success' as const }
      : item.verdict === 'typo'
        ? { label: 'опечатка', tone: 'warning' as const }
        : item.verdict === 'wrong_form'
          ? { label: 'не та форма слова', tone: 'warning' as const }
          : item.verdict === 'none'
            ? { label: 'без ответа', tone: 'neutral' as const }
            : null;
  return (
    <Card padding="s" style={styles.row}>
      <Text variant="caption" style={{ color: colors.textSecondary }}>
        {FORMAT_NAMES[item.format]}
      </Text>
      <Text variant="label">{item.prompt}</Text>
      {item.given ? (
        <Text
          variant="bodySmall"
          style={{ color: item.accepted ? colors.successText : colors.errorText }}
        >
          Твой ответ: {item.given}
        </Text>
      ) : null}
      <Text variant="bodySmall" style={{ color: colors.successText }}>
        Верно: {item.answer}
      </Text>
      {badge ? <Badge label={badge.label} tone={badge.tone} style={styles.badge} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.m, gap: spacing.l },
  scoreCard: { gap: spacing.xs },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xxs },
  formats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  formatCell: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.s,
    borderRadius: borderRadius.m,
  },
  section: { gap: spacing.s },
  row: { gap: spacing.xxs },
  badge: { alignSelf: 'flex-start', marginTop: spacing.xxs },
});
