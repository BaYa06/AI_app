/**
 * StreakCelebrationModal
 * @description Celebration modal for streak milestones, styled to match app design system
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  StyleSheet,
} from 'react-native';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, screenPadding, spacing } from '@/constants';
import { Button } from '@/components/ui/Button';
import { Text } from './Text';
import { LottieStreak } from './LottieWrapper';
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { pluralize } from '@/utils';

interface Props {
  visible: boolean;
  streakCount: number;
  onClose: () => void;
}

function AnimatedCounter({ target, color, duration = 800 }: { target: number; color: string; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const startTime = useRef(0);
  const raf = useRef<number>();

  useEffect(() => {
    if (target <= 0) return;
    startTime.current = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - progress) * (1 - progress);
      setDisplay(Math.round(eased * target));

      if (progress < 1) {
        raf.current = requestAnimationFrame(animate);
      }
    };

    raf.current = requestAnimationFrame(animate);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, duration]);

  return (
    <Text variant="display" align="center" style={{ color }}>{display}</Text>
  );
}

export function StreakCelebrationModal({ visible, streakCount, onClose }: Props) {
  const colors = useThemeColors();
  const [showButton, setShowButton] = useState(false);

  // Card entrance
  const cardTranslateY = useSharedValue(80);
  const cardOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.9);

  // Medallion pulse
  const medallionScale = useSharedValue(0);

  // Button entrance
  const buttonOpacity = useSharedValue(0);
  const buttonTranslateY = useSharedValue(16);

  const cardAnimStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [
        { translateY: cardTranslateY.value },
        { scale: cardScale.value },
      ],
      opacity: cardOpacity.value,
    };
  });

  const medallionAnimStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [{ scale: medallionScale.value }],
    };
  });

  const buttonAnimStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      opacity: buttonOpacity.value,
      transform: [{ translateY: buttonTranslateY.value }],
    };
  });

  useEffect(() => {
    if (visible) {
      setShowButton(false);

      // Reset
      cardTranslateY.value = 80;
      cardOpacity.value = 0;
      cardScale.value = 0.9;
      medallionScale.value = 0;
      buttonOpacity.value = 0;
      buttonTranslateY.value = 16;

      // Card entrance — spring
      cardTranslateY.value = withSpring(0, { damping: 18, stiffness: 140, mass: 0.8 });
      cardOpacity.value = withTiming(1, { duration: 300 });
      cardScale.value = withSpring(1, { damping: 14, stiffness: 160 });

      // Medallion pop — delayed
      medallionScale.value = withDelay(200,
        withSpring(1, { damping: 10, stiffness: 200 })
      );

      // Button appears after 1.5s
      const buttonTimer = setTimeout(() => {
        setShowButton(true);
        buttonOpacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) });
        buttonTranslateY.value = withSpring(0, { damping: 16, stiffness: 140 });
      }, 1500);

      return () => {
        clearTimeout(buttonTimer);
      };
    }
  }, [visible]);

  if (!visible) return null;

  const dayWord = pluralize(streakCount, 'день', 'дня', 'дней');

  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
          <ReAnimated.View
            accessibilityViewIsModal
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardAnimStyle]}
          >

            {/* Top accent bar */}
            <View style={[styles.accentBar, { backgroundColor: colors.streak }]} />

            {/* Fire medallion */}
            <ReAnimated.View style={[styles.medallionOuter, medallionAnimStyle]}>
              <View style={styles.medallion}>
                <LottieStreak />
              </View>
            </ReAnimated.View>

            {/* Streak count with day label */}
            <View style={styles.counterSection} accessible accessibilityLabel={`${streakCount} ${dayWord} подряд`}>
              <AnimatedCounter target={streakCount} color={colors.streak} />
              <View style={[styles.dayBadge, { backgroundColor: alpha(colors.streak, 10) }]}>
                <Text variant="overline" style={{ color: colors.warningText }}>
                  {dayWord}
                </Text>
              </View>
            </View>

            {/* Divider */}
            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Title */}
            <Text variant="h2" align="center" accessibilityRole="header" style={{ color: colors.textPrimary }}>
              Серия продолжается!
            </Text>

            {/* Subtitle */}
            <Text variant="body" align="center" style={[styles.subtitle, { color: colors.textSecondary }]}>
              Ты учишься {streakCount} {dayWord} подряд.{'\n'}Так держать!
            </Text>

            {/* Continue button */}
            {showButton && (
              <ReAnimated.View style={[styles.buttonWrapper, buttonAnimStyle]}>
                <Button title="Продолжить" onPress={onClose} fullWidth />
              </ReAnimated.View>
            )}
          </ReAnimated.View>
      </View>
    </Modal>
  );
}


const MEDALLION_SIZE = 200;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: screenPadding,
  },
  // Без тени: окно отделяет затемнение (в тёмной теме тени не используем)
  card: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    overflow: 'hidden',
  },
  accentBar: {
    alignSelf: 'stretch',
    marginHorizontal: -spacing.xl,
    height: 4,
    marginBottom: spacing.xs,
  },
  medallionOuter: {
    marginTop: spacing.xs,
    marginBottom: spacing.xxs,
  },
  medallion: {
    width: MEDALLION_SIZE,
    height: MEDALLION_SIZE,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  counterSection: {
    alignItems: 'center',
  },
  dayBadge: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.m,
    marginTop: spacing.xxs,
  },
  divider: {
    width: 48,
    height: 2,
    borderRadius: borderRadius.full,
    marginVertical: spacing.m,
  },
  subtitle: {
    marginTop: spacing.xs,
  },
  buttonWrapper: {
    width: '100%',
    marginTop: spacing.l,
  },
});
