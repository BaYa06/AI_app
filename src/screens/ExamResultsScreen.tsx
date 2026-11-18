/**
 * Итоги экзамена для учителя (plan/new/live_exam.md, LiveExam 18; макет «4»).
 * Средний балл и распределение, вкладки «Ученики | Слова». Ученик — карточка: имя, балл,
 * полоска, «Верно · Ошибки · Опечатка · Нет ответа» (нули не показываем). Подозрительный
 * вопрос — только через разбор: «Посмотреть вопрос» или «Оставить», без «Аннулировать» здесь.
 */
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AlertTriangle, ChevronRight } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
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
  confirmDialog,
  toast,
} from '@/components/ui';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, alpha, iconSize, screenPadding } from '@/constants';
import type { RootStackParamList } from '@/types/navigation';
import { ExamApi, type ExamResults, type ResultStudent, type Verdict } from '@/services/exam';
import { FORMAT_LABELS } from './exam/examConfig';

type Props = NativeStackScreenProps<RootStackParamList, 'ExamResults'>;

export function ExamResultsScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const { sessionId, courseId, courseTitle } = route.params;
  const [data, setData] = useState<ExamResults | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<'students' | 'words'>('students');
  const [releasing, setReleasing] = useState(false);

  const load = useCallback(async () => {
    const res = await ExamApi.results(sessionId);
    if (!res.ok) setError(true);
    else {
      setError(false);
      setData(res.data);
    }
  }, [sessionId]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const keep = async (itemId: string) => {
    const res = await ExamApi.decide(sessionId, itemId, 'keep');
    if (res.ok) load();
    else toast.error('Не удалось сохранить. Проверь интернет.');
  };

  const release = async () => {
    if (!data) return;
    const ok = await confirmDialog({
      title: 'Открыть результаты ученикам?',
      message:
        'Каждый увидит свой балл, ошибки и верные ответы. Засчитать ответ или изменить балл можно и после — ученики увидят обновлённый балл.',
      confirmText: 'Открыть',
      cancelText: 'Отмена',
    });
    if (!ok) return;
    setReleasing(true);
    try {
      const res = await ExamApi.release(sessionId);
      if (res.ok) {
        toast.success('Результаты открыты');
        load();
      } else toast.error('Не удалось открыть результаты.');
    } finally {
      setReleasing(false);
    }
  };

  const header = <ScreenHeader title="Итоги экзамена" onBack={() => navigation.goBack()} />;
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
        <SkeletonCard height={110} />
        <SkeletonCard height={260} />
      </Screen>
    );
  }

  const suspicious = data.words.filter((w) => w.suspicious);
  const maxDist = Math.max(1, ...data.distribution.map((d) => d.n));
  const finished = data.status === 'finished';

  return (
    <Screen
      header={header}
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          {data.released ? (
            <Text variant="label" style={[styles.center, { color: colors.successText }]}>
              Результаты открыты ученикам
            </Text>
          ) : (
            <Button
              title={finished ? 'Открыть результаты ученикам' : 'Экзамен ещё идёт'}
              fullWidth
              disabled={!finished}
              loading={releasing}
              onPress={release}
            />
          )}
        </View>
      }
    >
      <Text variant="caption" style={{ color: colors.textSecondary }}>
        {courseTitle} · {data.setTitle} · {new Date(data.date).toLocaleDateString('ru-RU')}
      </Text>

      <View style={styles.tiles}>
        <Card style={styles.tile}>
          <Text variant="caption" style={{ color: colors.textSecondary }}>
            Средний балл
          </Text>
          <View style={styles.baseline}>
            <Text variant="h1">{data.avgScore}</Text>
            <Text variant="label" style={{ color: colors.textSecondary }}>
              / 100
            </Text>
          </View>
          <Text variant="caption" style={{ color: colors.textSecondary }}>
            {data.students.length} сдавали · {data.totalQuestions} слов
          </Text>
        </Card>
        <Card style={styles.tile}>
          <Text variant="caption" style={{ color: colors.textSecondary }}>
            Распределение
          </Text>
          {data.distribution.map((d) => (
            <View key={d.label} style={styles.distRow}>
              <Text variant="caption" style={[styles.distLabel, { color: colors.textSecondary }]}>
                {d.label}
              </Text>
              <View style={[styles.distTrack, { backgroundColor: colors.borderLight }]}>
                <View
                  style={[
                    styles.distFill,
                    { width: `${(d.n / maxDist) * 100}%`, backgroundColor: colors.primaryFill },
                  ]}
                />
              </View>
              <Text variant="caption">{d.n}</Text>
            </View>
          ))}
        </Card>
      </View>

      {suspicious.map((w) => (
        <Card
          key={w.itemId}
          style={[
            styles.warn,
            { backgroundColor: alpha(colors.warning, 10), borderColor: alpha(colors.warning, 40) },
          ]}
        >
          <View style={styles.warnRow}>
            <AlertTriangle size={iconSize.s} color={colors.warningText} />
            <Text variant="bodySmall" style={[styles.flex, { color: colors.warningText }]}>
              «{w.prompt}»: ошиблись {w.wrong} из {w.answered}. Посмотрите, что ответили ученики,
              прежде чем решать.
            </Text>
          </View>
          <View style={styles.warnActions}>
            <Button
              title="Посмотреть вопрос"
              variant="secondary"
              size="s"
              onPress={() => navigation.navigate('ExamQuestion', { sessionId, itemId: w.itemId })}
            />
            <Button title="Оставить" variant="quiet" size="s" onPress={() => keep(w.itemId)} />
          </View>
        </Card>
      ))}

      <View style={[styles.tabs, { backgroundColor: colors.surfaceMuted }]}>
        {(['students', 'words'] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            style={[styles.tab, tab === t && { backgroundColor: colors.surface }]}
          >
            <Text
              variant="label"
              style={{ color: tab === t ? colors.textPrimary : colors.textSecondary }}
            >
              {t === 'students' ? 'Ученики' : 'Слова'}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'students' ? (
        <View style={styles.list}>
          {data.students.map((st) => (
            <StudentCard
              key={st.participantId}
              st={st}
              onPress={() =>
                navigation.navigate('ExamStudent', {
                  sessionId,
                  participantId: st.participantId,
                  courseId,
                })
              }
            />
          ))}
          {data.absent.length ? (
            <Text variant="caption" style={{ color: colors.textSecondary }}>
              Не пришли: {data.absent.map((a) => a.name).join(', ')}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.list}>
          {[...data.words]
            .sort(
              (a, b) => a.correct / Math.max(1, a.answered) - b.correct / Math.max(1, b.answered)
            )
            .map((w) => (
              <Card
                key={w.itemId}
                padding="s"
                onPress={() => navigation.navigate('ExamQuestion', { sessionId, itemId: w.itemId })}
                style={styles.wordRow}
              >
                <View style={styles.flex}>
                  <Text variant="label" numberOfLines={2}>
                    {w.prompt}
                  </Text>
                  <Text variant="caption" style={{ color: colors.textSecondary }}>
                    {FORMAT_LABELS[w.format]} · верно {w.correct} из {w.answered}
                  </Text>
                </View>
                {w.voided ? <Badge label="аннулирован" tone="neutral" /> : null}
                {w.accepted.length ? <Badge label="засчитан ответ" tone="success" /> : null}
                <ChevronRight size={iconSize.s} color={colors.textSecondary} />
              </Card>
            ))}
        </View>
      )}
    </Screen>
  );
}

const CHIPS: { key: Verdict; label: string }[] = [
  { key: 'correct', label: 'Верно' },
  { key: 'wrong', label: 'Ошибки' },
  { key: 'typo', label: 'Опечатка' },
  { key: 'wrong_form', label: 'Не та форма' },
  { key: 'none', label: 'Нет ответа' },
];

function StudentCard({ st, onPress }: { st: ResultStudent; onPress: () => void }) {
  const colors = useThemeColors();
  const tone: Record<Verdict, string> = {
    correct: colors.success,
    typo: colors.warning,
    wrong_form: colors.warning,
    wrong: colors.error,
    none: colors.border,
  };
  const scoreColor =
    st.score >= 75 ? colors.successText : st.score >= 50 ? colors.textPrimary : colors.errorText;
  const order: Verdict[] = ['correct', 'typo', 'wrong_form', 'wrong', 'none'];
  return (
    <Card padding="s" onPress={onPress} style={styles.studentCard}>
      <View style={styles.studentTop}>
        <Text variant="label" style={styles.flex}>
          {st.name}
        </Text>
        {st.overridden ? <Badge label="балл изменён" tone="info" /> : null}
        <View style={styles.baseline}>
          <Text variant="h3" style={{ color: scoreColor }}>
            {st.score}
          </Text>
          <Text variant="caption" style={{ color: colors.textSecondary }}>
            /100
          </Text>
        </View>
        <ChevronRight size={iconSize.s} color={colors.textSecondary} />
      </View>
      <View style={[styles.bar, { backgroundColor: colors.borderLight }]}>
        {order.map((v) =>
          st.counts[v] ? (
            <View key={v} style={{ flex: st.counts[v], backgroundColor: tone[v] }} />
          ) : null
        )}
      </View>
      <View style={styles.counts}>
        {CHIPS.filter((c) => st.counts[c.key] > 0).map((c) => (
          <View key={c.key} style={styles.countItem}>
            <View style={[styles.dot, { backgroundColor: tone[c.key] }]} />
            <Text variant="caption" style={{ color: colors.textSecondary }}>
              {c.label}:{' '}
              <Text variant="caption" style={{ color: colors.textPrimary, fontWeight: '700' }}>
                {st.counts[c.key]}
              </Text>
            </Text>
          </View>
        ))}
      </View>
      {st.leftReason || st.awayCount > 0 || st.flags.includes('fast') ? (
        <View style={styles.counts}>
          {st.leftReason ? <Badge label="вышел из приложения" tone="warning" /> : null}
          {!st.leftReason && st.awayCount > 0 ? (
            <Badge label={`выходил ×${st.awayCount}`} tone="warning" />
          ) : null}
          {st.flags.includes('fast') ? (
            <Badge label="все ответы быстрее 2 с" tone="warning" />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.xs, gap: spacing.m },
  footer: { paddingHorizontal: screenPadding },
  center: { textAlign: 'center' },
  flex: { flex: 1 },
  tiles: { flexDirection: 'row', gap: spacing.s },
  tile: { flex: 1, gap: spacing.xxs },
  baseline: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  distLabel: { width: 48 },
  distTrack: { flex: 1, height: 8, borderRadius: borderRadius.full, overflow: 'hidden' },
  distFill: { height: '100%' },
  warn: { borderWidth: 1, gap: spacing.s },
  warnRow: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' },
  warnActions: { flexDirection: 'row', gap: spacing.xs },
  tabs: { flexDirection: 'row', borderRadius: borderRadius.m, padding: spacing.xxs },
  tab: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.s,
  },
  list: { gap: spacing.xs },
  studentCard: { gap: spacing.xs },
  studentTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  bar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    gap: 2,
  },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  countItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  dot: { width: 8, height: 8, borderRadius: borderRadius.full },
  wordRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
