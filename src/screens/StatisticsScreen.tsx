/**
 * Statistics Screen
 * @description Full statistics page with hero card, goals, heatmap, charts
 */
import { isCardLearned } from '@/services/SRSService';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Text } from '@/components/common';
import { useThemeColors, useSettingsStore, useCardsStore, useSetsStore, useContextFillStore } from '@/store';
import { spacing, borderRadius, iconSize, screenPadding, alpha, type ColorToken } from '@/constants';
import { Button, Card, ProgressBar, type IconComponent } from '@/components/ui';
import { pluralize } from '@/utils';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  FileText,
  Flame,
  Library,
  Settings,
  Sparkles,
  Sun,
  Timer,
  Trophy,
  User,
  Zap,
} from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';
import { StreakService } from '@/services';
import type { DailyActivity, UserStats } from '@/services';
import { supabase } from '@/services/supabaseClient';
import { getLevelProgress, XP_PER_LEVEL } from '@/utils/level';

// ---- Helpers ----

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function formatHours(minutes: number): string {
  if (minutes < 60) return `${minutes}м`;
  const h = minutes / 60;
  if (h >= 100) return `${Math.round(h)}ч`;
  return h % 1 === 0 ? `${h}ч` : `${h.toFixed(1)}ч`;
}


const DAY_LABELS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTH_LABELS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay(); // 0=Sun
  return DAY_LABELS_SHORT[day === 0 ? 6 : day - 1];
}

const DAILY_GOAL = 10;

// ---- Main Screen ----

export function StatisticsScreen({ navigation }: any) {
  const colors = useThemeColors();
  const todayStatsLocal = useSettingsStore((s) => s.todayStats);

  const [chartTab, setChartTab] = useState<'week' | 'month' | 'year'>('week');
  // Сразу — сохранённое с прошлого раза, свежее с сервера подменит (без индикатора загрузки)
  const [userStats, setUserStats] = useState<UserStats | null>(() => StreakService.cachedUserStats());
  const [todayActivity, setTodayActivity] = useState<DailyActivity | null>(() => StreakService.cachedTodayActivity() ?? null);
  const [heatmapActivity, setHeatmapActivity] = useState<DailyActivity[]>(() => StreakService.cachedWeekActivity(42) ?? []);
  const [weekActivity, setWeekActivity] = useState<DailyActivity[]>(() => StreakService.cachedWeekActivity(7) ?? []);
  const [monthActivity, setMonthActivity] = useState<DailyActivity[] | null>(() => StreakService.cachedWeekActivity(30));
  const [yearActivity, setYearActivity] = useState<DailyActivity[] | null>(() => StreakService.cachedWeekActivity(365));
  const [loading, setLoading] = useState(() => userStats === null);
  const [userName, setUserName] = useState('');


  // Load data on mount
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        // Get user name from session
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email && mounted) {
          setUserName(session.user.email.split('@')[0]);
        }

        // Fetch all stats in parallel
        const [stats, today, heatmap, week] = await Promise.all([
          StreakService.fetchUserStats(),
          StreakService.fetchTodayActivity(),
          StreakService.fetchWeekActivity(42),
          StreakService.fetchWeekActivity(7),
        ]);

        if (!mounted) return;

        setUserStats(stats);
        setTodayActivity(today);
        setHeatmapActivity(heatmap);
        setWeekActivity(week);
      } catch (e) {
        console.error('StatisticsScreen: failed to load data', e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, []);

  // Lazy load month/year data when tab changes
  useEffect(() => {
    let mounted = true;
    if (chartTab === 'month' && !monthActivity) {
      StreakService.fetchWeekActivity(30).then((data) => {
        if (mounted) setMonthActivity(data);
      });
    }
    if (chartTab === 'year' && !yearActivity) {
      StreakService.fetchWeekActivity(365).then((data) => {
        if (mounted) setYearActivity(data);
      });
    }
    return () => { mounted = false; };
  }, [chartTab, monthActivity, yearActivity]);

  // ---- Computed values ----

  const totalCardsStudied = userStats?.total_cards_studied ?? 0;
  const { level, xpCurrent, xpPercent } = getLevelProgress(totalCardsStudied);

  const currentStreak = userStats?.current_streak ?? 0;

  const todayCards = todayActivity?.cards_studied ?? todayStatsLocal.cardsStudied ?? 0;
  const goalProgress = Math.min((todayCards || 0) / DAILY_GOAL, 1);
  const remaining = Math.max(DAILY_GOAL - todayCards, 0);

  // Card stats from store
  const allCards = useCardsStore((s) => s.cards);
  const allSets = useSetsStore((s) => s.getAllSets());

  const contextFill = useContextFillStore((s) => ({
    totalAnswered: s.totalAnswered,
    totalCorrect: s.totalCorrect,
    uniqueCorrect: s.correctCardIds.length,
  }));

  const cardStats = useMemo(() => {
    let newCount = 0;
    let learningCount = 0;
    let masteredCount = 0;

    const cards = Object.values(allCards);
    for (const card of cards) {
      if ((card.learningStep || 0) === 0) {
        newCount++;
      } else if (isCardLearned(card)) {
        masteredCount++;
      } else {
        learningCount++;
      }
    }
    return { newCount, learningCount, masteredCount };
  }, [allCards]);

  const quickStats = useMemo((): Array<{ icon: IconComponent; color: ColorToken; value: string; label: string }> => [
    { icon: Library, color: 'info', value: formatNumber(allSets.length), label: 'Наборы' },
    { icon: FileText, color: 'warning', value: formatNumber(totalCardsStudied), label: 'Изучено' },
    { icon: Timer, color: 'success', value: formatHours(userStats?.total_minutes_learned ?? 0), label: 'Время' },
    { icon: Sparkles, color: 'secondary', value: formatNumber(cardStats.newCount), label: 'Новые' },
    { icon: BookOpen, color: 'streak', value: formatNumber(cardStats.learningCount), label: 'Изучаются' },
    { icon: CheckCircle2, color: 'success', value: formatNumber(cardStats.masteredCount), label: 'Выучены' },
  ], [allSets.length, totalCardsStudied, userStats?.total_minutes_learned, cardStats]);

  // ---- Heatmap data ----

  const heatmapData = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of heatmapActivity) {
      map.set(a.local_date, a.cards_studied);
    }

    // Build 42-day grid (6 weeks ending today)
    const today = new Date();
    const days: number[] = [];
    for (let i = 41; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push(map.get(key) ?? 0);
    }

    const maxVal = Math.max(...days, 1);
    return days.map((v) => v / maxVal);
  }, [heatmapActivity]);

  // ---- Bar chart data ----

  const barData = useMemo(() => {
    if (chartTab === 'week') {
      // 7 days
      const map = new Map<string, number>();
      for (const a of weekActivity) {
        map.set(a.local_date, a.cards_studied);
      }

      const today = new Date();
      const bars: { label: string; value: number; raw: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const raw = map.get(key) ?? 0;
        bars.push({ label: getDayLabel(key), value: 0, raw });
      }
      const maxVal = Math.max(...bars.map((b) => b.raw), 1);
      return bars.map((b) => ({ label: b.label, value: b.raw / maxVal }));
    }

    if (chartTab === 'month') {
      const data = monthActivity ?? [];
      // Group by week (4 weeks)
      const weeks: number[] = [0, 0, 0, 0];
      const today = new Date();
      for (const a of data) {
        const d = new Date(a.local_date + 'T12:00:00');
        const daysAgo = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
        const weekIdx = Math.min(3, Math.floor(daysAgo / 7));
        weeks[3 - weekIdx] += a.cards_studied;
      }
      const maxVal = Math.max(...weeks, 1);
      return weeks.map((w, i) => ({ label: `Нед ${i + 1}`, value: w / maxVal }));
    }

    // Year
    const data = yearActivity ?? [];
    const months: number[] = new Array(12).fill(0);
    for (const a of data) {
      const month = parseInt(a.local_date.slice(5, 7), 10) - 1;
      months[month] += a.cards_studied;
    }
    const maxVal = Math.max(...months, 1);
    return months.map((m, i) => ({ label: MONTH_LABELS[i], value: m / maxVal }));
  }, [chartTab, weekActivity, monthActivity, yearActivity]);

  return (
    <View style={[st.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={st.scroll}
        contentContainerStyle={st.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ======== User Hero Card ======== */}
        <Card style={st.heroCard}>
          <View style={st.heroTop}>
            {/* Avatar */}
            <View style={st.avatarWrap}>
              <View style={[st.avatarBorder, { borderColor: colors.primary }]}>
                <View style={[st.avatarPlaceholder, { backgroundColor: alpha(colors.primary, 10) }]}>
                  <User size={iconSize.l} color={colors.primary} />
                </View>
              </View>
              <View style={[st.levelBadge, { backgroundColor: colors.primaryFill, borderColor: colors.surface }]}>
                <Text variant="caption" style={[st.bold, { color: colors.onPrimary }]}>Ур. {level}</Text>
              </View>
            </View>

            {/* Name */}
            <View style={st.heroInfo}>
              <Text variant="h3" style={[st.bold, { color: colors.textPrimary }]}>
                {userName || 'Гость'}
              </Text>
              <View style={st.proBadgeRow}>
                <Zap size={iconSize.xs} color={colors.primary} />
                <Text variant="label" style={{ color: colors.primary }}>Участник Flashly</Text>
              </View>
            </View>

            {/* Settings */}
            <Button
              variant="icon"
              icon={Settings}
              iconColor={colors.textSecondary}
              accessibilityLabel="Настройки"
              onPress={() => navigation?.navigate('Settings')}
            />
          </View>

          {/* XP Bar */}
          <View style={st.xpSection}>
            <View style={st.xpLabelRow}>
              <Text variant="overline" color="secondary">Опыт</Text>
              <Text variant="caption" color="secondary">
                {xpCurrent} / {XP_PER_LEVEL}
              </Text>
            </View>
            <ProgressBar progress={xpPercent} accessibilityLabel="Опыт до следующего уровня" />
          </View>

          {/* Streak + Badges row */}
          <View style={st.heroBadgesRow}>
            <View style={[st.heroBadgeCard, { backgroundColor: alpha(colors.streak, 10) }]}>
              <Flame size={iconSize.m} color={colors.streak} />
              <View>
                <Text variant="body" style={[st.bold, { color: colors.textPrimary }]}>
                  {currentStreak} {pluralize(currentStreak, 'день', 'дня', 'дней')}
                </Text>
                <Text variant="caption" color="secondary">Серия</Text>
              </View>
            </View>
            {/* Числа наград пока нет в данных — показываем только переход в «Награды» */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Награды"
              style={({ pressed }) => [st.heroBadgeCard, { backgroundColor: alpha(colors.star, 10) }, pressed && st.pressed]}
              onPress={() => navigation?.navigate('Achievements')}
            >
              <Trophy size={iconSize.m} color={colors.star} />
              <Text variant="body" style={[st.bold, st.flex1, { color: colors.textPrimary }]}>Награды</Text>
              <ChevronRight size={iconSize.xs} color={colors.textTertiary} />
            </Pressable>
          </View>
        </Card>

        {/* ======== Daily Goal ======== */}
        <Card style={st.card}>
          <Text variant="h3" style={[st.cardTitle, { color: colors.textPrimary }]}>Дневная цель</Text>

          <View style={st.goalCenter}>
            {/* Circular progress */}
            <View
              style={st.circleWrap}
              accessible
              accessibilityLabel={`Дневная цель: ${todayCards} из ${DAILY_GOAL} карточек`}
            >
              <Svg width={120} height={120} style={st.circleSvg}>
                <Circle cx={60} cy={60} r={52} stroke={colors.surfaceMuted} strokeWidth={8} fill="none" />
                <Circle
                  cx={60}
                  cy={60}
                  r={52}
                  stroke={colors.primary}
                  strokeWidth={8}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 52}`}
                  strokeDashoffset={`${2 * Math.PI * 52 * (1 - goalProgress)}`}
                  transform="rotate(-90 60 60)"
                />
              </Svg>
              <View style={st.circleInner}>
                <Text variant="h2" style={{ color: colors.textPrimary }}>
                  {todayCards}/{DAILY_GOAL}
                </Text>
                <Text variant="caption" color="secondary">Карточек</Text>
              </View>
            </View>
          </View>

          <Text variant="bodySmall" align="center" color="secondary">
            {remaining > 0
              ? <>Осталось <Text variant="bodySmall" style={[st.bold, { color: colors.primary }]}>{remaining} {pluralize(remaining, 'карточка', 'карточки', 'карточек')}</Text> до дневной цели.</>
              : <Text variant="bodySmall" style={[st.bold, { color: colors.primary }]}>Цель выполнена! Отличная работа!</Text>
            }
          </Text>
        </Card>

        {/* ======== Activity Heatmap ======== */}
        <Card style={st.card}>
          <View style={st.heatmapHeader}>
            <Text variant="h3" style={{ color: colors.textPrimary }}>Активность</Text>
            <View style={st.heatmapLegend}>
              <Text variant="caption" style={{ color: colors.textTertiary }}>Мало</Text>
              {[0.1, 0.4, 0.7, 1.0].map((op) => (
                <View key={op} style={[st.legendDot, { backgroundColor: colors.primary, opacity: op }]} />
              ))}
              <Text variant="caption" style={{ color: colors.textTertiary }}>Много</Text>
            </View>
          </View>

          <View style={st.heatmapGrid} accessibilityLabel="Активность за 6 недель">
            {heatmapData.map((intensity, i) => (
              <View
                key={i}
                style={[st.heatmapCell, { backgroundColor: colors.primary, opacity: Math.max(intensity, 0.08) }]}
              />
            ))}
          </View>
        </Card>

        {/* ======== Quick Stats ======== */}
        <Text variant="h3" style={[st.sectionTitle, { color: colors.textPrimary }]}>Статистика</Text>
        <View style={st.quickGrid}>
          {quickStats.map((stat) => {
            const Icon = stat.icon;
            return (
              <View
                key={stat.label}
                accessible
                accessibilityLabel={`${stat.label}: ${stat.value}`}
                style={[st.quickItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Icon size={iconSize.m} color={colors[stat.color]} style={st.quickIcon} />
                <Text variant="h3" style={[st.bold, { color: colors.textPrimary }]}>{stat.value}</Text>
                <Text variant="caption" color="secondary">{stat.label}</Text>
              </View>
            );
          })}
        </View>

        {/* ======== Cards Learned Chart ======== */}
        <Card style={st.card}>
          <Text variant="h3" style={[st.cardTitle, { color: colors.textPrimary }]}>Карточки</Text>

          {/* Tabs */}
          <View style={[st.tabRow, { backgroundColor: colors.surfaceMuted }]}>
            {(['week', 'month', 'year'] as const).map((tab) => {
              const isActive = chartTab === tab;
              const labels = { week: 'Неделя', month: 'Месяц', year: 'Год' };
              return (
                <Pressable hitSlop={{ top: spacing.xxs, bottom: spacing.xxs }}
                  key={tab}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  style={[st.tab, isActive && { backgroundColor: colors.surface }]}
                  onPress={() => setChartTab(tab)}
                >
                  <Text variant="label" style={{ color: isActive ? colors.textPrimary : colors.textSecondary }}>
                    {labels[tab]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Bar Chart */}
          <View style={st.barChart}>
            {barData.map((bar) => (
              <View key={bar.label} style={st.barCol}>
                <View style={st.barTrack}>
                  <View
                    style={[
                      st.barFill,
                      { backgroundColor: colors.primary, opacity: Math.max(bar.value, 0.15), height: `${bar.value * 100}%` },
                    ]}
                  />
                </View>
                <Text variant="caption" style={{ color: colors.textTertiary }}>{bar.label}</Text>
              </View>
            ))}
          </View>
        </Card>

        {/* ======== Context Fill Stats ======== */}
        {contextFill.totalAnswered > 0 && (
          <>
            <Text variant="h3" style={[st.sectionTitle, { color: colors.textPrimary }]}>Слово в контексте</Text>
            <Card style={st.card}>
              <View style={st.cfRow}>
                <View style={st.cfItem}>
                  <Text variant="h3" style={[st.bold, { color: colors.primary }]}>
                    {contextFill.uniqueCorrect}
                  </Text>
                  <Text variant="caption" color="secondary">Угадано слов</Text>
                </View>
                <View style={[st.cfDivider, { backgroundColor: colors.border }]} />
                <View style={st.cfItem}>
                  <Text variant="h3" style={[st.bold, { color: colors.successText }]}>
                    {contextFill.totalAnswered > 0
                      ? Math.round((contextFill.totalCorrect / contextFill.totalAnswered) * 100)
                      : 0}%
                  </Text>
                  <Text variant="caption" color="secondary">Точность</Text>
                </View>
                <View style={[st.cfDivider, { backgroundColor: colors.border }]} />
                <View style={st.cfItem}>
                  <Text variant="h3" style={[st.bold, { color: colors.textPrimary }]}>
                    {contextFill.totalAnswered}
                  </Text>
                  <Text variant="caption" color="secondary">Всего ответов</Text>
                </View>
              </View>
            </Card>
          </>
        )}

        {/* ======== Detailed Analytics Button ======== */}
        <Button title="Подробная аналитика" iconRight={ChevronRight} fullWidth style={st.detailBtn} />
      </ScrollView>
    </View>
  );
}

// ---- Styles ----

const st = StyleSheet.create({
  container: { flex: 1 },
  flex1: { flex: 1 },
  bold: { fontWeight: '700' },
  semibold: { fontWeight: '600' },
  pressed: { opacity: 0.85 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: screenPadding, paddingTop: spacing.xl, paddingBottom: spacing.xxl },
  heroCard: { padding: spacing.l, marginBottom: spacing.l },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.m },
  avatarWrap: { position: 'relative' },
  avatarBorder: { width: 72, height: 72, borderRadius: borderRadius.full, borderWidth: 3, padding: 3 },
  avatarPlaceholder: { flex: 1, borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  levelBadge: {
    position: 'absolute',
    bottom: -spacing.xxs,
    right: -spacing.xxs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs / 2,
    borderRadius: borderRadius.full,
    borderWidth: 2,
  },
  heroInfo: { flex: 1, gap: spacing.xxs },
  proBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  xpSection: { marginTop: spacing.l, gap: spacing.xs },
  xpLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroBadgesRow: { flexDirection: 'row', gap: spacing.s, marginTop: spacing.m },
  heroBadgeCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.s, padding: spacing.s, borderRadius: borderRadius.m },
  card: { marginBottom: spacing.l },
  cardTitle: { marginBottom: spacing.m },
  sectionTitle: { marginBottom: spacing.s },
  goalCenter: { alignItems: 'center', marginBottom: spacing.m },
  circleWrap: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  circleSvg: { position: 'absolute' },
  circleInner: { alignItems: 'center' },
  heatmapHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.m },
  heatmapLegend: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  legendDot: { width: 10, height: 10, borderRadius: borderRadius.full },
  heatmapGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxs },
  heatmapCell: { width: '13%', aspectRatio: 1, borderRadius: borderRadius.s },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s, marginBottom: spacing.l },
  quickItem: { width: '31%', flexGrow: 1, alignItems: 'center', padding: spacing.m, borderRadius: borderRadius.l, borderWidth: 1 },
  quickIcon: { marginBottom: spacing.xs },
  tabRow: { flexDirection: 'row', padding: spacing.xxs, borderRadius: borderRadius.m, marginBottom: spacing.m },
  tab: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: borderRadius.s },
  barChart: { flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: spacing.xxs },
  barCol: { flex: 1, alignItems: 'center', gap: spacing.xxs },
  barTrack: { flex: 1, width: '70%', justifyContent: 'flex-end' },
  barFill: { width: '100%', borderRadius: borderRadius.s },
  cfRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cfItem: { alignItems: 'center', flex: 1 },
  cfDivider: { width: 1 },
  detailBtn: { marginTop: spacing.xs },
});
