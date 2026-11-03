/**
 * SessionSummary
 * @description Итоги сессии набора «Изучить» (plan/new/session_results.md, макет «Итоги сессии — вариант А»):
 * картинка, заголовок по результату, три плитки (опыт · точность · время), строка со словами сессии —
 * список в шторке, одна кнопка. «Продолжить» — следующая сессия по тому же плану, что и шторка
 * (слабые слова в ней идут первыми сами). Учить нечего — «Готово».
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { ChevronRight, Clock, Target, X, Zap } from 'lucide-react-native';
import { useCardsStore, useSettingsStore, useThemeColors } from '@/store';
import { StreakCelebration, Text } from '@/components/common';
import { Badge, Button, Sheet, useScreenBottomInset } from '@/components/ui';
import type { IconComponent } from '@/components/ui';
import { alpha, borderRadius, heights, iconSize, screenPadding, spacing } from '@/constants';
import { pluralize } from '@/utils';
import { Analytics } from '@/services/analytics';
import { isSessionWordWeak, sessionCardIds } from '@/services/lessonFlow';
import type { RootStackParamList, SessionRouteParams } from '@/types/navigation';
import type { Card } from '@/types';
import { currentSetSessionPlan, startSetSession } from './setSession';
import { SessionSummaryArt } from './SessionSummaryArt';
import { useSummaryChoreography, type TileMotion } from './useSummaryChoreography';

const words = (n: number) => `${n} ${pluralize(n, 'слово', 'слова', 'слов')}`;
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

// Ниже этой высоты экрана (iPhone SE — 667) картинка и промежутки меньше, чтобы всё влезло без прокрутки
const COMPACT_HEIGHT = 700;

export function SessionSummary({ session, streakCount }: { session: SessionRouteParams; streakCount?: number }) {
  const colors = useThemeColors();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const bottomInset = useScreenBottomInset();
  const { height } = useWindowDimensions();
  const compact = height < COMPACT_HEIGHT;
  const cardsMap = useCardsStore((s) => s.cards);
  const todayStats = useSettingsStore((s) => s.todayStats);
  const [wordsOpen, setWordsOpen] = useState(false);
  const [streakVisible, setStreakVisible] = useState(false);
  // Переход, который ждёт закрытия празднования серии
  const afterStreakRef = useRef<(() => void) | null>(null);

  // Считаем один раз — на момент окончания сессии
  const { list, weakIds, info, xp, seconds } = useMemo(() => {
    const now = Date.now();
    const cards = sessionCardIds(session).map((id) => cardsMap[id]).filter((c): c is Card => !!c);
    const weak = new Set(cards.filter((c) => isSessionWordWeak(c, now)).map((c) => c.id));
    return {
      // В шторке слабые слова первыми — с них начнётся следующая сессия
      list: [...cards.filter((c) => weak.has(c.id)), ...cards.filter((c) => !weak.has(c.id))],
      weakIds: weak,
      info: currentSetSessionPlan(session.setId, now),
      xp: Math.max(0, todayStats.cardsStudied - (session.xpBase ?? todayStats.cardsStudied)),
      seconds: Math.max(1, Math.round((now - session.startedAt) / 1000)),
    };
  }, []);

  useEffect(() => {
    Analytics.setSessionCompleted({
      words: list.length,
      weak: weakIds.size,
      stages: session.stages.length,
      durationSec: seconds,
      xp,
    });
  }, []);

  const weak = weakIds.size;
  // Точность — доля уверенных слов сессии (решение 3): счётчика «с первой попытки» этапы не передают
  const accuracy = list.length > 0 ? Math.round(((list.length - weak) / list.length) * 100) : 100;
  // Плитки считают от нуля по очереди со звуком и вибрацией; кнопки работают сразу и обрывают анимацию
  const motion = useSummaryChoreography([xp, accuracy, seconds]);
  const heroStyle = useAnimatedStyle(() => ({
    opacity: motion.heroOpacity.value,
    transform: [{ scale: motion.heroScale.value }],
  }));
  const tailStyle = useAnimatedStyle(() => ({ opacity: motion.tailOpacity.value }));

  const plan = info?.plan;
  const canContinue = !!plan && (plan.mode === 'review' || plan.mode === 'learn' || plan.mode === 'more');
  const goToSet = () => navigation.navigate('SetDetail', { setId: session.setId });
  // Серия выросла — празднуем после итогов, по нажатию кнопки, и уже потом уходим с экрана (решение 14)
  const leave = (go: () => void) => {
    motion.stop();
    if (streakCount && !afterStreakRef.current) {
      afterStreakRef.current = go;
      setStreakVisible(true);
      return;
    }
    go();
  };
  const toSet = () => leave(goToSet);
  const handleContinue = () =>
    leave(() => {
      if (!plan || !startSetSession(navigation, session.setId, plan, 'replace')) goToSet();
    });
  const handleStreakClose = () => {
    setStreakVisible(false);
    afterStreakRef.current?.();
  };

  const title = !canContinue ? 'На сегодня всё!' : weak === 0 ? 'Без ошибок!' : 'Хорошая работа!';
  const subtitle = !canContinue
    ? 'План по набору выполнен'
    : weak === 0
      ? `Все ${words(list.length)} — уверенно`
      : 'Ещё одна сессия — и эти слова твои';

  const [xpShown, accuracyShown, secondsShown] = motion.values;
  const stats: StatTileProps[] = [
    { icon: Zap, value: `+${xpShown}`, final: `+${xp}`, label: 'опыта', fg: colors.warningText, tint: colors.warning, motion: motion.tiles[0] },
    { icon: Target, value: `${accuracyShown}%`, final: `${accuracy}%`, label: 'точность', fg: colors.successText, tint: colors.success, motion: motion.tiles[1] },
    { icon: Clock, value: mmss(secondsShown), final: mmss(seconds), label: 'время', fg: colors.primary, tint: colors.primary, motion: motion.tiles[2] },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + spacing.xs }]}>
      <View style={styles.top}>
        {canContinue ? (
          <Button variant="icon" icon={X} accessibilityLabel="К набору" onPress={toSet} />
        ) : null}
      </View>

      <View style={[styles.center, { gap: compact ? spacing.l : spacing.xl }]}>
        <Animated.View style={heroStyle}>
          <SessionSummaryArt kind={canContinue ? 'check' : 'star'} width={compact ? 150 : 200} />
        </Animated.View>

        <View style={styles.titles}>
          <Text variant="h1" align="center" accessibilityRole="header" style={{ color: colors.textPrimary }}>
            {title}
          </Text>
          <Text variant="bodyLarge" align="center" style={{ color: colors.textSecondary }}>
            {subtitle}
          </Text>
        </View>

        <View style={styles.stats}>
          {stats.map((s) => (
            <StatTile key={s.label} {...s} />
          ))}
        </View>

        <Animated.View style={tailStyle}>
          <Pressable
            onPress={() => setWordsOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={weak > 0 ? `${words(weak)} на повторение. Показать слова сессии` : 'Показать слова сессии'}
            style={({ pressed }) => [styles.wordsLink, { backgroundColor: colors.surfaceMuted }, pressed && styles.pressed]}
          >
            <View style={[styles.dot, { backgroundColor: weak > 0 ? colors.warning : colors.success }]} />
            <Text variant="label" style={{ color: colors.textPrimary }}>
              {weak > 0 ? `${words(weak)} на повторение` : 'Слова сессии'}
            </Text>
            <ChevronRight size={iconSize.xs} color={colors.textSecondary} strokeWidth={2.4} />
          </Pressable>
        </Animated.View>
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(bottomInset, spacing.m) }]}>
        {canContinue ? (
          <Button title="Продолжить" fullWidth onPress={handleContinue} />
        ) : (
          <Button title="Готово" fullWidth onPress={toSet} />
        )}
      </View>

      <Sheet
        visible={wordsOpen}
        onClose={() => setWordsOpen(false)}
        title="Слова сессии"
        headerRight={
          <Button
            variant="icon"
            icon={X}
            background="none"
            accessibilityLabel="Закрыть"
            onPress={() => setWordsOpen(false)}
          />
        }
        footer={<Button title="Понятно" variant="secondary" fullWidth onPress={() => setWordsOpen(false)} />}
      >
        {weak > 0 ? (
          <Text variant="bodySmall" style={[styles.sheetLead, { color: colors.textSecondary }]}>
            {`${weak} ${pluralize(weak, 'пойдёт', 'пойдут', 'пойдут')} первыми в следующей сессии`}
          </Text>
        ) : null}
        {list.map((card, i) => (
          <View
            key={card.id}
            style={[styles.wordRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
          >
            <View style={styles.wordText}>
              <Text variant="body" numberOfLines={2} style={[styles.semibold, { color: colors.textPrimary }]}>
                {card.frontText}
              </Text>
              <Text variant="bodySmall" numberOfLines={2} style={{ color: colors.textSecondary }}>
                {card.backText}
              </Text>
            </View>
            {weakIds.has(card.id) ? <Badge label="Повторить" tone="warning" /> : <Badge label="Уверенно" tone="success" />}
          </View>
        ))}
      </Sheet>

      <StreakCelebration visible={streakVisible} streakCount={streakCount ?? 0} onClose={handleStreakClose} />
    </View>
  );
}

interface StatTileProps {
  icon: IconComponent;
  /** Число, которое сейчас на экране (идёт счёт) */
  value: string;
  /** Итоговое число — для VoiceOver */
  final: string;
  label: string;
  fg: string;
  tint: string;
  motion: TileMotion;
}

function StatTile({ icon: Icon, value, final, label, fg, tint, motion }: StatTileProps) {
  const colors = useThemeColors();
  const style = useAnimatedStyle(() => ({
    opacity: motion.opacity.value,
    transform: [{ scale: motion.scale.value }],
  }));
  return (
    <Animated.View
      accessible
      accessibilityLabel={`${label}: ${final}`}
      style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }, style]}
    >
      <View style={[styles.statIcon, { backgroundColor: alpha(tint, 20) }]}>
        <Icon size={iconSize.s} color={fg} strokeWidth={2.2} />
      </View>
      <Text variant="h2" style={[styles.tabular, { color: fg }]}>
        {value}
      </Text>
      <Text variant="caption" style={{ color: colors.textSecondary }}>
        {label}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  semibold: {
    fontWeight: '600',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  pressed: {
    opacity: 0.7,
  },
  top: {
    height: heights.touch,
    paddingHorizontal: screenPadding,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenPadding,
  },
  titles: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  stats: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xxs,
    paddingTop: spacing.m,
    paddingBottom: spacing.s,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.l,
    borderWidth: 1,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxs,
  },
  wordsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: heights.touch,
    paddingHorizontal: spacing.m,
    borderRadius: borderRadius.full,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
  },
  footer: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.s,
  },
  sheetLead: {
    marginTop: -spacing.xs,
    marginBottom: spacing.s,
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    minHeight: heights.listRow,
    paddingVertical: spacing.xs,
  },
  wordText: {
    flex: 1,
    gap: spacing.xxs,
  },
});
