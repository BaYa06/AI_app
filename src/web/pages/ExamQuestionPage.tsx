/**
 * Разбор вопроса (plan/new/web_cabinet.md, Web 24; макет E9): как отвечали ученики, почему могли
 * ошибиться, «Аннулировать / Засчитать ответ / Оставить» с расчётом «как изменятся баллы» до применения
 * и отменой решения. Прямо из итогов вопрос не аннулируется — только отсюда (решение 17.11.2026).
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ArrowRight, BarChart3, Info, Undo2 } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Controls';
import { toast } from '@/components/ui/Toast';
import { FORMAT_LABELS } from '@/screens/exam/examConfig';
import { describeApiError } from '../api';
import { ExamData } from '../data/exam';
import { useLoad } from '../useLoad';
import { ErrorPage, LoadingPage } from '../ui/states';
import { PageHeader, SectionLabel } from '../ui/kit';
import {
  choiceViews,
  decisionNote,
  decisionTitle,
  defaultChoice,
  simulationFor,
  type Choice,
} from '../exam/resultsLogic';

export function ExamQuestionPage({ sessionId, itemId }: { sessionId: string; itemId: string }) {
  const colors = useThemeColors();
  const q = useLoad(() => ExamData.question(sessionId, itemId), [sessionId, itemId]);
  const [pick, setPick] = useState<Choice | null>(null);
  const [applying, setApplying] = useState(false);
  const [undoing, setUndoing] = useState<string | null>(null);

  const data = q.data;
  // Выбор по умолчанию — то, что советуют подсказки; потом учитель выбирает сам
  useEffect(() => {
    if (data && pick === null) setPick(defaultChoice(data));
  }, [data, pick]);

  if (q.error && !data) return <ErrorPage error={q.error} onRetry={q.reload} />;
  if (!data) return <LoadingPage />;

  const { item, stats, groups, hints, decisions } = data;
  const choices = choiceViews(data);
  const current = choices.find((c) => c.key === pick);
  const sim = pick ? simulationFor(data, pick) : null;
  const maxCount = Math.max(1, stats.answered);
  const back = { label: 'Итоги экзамена', path: `/exams/${sessionId}` };

  const apply = async () => {
    if (!pick || current?.disabled) return;
    setApplying(true);
    try {
      await ExamData.decide(
        sessionId,
        itemId,
        pick,
        pick === 'accept' ? data.actions.accept?.answer : undefined
      );
      toast.success('Решение сохранено');
      setPick(null);
      q.reload();
    } catch (e) {
      toast.error(describeApiError(e));
    }
    setApplying(false);
  };

  const undo = async (logId: string) => {
    setUndoing(logId);
    try {
      await ExamData.undo(sessionId, logId);
      toast.info('Решение отменено, баллы вернулись');
      setPick(null);
      q.reload();
    } catch (e) {
      toast.error(describeApiError(e));
    }
    setUndoing(null);
  };

  return (
    <View>
      <PageHeader
        title={`Вопрос ${item.number}`}
        subtitle={FORMAT_LABELS[item.format]}
        back={back}
      />
      <View style={styles.layout}>
        <View style={styles.main}>
          <Card>
            <View style={{ gap: spacing.s }}>
              <SectionLabel>Как видели ученики</SectionLabel>
              <Text variant="h2">{item.prompt}</Text>
              <Text variant="caption" color="secondary">
                {item.options
                  ? 'Варианты у всех одни, у каждого свой порядок'
                  : `Верный ответ: ${item.answer}`}
              </Text>
              <View style={{ gap: spacing.s }}>
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
                        <Text variant="label" style={{ flex: 1 }}>
                          {g.text}
                        </Text>
                        {correct ? <Badge label="верный" tone="success" /> : null}
                        <Text variant="label">{g.count}</Text>
                      </View>
                      <View style={[styles.track, { backgroundColor: colors.surfaceMuted }]}>
                        <View
                          style={{
                            width: `${(g.count / maxCount) * 100}%`,
                            height: '100%',
                            backgroundColor: correct ? colors.success : colors.error,
                          }}
                        />
                      </View>
                      {g.names.length > 0 ? (
                        <Text variant="caption" color="secondary">
                          {g.names.join(', ')}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          </Card>

          {hints.length > 0 ? (
            <Card>
              <View style={{ gap: spacing.s }}>
                <SectionLabel>Почему могли ошибиться</SectionLabel>
                {hints.map((h) => (
                  <View key={h.code + h.text} style={styles.hint}>
                    {h.code === 'question_issue' ? (
                      <BarChart3 size={20} color={colors.primary} />
                    ) : (
                      <Info size={20} color={colors.warningText} />
                    )}
                    <Text variant="bodySmall" style={{ flex: 1 }}>
                      {h.text}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          {decisions.length > 0 ? (
            <View style={{ gap: spacing.s }}>
              <SectionLabel>Принятые решения</SectionLabel>
              <Card
                style={{
                  backgroundColor: alpha(colors.success, 10),
                  borderColor: alpha(colors.success, 40),
                }}
              >
                <View style={{ gap: spacing.m }}>
                  {decisions.map((d) => (
                    <View key={d.logId} style={styles.decision}>
                      <View style={{ flex: 1, gap: spacing.xxs }}>
                        <Text variant="label" style={{ color: colors.successText }}>
                          {decisionTitle(d.action, d.payload)}
                        </Text>
                        <Text variant="bodySmall" style={{ color: colors.successText }}>
                          {decisionNote(d.action)}
                        </Text>
                      </View>
                      <Button
                        variant="secondary"
                        size="s"
                        icon={Undo2}
                        title="Отменить решение"
                        onPress={() => undo(d.logId)}
                        loading={undoing === d.logId}
                      />
                    </View>
                  ))}
                </View>
              </Card>
            </View>
          ) : null}
        </View>

        <View style={styles.side}>
          <SectionLabel>Что сделать</SectionLabel>
          {choices.map((c) => {
            const on = pick === c.key;
            return (
              <Pressable
                key={c.key}
                role="radio"
                accessibilityState={{ selected: on, disabled: c.disabled }}
                disabled={c.disabled}
                onPress={() => setPick(c.key)}
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
                <View style={{ flex: 1, gap: spacing.xxs }}>
                  <Text variant="label">{c.title}</Text>
                  <Text variant="caption" color="secondary">
                    {c.detail}
                  </Text>
                </View>
              </Pressable>
            );
          })}

          {sim && sim.rows.length > 0 ? (
            <Card>
              <View style={{ gap: spacing.xs }}>
                <View style={styles.groupTop}>
                  <Text variant="overline" color="secondary" style={{ flex: 1 }}>
                    КАК ИЗМЕНЯТСЯ БАЛЛЫ
                  </Text>
                  <Text variant="caption" color="secondary">
                    средний {sim.avgFrom} → {sim.avgTo}
                  </Text>
                </View>
                {sim.rows.map((r) => (
                  <View key={r.participantId} style={styles.sim}>
                    <Text variant="bodySmall" style={{ flex: 1 }} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Text variant="bodySmall" color="secondary">
                      {r.from}
                    </Text>
                    <ArrowRight size={14} color={colors.textTertiary} />
                    <Text
                      variant="label"
                      style={{
                        width: 32,
                        textAlign: 'right',
                        color: r.to >= r.from ? colors.successText : colors.errorText,
                      }}
                    >
                      {r.to}
                    </Text>
                  </View>
                ))}
                {sim.unchanged.length > 0 ? (
                  <Text variant="caption" color="secondary">
                    Без изменений: {sim.unchanged.join(', ')}
                  </Text>
                ) : null}
              </View>
            </Card>
          ) : null}

          <Button
            title={current?.title ?? 'Выбери действие'}
            fullWidth
            loading={applying}
            disabled={!pick || Boolean(current?.disabled)}
            onPress={apply}
          />
          <Text variant="caption" color="secondary">
            Решение записывается в журнал изменений. Его можно отменить.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { flexDirection: 'row', gap: spacing.l, alignItems: 'flex-start' },
  main: { flex: 1, gap: spacing.l, minWidth: 0 },
  side: { width: 380, gap: spacing.s, position: 'sticky' as unknown as 'relative', top: spacing.l },
  group: { borderWidth: 1, borderRadius: borderRadius.m, padding: spacing.s, gap: spacing.xs },
  groupTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  track: { height: 6, borderRadius: borderRadius.full, overflow: 'hidden' },
  hint: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' },
  decision: { flexDirection: 'row', alignItems: 'center', gap: spacing.m },
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
  sim: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
