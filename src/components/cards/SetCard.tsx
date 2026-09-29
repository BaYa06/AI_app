/**
 * SetCard Component
 * @description Карточка набора для списка
 */
import React, { memo, useCallback } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Star } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text, Caption } from '../common/Text';
import { CategoryIcon, ProgressBar } from '../ui';
import { spacing, borderRadius, iconSize, getDeckAccentColor } from '@/constants';
import { pluralize } from '@/utils';
import type { CardSet } from '@/types';

interface SetCardProps {
  set: CardSet;
  onPress?: (setId: string) => void;
  onLongPress?: (setId: string) => void;
}

export const SetCard = memo<SetCardProps>(function SetCard({
  set,
  onPress,
  onLongPress,
}) {
  const colors = useThemeColors();

  const handlePress = useCallback(() => {
    onPress?.(set.id);
  }, [set.id, onPress]);

  const handleLongPress = useCallback(() => {
    onLongPress?.(set.id);
  }, [set.id, onLongPress]);

  // Расчет прогресса
  const progress = set.cardCount > 0 
    ? Math.round((set.masteredCount / set.cardCount) * 100) 
    : 0;

  // Форматирование времени
  const lastStudied = set.lastStudiedAt
    ? formatRelativeTime(set.lastStudiedAt)
    : 'Не изучался';

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
        pressed && styles.pressed,
      ]}
    >
      {/* Заголовок */}
      <View style={styles.header}>
        {/* Иконка категории вместо эмодзи из данных набора (брендбук, раздел 6) */}
        <CategoryIcon category={set.category} size="m" color={getDeckAccentColor(set.id)} background />
        <View style={styles.titleContainer}>
          <Text variant="h3" numberOfLines={1}>
            {set.title}
          </Text>
          <Caption>{set.cardCount} {pluralize(set.cardCount, 'карточка', 'карточки', 'карточек')}</Caption>
        </View>
        {set.isFavorite && <Star size={iconSize.s} color={colors.star} fill={colors.star} accessibilityLabel="В избранном" />}
      </View>

      {/* Прогресс */}
      <View style={styles.progressSection}>
        <ProgressBar progress={progress} />
        <Caption style={styles.progressText}>{progress}% изучено</Caption>
      </View>

      {/* Статистика */}
      <View style={styles.stats}>
        <StatBadge
          count={set.reviewCount}
          label="На сегодня"
          color={colors.cardReview}
        />
        <StatBadge
          count={set.learningCount}
          label="Изучаются"
          color={colors.cardLearning}
        />
        <StatBadge
          count={set.masteredCount}
          label="Изучено"
          color={colors.cardMastered}
        />
      </View>

      {/* Последняя активность */}
      <Caption style={styles.lastStudied}>
        Последнее изучение: {lastStudied}
      </Caption>
    </Pressable>
  );
});

// ==================== ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ ====================

interface StatBadgeProps {
  count: number;
  label: string;
  color: string;
}

const StatBadge = memo<StatBadgeProps>(function StatBadge({ count, label, color }) {
  return (
    <View style={styles.statBadge}>
      <View style={[styles.statDot, { backgroundColor: color }]} />
      <Caption>
        {count} {label}
      </Caption>
    </View>
  );
});

// ==================== УТИЛИТЫ ====================

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  if (hours < 24) return `${hours} ч назад`;
  if (days < 7) return `${days} дн назад`;
  
  return new Date(timestamp).toLocaleDateString('ru-RU');
}

// ==================== СТИЛИ ====================

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.l,
    borderWidth: 1,
    padding: spacing.m,
    marginBottom: spacing.m,
  },

  pressed: {
    opacity: 0.85,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    marginBottom: spacing.m,
  },

  titleContainer: {
    flex: 1,
  },

  progressSection: {
    marginBottom: spacing.m,
  },

  progressText: {
    marginTop: spacing.xs,
    textAlign: 'right',
  },

  stats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.s,
  },

  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },

  statDot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
  },

  lastStudied: {
    textAlign: 'right',
  },
});
