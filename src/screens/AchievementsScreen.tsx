/**
 * Achievements Screen
 * @description Grid of unlocked and locked achievements
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
import { ArrowLeft } from 'lucide-react-native';

// ---- Data ----

const TABS = ['Все', 'Стрики', 'Обучение', 'Сеты', 'Соцсети'];

type Achievement = {
  id: string;
  icon: string;
  title: string;
  unlocked: boolean;
  // unlocked-only
  description?: string;
  unlockedLabel?: string;
  // locked-only
  progressLabel?: string;
  progressPercent?: number;
};

const ACHIEVEMENTS: Achievement[] = [
  {
    id: '1',
    icon: 'flame',
    title: 'Огненная неделя',
    unlocked: true,
    description: 'Поддерживайте стрик 7 дней подряд',
    unlockedLabel: 'Разблокировано: Вчера',
  },
  {
    id: '2',
    icon: 'book',
    title: 'Мастер сетов',
    unlocked: true,
    description: 'Создайте свои первые 10 наборов карточек',
    unlockedLabel: 'Разблокировано: Пн',
  },
  {
    id: '3',
    icon: 'timer-outline',
    title: 'Марафонец',
    unlocked: false,
    progressLabel: '15 / 30 дней',
    progressPercent: 50,
  },
  {
    id: '4',
    icon: 'people-outline',
    title: 'Наставник',
    unlocked: false,
    progressLabel: '1 / 5 друзей',
    progressPercent: 20,
  },
  {
    id: '5',
    icon: 'school',
    title: 'Первые шаги',
    unlocked: true,
    description: 'Завершите свой первый урок',
    unlockedLabel: 'Разблокировано',
  },
  {
    id: '6',
    icon: 'ribbon-outline',
    title: 'Коллекционер',
    unlocked: false,
    progressLabel: '750 / 1000 слов',
    progressPercent: 75,
  },
];

// ---- Components ----

function UnlockedCard({
  item,
  colors,
  isDark,
}: {
  item: Achievement;
  colors: ReturnType<typeof useThemeColors>;
  isDark: boolean;
}) {
  return (
    <View style={[st.gridCard, st.unlockedCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF', borderTopColor: colors.primary }]}>
      <View style={[st.iconCircle, { backgroundColor: colors.primary + '20' }]}>
        <Ionicons name={item.icon as any} size={32} color={colors.primary} />
      </View>
      <Text style={[st.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
        {item.title}
      </Text>
      <Text style={[st.cardDesc, { color: colors.textTertiary }]} numberOfLines={2}>
        {item.description}
      </Text>
      <View style={[st.unlockedBadge, { backgroundColor: isDark ? 'rgba(16,185,129,0.15)' : '#DCFCE7' }]}>
        <Text style={[st.unlockedBadgeText, { color: isDark ? '#34D399' : '#16A34A' }]}>
          {item.unlockedLabel}
        </Text>
      </View>
    </View>
  );
}

function LockedCard({
  item,
  colors,
  isDark,
}: {
  item: Achievement;
  colors: ReturnType<typeof useThemeColors>;
  isDark: boolean;
}) {
  const lockedBg = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(241,245,249,0.5)';
  const lockedBorder = isDark ? 'rgba(255,255,255,0.08)' : '#CBD5E1';
  const greyIcon = isDark ? '#4B5563' : '#9CA3AF';
  const greyBg = isDark ? 'rgba(255,255,255,0.06)' : '#E2E8F0';
  const barBg = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';

  return (
    <View style={[st.gridCard, st.lockedCard, { backgroundColor: lockedBg, borderColor: lockedBorder }]}>
      <View style={st.lockedIconWrap}>
        <View style={[st.iconCircle, { backgroundColor: greyBg }]}>
          <Ionicons name={item.icon as any} size={32} color={greyIcon} />
        </View>
        <View style={[st.lockBadge, { backgroundColor: greyIcon, borderColor: isDark ? '#101122' : '#F8F6F6' }]}>
          <Ionicons name="lock-closed" size={10} color="#FFFFFF" />
        </View>
      </View>
      <Text style={[st.cardTitle, { color: greyIcon }]} numberOfLines={1}>
        {item.title}
      </Text>
      <View style={[st.progressBar, { backgroundColor: barBg }]}>
        <View style={[st.progressFill, { backgroundColor: greyIcon, width: `${item.progressPercent ?? 0}%` }]} />
      </View>
      <Text style={[st.progressLabel, { color: greyIcon }]}>
        {item.progressLabel}
      </Text>
    </View>
  );
}

// ---- Main Screen ----

export function AchievementsScreen({ navigation }: any) {
  const colors = useThemeColors();
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const isDark = resolvedTheme === 'dark';

  const [activeTab, setActiveTab] = useState(0);

  return (
    <View style={[st.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[st.header, { backgroundColor: isDark ? colors.background : '#FFFFFF', borderBottomColor: colors.border }]}>
        <View style={st.headerLeft}>
          <Pressable style={st.backBtn} onPress={() => navigation?.goBack()}>
            <ArrowLeft size={22} color={colors.primary} />
          </Pressable>
          <Text style={[st.headerTitle, { color: colors.textPrimary }]}>Достижения</Text>
        </View>
        <View style={[st.counterBadge, { backgroundColor: colors.primary + '15' }]}>
          <Text style={[st.counterText, { color: colors.primary }]}>24 / 50</Text>
        </View>
      </View>

      <ScrollView
        style={st.scroll}
        contentContainerStyle={st.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Overall Progress */}
        <View style={[st.progressCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF', borderColor: isDark ? 'rgba(255,255,255,0.06)' : colors.primary + '0D' }]}>
          <View style={st.progressCardTop}>
            <View style={{ flex: 1 }}>
              <Text style={[st.progressSubtitle, { color: colors.textTertiary }]}>
                Ваш путь к мастерству
              </Text>
              <Text style={[st.progressTitle, { color: colors.textPrimary }]}>
                Общий прогресс
              </Text>
            </View>
            <Text style={[st.progressPercent, { color: colors.primary }]}>48%</Text>
          </View>
          <View style={[st.totalBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0' }]}>
            <View style={[st.totalBarFill, { backgroundColor: colors.primary, width: '48%' }]} />
          </View>
          <Text style={[st.progressHint, { color: colors.textTertiary }]}>
            Еще 26 достижений до звания «Легенда»
          </Text>
        </View>

        {/* Category Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={st.tabsRow}
        >
          {TABS.map((tab, i) => {
            const isActive = activeTab === i;
            return (
              <Pressable
                key={tab}
                style={[
                  st.tab,
                  isActive
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF', borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0', borderWidth: 1 },
                ]}
                onPress={() => setActiveTab(i)}
              >
                <Text style={[st.tabText, { color: isActive ? '#FFFFFF' : colors.textSecondary }]}>
                  {tab}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Achievement Grid */}
        <View style={st.grid}>
          {ACHIEVEMENTS.map((item) =>
            item.unlocked ? (
              <UnlockedCard key={item.id} item={item} colors={colors} isDark={isDark} />
            ) : (
              <LockedCard key={item.id} item={item} colors={colors} isDark={isDark} />
            ),
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ---- Styles ----

const st = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.m,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  counterBadge: {
    paddingHorizontal: spacing.s,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  counterText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.m,
    paddingTop: spacing.l,
    paddingBottom: spacing.xxl + 20,
  },

  // Overall Progress Card
  progressCard: {
    padding: spacing.l,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    marginBottom: spacing.l,
  },
  progressCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: spacing.s,
  },
  progressSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 4,
  },
  progressTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  progressPercent: {
    fontSize: 28,
    fontWeight: '900',
  },
  totalBar: {
    height: 14,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginBottom: spacing.s,
  },
  totalBarFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  progressHint: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Tabs
  tabsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.l,
  },
  tab: {
    paddingHorizontal: 18,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s,
  },

  // Shared card
  gridCard: {
    width: '48%',
    padding: spacing.m,
    borderRadius: borderRadius.l,
    alignItems: 'center',
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.s,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },

  // Unlocked
  unlockedCard: {
    borderTopWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  cardDesc: {
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 14,
    marginBottom: spacing.s,
  },
  unlockedBadge: {
    marginTop: 'auto',
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    borderRadius: borderRadius.xs,
  },
  unlockedBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Locked
  lockedCard: {
    borderWidth: 1,
    borderStyle: 'dashed',
    opacity: 0.85,
  },
  lockedIconWrap: {
    position: 'relative',
    marginBottom: spacing.s,
  },
  lockBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  progressBar: {
    width: '100%',
    height: 5,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginTop: spacing.xs,
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  progressLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
});
