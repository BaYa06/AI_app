/**
 * SessionSummary
 * @description Итоги сессии набора «Изучить» (plan/new/study_session.md, решение 14): слова с метками,
 * опыт и уровень, одна главная кнопка «Продолжить» — следующая сессия по тому же плану, что и шторка
 * (слабые слова в ней идут первыми сами). Учить нечего — «Готово».
 */
import React, { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCardsStore, useSettingsStore, useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Badge, Button, ProgressBar, useScreenBottomInset } from '@/components/ui';
import { borderRadius, heights, screenPadding, spacing } from '@/constants';
import { pluralize } from '@/utils';
import { getLevelProgress } from '@/utils/level';
import { cachedUserStats } from '@/services/StreakService';
import { Analytics } from '@/services/analytics';
import { isSessionWordWeak, sessionCardIds } from '@/services/lessonFlow';
import type { SetSessionPlan } from '@/services/LessonService';
import type { RootStackParamList, SessionRouteParams } from '@/types/navigation';
import type { Card } from '@/types';
import { currentSetSessionPlan, startSetSession } from './setSession';

const words = (n: number) => `${n} ${pluralize(n, 'слово', 'слова', 'слов')}`;

/** Что будет по «Продолжить» — подпись под кнопкой */
function nextLine(plan: SetSessionPlan): string {
  const n = plan.cardIds.length;
  if (plan.mode === 'review') return `Дальше: повторить ${words(n)}`;
  if (plan.mode === 'more') return `Дальше: ещё ${words(n)} сверх плана на сегодня`;
  if (plan.newCount < n) return `Дальше: ${plan.newCount} ${pluralize(plan.newCount, 'новое', 'новых', 'новых')} + ${n - plan.newCount} на закрепление`;
  return `Дальше: ${n} ${pluralize(n, 'новое слово', 'новых слова', 'новых слов')}`;
}

export function SessionSummary({ session }: { session: SessionRouteParams }) {
  const colors = useThemeColors();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const bottomInset = useScreenBottomInset();
  const cardsMap = useCardsStore((s) => s.cards);
  const todayStats = useSettingsStore((s) => s.todayStats);

  // Считаем один раз — на момент окончания сессии
  const { list, weakIds, info, xp, seconds, level } = useMemo(() => {
    const now = Date.now();
    const cards = sessionCardIds(session).map((id) => cardsMap[id]).filter((c): c is Card => !!c);
    const weak = new Set(cards.filter((c) => isSessionWordWeak(c, now)).map((c) => c.id));
    // Опыт как в профиле: сумма с сервера + ещё не отправленное за сегодня
    const total = (cachedUserStats()?.total_cards_studied ?? 0) + Math.max(0, todayStats.cardsStudied - todayStats.cardsSynced);
    return {
      list: cards,
      weakIds: weak,
      info: currentSetSessionPlan(session.setId, now),
      xp: Math.max(0, todayStats.cardsStudied - (session.xpBase ?? todayStats.cardsStudied)),
      seconds: Math.max(1, Math.round((now - session.startedAt) / 1000)),
      level: getLevelProgress(total),
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

  const isReview = session.stages[0]?.stage !== 'cards';
  const confident = list.length - weakIds.size;
  const lead =
    weakIds.size > 0
      ? `Уверенно: ${confident} из ${list.length}. ${words(weakIds.size)} — в повторение, они пойдут первыми.`
      : `Все ${words(list.length)} без ошибок. Повторение — по расписанию.`;
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  const plan = info?.plan;
  const canContinue = !!plan && (plan.mode === 'review' || plan.mode === 'learn' || plan.mode === 'more');
  const toSet = () => navigation.navigate('SetDetail', { setId: session.setId });
  const handleContinue = () => {
    if (!plan || !startSetSession(navigation, session.setId, plan, 'replace')) toSet();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <Text variant="h2" accessibilityRole="header" style={{ color: colors.textPrimary }}>
            {isReview ? 'Повторение завершено' : 'Сессия завершена'}
          </Text>
          <Text variant="body" style={{ color: colors.textSecondary }}>
            {lead}
          </Text>
        </View>

        <View style={styles.stats}>
          {[
            { value: `+${xp}`, label: 'опыта' },
            { value: String(list.length), label: pluralize(list.length, 'слово', 'слова', 'слов') },
            { value: time, label: 'время' },
          ].map((s) => (
            <View key={s.label} style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text variant="h3" style={[styles.tabular, { color: colors.textPrimary }]}>
                {s.value}
              </Text>
              <Text variant="caption" style={{ color: colors.textSecondary }}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.level}>
          <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
            Уровень {level.level} · до уровня {level.level + 1} осталось {level.xpToNext} опыта
          </Text>
          <ProgressBar progress={level.xpPercent} accessibilityLabel="Опыт до следующего уровня" />
        </View>

        <View style={styles.wordsBlock}>
          <Text variant="overline" style={{ color: colors.textSecondary }}>
            Слова сессии
          </Text>
          {list.map((card, i) => (
            <View
              key={card.id}
              style={[styles.wordRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
            >
              <Text variant="body" style={[styles.flex1, { color: colors.textPrimary }]} numberOfLines={2}>
                <Text variant="body" style={styles.semibold}>{card.frontText}</Text>
                <Text variant="body" style={{ color: colors.textSecondary }}>{`  ·  ${card.backText}`}</Text>
              </Text>
              {weakIds.has(card.id) ? <Badge label="Повторить" tone="error" /> : <Badge label="Уверенно" tone="success" />}
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(bottomInset, spacing.m) }]}>
        {canContinue && plan ? (
          <>
            <Button title="Продолжить" fullWidth onPress={handleContinue} />
            <Text variant="caption" align="center" style={{ color: colors.textSecondary }}>
              {nextLine(plan)}
            </Text>
          </>
        ) : (
          <>
            <Button title="Готово" fullWidth onPress={toSet} />
            <Text variant="caption" align="center" style={{ color: colors.textSecondary }}>
              {info && info.tomorrowCount > 0
                ? `На сегодня всё · завтра ${words(info.tomorrowCount)} на повторение`
                : 'На сегодня всё'}
            </Text>
          </>
        )}
        {canContinue ? <Button variant="quiet" tone="secondary" title="К набору" onPress={toSet} /> : null}
      </View>
    </View>
  );
}

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
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  content: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.xl,
    paddingBottom: spacing.l,
    gap: spacing.l,
  },
  head: {
    gap: spacing.xs,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  stat: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.l,
    padding: spacing.s,
    gap: spacing.xxs,
  },
  level: {
    gap: spacing.xs,
  },
  wordsBlock: {
    gap: spacing.xs,
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    minHeight: heights.touch,
    paddingVertical: spacing.xs,
  },
  footer: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.s,
    gap: spacing.xs,
  },
});
