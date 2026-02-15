/**
 * Statistics Screen
 * @description Full statistics page with hero card, goals, heatmap, charts, achievements
 */
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { Text } from '@/components/common';
import { useThemeColors, useSettingsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import Ionicons from 'react-native-vector-icons/Ionicons';

// ---- Mock heatmap data (6 weeks x 7 days) ----
const HEATMAP: number[] = [
  0.6, 0.2, 1.0, 0.1, 0.8, 0.3, 0.9,
  0.4, 0.1, 0.7, 0.5, 0.1, 1.0, 0.2,
  0.8, 0.1, 0.4, 0.6, 0.9, 0.1, 0.3,
  0.2, 0.5, 0.1, 0.8, 0.4, 0.7, 0.1,
  0.1, 1.0, 0.6, 0.2, 0.9, 0.1, 0.4,
  0.7, 0.3, 0.1, 0.8, 0.5, 0.1, 0.9,
];

const BAR_DATA = [
  { label: 'Пн', value: 0.38 },
  { label: 'Вт', value: 0.63 },
  { label: 'Ср', value: 0.88 },
  { label: 'Чт', value: 0.50 },
  { label: 'Пт', value: 0.75 },
  { label: 'Сб', value: 0.25 },
  { label: 'Вс', value: 0.31 },
];

const QUICK_STATS = [
  { icon: 'library-outline', color: '#3B82F6', value: '42', label: 'Total Sets' },
  { icon: 'document-text-outline', color: '#F59E0B', value: '1.2k', label: 'Cards Studied' },
  { icon: 'timer-outline', color: '#10B981', value: '48h', label: 'Total Time' },
  { icon: 'sparkles-outline', color: '#8B5CF6', value: '156', label: 'New Cards' },
  { icon: 'book-outline', color: '#F97316', value: '342', label: 'Learning' },
  { icon: 'checkmark-circle-outline', color: '#22C55E', value: '702', label: 'Mastered' },
];

const ACHIEVEMENTS = [
  {
    id: '1',
    icon: 'sunny-outline',
    iconColor: '#D97706',
    bgColor: '#FEF3C7',
    bgColorDark: 'rgba(217,119,6,0.15)',
    title: 'Early Bird',
    desc: 'Studied before 7:00 AM',
    date: 'Oct 24',
  },
  {
    id: '2',
    icon: 'book-outline',
    iconColor: '#4F46E5',
    bgColor: '#E0E7FF',
    bgColorDark: 'rgba(79,70,229,0.15)',
    title: 'Knowledge Seeker',
    desc: 'Finished 5 decks in one day',
    date: 'Oct 21',
  },
];

const CHALLENGES = [
  {
    id: '1',
    icon: 'calendar-outline',
    title: 'Perfect Week',
    progress: '5/7 Days',
    percent: 71,
    variant: 'primary' as const,
  },
  {
    id: '2',
    icon: 'rocket-outline',
    title: 'Sprint 100',
    progress: '45/100 Cards',
    percent: 45,
    variant: 'green' as const,
  },
];

// ---- Main Screen ----

export function StatisticsScreen({ navigation }: any) {
  const colors = useThemeColors();
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const isDark = resolvedTheme === 'dark';

  const [chartTab, setChartTab] = useState<'week' | 'month' | 'year'>('week');

  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9';

  return (
    <View style={[st.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={st.scroll}
        contentContainerStyle={st.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ======== User Hero Card ======== */}
        <View style={[st.heroCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={st.heroTop}>
            {/* Avatar */}
            <View style={st.avatarWrap}>
              <View style={[st.avatarBorder, { borderColor: colors.primary }]}>
                <View style={[st.avatarPlaceholder, { backgroundColor: colors.primary + '20' }]}>
                  <Ionicons name="person" size={28} color={colors.primary} />
                </View>
              </View>
              <View style={[st.levelBadge, { backgroundColor: colors.primary, borderColor: isDark ? colors.background : '#FFFFFF' }]}>
                <Text style={st.levelText}>LVL 12</Text>
              </View>
            </View>

            {/* Name */}
            <View style={st.heroInfo}>
              <Text style={[st.heroName, { color: colors.textPrimary }]}>Иван Петров</Text>
              <View style={st.proBadgeRow}>
                <Ionicons name="flash" size={14} color={colors.primary} />
                <Text style={[st.proLabel, { color: colors.primary }]}>Flashly Pro Member</Text>
              </View>
            </View>

            {/* Settings */}
            <Pressable style={[st.settingsBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}>
              <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* XP Bar */}
          <View style={st.xpSection}>
            <View style={st.xpLabelRow}>
              <Text style={[st.xpLabel, { color: colors.textTertiary }]}>XP Progress</Text>
              <Text style={[st.xpLabel, { color: colors.textTertiary }]}>1,340 / 2,000 XP</Text>
            </View>
            <View style={[st.xpBarBg, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}>
              <View style={[st.xpBarFill, { backgroundColor: colors.primary, width: '67%' }]} />
            </View>
          </View>

          {/* Streak + Badges row */}
          <View style={st.heroBadgesRow}>
            <View style={[st.heroBadgeCard, { backgroundColor: colors.primary + '0D' }]}>
              <Ionicons name="flame" size={22} color={colors.primary} />
              <View>
                <Text style={[st.heroBadgeValue, { color: colors.textPrimary }]}>7 Days</Text>
                <Text style={[st.heroBadgeMeta, { color: colors.textTertiary }]}>Current Streak</Text>
              </View>
            </View>
            <Pressable
              style={[st.heroBadgeCard, { backgroundColor: colors.primary + '0D' }]}
              onPress={() => navigation?.navigate('Achievements')}
            >
              <Ionicons name="trophy" size={22} color={colors.primary} />
              <View>
                <Text style={[st.heroBadgeValue, { color: colors.textPrimary }]}>24</Text>
                <Text style={[st.heroBadgeMeta, { color: colors.textTertiary }]}>Badges</Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* ======== Daily Goal ======== */}
        <View style={[st.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[st.cardTitle, { color: colors.textPrimary }]}>Daily Goal</Text>

          <View style={st.goalCenter}>
            {/* Circular progress */}
            <View style={st.circleWrap}>
              <View style={[st.circleTrack, { borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]} />
              <View style={[st.circleProgress, { borderColor: colors.primary, borderTopColor: 'transparent', borderRightColor: 'transparent', transform: [{ rotate: '216deg' }] }]} />
              <View style={st.circleInner}>
                <Text style={[st.circleValue, { color: colors.textPrimary }]}>16/20</Text>
                <Text style={[st.circleLabel, { color: colors.textTertiary }]}>Cards</Text>
              </View>
            </View>
          </View>

          <Text style={[st.goalHint, { color: colors.textSecondary }]}>
            Almost there! Only <Text style={{ color: colors.primary, fontWeight: '700' }}>4 more cards</Text> to hit your daily target.
          </Text>
        </View>

        {/* ======== Activity Heatmap ======== */}
        <View style={[st.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={st.heatmapHeader}>
            <Text style={[st.cardTitle, { color: colors.textPrimary, marginBottom: 0 }]}>Activity Heatmap</Text>
            <View style={st.heatmapLegend}>
              <Text style={[st.legendLabel, { color: colors.textTertiary }]}>Less</Text>
              {[0.1, 0.4, 0.7, 1.0].map((op) => (
                <View
                  key={op}
                  style={[st.legendDot, { backgroundColor: colors.primary, opacity: op }]}
                />
              ))}
              <Text style={[st.legendLabel, { color: colors.textTertiary }]}>More</Text>
            </View>
          </View>

          <View style={st.heatmapGrid}>
            {HEATMAP.map((intensity, i) => (
              <View
                key={i}
                style={[
                  st.heatmapCell,
                  { backgroundColor: colors.primary, opacity: Math.max(intensity, 0.08) },
                ]}
              />
            ))}
          </View>
        </View>

        {/* ======== Quick Stats ======== */}
        <Text style={[st.sectionTitle, { color: colors.textPrimary }]}>Quick Stats</Text>
        <View style={st.quickGrid}>
          {QUICK_STATS.map((stat) => (
            <View key={stat.label} style={[st.quickItem, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <Ionicons name={stat.icon as any} size={22} color={stat.color} style={{ marginBottom: 6 }} />
              <Text style={[st.quickValue, { color: colors.textPrimary }]}>{stat.value}</Text>
              <Text style={[st.quickLabel, { color: colors.textTertiary }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* ======== Cards Learned Chart ======== */}
        <View style={[st.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[st.cardTitle, { color: colors.textPrimary }]}>Cards Learned</Text>

          {/* Tabs */}
          <View style={[st.tabRow, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}>
            {(['week', 'month', 'year'] as const).map((tab) => {
              const isActive = chartTab === tab;
              const labels = { week: 'Week', month: 'Month', year: 'Year' };
              return (
                <Pressable
                  key={tab}
                  style={[
                    st.tab,
                    isActive && [st.tabActive, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#FFFFFF' }],
                  ]}
                  onPress={() => setChartTab(tab)}
                >
                  <Text style={[st.tabText, { color: isActive ? colors.textPrimary : colors.textTertiary }]}>
                    {labels[tab]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Bar Chart */}
          <View style={st.barChart}>
            {BAR_DATA.map((bar) => (
              <View key={bar.label} style={st.barCol}>
                <View style={st.barTrack}>
                  <View
                    style={[
                      st.barFill,
                      {
                        backgroundColor: colors.primary,
                        opacity: Math.max(bar.value, 0.15),
                        height: `${bar.value * 100}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={[st.barLabel, { color: colors.textTertiary }]}>{bar.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ======== Recent Achievements ======== */}
        <Text style={[st.sectionTitle, { color: colors.textPrimary }]}>Recent Achievements</Text>
        <View style={st.achieveList}>
          {ACHIEVEMENTS.map((a) => (
            <View key={a.id} style={[st.achieveCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <View style={[st.achieveIcon, { backgroundColor: isDark ? a.bgColorDark : a.bgColor }]}>
                <Ionicons name={a.icon as any} size={22} color={a.iconColor} />
              </View>
              <View style={st.achieveBody}>
                <Text style={[st.achieveTitle, { color: colors.textPrimary }]}>{a.title}</Text>
                <Text style={[st.achieveDesc, { color: colors.textTertiary }]}>{a.desc}</Text>
              </View>
              <Text style={[st.achieveDate, { color: colors.textTertiary }]}>{a.date}</Text>
            </View>
          ))}
        </View>

        {/* ======== Active Challenges ======== */}
        <Text style={[st.sectionTitle, { color: colors.textPrimary }]}>Active Challenges</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={st.challengeScroll}
        >
          {CHALLENGES.map((ch) => {
            const isGreen = ch.variant === 'green';
            const accentColor = isGreen ? '#10B981' : colors.primary;
            const bgTint = isGreen
              ? (isDark ? 'rgba(16,185,129,0.12)' : '#ECFDF5')
              : (colors.primary + (isDark ? '1A' : '0D'));
            const borderTint = isGreen
              ? (isDark ? 'rgba(16,185,129,0.2)' : '#D1FAE5')
              : (colors.primary + '33');

            return (
              <View key={ch.id} style={[st.challengeCard, { backgroundColor: bgTint, borderColor: borderTint }]}>
                <View style={st.challengeTop}>
                  <Ionicons name={ch.icon as any} size={20} color={accentColor} />
                  <Text style={[st.challengeTitle, { color: colors.textPrimary }]}>{ch.title}</Text>
                </View>
                <View style={st.challengeProgress}>
                  <View style={st.challengeProgressRow}>
                    <Text style={[st.challengeProgressLabel, { color: colors.textTertiary }]}>Progress</Text>
                    <Text style={[st.challengeProgressLabel, { color: colors.textTertiary }]}>{ch.progress}</Text>
                  </View>
                  <View style={[st.challengeBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF' }]}>
                    <View style={[st.challengeBarFill, { backgroundColor: accentColor, width: `${ch.percent}%` }]} />
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* ======== Detailed Analytics Button ======== */}
        <Pressable style={[st.detailBtn, { backgroundColor: colors.primary }]}>
          <Text style={st.detailBtnText}>Detailed Analytics</Text>
          <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
        </Pressable>
      </ScrollView>
    </View>
  );
}

// ---- Styles ----

const st = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.m,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl + 40,
  },

  // Hero Card
  heroCard: {
    borderRadius: borderRadius.l,
    padding: spacing.l,
    borderWidth: 1,
    marginBottom: spacing.m,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    marginBottom: spacing.m,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarBorder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    padding: 2,
  },
  avatarPlaceholder: {
    flex: 1,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    borderWidth: 2,
  },
  levelText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroInfo: {
    flex: 1,
    gap: 4,
  },
  heroName: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  proBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  proLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // XP
  xpSection: {
    marginBottom: spacing.m,
  },
  xpLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  xpLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  xpBarBg: {
    height: 10,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  xpBarFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },

  // Hero badges
  heroBadgesRow: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  heroBadgeCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    padding: spacing.s,
    borderRadius: borderRadius.m,
  },
  heroBadgeValue: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  heroBadgeMeta: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Common card
  card: {
    borderRadius: borderRadius.l,
    padding: spacing.l,
    borderWidth: 1,
    marginBottom: spacing.m,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: spacing.m,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: spacing.s,
    marginTop: spacing.xs,
  },

  // Daily Goal
  goalCenter: {
    alignItems: 'center',
    marginBottom: spacing.m,
  },
  circleWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleTrack: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 8,
  },
  circleProgress: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 8,
  },
  circleInner: {
    alignItems: 'center',
  },
  circleValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  circleLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  goalHint: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },

  // Heatmap
  heatmapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.m,
  },
  heatmapLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  legendLabel: {
    fontSize: 9,
    fontWeight: '600',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  heatmapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  heatmapCell: {
    width: '13%',
    aspectRatio: 1,
    borderRadius: 3,
  },

  // Quick Stats
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s,
    marginBottom: spacing.m,
  },
  quickItem: {
    width: '47.5%',
    padding: spacing.m,
    borderRadius: borderRadius.l,
    borderWidth: 1,
  },
  quickValue: {
    fontSize: 24,
    fontWeight: '900',
  },
  quickLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },

  // Bar Chart
  tabRow: {
    flexDirection: 'row',
    borderRadius: borderRadius.m,
    padding: 3,
    marginBottom: spacing.l,
  },
  tab: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: borderRadius.s,
  },
  tabActive: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 2,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
  },
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 120,
    paddingHorizontal: spacing.xs,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  barTrack: {
    width: 14,
    height: '100%',
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderRadius: borderRadius.full,
    minHeight: 6,
  },
  barLabel: {
    fontSize: 10,
    fontWeight: '700',
  },

  // Achievements
  achieveList: {
    gap: spacing.s,
    marginBottom: spacing.m,
  },
  achieveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    padding: spacing.m,
    borderRadius: borderRadius.l,
    borderWidth: 1,
  },
  achieveIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  achieveBody: {
    flex: 1,
    gap: 2,
  },
  achieveTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  achieveDesc: {
    fontSize: 12,
    fontWeight: '500',
  },
  achieveDate: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },

  // Challenges
  challengeScroll: {
    gap: spacing.s,
    paddingBottom: spacing.m,
  },
  challengeCard: {
    width: 230,
    padding: spacing.l,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
  },
  challengeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    marginBottom: spacing.m,
  },
  challengeTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  challengeProgress: {
    gap: spacing.xs,
  },
  challengeProgressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  challengeProgressLabel: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  challengeBar: {
    height: 7,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  challengeBarFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },

  // Detailed button
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.m,
    borderRadius: borderRadius.l,
    marginTop: spacing.xs,
    shadowColor: '#6467f2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  detailBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
