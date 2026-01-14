/**
 * FlashCard Component
 * @description Компонент флеш-карточки с анимацией переворота
 */
import React, { memo, useCallback } from 'react';
import { View, StyleSheet, Pressable, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { useThemeColors } from '@/store';
import { Text } from '../common/Text';
import { spacing, borderRadius, animation } from '@/constants';
import type { Card } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - spacing.l * 2;
const CARD_HEIGHT = CARD_WIDTH * 0.7;

interface FlashCardProps {
  card: Card;
  isFlipped: boolean;
  onFlip?: () => void;
}

export const FlashCard = memo<FlashCardProps>(function FlashCard({
  card,
  isFlipped,
  onFlip,
}) {
  const colors = useThemeColors();
  const front = card.frontText ?? (card as any).front ?? '';
  const back = card.backText ?? (card as any).back ?? '';
  const flipProgress = useSharedValue(0);

  // Анимация переворота
  React.useEffect(() => {
    flipProgress.value = withTiming(isFlipped ? 1 : 0, {
      duration: animation.normal,
      easing: Easing.inOut(Easing.ease),
    });
  }, [isFlipped]);

  // Стиль передней стороны
  const frontAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 1], [0, 180]);
    const opacity = interpolate(flipProgress.value, [0, 0.5, 0.5, 1], [1, 1, 0, 0]);

    return {
      transform: [{ perspective: 1000 }, { rotateY: `${rotateY}deg` }],
      opacity,
      backfaceVisibility: 'hidden',
    };
  });

  // Стиль задней стороны
  const backAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 1], [180, 360]);
    const opacity = interpolate(flipProgress.value, [0, 0.5, 0.5, 1], [0, 0, 1, 1]);

    return {
      transform: [{ perspective: 1000 }, { rotateY: `${rotateY}deg` }],
      opacity,
      backfaceVisibility: 'hidden',
    };
  });

  const handlePress = useCallback(() => {
    onFlip?.();
  }, [onFlip]);

  const cardStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  };

  return (
    <Pressable onPress={handlePress} style={styles.container}>
      {/* Передняя сторона */}
      <Animated.View style={[styles.card, cardStyle, frontAnimatedStyle]}>
        <View style={styles.content}>
          <Text variant="cardText" align="center">
            {front}
          </Text>
        </View>
        <View style={[styles.label, { backgroundColor: colors.primary }]}>
          <Text variant="caption" color="inverse">
            Вопрос
          </Text>
        </View>
      </Animated.View>

      {/* Задняя сторона */}
      <Animated.View style={[styles.card, styles.backCard, cardStyle, backAnimatedStyle]}>
        <View style={styles.content}>
          <Text variant="cardText" align="center">
            {back}
          </Text>
        </View>
        <View style={[styles.label, { backgroundColor: colors.success }]}>
          <Text variant="caption" color="inverse">
            Ответ
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    alignSelf: 'center',
  },

  card: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },

  backCard: {
    position: 'absolute',
    top: 0,
    left: 0,
  },

  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.l,
  },

  label: {
    position: 'absolute',
    top: spacing.m,
    left: spacing.m,
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.s,
  },
});
