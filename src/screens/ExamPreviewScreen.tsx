/**
 * Превью «что увидят ученики» (plan/new/live_exam.md, LiveExam 14; макет «2»).
 * Слова по форматам (пары — одним блоком), точка сложности, иконка «заменить слово» справа.
 * «Открыть экзамен» — код для входа, дальше обычное ожидание и старт (TestLobby).
 * Порядок у каждого ученика свой — здесь он сгруппирован по форматам.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { RefreshCw } from 'lucide-react-native';
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
import { spacing, borderRadius, heights, iconSize, screenPadding } from '@/constants';
import type { RootStackParamList } from '@/types/navigation';
import {
  ExamApi,
  type DraftItem,
  type ExamDraft,
  type Difficulty,
  type ExamFormat,
} from '@/services/exam';
import { describeTestError } from '@/utils/testApiErrors';
import { FORMAT_LABELS } from './exam/examConfig';

type Props = NativeStackScreenProps<RootStackParamList, 'ExamPreview'>;

const ORDER: ExamFormat[] = ['choice', 'write', 'gap', 'scramble', 'match'];

export function ExamPreviewScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const { sessionId, courseId, courseTitle } = route.params;
  const [draft, setDraft] = useState<ExamDraft | null>(null);
  const [error, setError] = useState(false);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    const res = await ExamApi.draft(sessionId);
    if (!res.ok) setError(true);
    else setDraft(res.data);
  }, [sessionId]);
  useEffect(() => {
    load();
  }, [load]);

  const levelColor: Record<Difficulty, string> = {
    easy: colors.success,
    mid: colors.warning,
    hard: colors.error,
    unstudied: colors.textTertiary,
  };
  const levelName: Record<Difficulty, string> = {
    easy: 'лёгкое',
    mid: 'среднее',
    hard: 'сложное',
    unstudied: 'не изучено',
  };

  const groups = useMemo(() => {
    const items = draft?.items || [];
    return ORDER.map((f) => ({ format: f, items: items.filter((i) => i.format === f) })).filter(
      (g) => g.items.length
    );
  }, [draft]);
  const levels = useMemo(() => {
    const out = { easy: 0, mid: 0, hard: 0, unstudied: 0 } as Record<Difficulty, number>;
    for (const i of draft?.items || []) out[i.difficulty]++;
    return out;
  }, [draft]);
  const screens = useMemo(() => new Set((draft?.items || []).map((i) => i.blockNo)).size, [draft]);

  const replace = async (it: DraftItem) => {
    setReplacing(it.itemId);
    try {
      const res = await ExamApi.replace(sessionId, it.itemId);
      if (!res.ok) {
        toast.error(describeTestError(res.error, 'Не удалось заменить слово.'));
        return;
      }
      setDraft(res.data);
      const fresh = res.data.items.find((x) => x.itemId === it.itemId);
      toast.info(
        res.data.sameLevel === false
          ? `Заменили на «${fresh?.prompt}» — слов той же сложности не осталось`
          : `Заменили на «${fresh?.prompt}»`
      );
    } finally {
      setReplacing(null);
    }
  };

  const open = async () => {
    if (!draft || opening) return;
    setOpening(true);
    try {
      const res = await ExamApi.create(sessionId);
      if (!res.ok) {
        toast.error(describeTestError(res.error, 'Не удалось открыть экзамен.'));
        return;
      }
      navigation.replace('TestLobby', {
        courseId,
        courseTitle,
        sessionId,
        code: res.data.code,
        testMode: 'exam',
        questionCount: res.data.questionCount,
        timePerQuestion: 0,
      });
    } finally {
      setOpening(false);
    }
  };

  const header = <ScreenHeader title="Что увидят ученики" onBack={() => navigation.goBack()} />;
  if (error) {
    return (
      <Screen header={header}>
        <ErrorState onRetry={load} />
      </Screen>
    );
  }
  if (!draft) {
    return (
      <Screen header={header} contentStyle={styles.content}>
        <SkeletonCard height={80} />
        <SkeletonCard height={240} />
      </Screen>
    );
  }

  const minutes = Math.round((draft.durationSec || 0) / 60);
  const editable = draft.status === 'draft' || draft.status === 'waiting';

  return (
    <Screen
      header={header}
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          <Button title="Открыть экзамен" fullWidth loading={opening} onPress={open} />
        </View>
      }
    >
      <View style={styles.chips}>
        <Meta text={`${draft.items.length} слов`} />
        <Meta text={`${screens} экранов`} />
        <Meta text={`${minutes} мин`} />
        <Meta text="100 баллов" />
      </View>
      <View style={styles.legend}>
        {(['easy', 'mid', 'hard', 'unstudied'] as Difficulty[]).map((l) =>
          levels[l] ? (
            <View key={l} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: levelColor[l] }]} />
              <Text variant="caption" style={{ color: colors.textSecondary }}>
                {levels[l]} {levelName[l]}
              </Text>
            </View>
          ) : null
        )}
      </View>
      <Text variant="caption" style={{ color: colors.textSecondary }}>
        Слова у всех одинаковые, порядок вопросов у каждого ученика свой.
      </Text>

      {groups.map((g) => {
        const pts = g.items.reduce((a, i) => a + i.points, 0);
        const matchBlocks = new Set(g.items.map((i) => i.blockNo)).size;
        return (
          <Card
            key={g.format}
            padding="none"
            style={g.format === 'match' ? styles.matchCard : undefined}
          >
            <View style={[styles.groupHead, { borderBottomColor: colors.borderLight }]}>
              <Text variant="label">{FORMAT_LABELS[g.format]}</Text>
              <Text variant="caption" style={{ color: colors.textSecondary }}>
                {g.format === 'match'
                  ? `${matchBlocks} ${matchBlocks === 1 ? 'экран' : 'экрана'} · ${g.items.length} слов`
                  : `${g.items.length}`}{' '}
                · {Math.round(pts)} баллов
              </Text>
            </View>
            {g.items.map((it) => (
              <View key={it.itemId} style={styles.row}>
                <View style={[styles.dot, { backgroundColor: levelColor[it.difficulty] }]} />
                <View style={styles.flex}>
                  <Text variant="bodySmall" numberOfLines={2}>
                    {it.format === 'gap'
                      ? String(it.extra?.baseForm || it.answer)
                      : it.direction === 'forward' || it.format === 'match'
                        ? it.prompt
                        : it.answer}
                  </Text>
                  <Text variant="caption" style={{ color: colors.textSecondary }} numberOfLines={2}>
                    {it.format === 'gap'
                      ? it.prompt
                      : it.direction === 'forward' || it.format === 'match'
                        ? it.answer
                        : it.prompt}
                  </Text>
                </View>
                {editable && it.format !== 'match' ? (
                  <Pressable
                    onPress={() => replace(it)}
                    disabled={Boolean(replacing)}
                    accessibilityRole="button"
                    accessibilityLabel={`Заменить слово ${it.format === 'gap' ? it.extra?.baseForm : it.prompt}`}
                    style={styles.replaceBtn}
                  >
                    {replacing === it.itemId ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <RefreshCw size={iconSize.s} color={colors.textSecondary} />
                    )}
                  </Pressable>
                ) : null}
              </View>
            ))}
          </Card>
        );
      })}
    </Screen>
  );
}

function Meta({ text }: { text: string }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.meta, { backgroundColor: colors.surfaceMuted }]}>
      <Text variant="label">{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.xs, gap: spacing.m },
  footer: { paddingHorizontal: screenPadding },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  meta: {
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xxs + 2,
    borderRadius: borderRadius.s,
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.m },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  dot: { width: 8, height: 8, borderRadius: borderRadius.full },
  groupHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.m,
    borderBottomWidth: 1,
  },
  matchCard: { borderWidth: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingLeft: spacing.m,
    minHeight: heights.listRow,
  },
  flex: { flex: 1, paddingVertical: spacing.xs },
  replaceBtn: {
    width: heights.touch,
    height: heights.touch,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
