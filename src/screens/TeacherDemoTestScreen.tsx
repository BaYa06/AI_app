/**
 * Демо живого теста (plan/new/new_user_activation.md, Start 6.2): учитель за минуту видит, как
 * тест выглядит на уроке. Три бота-ученика подключаются по коду и отвечают — только на устройстве,
 * без записи в базу. Лобби → ход теста → итоги, как в настоящем тесте (TestLobby, LiveTest).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check, Info, Trophy, UserCheck } from 'lucide-react-native';
import { Text } from '@/components/common/Text';
import { Badge, BottomBar, Button, ProgressBar, ScreenHeader } from '@/components/ui';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, iconSize, screenPadding, spacing } from '@/constants';
import { pluralize } from '@/utils';
import { Analytics } from '@/services/analytics';
import { markTeacherTask } from '@/services/teacherStart';
import type { RootStackParamList } from '@/types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'TeacherDemoTest'>;

const DEMO_CODE = '482 615';
const QUESTIONS = ['Hello', 'Thank you', 'Water', 'Friend', 'Apple'];
/** Боты: имя и вероятность верного ответа — один сильный, один средний, один слабее */
const BOTS = [
  { name: 'Айгерим', skill: 0.95 },
  { name: 'Тимур', skill: 0.75 },
  { name: 'Соня', skill: 0.55 },
];
const JOIN_MS = 800;
const ANSWER_MS = 900;

type Phase = 'lobby' | 'live' | 'results';

interface BotState {
  joined: boolean;
  /** true/false по вопросам — верно ли ответил */
  answers: boolean[];
}

function initials(name: string) {
  return name.slice(0, 1).toUpperCase();
}

export function TeacherDemoTestScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const [phase, setPhase] = useState<Phase>('lobby');
  const [bots, setBots] = useState<BotState[]>(BOTS.map(() => ({ joined: false, answers: [] })));
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    Analytics.teacherDemoStarted();
    BOTS.forEach((_, i) => {
      timers.current.push(
        setTimeout(
          () => {
            setBots((prev) => prev.map((b, k) => (k === i ? { ...b, joined: true } : b)));
          },
          JOIN_MS * (i + 1)
        )
      );
    });
    const all = timers.current;
    return () => all.forEach(clearTimeout);
  }, []);

  // Ход теста: раз в ~0,9 с случайный бот отвечает на свой следующий вопрос
  useEffect(() => {
    if (phase !== 'live') return;
    const tick = setInterval(() => {
      setBots((prev) => {
        const waiting = prev
          .map((b, i) => ({ b, i }))
          .filter(({ b }) => b.answers.length < QUESTIONS.length);
        if (waiting.length === 0) return prev;
        const { i } = waiting[Math.floor(Math.random() * waiting.length)];
        return prev.map((b, k) =>
          k === i ? { ...b, answers: [...b.answers, Math.random() < BOTS[k].skill] } : b
        );
      });
    }, ANSWER_MS);
    return () => clearInterval(tick);
  }, [phase]);

  const allDone = bots.every((b) => b.answers.length === QUESTIONS.length);
  useEffect(() => {
    if (phase !== 'live' || !allDone) return undefined;
    const t = setTimeout(() => setPhase('results'), 700);
    return () => clearTimeout(t);
  }, [phase, allDone]);

  const joined = bots.filter((b) => b.joined).length;
  const ranking = useMemo(
    () =>
      BOTS.map((bot, i) => ({
        name: bot.name,
        correct: bots[i].answers.filter(Boolean).length,
      })).sort((a, b) => b.correct - a.correct),
    [bots]
  );
  const hardest = useMemo(() => {
    let worst = { word: QUESTIONS[0], wrong: -1 };
    QUESTIONS.forEach((word, q) => {
      const wrong = bots.filter((b) => b.answers[q] === false).length;
      if (wrong > worst.wrong) worst = { word, wrong };
    });
    return worst;
  }, [bots]);

  const finish = () => {
    markTeacherTask('demo');
    Analytics.teacherDemoFinished();
    navigation.goBack();
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Демо теста" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.note, { backgroundColor: colors.surfaceVariant }]}>
          <Info size={iconSize.s} color={colors.primary} />
          <Text variant="bodySmall" style={[styles.flex, { color: colors.textSecondary }]}>
            Это демо: ученики — боты, ничего не сохраняется. На уроке так же, только с настоящими
            учениками.
          </Text>
        </View>

        {phase === 'lobby' && (
          <>
            <View style={[styles.codeBox, { borderColor: colors.primary }]}>
              <Text variant="overline" style={{ color: colors.textSecondary }}>
                Код теста
              </Text>
              <Text variant="display" style={[styles.code, { color: colors.textPrimary }]}>
                {DEMO_CODE}
              </Text>
              <Text variant="bodySmall" align="center" style={{ color: colors.textSecondary }}>
                Ученики вводят код на своих телефонах — и сразу появляются здесь
              </Text>
            </View>
            <Text variant="overline" style={{ color: colors.textSecondary }}>
              Подключились: {joined} из {BOTS.length}
            </Text>
            {BOTS.map((bot, i) => (
              <View
                key={bot.name}
                style={[
                  styles.row,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  !bots[i].joined && styles.waiting,
                ]}
              >
                <View style={[styles.avatar, { backgroundColor: alpha(colors.primary, 10) }]}>
                  <Text variant="label" style={{ color: colors.primary }}>
                    {initials(bot.name)}
                  </Text>
                </View>
                <Text variant="body" style={[styles.flex, { color: colors.textPrimary }]}>
                  {bot.name}
                </Text>
                {bots[i].joined ? (
                  <UserCheck size={iconSize.s} color={colors.successText} />
                ) : (
                  <Text variant="caption" style={{ color: colors.textTertiary }}>
                    подключается…
                  </Text>
                )}
              </View>
            ))}
          </>
        )}

        {phase === 'live' && (
          <>
            <Text variant="h3" style={{ color: colors.textPrimary }}>
              Тест идёт · {QUESTIONS.length} вопросов
            </Text>
            {BOTS.map((bot, i) => {
              const a = bots[i].answers;
              const correct = a.filter(Boolean).length;
              const done = a.length === QUESTIONS.length;
              return (
                <View
                  key={bot.name}
                  style={[
                    styles.liveRow,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.liveHead}>
                    <Text
                      variant="body"
                      style={[styles.flex, styles.bold, { color: colors.textPrimary }]}
                    >
                      {bot.name}
                    </Text>
                    {done ? <Badge label="Готово" tone="success" icon={Check} /> : null}
                    <Text variant="caption" style={{ color: colors.textSecondary }}>
                      {a.length}/{QUESTIONS.length} · верно {correct}
                    </Text>
                  </View>
                  <ProgressBar
                    progress={(a.length / QUESTIONS.length) * 100}
                    accessibilityLabel={`${bot.name}: ${a.length} из ${QUESTIONS.length}`}
                  />
                </View>
              );
            })}
          </>
        )}

        {phase === 'results' && (
          <>
            <View style={styles.resultsHead}>
              <Trophy size={iconSize.l} color={colors.warning} />
              <Text variant="h2" style={{ color: colors.textPrimary }}>
                Итоги теста
              </Text>
            </View>
            {ranking.map((r, place) => (
              <View
                key={r.name}
                style={[
                  styles.row,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <Text variant="label" style={[styles.place, { color: colors.textSecondary }]}>
                  {place + 1}
                </Text>
                <Text variant="body" style={[styles.flex, { color: colors.textPrimary }]}>
                  {r.name}
                </Text>
                <Text variant="body" style={[styles.bold, { color: colors.textPrimary }]}>
                  {r.correct} из {QUESTIONS.length}
                </Text>
              </View>
            ))}
            {hardest.wrong > 0 ? (
              <View style={[styles.note, { backgroundColor: alpha(colors.warning, 10) }]}>
                <Text variant="bodySmall" style={{ color: colors.textPrimary }}>
                  Самое трудное слово — «{hardest.word}»: ошиблись {hardest.wrong} из {BOTS.length}{' '}
                  {pluralize(BOTS.length, 'ученика', 'учеников', 'учеников')}. Его стоит повторить
                  на уроке.
                </Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <BottomBar>
        {phase === 'lobby' ? (
          <Button
            title={joined < BOTS.length ? 'Ждём учеников…' : 'Начать тест'}
            disabled={joined < BOTS.length}
            onPress={() => setPhase('live')}
            fullWidth
          />
        ) : phase === 'live' ? (
          <Button title="Идёт тест…" disabled fullWidth onPress={() => {}} />
        ) : (
          <Button title="Понятно" onPress={finish} fullWidth />
        )}
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: screenPadding, paddingBottom: spacing.xl, gap: spacing.s },
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  note: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'flex-start',
    borderRadius: borderRadius.m,
    padding: spacing.s,
  },
  codeBox: {
    alignItems: 'center',
    gap: spacing.xxs,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: borderRadius.l,
    padding: spacing.l,
    marginVertical: spacing.s,
  },
  code: { fontVariant: ['tabular-nums'], letterSpacing: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    padding: spacing.s,
  },
  waiting: { opacity: 0.5 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveRow: { borderWidth: 1, borderRadius: borderRadius.m, padding: spacing.s, gap: spacing.xs },
  liveHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  resultsHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, marginTop: spacing.s },
  place: { width: 20, textAlign: 'center' },
});
