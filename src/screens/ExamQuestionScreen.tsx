/**
 * Разбор вопроса (plan/new/live_exam.md, раздел E, LiveExam 19; макет «4.1»).
 * Вопрос так, как его видели ученики; ответы по вариантам с именами; «почему могли ошибиться»
 * (правила, без ИИ); одно действие на выбор — «Аннулировать / Засчитать ответ / Оставить» —
 * с расчётом «как изменятся баллы» до применения; решение можно отменить.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ArrowRight, BarChart3, Info } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text } from '@/components/common';
import {
  Button,
  Card,
  ErrorState,
  Screen,
  ScreenHeader,
  SkeletonCard,
  toast,
} from '@/components/ui';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, alpha, iconSize, screenPadding } from '@/constants';
import type { RootStackParamList } from '@/types/navigation';
import { ExamApi, type QuestionReview, type Simulation } from '@/services/exam';
import { FORMAT_LABELS } from './exam/examConfig';

type Props = NativeStackScreenProps<RootStackParamList, 'ExamQuestion'>;
type Choice = 'void' | 'accept' | 'keep';

export function ExamQuestionScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const { sessionId, itemId } = route.params;
  const [data, setData] = useState<QuestionReview | null>(null);
  const [error, setError] = useState(false);
  const [pick, setPick] = useState<Choice | null>(null);
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState<{ choice: Choice; logId: string } | null>(null);

  const load = useCallback(async () => {
    const res = await ExamApi.question(sessionId, itemId);
    if (!res.ok) setError(true);
    else {
      setError(false);
      setData(res.data);
    }
  }, [sessionId, itemId]);
  useEffect(() => {
    load();
  }, [load]);

  // Действие по умолчанию — то, что советуют подсказки
  useEffect(() => {
    if (!data || pick) return;
    const suggest = data.hints.find((h) => h.suggest)?.suggest;
    if (suggest === 'accept' && data.actions.accept) setPick('accept');
    else if (suggest === 'keep') setPick('keep');
    else if (data.actions.void) setPick('void');
    else setPick('keep');
  }, [data, pick]);

  const sim: Simulation | null = useMemo(() => {
    if (!data || !pick || pick === 'keep') return null;
    return pick === 'void' ? data.actions.void : data.actions.accept;
  }, [data, pick]);

  const apply = async () => {
    if (!pick || !data) return;
    setApplying(true);
    try {
      const res = await ExamApi.decide(
        sessionId,
        itemId,
        pick,
        pick === 'accept' ? data.actions.accept?.answer : undefined
      );
      if (!res.ok) {
        toast.error('Не удалось сохранить решение. Проверь интернет.');
        return;
      }
      setDone({ choice: pick, logId: res.data.logId });
      load();
    } finally {
      setApplying(false);
    }
  };

  const undo = async () => {
    if (!done) return;
    const res = await ExamApi.undo(sessionId, done.logId);
    if (res.ok) {
      setDone(null);
      toast.info('Решение отменено, баллы вернулись');
      load();
    } else toast.error('Не удалось отменить.');
  };

  const header = <ScreenHeader title="Разбор вопроса" onBack={() => navigation.goBack()} />;
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
        <SkeletonCard height={200} />
        <SkeletonCard height={160} />
      </Screen>
    );
  }

  const { item, stats, groups, hints, actions } = data;
  const maxCount = Math.max(1, stats.answered);
  const acceptAnswer = actions.accept?.answer;
  const choices: { key: Choice; title: string; detail: string; disabled?: boolean }[] = [
    {
      key: 'void',
      title: item.voided ? 'Вопрос уже аннулирован' : 'Аннулировать вопрос',
      detail: actions.void
        ? `Вопрос не считается: 100 баллов делятся на оставшиеся вопросы. Балл изменится у ${actions.void.rows.length}.`
        : 'Вопрос уже не считается.',
      disabled: !actions.void,
    },
    {
      key: 'accept',
      title: acceptAnswer ? `Засчитать «${acceptAnswer}»` : 'Засчитать ответ',
      detail: actions.accept
        ? `Балл вырастет у ${actions.accept.rows.length} — у всех, кто ответил так же. Подходит, если на уроке давали такой перевод.`
        : 'Неверных ответов нет.',
      disabled: !actions.accept,
    },
    {
      key: 'keep',
      title: 'Оставить как есть',
      detail: 'Баллы не меняются. Предупреждение уйдёт из итогов.',
    },
  ];
  const doneText: Record<Choice, [string, string]> = {
    void: [
      'Вопрос аннулирован',
      'Баллы пересчитаны. В разборе ученики увидят «вопрос аннулирован учителем».',
    ],
    accept: [
      `Ответ «${acceptAnswer || ''}» засчитан`,
      'Баллы пересчитаны. В разборе — «ответ засчитан учителем».',
    ],
    keep: ['Вопрос оставлен', 'Предупреждение скрыто из итогов, баллы не менялись.'],
  };

  return (
    <Screen
      header={header}
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          {done ? (
            <Button title="Вернуться к итогам" fullWidth onPress={() => navigation.goBack()} />
          ) : (
            <Button
              title={choices.find((c) => c.key === pick)?.title || 'Выберите действие'}
              fullWidth
              loading={applying}
              disabled={!pick || choices.find((c) => c.key === pick)?.disabled}
              onPress={apply}
            />
          )}
          <Text variant="caption" style={[styles.center, { color: colors.textSecondary }]}>
            Решение записывается в журнал изменений. Его можно отменить.
          </Text>
        </View>
      }
    >
      <Text variant="caption" style={{ color: colors.textSecondary }}>
        Вопрос {item.number} · {FORMAT_LABELS[item.format]}
      </Text>

      {done ? (
        <Card
          style={[
            styles.doneCard,
            { backgroundColor: alpha(colors.success, 10), borderColor: alpha(colors.success, 40) },
          ]}
        >
          <Text variant="label" style={{ color: colors.successText }}>
            {doneText[done.choice][0]}
          </Text>
          <Text variant="bodySmall" style={{ color: colors.successText }}>
            {doneText[done.choice][1]}
          </Text>
          <Button
            title="Отменить"
            variant="secondary"
            size="s"
            onPress={undo}
            style={styles.selfStart}
          />
        </Card>
      ) : null}

      <Card style={styles.section}>
        <Text variant="overline" style={{ color: colors.textSecondary }}>
          Как видели ученики
        </Text>
        <Text variant="h2">{item.prompt}</Text>
        <Text variant="caption" style={{ color: colors.textSecondary }}>
          {item.options
            ? 'Варианты у всех одни, у каждого свой порядок'
            : `Верный ответ: ${item.answer}`}
        </Text>
        <View style={styles.groups}>
          {groups.map((g) => {
            const correct = g.verdict === 'correct';
            return (
              <View
                key={g.text}
                style={[
                  styles.group,
                  {
                    borderColor: correct ? alpha(colors.success, 40) : colors.border,
                    backgroundColor: correct ? alpha(colors.success, 10) : colors.surface,
                  },
                ]}
              >
                <View style={styles.groupTop}>
                  <Text variant="label" style={styles.flex}>
                    {g.text}
                  </Text>
                  {correct ? (
                    <Text
                      variant="caption"
                      style={{ color: colors.successText, fontWeight: '700' }}
                    >
                      верный
                    </Text>
                  ) : null}
                  <Text variant="label">{g.count}</Text>
                </View>
                <View style={[styles.track, { backgroundColor: colors.borderLight }]}>
                  <View
                    style={[
                      styles.fill,
                      {
                        width: `${(g.count / maxCount) * 100}%`,
                        backgroundColor: correct ? colors.success : colors.error,
                      },
                    ]}
                  />
                </View>
                {g.names.length ? (
                  <Text variant="caption" style={{ color: colors.textSecondary }}>
                    {g.names.join(', ')}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      </Card>

      {hints.length ? (
        <Card style={styles.section}>
          <Text variant="overline" style={{ color: colors.textSecondary }}>
            Почему могли ошибиться
          </Text>
          {hints.map((h) => (
            <View key={h.code} style={styles.hint}>
              {h.code === 'question_issue' ? (
                <BarChart3 size={iconSize.s} color={colors.primary} />
              ) : (
                <Info size={iconSize.s} color={colors.warningText} />
              )}
              <Text variant="bodySmall" style={styles.flex}>
                {h.text}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      {!done ? (
        <View style={styles.section}>
          <Text variant="overline" style={{ color: colors.textSecondary }}>
            Что сделать
          </Text>
          {choices.map((c) => {
            const on = pick === c.key;
            return (
              <Pressable
                key={c.key}
                onPress={() => !c.disabled && setPick(c.key)}
                disabled={c.disabled}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: c.disabled }}
                style={[
                  styles.choice,
                  {
                    borderColor: on ? colors.primary : colors.border,
                    borderWidth: on ? 2 : 1,
                    backgroundColor: on ? alpha(colors.primary, 10) : colors.surface,
                    opacity: c.disabled ? 0.5 : 1,
                  },
                ]}
              >
                <View style={[styles.radio, { borderColor: on ? colors.primary : colors.border }]}>
                  {on ? (
                    <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />
                  ) : null}
                </View>
                <View style={styles.flex}>
                  <Text variant="label">{c.title}</Text>
                  <Text variant="caption" style={{ color: colors.textSecondary }}>
                    {c.detail}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {!done && sim && sim.rows.length ? (
        <Card style={styles.section}>
          <View style={styles.groupTop}>
            <Text variant="overline" style={[styles.flex, { color: colors.textSecondary }]}>
              Как изменятся баллы
            </Text>
            <Text variant="caption" style={{ color: colors.textSecondary }}>
              средний {sim.avgFrom} → {sim.avgTo}
            </Text>
          </View>
          {sim.rows.map((r) => (
            <View key={r.participantId} style={styles.simRow}>
              <Text variant="bodySmall" style={styles.flex}>
                {r.name}
              </Text>
              <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                {r.from}
              </Text>
              <ArrowRight size={iconSize.xs} color={colors.textTertiary} />
              <Text variant="label" style={[styles.simTo, { color: colors.successText }]}>
                {r.to}
              </Text>
            </View>
          ))}
          {sim.unchanged.length ? (
            <Text variant="caption" style={{ color: colors.textSecondary }}>
              Без изменений: {sim.unchanged.join(', ')}
            </Text>
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.xs, gap: spacing.m },
  footer: { paddingHorizontal: screenPadding, gap: spacing.xs },
  center: { textAlign: 'center' },
  flex: { flex: 1 },
  selfStart: { alignSelf: 'flex-start' },
  section: { gap: spacing.s },
  doneCard: { borderWidth: 1, gap: spacing.xs },
  groups: { gap: spacing.s },
  group: { borderWidth: 1, borderRadius: borderRadius.m, padding: spacing.s, gap: spacing.xxs + 2 },
  groupTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  track: { height: 6, borderRadius: borderRadius.full, overflow: 'hidden' },
  fill: { height: '100%' },
  hint: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' },
  choice: {
    flexDirection: 'row',
    gap: spacing.s,
    padding: spacing.s,
    borderRadius: borderRadius.l,
    alignItems: 'flex-start',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioDot: { width: 10, height: 10, borderRadius: borderRadius.full },
  simRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  simTo: { width: 28, textAlign: 'right' },
});
