/**
 * Карточка ученика в экзамене (plan/new/web_cabinet.md, Web 25; макет E10): балл с правкой и комментарием,
 * подготовка к экзамену, выход из приложения, ошибки с «Засчитать ответ». Листание «предыдущий / следующий»
 * по списку итогов. «Пересдача» — на странице итогов, как в приложении.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { borderRadius, spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Controls';
import { TextField } from '@/components/ui/TextField';
import { toast } from '@/components/ui/Toast';
import { FORMAT_LABELS } from '@/screens/exam/examConfig';
import type { ReviewItem } from '@/services/exam';
import { describeApiError } from '../api';
import { navigate } from '../router';
import { ExamData } from '../data/exam';
import { useLoad } from '../useLoad';
import { ErrorPage, LoadingPage, NotFoundPage } from '../ui/states';
import { Avatar, PageHeader, SectionLabel } from '../ui/kit';
import {
  VERDICT_CHIP,
  VERDICT_LABEL,
  VERDICT_ORDER,
  lowPreparation,
  mistakes,
  parseScore,
  scoreTone,
} from '../exam/resultsLogic';

export function ExamStudentPage({
  sessionId,
  participantId,
}: {
  sessionId: string;
  participantId: string;
}) {
  const colors = useThemeColors();
  const card = useLoad(
    () => ExamData.student(sessionId, participantId),
    [sessionId, participantId]
  );
  const results = useLoad(() => ExamData.results(sessionId), [sessionId]);

  const [editing, setEditing] = useState(false);
  const [scoreText, setScoreText] = useState('');
  const [comment, setComment] = useState('');
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);

  const order = useMemo(() => results.data?.students ?? [], [results.data]);
  const index = order.findIndex((s) => s.participantId === participantId);

  if (card.error && !card.data) return <ErrorPage error={card.error} onRetry={card.reload} />;
  if (!card.data) return <LoadingPage />;
  const data = card.data;
  if (results.data && index < 0) return <NotFoundPage />;

  const score = data.score ?? 0;
  const tone = scoreTone(score);
  const scoreColor =
    tone === 'success'
      ? colors.successText
      : tone === 'error'
        ? colors.errorText
        : colors.textPrimary;
  const wrong = mistakes(data);
  const prep = data.preparation;
  const lowPrep = lowPreparation(prep);

  const go = (offset: number) => {
    const next = order[index + offset];
    if (next) navigate(`/exams/${sessionId}/students/${next.participantId}`);
  };

  const startEdit = () => {
    setScoreText(String(data.score ?? ''));
    setComment(data.comment || '');
    setScoreError(null);
    setEditing(true);
  };

  const save = async (reset = false) => {
    const n = reset ? null : parseScore(scoreText);
    if (!reset && n === null) {
      setScoreError('Балл — число от 0 до 100');
      return;
    }
    setSaving(true);
    try {
      await ExamData.override(
        sessionId,
        participantId,
        n,
        reset ? undefined : comment.trim() || undefined
      );
      setEditing(false);
      toast.success(reset ? 'Вернули посчитанный балл' : 'Балл сохранён');
      card.reload();
      results.reload();
    } catch (e) {
      setScoreError(describeApiError(e));
    }
    setSaving(false);
  };

  const accept = async (it: ReviewItem) => {
    if (!it.given) return;
    setAccepting(it.itemId);
    try {
      await ExamData.decide(sessionId, it.itemId, 'accept', it.given);
      toast.success(`«${it.given}» засчитан — у всех, кто ответил так же`);
      card.reload();
      results.reload();
    } catch (e) {
      toast.error(describeApiError(e));
    }
    setAccepting(null);
  };

  return (
    <View>
      <PageHeader
        title={data.name}
        subtitle={data.setTitle}
        back={{ label: 'Итоги экзамена', path: `/exams/${sessionId}` }}
        leading={<Avatar name={data.name} size={56} />}
        actions={
          order.length > 1 ? (
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
          ) : null
        }
      />

      <View style={styles.layout}>
        <View style={styles.main}>
          <View style={{ gap: spacing.s }}>
            <Text variant="h3" accessibilityRole="header">
              {wrong.length ? `Ошибки · ${wrong.length}` : 'Ошибок нет'}
            </Text>
            {wrong.map((it) => (
              <Card key={it.itemId}>
                <View style={{ gap: spacing.xxs }}>
                  <View style={styles.rowTop}>
                    <Text variant="caption" color="secondary" style={{ flex: 1 }}>
                      {FORMAT_LABELS[it.format]}
                    </Text>
                    <Badge
                      label={VERDICT_LABEL[it.verdict] || it.verdict}
                      tone={it.verdict === 'wrong' ? 'error' : 'warning'}
                    />
                  </View>
                  <Text variant="body">{it.prompt}</Text>
                  {it.given ? (
                    <Text variant="bodySmall" color="error">
                      Ответ: {it.given}
                    </Text>
                  ) : null}
                  <Text variant="bodySmall" color="success">
                    Верно: {it.answer}
                  </Text>
                  {it.given && it.verdict !== 'none' ? (
                    <View style={{ flexDirection: 'row' }}>
                      <Button
                        variant="quiet"
                        size="s"
                        title="Засчитать ответ"
                        loading={accepting === it.itemId}
                        onPress={() => accept(it)}
                      />
                    </View>
                  ) : null}
                </View>
              </Card>
            ))}
          </View>
        </View>

        <View style={styles.side}>
          <Card>
            <View style={{ gap: spacing.s }}>
              <View style={styles.scoreRow}>
                <Text
                  variant="display"
                  style={{ color: scoreColor }}
                  accessibilityLabel={`Балл ${score} из 100`}
                >
                  {score}
                </Text>
                <Text variant="h3" color="secondary">
                  / 100
                </Text>
              </View>
              {data.override !== null ? <Badge label="балл изменён учителем" tone="info" /> : null}
              <View style={styles.counts}>
                {VERDICT_ORDER.map((v) =>
                  data.counts?.[v] ? (
                    <View
                      key={v}
                      style={[styles.countCell, { backgroundColor: colors.surfaceMuted }]}
                    >
                      <Text variant="label">{data.counts[v]}</Text>
                      <Text variant="caption" color="secondary">
                        {VERDICT_CHIP[v]}
                      </Text>
                    </View>
                  ) : null
                )}
              </View>
              {data.comment && !editing ? (
                <Text variant="bodySmall" color="secondary">
                  Комментарий: {data.comment}
                </Text>
              ) : null}
              {editing ? (
                <View style={{ gap: spacing.s }}>
                  <TextField
                    label="Новый балл"
                    placeholder="0–100"
                    value={scoreText}
                    onChangeText={setScoreText}
                    keyboardType="number-pad"
                    maxLength={3}
                    error={scoreError}
                  />
                  <TextField
                    label="Комментарий"
                    hint="Ученик его увидит"
                    value={comment}
                    onChangeText={setComment}
                    maxLength={500}
                    multiline
                  />
                  <View style={styles.actions}>
                    <Button
                      size="s"
                      title="Сохранить"
                      loading={saving}
                      onPress={() => save(false)}
                    />
                    {data.override !== null ? (
                      <Button
                        variant="secondary"
                        size="s"
                        title="Вернуть посчитанный"
                        onPress={() => save(true)}
                        disabled={saving}
                      />
                    ) : null}
                    <Button
                      variant="quiet"
                      tone="secondary"
                      size="s"
                      title="Отмена"
                      onPress={() => setEditing(false)}
                      disabled={saving}
                    />
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: 'row' }}>
                  <Button
                    variant="secondary"
                    size="s"
                    icon={Pencil}
                    title="Изменить балл"
                    onPress={startEdit}
                  />
                </View>
              )}
            </View>
          </Card>

          <Card>
            <View style={{ gap: spacing.s }}>
              <SectionLabel>{`Подготовка · ${prep.days} дней до экзамена`}</SectionLabel>
              <View style={{ flexDirection: 'row', gap: spacing.m }}>
                <View style={{ flex: 1 }}>
                  <Text
                    variant="h3"
                    style={{ color: lowPrep ? colors.errorText : colors.textPrimary }}
                  >
                    {prep.reviews} повт. · {prep.reviewDays} дн.
                  </Text>
                  <Text variant="caption" color="secondary">
                    у ученика
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="h3">
                    {prep.classReviews} повт. · {prep.classReviewDays} дн.
                  </Text>
                  <Text variant="caption" color="secondary">
                    в среднем по классу
                  </Text>
                </View>
              </View>
              <Text variant="caption" color="secondary">
                Повторения слов этого экзамена. Ученик знает, что учитель это видит.
              </Text>
            </View>
          </Card>

          {data.leftReason || data.awayCount > 0 ? (
            <Card>
              <View style={{ gap: spacing.xs }}>
                <SectionLabel>Выход из приложения</SectionLabel>
                <Text variant="bodySmall">
                  {data.leftReason
                    ? 'Экзамен завершился: ученик вышел из приложения.'
                    : `Выходил ${data.awayCount} раз, возвращался вовремя.`}
                </Text>
              </View>
            </Card>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { flexDirection: 'row', gap: spacing.l, alignItems: 'flex-start' },
  main: { flex: 1, minWidth: 0 },
  side: { width: 380, gap: spacing.m },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  countCell: {
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.m,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
