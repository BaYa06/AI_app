/**
 * Итоги разминки (П4; plan/new/teacher_cabinet.md, Teacher 41): «A1-B: 74 % верных», слова
 * «усвоили / трудное», «Лучшие» и «Нужна помощь», «N не были на разминке» → «Отправить домой»,
 * внизу «Задать N трудных слов к <день урока>» и «К курсу». Правила — liveTest/warmup.ts.
 * Задание выдаётся обычным окном «Новое задание» с готовыми словами (Teacher 42).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button } from '@/components/ui';
import { alpha, borderRadius, spacing } from '@/constants';
import { TEACHER_HOMEWORK_ENABLED } from '@/config/features';
import { NeonService } from '@/services/NeonService';
import { Analytics } from '@/services/analytics';
import { getAccessToken } from '@/services/auth/session';
import { rawApiFetch } from '@/services/api/client';
import { describeTestError } from '@/utils/testApiErrors';
import { getNextLesson, type ScheduleItem } from '@/utils/nextLesson';
import { NewHomeworkSheet, type HomeworkStudent } from '@/components/teacher/NewHomeworkSheet';
import type { HomeworkPreset } from '@/components/teacher/newHomework';
import type { RootStackParamList } from '@/types/navigation';
import {
  WORD_STATUS_LABEL,
  absentTitle,
  assignHardLabel,
  bestStudents,
  hardWarmupCards,
  needHelpStudents,
  sortCardStats,
  studentScoreText,
  warmupCorrectRate,
  warmupSummaryLine,
  wordStatus,
  type CardStat,
  type WarmupParticipant,
  type WarmupResults,
} from './liveTest/warmup';

type Props = NativeStackScreenProps<RootStackParamList, 'WarmupResults'>;
type Colors = ReturnType<typeof useThemeColors>;
type Results = WarmupResults & { setTitle: string };

const hhmm = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function WarmupResultsScreen({ navigation, route }: Props) {
  const { courseId, courseTitle, sessionId } = route.params;
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<HomeworkStudent[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[] | null>(null);
  const [preset, setPreset] = useState<HomeworkPreset | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const res = await rawApiFetch(`test?action=results&sessionId=${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json as Results);
    } catch (e) {
      setError(describeTestError(e, 'Не удалось загрузить итоги разминки.'));
    }
  }, [sessionId]);

  useEffect(() => {
    load();
    NeonService.loadCourseMembers(courseId)
      .then((list) => setStudents(list.map((m) => ({ id: m.id, displayName: m.displayName }))))
      .catch(() => {});
    NeonService.getCourseSchedule(courseId)
      .then(setSchedule)
      .catch(() => {});
  }, [load, courseId]);

  const cards = useMemo(() => sortCardStats(data?.byCard ?? []), [data]);
  const hard = useMemo(() => hardWarmupCards(cards), [cards]);
  const absent = data?.absent ?? [];
  const lesson = useMemo(() => getNextLesson(schedule), [schedule]);
  const toCourse = () => navigation.navigate('TeacherCourseStats', { courseId, courseTitle });

  /** Слова разминки → окно «Новое задание»; название — по набору разминки */
  const openHomework = (list: CardStat[], userIds: string[] | null) => {
    if (!data || list.length === 0) return;
    Analytics.teacherAction('warmup_homework', 'course');
    setPreset({
      words: {
        cardIds: list.map((c) => c.cardId),
        sets: [{ id: sessionId, title: `Трудные слова · ${data.setTitle}` }],
      },
      userIds,
      due: lesson?.date ?? null,
      task: 'hard',
    });
  };

  if (!data) {
    return (
      <View style={[st.screen, st.center, { backgroundColor: colors.background }]}>
        {error ? (
          <>
            <Text color="secondary" style={st.centerText}>
              {error}
            </Text>
            <Button title="Повторить" variant="secondary" onPress={load} />
            <Button title="К курсу" variant="quiet" onPress={toCourse} />
          </>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </View>
    );
  }

  const best = bestStudents(data.participants);
  const needHelp = needHelpStudents(data.participants);

  return (
    <View style={[st.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={st.content}>
        <View style={st.head}>
          <Text variant="caption" color="secondary" style={st.overline}>
            {`РАЗМИНКА ЗАВЕРШЕНА${data.finishedAt ? ` · ${hhmm(data.finishedAt)}` : ''}`}
          </Text>
          <Text variant="h2">{`${courseTitle}: ${warmupCorrectRate(cards)}% верных`}</Text>
          <Text variant="bodySmall" color="secondary">
            {`${warmupSummaryLine(data)} · сохранено в «Историю тестов»`}
          </Text>
        </View>

        {cards.length > 0 && (
          <View style={st.section}>
            <Text variant="h3">Слова</Text>
            <View
              style={[st.list, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              {cards.map((card, i) => (
                <WordRow key={card.cardId} colors={colors} card={card} divider={i > 0} />
              ))}
            </View>
          </View>
        )}

        {data.participants.length > 0 && (
          <View style={st.columns}>
            <StudentsCard colors={colors} title="ЛУЧШИЕ" tone="success" list={best} />
            {needHelp.length > 0 && (
              <StudentsCard colors={colors} title="НУЖНА ПОМОЩЬ" tone="warning" list={needHelp} />
            )}
          </View>
        )}

        {absent.length > 0 && (
          <View
            style={[st.absent, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={st.flex}>
              <Text variant="body" style={st.bold}>
                {absentTitle(absent.length)}
              </Text>
              <Text variant="caption" color="secondary" numberOfLines={2}>
                {absent.map((a) => a.name).join(', ')}
              </Text>
            </View>
            {TEACHER_HOMEWORK_ENABLED && cards.length > 0 && (
              <Pressable
                accessibilityRole="button"
                hitSlop={spacing.xs}
                onPress={() =>
                  openHomework(
                    cards,
                    absent.map((a) => a.userId)
                  )
                }
                style={({ pressed }) => pressed && st.pressed}
              >
                <Text variant="bodySmall" style={[st.bold, { color: colors.primary }]}>
                  Отправить домой
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>

      <View
        style={[
          st.footer,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom + spacing.m,
          },
        ]}
      >
        {TEACHER_HOMEWORK_ENABLED && hard.length > 0 && (
          <Button
            title={assignHardLabel(hard.length, lesson?.date ?? null)}
            fullWidth
            onPress={() => openHomework(hard, null)}
          />
        )}
        <Button title="К курсу" variant="secondary" fullWidth onPress={toCourse} />
      </View>

      {TEACHER_HOMEWORK_ENABLED && (
        <NewHomeworkSheet
          visible={!!preset}
          onClose={() => setPreset(null)}
          courseId={courseId}
          courseTitle={courseTitle}
          students={students}
          schedule={schedule}
          initialWords={preset?.words ?? null}
          preset={preset}
          onCreated={(homeworkId) => {
            setPreset(null);
            navigation.navigate('TeacherHomework', { homeworkId, courseId, courseTitle });
          }}
        />
      )}
    </View>
  );
}

function WordRow({ colors, card, divider }: { colors: Colors; card: CardStat; divider: boolean }) {
  const status = wordStatus(card);
  const learned = status === 'learned';
  const fg = learned
    ? colors.successText
    : status === 'hard'
      ? colors.warningText
      : colors.textSecondary;
  const bg = learned
    ? alpha(colors.success, 10)
    : status === 'hard'
      ? alpha(colors.warning, 10)
      : colors.surfaceMuted;
  return (
    <View
      style={[
        st.row,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
      ]}
    >
      <View style={st.flex}>
        <Text variant="body" style={st.bold} numberOfLines={1}>
          {card.word}
        </Text>
        <Text variant="caption" color="secondary" numberOfLines={1}>
          {card.hint}
        </Text>
      </View>
      <Text variant="bodySmall" style={[st.bold, { color: fg }]}>
        {card.correctRate === null ? '—' : `${card.correctRate}%`}
      </Text>
      <View style={[st.badge, { backgroundColor: bg }]}>
        <Text variant="caption" style={[st.bold, { color: fg }]}>
          {WORD_STATUS_LABEL[status]}
        </Text>
      </View>
    </View>
  );
}

function StudentsCard({
  colors,
  title,
  tone,
  list,
}: {
  colors: Colors;
  title: string;
  tone: 'success' | 'warning';
  list: WarmupParticipant[];
}) {
  return (
    <View style={[st.column, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text
        variant="caption"
        style={[
          st.overline,
          { color: tone === 'success' ? colors.successText : colors.warningText },
        ]}
      >
        {title}
      </Text>
      {list.map((p, i) => (
        <Text key={`${p.name}-${i}`} variant="bodySmall" numberOfLines={1}>
          {studentScoreText(p)}
        </Text>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.m, padding: spacing.l },
  centerText: { textAlign: 'center' },
  content: { padding: spacing.m, gap: spacing.l, paddingBottom: spacing.xl },
  head: { gap: spacing.xxs },
  section: { gap: spacing.s },
  flex: { flex: 1, minWidth: 0 },
  bold: { fontWeight: '600' },
  overline: { fontWeight: '600', letterSpacing: 0.8 },
  list: {
    borderRadius: borderRadius.l,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.m,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, paddingVertical: spacing.s },
  badge: {
    minWidth: 72,
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.s,
  },
  columns: { flexDirection: 'row', gap: spacing.xs },
  column: {
    flex: 1,
    gap: spacing.xs,
    padding: spacing.s,
    borderRadius: borderRadius.l,
    borderWidth: StyleSheet.hairlineWidth,
  },
  absent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    padding: spacing.m,
    borderRadius: borderRadius.l,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: { opacity: 0.6 },
  footer: {
    padding: spacing.m,
    gap: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
