/**
 * RatingButtons Component
 * @description Кнопки оценки для режима изучения
 */
import React, { memo, useCallback } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useThemeColors } from '@/store';
import { Text, Caption } from '../common/Text';
import { spacing, borderRadius } from '@/constants';
import type { Rating, Card } from '@/types';
import { getExpectedIntervals } from '@/services/SRSService';

interface RatingButtonsProps {
  card: Card;
  onRate: (rating: Rating) => void;
  disabled?: boolean;
}

const RATING_LABELS: Record<Rating, string> = {
  1: 'Снова',
  2: 'Сложно',
  3: 'Хорошо',
  4: 'Легко',
};

export const RatingButtons = memo<RatingButtonsProps>(function RatingButtons({
  card,
  onRate,
  disabled = false,
}) {
  const colors = useThemeColors();
  const intervals = getExpectedIntervals(card);

  const ratingColors: Record<Rating, string> = {
    1: colors.ratingAgain,
    2: colors.ratingHard,
    3: colors.ratingGood,
    4: colors.ratingEasy,
  };

  return (
    <View style={styles.container}>
      {([1, 2, 3, 4] as Rating[]).map((rating) => (
        <RatingButton
          key={rating}
          rating={rating}
          label={RATING_LABELS[rating]}
          interval={intervals[rating]}
          color={ratingColors[rating]}
          onPress={onRate}
          disabled={disabled}
        />
      ))}
    </View>
  );
});

// ==================== ОТДЕЛЬНАЯ КНОПКА ====================

interface RatingButtonProps {
  rating: Rating;
  label: string;
  interval: string;
  color: string;
  onPress: (rating: Rating) => void;
  disabled: boolean;
}

const RatingButton = memo<RatingButtonProps>(function RatingButton({
  rating,
  label,
  interval,
  color,
  onPress,
  disabled,
}) {
  const colors = useThemeColors();

  const handlePress = useCallback(() => {
    if (!disabled) {
      onPress(rating);
    }
  }, [rating, onPress, disabled]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: pressed ? color : colors.surface,
          borderColor: color,
          opacity: disabled ? 0.5 : pressed ? 0.9 : 1,
        },
      ]}
    >
      {({ pressed }) => (
        <>
          <Text
            variant="button"
            style={{ color: pressed ? colors.textInverse : color }}
          >
            {label}
          </Text>
          <Caption style={{ color: pressed ? colors.textInverse : colors.textTertiary }}>
            {interval}
          </Caption>
        </>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
    paddingHorizontal: spacing.m,
  },

  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.m,
    borderRadius: borderRadius.m,
    borderWidth: 2,
    gap: spacing.xxs,
  },
});
