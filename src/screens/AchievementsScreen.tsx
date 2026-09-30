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
import { Badge, Card, ProgressBar, ScreenHeader, type IconComponent } from '@/components/ui';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, iconSize, screenPadding, alpha } from '@/constants';
import { Award, BookOpen, Flame, GraduationCap, Lock, Timer, Users } from 'lucide-react-native';

// ---- Data ----

const TABS = ['Все', 'Серия', 'Обучение', 'Наборы', 'Соцсети'];

type Achievement = {
  id: string;
  icon: IconComponent;
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
    icon: Flame,
    title: 'Огненная неделя',
    unlocked: true,
    description: 'Держи серию 7 дней подряд',
    unlockedLabel: 'Разблокировано: Вчера',
  },
  {
    id: '2',
    icon: BookOpen,
    title: 'Мастер наборов',
    unlocked: true,
    description: 'Создай свои первые 10 наборов карточек',
    unlockedLabel: 'Разблокировано: Пн',
  },
  {
    id: '3',
    icon: Timer,
    title: 'Марафонец',
    unlocked: false,
    progressLabel: '15 / 30 дней',
    progressPercent: 50,
  },
  {
    id: '4',
    icon: Users,
    title: 'Наставник',
    unlocked: false,
    progressLabel: '1 / 5 друзей',
    progressPercent: 20,
  },
  {
    id: '5',
    icon: GraduationCap,
    title: 'Первые шаги',
    unlocked: true,
    description: 'Заверши свой первый урок',
    unlockedLabel: 'Разблокировано',
  },
  {
    id: '6',
    icon: Award,
    title: 'Коллекционер',
    unlocked: false,
    progressLabel: '750 / 1000 слов',
    progressPercent: 75,
  },
];

// ---- Components ----

function UnlockedCard({ item, colors }: { item: Achievement; colors: ReturnType<typeof useThemeColors> }) {
  const Icon = item.icon;
  return (
    <View
      accessible
      accessibilityLabel={`${item.title}. ${item.description ?? ''}. ${item.unlockedLabel ?? ''}`}
      style={[st.gridCard, st.unlockedCard, { backgroundColor: colors.surface, borderColor: colors.border, borderTopColor: colors.primary }]}
    >
      <View style={[st.iconCircle, { backgroundColor: alpha(colors.primary, 10) }]}>
        <Icon size={iconSize.l} color={colors.primary} />
      </View>
      <Text variant="body" align="center" style={[st.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
        {item.title}
      </Text>
      <Text variant="caption" align="center" color="secondary" numberOfLines={2}>
        {item.description}
      </Text>
      {item.unlockedLabel ? <Badge label={item.unlockedLabel} tone="success" style={st.unlockedBadge} /> : null}
    </View>
  );
}

function LockedCard({ item, colors }: { item: Achievement; colors: ReturnType<typeof useThemeColors> }) {
  const Icon = item.icon;
  return (
    <View
      accessible
      accessibilityLabel={`${item.title}, закрыто. ${item.progressLabel ?? ''}`}
      style={[st.gridCard, st.lockedCard, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
    >
      <View style={st.lockedIconWrap}>
        <View style={[st.iconCircle, { backgroundColor: colors.surfaceVariant }]}>
          <Icon size={iconSize.l} color={colors.textTertiary} />
        </View>
        <View style={[st.lockBadge, { backgroundColor: colors.textTertiary, borderColor: colors.surfaceMuted }]}>
          <Lock size={10} color={colors.onPrimary} />
        </View>
      </View>
      <Text variant="body" align="center" style={[st.cardTitle, { color: colors.textSecondary }]} numberOfLines={1}>
        {item.title}
      </Text>
      <ProgressBar progress={item.progressPercent ?? 0} color={colors.textTertiary} animated={false} style={st.lockedBar} />
      <Text variant="caption" color="secondary">
        {item.progressLabel}
      </Text>
    </View>
  );
}

// ---- Main Screen ----

export function AchievementsScreen({ navigation }: any) {
  const colors = useThemeColors();
  const [activeTab, setActiveTab] = useState(0);

  return (
    <View style={[st.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        variant="root"
        title="Достижения"
        onBack={() => navigation?.goBack()}
        bordered
        right={<Badge label="24 / 50" tone="primary" />}
      />

      <ScrollView
        style={st.scroll}
        contentContainerStyle={st.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Overall Progress */}
        <Card style={st.progressCard}>
          <View style={st.progressCardTop}>
            <View style={st.flex1}>
              <Text variant="overline" color="secondary">
                Твой путь к мастерству
              </Text>
              <Text variant="h3" style={{ color: colors.textPrimary }}>
                Общий прогресс
              </Text>
            </View>
            <Text variant="h2" style={{ color: colors.primary }}>48%</Text>
          </View>
          <ProgressBar progress={48} accessibilityLabel="Общий прогресс" />
          <Text variant="caption" color="secondary" style={st.progressHint}>
            Ещё 26 достижений до звания «Легенда»
          </Text>
        </Card>

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
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                style={[
                  st.tab,
                  isActive
                    ? { backgroundColor: colors.primaryFill, borderColor: colors.primaryFill }
                    : { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={() => setActiveTab(i)}
              >
                <Text variant="label" style={{ color: isActive ? colors.onPrimary : colors.textSecondary }}>
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
              <UnlockedCard key={item.id} item={item} colors={colors} />
            ) : (
              <LockedCard key={item.id} item={item} colors={colors} />
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
  flex1: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: screenPadding,
    paddingBottom: spacing.xxl,
    gap: spacing.l,
  },
  progressCard: {
    gap: spacing.s,
  },
  progressCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.s,
  },
  progressHint: {
    marginTop: spacing.xxs,
  },
  tabsRow: {
    gap: spacing.xs,
  },
  tab: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.m,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s,
  },
  gridCard: {
    width: '48%',
    flexGrow: 1,
    alignItems: 'center',
    padding: spacing.m,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    gap: spacing.xxs,
  },
  unlockedCard: {
    borderTopWidth: 4,
  },
  lockedCard: {
    borderStyle: 'dashed',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  cardTitle: {
    fontWeight: '600',
  },
  unlockedBadge: {
    alignSelf: 'center',
    marginTop: spacing.xs,
  },
  lockedIconWrap: {
    position: 'relative',
  },
  lockBadge: {
    position: 'absolute',
    bottom: spacing.xs,
    right: -spacing.xxs,
    width: 20,
    height: 20,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedBar: {
    marginTop: spacing.xs,
  },
});
