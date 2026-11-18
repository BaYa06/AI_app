/**
 * Экзамен ученика, движок 2 (plan/new/live_exam.md, LiveExam 11–12, 15–17).
 *
 * Все экраны приходят сразу (exam-state) в порядке этого ученика, без правильных ответов.
 * Сверху — карта вопросов (жёлтый — текущий, фиолетовый — отвечен) и общий таймер (красный
 * ≤ 3 мин). Можно ходить назад и пропускать, ответ меняется до сдачи. Ответы уходят на сервер
 * сразу; без сети копятся в очереди и досылаются. Срок считает сервер: здесь только показ.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { useKeepAwake } from '@sayem314/react-native-keep-awake';
import {
  CheckCircle2,
  Clock,
  LogOut,
  Maximize2,
  PauseCircle,
  ShieldCheck,
} from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text } from '@/components/common';
import {
  Button,
  Card,
  ErrorState,
  Screen,
  SkeletonCard,
  confirmDialog,
  toast,
} from '@/components/ui';
import { useThemeColors } from '@/store';
import { spacing, screenPadding, iconSize } from '@/constants';
import type { RootStackParamList } from '@/types/navigation';
import { useExamExitGuard, type ExamAttemptSummary } from '@/hooks/useExamExitGuard';
import { createChannel, removeChannel } from '@/services/realtime';
import { ExamApi, type ExamQuestion, type ExamState, type MatchQuestion } from '@/services/exam';
import { log } from '@/utils/logger';
import { QuestionMap, type MapCell } from './exam/QuestionMap';
import { ExamTimer } from './exam/ExamTimer';
import {
  ChoiceQuestion,
  GapQuestion,
  MatchBlock,
  ScrambleQuestion,
  WriteQuestion,
} from './exam/ExamFormats';

type Props = NativeStackScreenProps<RootStackParamList, 'ExamTake'>;
type Phase = 'loading' | 'error' | 'exam' | 'submitted' | 'left' | 'finished';

const RETRY_MS = 4000;

export function ExamTakeScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const { sessionId, participantId, exitControl, setTitle } = route.params;
  useKeepAwake();

  const [phase, setPhase] = useState<Phase>('loading');
  const [state, setState] = useState<ExamState | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [released, setReleased] = useState(false);
  const [offline, setOffline] = useState(false);

  const offsetRef = useRef(0); // серверное время − локальное
  const pendingRef = useRef(new Map<string, string>());
  const flushingRef = useRef(false);
  const doneRef = useRef(false);
  const screenStartRef = useRef(Date.now());

  // ─── Загрузка состояния ───
  const load = useCallback(async () => {
    const res = await ExamApi.state(participantId);
    if (!res.ok) {
      if (res.status === 409 && (res.data as any)?.left) {
        doneRef.current = true;
        setPhase('left');
        return;
      }
      setPhase((p) => (p === 'loading' ? 'error' : p));
      return;
    }
    const s = res.data;
    offsetRef.current = new Date(s.serverNow).getTime() - Date.now();
    setState(s);
    // Неотправленные ответы (очередь) важнее сохранённых на сервере
    setAnswers((prev) => {
      const merged = { ...s.answers };
      for (const [id, v] of pendingRef.current) merged[id] = prev[id] ?? v;
      return merged;
    });
    if (s.left) {
      doneRef.current = true;
      setPhase('left');
    } else if (s.finished || s.submitted) {
      doneRef.current = true;
      setPhase(s.status === 'finished' && !s.submitted ? 'finished' : 'submitted');
    } else {
      setPhase('exam');
    }
  }, [participantId]);

  useEffect(() => {
    load();
  }, [load]);

  // ─── Отправка ответов: сразу, без сети — очередь с повтором ───
  const flush = useCallback(async (): Promise<boolean> => {
    if (flushingRef.current) return false;
    flushingRef.current = true;
    try {
      for (const [itemId, value] of [...pendingRef.current.entries()]) {
        const spent = Math.round((Date.now() - screenStartRef.current) / 1000);
        const res = await ExamApi.answer(participantId, itemId, value, spent);
        if (res.ok) {
          if (pendingRef.current.get(itemId) === value) pendingRef.current.delete(itemId);
          continue;
        }
        if (res.status === 0) {
          setOffline(true);
          return false;
        }
        const d = res.data as any;
        pendingRef.current.delete(itemId);
        if (res.status === 409 && d?.left) {
          doneRef.current = true;
          setPhase('left');
          return false;
        }
        if (res.status === 409 && (d?.deadline || d?.submitted)) {
          pendingRef.current.clear();
          await load();
          return false;
        }
        if (res.status === 409 && d?.paused) {
          pendingRef.current.set(itemId, value);
          await load();
          return false;
        }
        log.warn('ExamTake', 'answer rejected', res.status, d?.error);
      }
      setOffline(false);
      return true;
    } finally {
      flushingRef.current = false;
    }
  }, [participantId, load]);

  useEffect(() => {
    if (!offline) return;
    const t = setInterval(() => flush(), RETRY_MS);
    return () => clearInterval(t);
  }, [offline, flush]);

  const setAnswer = useCallback(
    (itemId: string, value: string, sendNow = true) => {
      if (doneRef.current) return;
      setAnswers((a) => ({ ...a, [itemId]: value }));
      pendingRef.current.set(itemId, value);
      if (sendNow) flush();
    },
    [flush]
  );

  // ─── Таймер ───
  useEffect(() => {
    if (phase !== 'exam') return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [phase]);

  const remainingSec = useMemo(() => {
    if (!state?.deadline) return null;
    if (state.paused) return state.remainingSec;
    return Math.max(
      0,
      Math.round((new Date(state.deadline).getTime() - (now + offsetRef.current)) / 1000)
    );
  }, [state, now]);

  // ─── Сдача ───
  const submit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await flush();
      const res = await ExamApi.submit(participantId);
      if (!res.ok && res.status === 0) {
        toast.error('Нет соединения. Ответы сохранены — сдай, когда появится интернет.');
        return;
      }
      doneRef.current = true;
      setReleased(Boolean(res.data?.released));
      setPhase('submitted');
    } finally {
      setSubmitting(false);
    }
  }, [submitting, flush, participantId]);

  // Время вышло — сдаём сами (сервер всё равно не примет ответы после срока)
  const autoSubmittedRef = useRef(false);
  useEffect(() => {
    if (phase === 'exam' && remainingSec === 0 && !state?.paused && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      toast.info('Время вышло — экзамен сдан');
      submit();
    }
  }, [phase, remainingSec, state?.paused, submit]);

  // ─── Realtime: пауза, +время, учитель завершил, результаты открыты ───
  useEffect(() => {
    const channel = createChannel(`test:${sessionId}:exam`);
    channel
      .on('broadcast', { event: 'test_finished' }, async () => {
        await flush();
        doneRef.current = true;
        setPhase((p) => (p === 'exam' ? 'finished' : p));
      })
      .on('broadcast', { event: 'exam_paused' }, () => load())
      .on('broadcast', { event: 'exam_time' }, () => load())
      .on('broadcast', { event: 'exam_results_released' }, () => setReleased(true))
      .subscribe();
    return () => {
      removeChannel(channel);
    };
  }, [sessionId, load, flush]);

  // Пауза: время от времени проверяем, не сняли ли её (если событие не дошло)
  useEffect(() => {
    if (!state?.paused || phase !== 'exam') return;
    const t = setInterval(() => load(), 5000);
    return () => clearInterval(t);
  }, [state?.paused, phase, load]);

  // ─── Контроль выхода (как в движке 1) ───
  const onLeft = useCallback((_s: ExamAttemptSummary) => {
    doneRef.current = true;
    setPhase('left');
  }, []);
  const { splitView, checking } = useExamExitGuard({
    participantId,
    enabled: exitControl === true && phase === 'exam',
    onLeft,
  });

  // ─── Уход с экрана: «Сдать экзамен?» ───
  const answeredCount = useMemo(() => {
    if (!state) return 0;
    return Object.values(answers).filter((v) => v && v.trim()).length;
  }, [answers, state]);

  const confirmSubmit = useCallback(async () => {
    if (!state) return;
    const left = state.total - answeredCount;
    const ok = await confirmDialog({
      title: 'Сдать экзамен?',
      message:
        left > 0
          ? `Без ответа ${left} из ${state.total}. Их можно ещё заполнить — после сдачи ответы не изменить.`
          : 'Все ответы заполнены. После сдачи изменить их нельзя.',
      confirmText: 'Сдать',
      cancelText: 'Вернуться',
    });
    if (ok) submit();
  }, [state, answeredCount, submit]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (doneRef.current) return false;
      confirmSubmit();
      return true;
    });
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (doneRef.current) return;
      e.preventDefault();
      confirmSubmit();
    });
    return () => {
      sub.remove();
      unsubscribe();
    };
  }, [navigation, confirmSubmit]);

  // ─── Навигация по экранам ───
  const screens = state?.screens || [];
  const cells: MapCell[] = useMemo(() => {
    const out: MapCell[] = [];
    screens.forEach((sc, si) => {
      if (sc.format === 'match') {
        const mq = sc.questions[0] as MatchQuestion;
        mq.left.forEach((l, i) =>
          out.push({ number: sc.numbers[i], screenIndex: si, answered: Boolean(answers[l.itemId]) })
        );
      } else {
        sc.questions.forEach((q, i) =>
          out.push({
            number: sc.numbers[i],
            screenIndex: si,
            answered: Boolean(answers[(q as ExamQuestion).itemId]?.trim()),
          })
        );
      }
    });
    return out;
  }, [screens, answers]);

  const go = useCallback(
    (index: number) => {
      flush();
      screenStartRef.current = Date.now();
      setCurrent(Math.max(0, Math.min(screens.length - 1, index)));
    },
    [flush, screens.length]
  );

  // ─── Отрисовка ───
  if (phase === 'loading') {
    return (
      <Screen enableSwipeBack={false} contentStyle={styles.content}>
        <SkeletonCard height={60} />
        <SkeletonCard height={140} />
        <SkeletonCard height={220} />
      </Screen>
    );
  }
  if (phase === 'error') {
    return (
      <Screen enableSwipeBack={false} contentStyle={styles.content}>
        <ErrorState
          title="Не удалось открыть экзамен"
          description="Проверь интернет и попробуй ещё раз."
          onRetry={() => {
            setPhase('loading');
            load();
          }}
        />
      </Screen>
    );
  }
  if (phase !== 'exam') {
    const left = phase === 'left';
    const Icon = left ? LogOut : phase === 'finished' ? Clock : CheckCircle2;
    const title = left
      ? 'Экзамен завершён: ты вышел из приложения'
      : phase === 'finished'
        ? 'Учитель завершил экзамен'
        : 'Экзамен сдан';
    const text = left
      ? 'Ответы, которые ты успел дать, сохранены и ушли учителю. Если учитель разрешит продолжить, войди по коду ещё раз.'
      : released
        ? 'Учитель открыл результаты — можно посмотреть балл и ошибки.'
        : 'Ответы сохранены. Результаты откроет учитель — придёт уведомление.';
    return (
      <Screen
        enableSwipeBack={false}
        contentStyle={styles.content}
        footer={
          <View style={styles.footer}>
            {released && !left ? (
              <Button
                title="Мой результат"
                fullWidth
                onPress={() => navigation.replace('ExamResult', { sessionId, setTitle })}
              />
            ) : null}
            <Button
              title="Готово"
              variant={released && !left ? 'secondary' : 'primary'}
              fullWidth
              onPress={() => navigation.goBack()}
            />
          </View>
        }
      >
        <Card style={styles.doneCard}>
          <Icon size={iconSize.xl} color={left ? colors.errorText : colors.successText} />
          <Text variant="h2" accessibilityRole="header" style={styles.center}>
            {title}
          </Text>
          <Text variant="body" style={[styles.center, { color: colors.textSecondary }]}>
            {text}
          </Text>
          {state ? (
            <Text variant="label" style={{ color: colors.textSecondary }}>
              Отвечено: {answeredCount} из {state.total}
            </Text>
          ) : null}
        </Card>
      </Screen>
    );
  }

  const screen = screens[current];
  const isLast = current >= screens.length - 1;
  const numbersLabel = screen
    ? screen.numbers.length > 1
      ? `Вопросы ${screen.numbers[0]}–${screen.numbers[screen.numbers.length - 1]} из ${state?.total}`
      : `Вопрос ${screen.numbers[0]} из ${state?.total}`
    : '';

  return (
    <Screen
      enableSwipeBack={false}
      keyboard
      header={
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text variant="label" style={[styles.tabular, { color: colors.textSecondary }]}>
              {numbersLabel}
            </Text>
            <ExamTimer remainingSec={remainingSec} paused={state?.paused} />
          </View>
          <QuestionMap cells={cells} currentScreen={current} onSelect={go} />
          {exitControl === true ? (
            <View style={styles.inline}>
              <ShieldCheck size={iconSize.xs} color={colors.textSecondary} />
              <Text variant="caption" style={{ color: colors.textSecondary }}>
                Контролируемый режим: не выходи из приложения
              </Text>
            </View>
          ) : null}
          {offline ? (
            <Text variant="caption" style={{ color: colors.warningText }}>
              Нет связи — ответы сохранятся, как только появится интернет
            </Text>
          ) : null}
        </View>
      }
      footer={
        <View style={styles.footerRow}>
          <Button
            title="Назад"
            variant="secondary"
            disabled={current === 0}
            onPress={() => go(current - 1)}
            style={styles.flex}
          />
          {isLast ? (
            <Button
              title="Сдать"
              loading={submitting}
              disabled={checking}
              onPress={confirmSubmit}
              style={styles.flex}
            />
          ) : (
            <Button title="Далее" onPress={() => go(current + 1)} style={styles.flex} />
          )}
        </View>
      }
      contentStyle={styles.content}
    >
      {splitView ? (
        <Card style={styles.doneCard}>
          <Maximize2 size={iconSize.l} color={colors.errorText} />
          <Text variant="h3" accessibilityRole="header" style={styles.center}>
            Разверните приложение на весь экран
          </Text>
          <Text variant="bodySmall" style={[styles.center, { color: colors.textSecondary }]}>
            Во время экзамена нельзя открывать другие приложения рядом. Если не развернуть за 3
            секунды, экзамен завершится.
          </Text>
        </Card>
      ) : state?.paused ? (
        <Card style={styles.doneCard}>
          <PauseCircle size={iconSize.xl} color={colors.primary} />
          <Text variant="h3" accessibilityRole="header" style={styles.center}>
            Учитель поставил экзамен на паузу
          </Text>
          <Text variant="bodySmall" style={[styles.center, { color: colors.textSecondary }]}>
            Время не идёт. Экзамен продолжится сам, когда учитель снимет паузу.
          </Text>
        </Card>
      ) : screen ? (
        <View key={current}>{renderScreen(screen, answers, setAnswer, () => go(current + 1))}</View>
      ) : null}
      <Button
        title="Сдать экзамен"
        variant="quiet"
        onPress={confirmSubmit}
        disabled={submitting}
        style={styles.submitQuiet}
      />
    </Screen>
  );
}

function renderScreen(
  screen: ExamState['screens'][number],
  answers: Record<string, string>,
  setAnswer: (itemId: string, value: string, sendNow?: boolean) => void,
  next: () => void
) {
  if (screen.format === 'match') {
    const q = screen.questions[0] as MatchQuestion;
    return (
      <MatchBlock
        q={q}
        numbers={screen.numbers}
        values={answers}
        onChange={(itemId, v) => setAnswer(itemId, v)}
      />
    );
  }
  return (
    <View style={styles.questions}>
      {screen.questions.map((raw, i) => {
        const q = raw as ExamQuestion;
        const value = answers[q.itemId] || '';
        const number = screen.numbers[i];
        if (screen.format === 'choice') {
          return (
            <ChoiceQuestion
              key={q.itemId}
              q={q}
              number={number}
              value={value}
              onChange={(v) => setAnswer(q.itemId, v)}
            />
          );
        }
        if (screen.format === 'gap') {
          return (
            <GapQuestion
              key={q.itemId}
              q={q}
              number={number}
              value={value}
              onChange={(v) => setAnswer(q.itemId, v)}
            />
          );
        }
        if (screen.format === 'scramble') {
          return (
            <ScrambleQuestion
              key={q.itemId}
              q={q}
              number={number}
              value={value}
              onChange={(v) => setAnswer(q.itemId, v)}
            />
          );
        }
        // Письмо: отправляем при переходе (go → flush), не на каждую букву
        return (
          <WriteQuestion
            key={q.itemId}
            q={q}
            number={number}
            value={value}
            onChange={(v) => setAnswer(q.itemId, v, false)}
            onDone={next}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.xs,
    paddingBottom: spacing.s,
    gap: spacing.s,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tabular: { fontVariant: ['tabular-nums'] },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  content: { paddingTop: spacing.m, gap: spacing.l },
  questions: { gap: spacing.l },
  footer: { gap: spacing.s, paddingHorizontal: screenPadding },
  footerRow: { flexDirection: 'row', gap: spacing.s, paddingHorizontal: screenPadding },
  flex: { flex: 1 },
  doneCard: { alignItems: 'center', gap: spacing.s, paddingVertical: spacing.xl },
  center: { textAlign: 'center' },
  submitQuiet: { alignSelf: 'center' },
});
