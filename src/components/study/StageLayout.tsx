/**
 * StageLayout
 * @description Общий скелет режима тренировки (plan/new/study_session.md, решение 19):
 * шапка → подпись задания → содержимое режима → нижняя панель. Один и тот же в сессии «Изучить»
 * и в свободной практике, отличается только шапка:
 * - сессия: × · полоски этапов · «+N опыта»; перед этапом — экран «Этап 2 из 6», выход — через окно;
 * - практика: × · одна полоса · «7 из 20», выход сразу.
 */
import React, { memo, useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Check, X } from 'lucide-react-native';
import { useSettingsStore, useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button, Dialog, ProgressBar, useScreenBottomInset } from '@/components/ui';
import { alpha, borderRadius, heights, iconSize, screenPadding, spacing } from '@/constants';
import { pluralize } from '@/utils';
import type { SessionRouteParams, SessionStage } from '@/types/navigation';

export const SESSION_STAGE_INFO: Record<SessionStage, { title: string; subtitle: string }> = {
  cards: { title: 'Карточки', subtitle: 'Переверни карточку и честно оцени себя' },
  pairs: { title: 'Пары', subtitle: 'Найди перевод для каждого слова' },
  test: { title: 'Тест', subtitle: 'Выбери правильный перевод' },
  listen: { title: 'На слух', subtitle: 'Послушай слово и выбери его' },
  context: { title: 'Слово в контексте', subtitle: 'Вставь слово в предложение' },
  build: { title: 'Собери слово', subtitle: 'Собери слово из букв' },
};

/** Сколько показывается экран «Этап N из M», если не нажать «Начать» */
const INTRO_MS = 1500;

interface Props {
  /** Есть — экран открыт из сессии набора */
  session?: SessionRouteParams;
  /** Сколько заданий текущего этапа (порции) сделано и сколько всего */
  progress: { done: number; total: number };
  /** Подпись задания над содержимым: «Как переводится?» */
  task?: string;
  /** Действие справа от подписи задания: «Не могу слушать» */
  taskAction?: React.ReactNode;
  /** Выйти из режима. В сессии вызывается только после подтверждения в окне */
  onExit: () => void;
  /** Начало этапа сессии — показать «Этап N из M» */
  showIntro?: boolean;
  /** Экран «Этап N из M» ушёл (или его не было): можно, например, начать озвучку */
  onIntroDone?: () => void;
  /** Нижняя панель: ответ (AnswerPanel) или действие режима */
  footer?: React.ReactNode;
  /** false — без прокрутки: свайп карточки не спорит с прокруткой, содержимое растягивается на экран */
  scroll?: boolean;
  children: React.ReactNode;
}

export const StageLayout = memo(function StageLayout({
  session,
  progress,
  task,
  taskAction,
  onExit,
  showIntro = false,
  onIntroDone,
  footer,
  scroll = true,
  children,
}: Props) {
  const colors = useThemeColors();
  const navigation = useNavigation();
  const bottomInset = useScreenBottomInset();
  const [introVisible, setIntroVisible] = useState(!!session && showIntro);
  const [confirmExit, setConfirmExit] = useState(false);

  // Опыт за сессию: 1 ответ = 1 очко (src/utils/level.ts), счётчик дня минус снимок на старте
  const studiedToday = useSettingsStore((s) => s.todayStats.cardsStudied);
  const xp = session ? Math.max(0, studiedToday - (session.xpBase ?? studiedToday)) : 0;

  const requestExit = useCallback(() => {
    if (session) setConfirmExit(true);
    else onExit();
  }, [session, onExit]);

  // В сессии свайп назад и системная «Назад» тоже спрашивают, а не выходят молча
  useLayoutEffect(() => {
    if (session) navigation.setOptions({ gestureEnabled: false });
  }, [navigation, session]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      requestExit();
      return true;
    });
    return () => sub.remove();
  }, [requestExit]);

  useEffect(() => {
    if (!introVisible) {
      onIntroDone?.();
      return;
    }
    const timer = setTimeout(() => setIntroVisible(false), INTRO_MS);
    return () => clearTimeout(timer);
  }, [introVisible]);

  const taskRow =
    task || taskAction ? (
      <View style={styles.taskRow}>
        <Text variant="overline" style={[styles.flex1, { color: colors.textSecondary }]}>
          {task}
        </Text>
        {taskAction}
      </View>
    ) : null;

  const fraction = progress.total > 0 ? Math.min(1, progress.done / progress.total) : 0;
  const stagesLeft = session ? session.stages.length - session.index : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Button
          variant="icon"
          icon={X}
          iconSize={iconSize.s}
          iconColor={colors.textSecondary}
          accessibilityLabel={session ? 'Выйти из сессии' : 'Закрыть'}
          onPress={requestExit}
        />
        {session ? (
          <View
            style={styles.segments}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`Этап ${session.index + 1} из ${session.stages.length}`}
          >
            {session.stages.map((s, i) => (
              <View key={`${s.stage}-${i}`} style={[styles.segment, { backgroundColor: colors.surfaceMuted }]}>
                <View
                  style={[
                    styles.segmentFill,
                    {
                      backgroundColor: colors.primaryFill,
                      width: `${i < session.index ? 100 : i === session.index ? Math.round(fraction * 100) : 0}%`,
                    },
                  ]}
                />
              </View>
            ))}
          </View>
        ) : (
          <ProgressBar progress={Math.round(fraction * 100)} accessibilityLabel="Прогресс" style={styles.flex1} />
        )}
        {session ? (
          <Text variant="label" style={[styles.counter, { color: colors.warningText }]} accessibilityLabel={`Плюс ${xp} опыта`}>
            +{xp} опыта
          </Text>
        ) : (
          <Text variant="label" style={[styles.counter, { color: colors.textSecondary }]}>
            {progress.done} из {progress.total}
          </Text>
        )}
      </View>

      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {taskRow}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.flex1]}>
          {taskRow}
          {children}
        </View>
      )}

      {footer ? (
        <View style={[styles.footer, { paddingBottom: Math.max(bottomInset, spacing.m) }]}>{footer}</View>
      ) : null}

      {introVisible && session ? (
        <StageIntro session={session} onStart={() => setIntroVisible(false)} bottomInset={bottomInset} />
      ) : null}

      <Dialog
        visible={confirmExit}
        onClose={() => setConfirmExit(false)}
        title="Выйти из сессии?"
        footer={
          <View style={styles.dialogButtons}>
            <Button
              variant="secondary"
              title="Выйти"
              style={styles.flex1}
              onPress={() => {
                setConfirmExit(false);
                onExit();
              }}
            />
            <Button title="Продолжить" style={styles.flex1} onPress={() => setConfirmExit(false)} />
          </View>
        }
      >
        <Text variant="body" style={{ color: colors.textSecondary }}>
          {stagesLeft > 1
            ? `Осталось ${stagesLeft} ${pluralize(stagesLeft, 'этап', 'этапа', 'этапов')}. `
            : 'Остался последний этап. '}
          Если выйти сейчас, эту сессию продолжить не получится.
        </Text>
      </Dialog>
    </View>
  );
});

/** Экран «Этап 2 из 6 · Пары» перед этапом: сам уходит через INTRO_MS */
function StageIntro({
  session,
  onStart,
  bottomInset,
}: {
  session: SessionRouteParams;
  onStart: () => void;
  bottomInset: number;
}) {
  const colors = useThemeColors();
  const current = session.stages[session.index];
  const info = current ? SESSION_STAGE_INFO[current.stage] : null;
  if (!info) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.intro, { backgroundColor: colors.background, paddingBottom: Math.max(bottomInset, spacing.m) }]}>
      <View style={styles.introBody} accessibilityLiveRegion="polite">
        <Text variant="overline" style={{ color: colors.primary }}>
          Этап {session.index + 1} из {session.stages.length}
        </Text>
        <Text variant="h1" accessibilityRole="header" style={{ color: colors.textPrimary }}>
          {info.title}
        </Text>
        <Text variant="bodyLarge" style={{ color: colors.textSecondary }}>
          {info.subtitle}
        </Text>
        <View style={styles.route}>
          {session.stages.map((s, i) => {
            const state = i < session.index ? 'done' : i === session.index ? 'current' : 'next';
            const tint = state === 'current' ? colors.primary : state === 'done' ? colors.successText : colors.textSecondary;
            return (
              <View
                key={`${s.stage}-${i}`}
                style={[
                  styles.routeChip,
                  {
                    borderColor: state === 'next' ? colors.border : tint,
                    backgroundColor: state === 'current' ? alpha(colors.primary, 10) : 'transparent',
                  },
                ]}
              >
                <Text variant="caption" style={[styles.semibold, { color: tint }]}>
                  {SESSION_STAGE_INFO[s.stage].title}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
      <Button title="Начать" fullWidth onPress={onStart} />
    </View>
  );
}

interface AnswerPanelProps {
  correct: boolean;
  /** Правильный ответ — показывается после ошибки */
  answer?: string;
  /** Подсказка после ошибки: слово, перевод и пример (карточка вместо отдельного этапа) */
  hint?: { front: string; back: string; example?: string };
  onNext: () => void;
}

/** Нижняя панель ответа — одинаковая во всех режимах */
export const AnswerPanel = memo(function AnswerPanel({ correct, answer, hint, onNext }: AnswerPanelProps) {
  const colors = useThemeColors();
  const tone = correct ? colors.success : colors.error;
  const toneText = correct ? colors.successText : colors.errorText;
  const Icon = correct ? Check : X;

  return (
    <View style={[styles.panel, { backgroundColor: alpha(tone, 10) }]} accessibilityLiveRegion="polite">
      <View style={styles.panelTitle}>
        <Icon size={iconSize.s} color={toneText} strokeWidth={3} />
        <Text variant="h3" style={{ color: toneText }}>
          {correct ? 'Верно!' : 'Не совсем'}
        </Text>
      </View>
      {!correct && answer ? (
        <Text variant="body" style={{ color: colors.textPrimary }}>
          Правильно: <Text variant="body" style={styles.semibold}>{answer}</Text>
        </Text>
      ) : null}
      {!correct && hint ? (
        <View style={[styles.hint, { backgroundColor: colors.surface }]}>
          <Text variant="body" style={[styles.semibold, { color: colors.textPrimary }]}>
            {hint.front} — {hint.back}
          </Text>
          {hint.example ? (
            <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
              {hint.example}
            </Text>
          ) : null}
        </View>
      ) : null}
      <Button title={correct ? 'Дальше' : 'Понятно'} fullWidth onPress={onNext} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex1: {
    flex: 1,
  },
  semibold: {
    fontWeight: '600',
  },
  header: {
    height: heights.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenPadding,
    gap: spacing.s,
  },
  segments: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xxs,
  },
  segment: {
    flex: 1,
    height: 8,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  segmentFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  counter: {
    fontVariant: ['tabular-nums'],
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  content: {
    flexGrow: 1,
    gap: spacing.m,
    paddingHorizontal: screenPadding,
    paddingTop: spacing.xs,
    paddingBottom: spacing.l,
  },
  footer: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.s,
  },
  intro: {
    paddingHorizontal: screenPadding,
    justifyContent: 'space-between',
  },
  introBody: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.s,
  },
  route: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.m,
  },
  routeChip: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xxs,
  },
  panel: {
    borderRadius: borderRadius.l,
    padding: spacing.m,
    gap: spacing.s,
  },
  panelTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  hint: {
    borderRadius: borderRadius.m,
    padding: spacing.s,
    gap: spacing.xxs,
  },
  dialogButtons: {
    flexDirection: 'row',
    gap: spacing.s,
  },
});
