/**
 * Карточка ученика в итогах экзамена (plan/new/live_exam.md, LiveExam 19, 22; макет «5»).
 * Балл (можно изменить с комментарием), подготовка к экзамену против класса, выходы из
 * приложения, ответы с вердиктами и «Засчитать» (у всех с таким же ответом).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text } from '@/components/common';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Screen,
  ScreenHeader,
  SkeletonCard,
  toast,
} from '@/components/ui';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, heights, typography } from '@/constants';
import type { RootStackParamList } from '@/types/navigation';
import { ExamApi, type ExamStudentCard, type ReviewItem } from '@/services/exam';
import { FORMAT_LABELS } from './exam/examConfig';

type Props = NativeStackScreenProps<RootStackParamList, 'ExamStudent'>;

const VERDICT_LABEL: Record<string, string> = {
  wrong: 'ошибка',
  typo: 'опечатка',
  wrong_form: 'не та форма',
  none: 'без ответа',
};

export function ExamStudentScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const { sessionId, participantId } = route.params;
  const [data, setData] = useState<ExamStudentCard | null>(null);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [scoreText, setScoreText] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await ExamApi.student(sessionId, participantId);
    if (!res.ok) setError(true);
    else {
      setError(false);
      setData(res.data);
    }
  }, [sessionId, participantId]);
  useEffect(() => {
    load();
  }, [load]);

  const startEdit = () => {
    if (!data) return;
    setScoreText(String(data.score ?? ''));
    setComment(data.comment || '');
    setEditing(true);
  };

  const save = async (reset = false) => {
    const n = reset ? null : Number(scoreText.replace(',', '.'));
    if (!reset && (!Number.isFinite(n) || (n as number) < 0 || (n as number) > 100)) {
      toast.error('Балл — число от 0 до 100');
      return;
    }
    setSaving(true);
    try {
      const res = await ExamApi.override(
        sessionId,
        participantId,
        reset ? null : Math.round(n as number),
        reset ? undefined : comment.trim() || undefined
      );
      if (!res.ok) {
        toast.error('Не удалось сохранить балл.');
        return;
      }
      setEditing(false);
      toast.success(reset ? 'Вернули посчитанный балл' : 'Балл сохранён');
      load();
    } finally {
      setSaving(false);
    }
  };

  const accept = async (it: ReviewItem) => {
    if (!it.given) return;
    setAccepting(it.itemId);
    try {
      const res = await ExamApi.decide(sessionId, it.itemId, 'accept', it.given);
      if (res.ok) {
        toast.success(`«${it.given}» засчитан — у всех, кто ответил так же`);
        load();
      } else toast.error('Не удалось засчитать.');
    } finally {
      setAccepting(null);
    }
  };

  const header = <ScreenHeader title={data?.name || 'Ученик'} onBack={() => navigation.goBack()} />;
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

  const score = data.score ?? 0;
  const scoreColor =
    score >= 75 ? colors.successText : score >= 50 ? colors.textPrimary : colors.errorText;
  const items = data.items || [];
  const mistakes = items.filter((i) => !i.voided && i.verdict !== 'correct');
  const prep = data.preparation;
  const lowPrep = prep.reviews < prep.classReviews / 3;

  return (
    <Screen header={header} contentStyle={styles.content} keyboard>
      <Card style={styles.section}>
        <View style={styles.scoreRow}>
          <Text variant="display" style={{ color: scoreColor }}>
            {score}
          </Text>
          <Text variant="h3" style={{ color: colors.textSecondary }}>
            / 100
          </Text>
          {data.override !== null ? <Badge label="балл изменён учителем" tone="info" /> : null}
        </View>
        <View style={styles.counts}>
          {Object.entries(data.counts || {}).map(([k, v]) =>
            v ? (
              <View key={k} style={[styles.countCell, { backgroundColor: colors.surfaceMuted }]}>
                <Text variant="label">{v}</Text>
                <Text variant="caption" style={{ color: colors.textSecondary }}>
                  {k === 'correct' ? 'верно' : VERDICT_LABEL[k]}
                </Text>
              </View>
            ) : null
          )}
        </View>
        {data.comment && !editing ? (
          <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
            Комментарий: {data.comment}
          </Text>
        ) : null}
        {editing ? (
          <View style={styles.section}>
            <TextInput
              value={scoreText}
              onChangeText={setScoreText}
              keyboardType="number-pad"
              maxLength={3}
              accessibilityLabel="Новый балл от 0 до 100"
              placeholder="Балл 0–100"
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
            />
            <TextInput
              value={comment}
              onChangeText={setComment}
              maxLength={500}
              multiline
              accessibilityLabel="Комментарий для ученика"
              placeholder="Комментарий — ученик его увидит"
              placeholderTextColor={colors.textTertiary}
              style={[
                styles.input,
                styles.multiline,
                { borderColor: colors.border, color: colors.textPrimary },
              ]}
            />
            <View style={styles.actions}>
              <Button title="Сохранить" size="s" loading={saving} onPress={() => save(false)} />
              {data.override !== null ? (
                <Button
                  title="Вернуть посчитанный"
                  variant="secondary"
                  size="s"
                  onPress={() => save(true)}
                />
              ) : null}
              <Button title="Отмена" variant="quiet" size="s" onPress={() => setEditing(false)} />
            </View>
          </View>
        ) : (
          <Button
            title="Изменить балл"
            variant="secondary"
            size="s"
            onPress={startEdit}
            style={styles.selfStart}
          />
        )}
      </Card>

      <Card style={styles.section}>
        <Text variant="overline" style={{ color: colors.textSecondary }}>
          Подготовка · {prep.days} дней до экзамена
        </Text>
        <View style={styles.prepRow}>
          <View style={styles.flex}>
            <Text variant="h3" style={{ color: lowPrep ? colors.errorText : colors.textPrimary }}>
              {prep.reviews} повт. · {prep.reviewDays} дн.
            </Text>
            <Text variant="caption" style={{ color: colors.textSecondary }}>
              у ученика
            </Text>
          </View>
          <View style={styles.flex}>
            <Text variant="h3">
              {prep.classReviews} повт. · {prep.classReviewDays} дн.
            </Text>
            <Text variant="caption" style={{ color: colors.textSecondary }}>
              в среднем по классу
            </Text>
          </View>
        </View>
        <Text variant="caption" style={{ color: colors.textSecondary }}>
          Повторения слов этого экзамена. Ученик знает, что учитель это видит.
        </Text>
      </Card>

      {data.leftReason || data.awayCount > 0 ? (
        <Card style={styles.section}>
          <Text variant="overline" style={{ color: colors.textSecondary }}>
            Выход из приложения
          </Text>
          <Text variant="bodySmall">
            {data.leftReason
              ? 'Экзамен завершился: ученик вышел из приложения.'
              : `Выходил ${data.awayCount} раз, возвращался вовремя.`}
          </Text>
        </Card>
      ) : null}

      <View style={styles.section}>
        <Text variant="h3" accessibilityRole="header">
          {mistakes.length ? `Ошибки · ${mistakes.length}` : 'Ошибок нет'}
        </Text>
        {mistakes.map((it) => (
          <Card key={it.itemId} padding="s" style={styles.row}>
            <View style={styles.rowTop}>
              <Text variant="caption" style={[styles.flex, { color: colors.textSecondary }]}>
                {FORMAT_LABELS[it.format]}
              </Text>
              <Badge
                label={VERDICT_LABEL[it.verdict] || it.verdict}
                tone={it.verdict === 'wrong' ? 'error' : 'warning'}
              />
            </View>
            <Text variant="label">{it.prompt}</Text>
            {it.given ? (
              <Text variant="bodySmall" style={{ color: colors.errorText }}>
                Ответ: {it.given}
              </Text>
            ) : null}
            <Text variant="bodySmall" style={{ color: colors.successText }}>
              Верно: {it.answer}
            </Text>
            {it.given && it.verdict !== 'none' ? (
              <Button
                title="Засчитать +балл"
                variant="quiet"
                size="s"
                loading={accepting === it.itemId}
                onPress={() => accept(it)}
                style={styles.selfStart}
              />
            ) : null}
          </Card>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.xs, gap: spacing.m },
  section: { gap: spacing.s },
  flex: { flex: 1 },
  selfStart: { alignSelf: 'flex-start' },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, flexWrap: 'wrap' },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  countCell: {
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.m,
  },
  input: {
    minHeight: heights.input,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    paddingHorizontal: spacing.s,
    fontSize: typography.body.fontSize,
  },
  multiline: { minHeight: 80, paddingTop: spacing.s, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  prepRow: { flexDirection: 'row', gap: spacing.s },
  row: { gap: spacing.xxs },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
