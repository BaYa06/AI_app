/**
 * Statistics Screen
 * @description Экран статистики
 */
import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useSettingsStore, useSetsStore, useThemeColors } from '@/store';
import { Container, Text, Heading2, Heading3, ProgressBar } from '@/components/common';
import { spacing, borderRadius } from '@/constants';

export function StatisticsScreen() {
  const colors = useThemeColors();
  const todayStats = useSettingsStore((s) => s.todayStats);
  const sets = useSetsStore((s) => s.getAllSets());

  // Общая статистика
  const totalCards = sets.reduce((sum, s) => sum + s.cardCount, 0);
  const totalMastered = sets.reduce((sum, s) => sum + s.masteredCount, 0);
  const overallProgress = totalCards > 0 
    ? Math.round((totalMastered / totalCards) * 100) 
    : 0;

  return (
    <Container>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Heading2 style={styles.title}>Статистика</Heading2>

        {/* Streak */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.streakHeader}>
            <Text style={styles.streakIcon}>🔥</Text>
            <View>
              <Text variant="h1">{todayStats.streak}</Text>
              <Text variant="body" color="secondary">
                дней подряд
              </Text>
            </View>
          </View>
        </View>

        {/* Сегодня */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Heading3>Сегодня</Heading3>
          <View style={styles.statsRow}>
            <StatItem
              value={todayStats.cardsStudied}
              label="Карточек изучено"
              icon="✅"
            />
          </View>
        </View>

        {/* Общий прогресс */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Heading3>Общий прогресс</Heading3>
          
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text variant="body" color="secondary">
                Всего карточек: {totalCards}
              </Text>
              <Text variant="h3">{overallProgress}%</Text>
            </View>
            <ProgressBar progress={overallProgress} height={12} />
          </View>

          <View style={styles.statsRow}>
            <StatItem value={sets.length} label="Наборов" icon="📚" />
            <StatItem value={totalCards} label="Карточек" icon="🃏" />
            <StatItem value={totalMastered} label="Изучено" icon="⭐" />
          </View>
        </View>

        {/* Календарь активности (заглушка) */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Heading3>Активность</Heading3>
          <View style={styles.placeholder}>
            <Text variant="body" color="tertiary" align="center">
              📅 Календарь активности
            </Text>
            <Text variant="caption" color="tertiary" align="center">
              Скоро
            </Text>
          </View>
        </View>
      </ScrollView>
    </Container>
  );
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ ====================

interface StatItemProps {
  value: number;
  label: string;
  icon: string;
}

function StatItem({ value, label, icon }: StatItemProps) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text variant="h2">{value}</Text>
      <Text variant="caption" color="secondary">
        {label}
      </Text>
    </View>
  );
}

// ==================== СТИЛИ ====================

const styles = StyleSheet.create({
  title: {
    marginBottom: spacing.l,
  },

  card: {
    padding: spacing.m,
    borderRadius: borderRadius.l,
    marginBottom: spacing.m,
  },

  streakHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  streakIcon: {
    fontSize: 48,
    marginRight: spacing.m,
  },

  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.m,
  },

  statItem: {
    alignItems: 'center',
  },

  statIcon: {
    fontSize: 24,
    marginBottom: spacing.xs,
  },

  progressSection: {
    marginVertical: spacing.m,
  },

  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.s,
  },

  placeholder: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
});
