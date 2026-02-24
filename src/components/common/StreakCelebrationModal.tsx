/**
 * StreakCelebrationModal
 * @description Celebration modal for streak milestones, styled to match app design system
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import { useThemeColors } from '@/store';
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

const STREAK_ORANGE = '#FF6B00';
const STREAK_ORANGE_LIGHT = '#FF8C33';

interface Props {
  visible: boolean;
  streakCount: number;
  onClose: () => void;
}

function AnimatedCounter({ target, duration = 800 }: { target: number; duration?: number }) {
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
    <Text style={styles.streakNumber}>{display}</Text>
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

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: cardTranslateY.value },
      { scale: cardScale.value },
    ],
    opacity: cardOpacity.value,
  }));

  const medallionAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: medallionScale.value }],
  }));

  const buttonAnimStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
    transform: [{ translateY: buttonTranslateY.value }],
  }));

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

  const dayWord = getDayWord(streakCount);

  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
          <ReAnimated.View style={[styles.card, {
            backgroundColor: colors.background,
            ...Platform.select({
              ios: {
                shadowColor: STREAK_ORANGE,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.25,
                shadowRadius: 32,
              },
              android: { elevation: 12 },
              web: {
                boxShadow: `0 8px 40px ${STREAK_ORANGE}40, 0 2px 16px rgba(0,0,0,0.15)`,
              },
            }),
          }, cardAnimStyle]}>

            {/* Top accent gradient bar */}
            <View style={styles.accentBar}>
              <View style={styles.accentBarGradient} />
            </View>

            {/* Fire medallion */}
            <ReAnimated.View style={[styles.medallionOuter, medallionAnimStyle]}>
              <View style={[styles.medallion, {
                ...Platform.select({
                  ios: {
                    shadowColor: STREAK_ORANGE,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.4,
                    shadowRadius: 20,
                  },
                  web: {
                    boxShadow: `0 0 24px ${STREAK_ORANGE}66`,
                  },
                }),
              }]}>
                <LottieStreak />
              </View>
            </ReAnimated.View>

            {/* Streak count with day label */}
            <View style={styles.counterSection}>
              <AnimatedCounter target={streakCount} />
              <View style={styles.dayBadge}>
                <Text style={styles.dayBadgeText}>
                  {dayWord}
                </Text>
              </View>
            </View>

            {/* Divider */}
            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Title */}
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Серия продолжается!
            </Text>

            {/* Subtitle */}
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Ты учишься {streakCount} {dayWord} подряд.{'\n'}Так держать!
            </Text>

            {/* Continue button */}
            {showButton && (
              <ReAnimated.View style={[styles.buttonWrapper, buttonAnimStyle]}>
                <Pressable
                  style={({ pressed }) => [
                    styles.button,
                    {
                      backgroundColor: colors.primary,
                      opacity: pressed ? 0.85 : 1,
                      ...Platform.select({
                        ios: {
                          shadowColor: colors.primary,
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.25,
                          shadowRadius: 8,
                        },
                        web: {
                          boxShadow: `0 4px 12px ${colors.primary}40`,
                        },
                      }),
                    },
                  ]}
                  onPress={onClose}
                >
                  <Text style={styles.buttonText}>Продолжить</Text>
                </Pressable>
              </ReAnimated.View>
            )}
          </ReAnimated.View>
      </View>
    </Modal>
  );
}

function getDayWord(n: number): string {
  const abs = Math.abs(n) % 100;
  const lastDigit = abs % 10;
  if (abs >= 11 && abs <= 19) return 'дней';
  if (lastDigit === 1) return 'день';
  if (lastDigit >= 2 && lastDigit <= 4) return 'дня';
  return 'дней';
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    borderRadius: 24,
    paddingTop: 0,
    paddingHorizontal: 32,
    paddingBottom: 32,
    maxWidth: 340,
    width: 340,
    alignItems: 'center',
    overflow: 'hidden',
  },

  // Accent bar
  accentBar: {
    width: '100%',
    height: 4,
    marginBottom: 8,
  },
  accentBarGradient: {
    flex: 1,
    backgroundColor: STREAK_ORANGE,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },

  // Medallion
  medallionOuter: {
    marginTop: 8,
    marginBottom: 4,
  },
  medallion: {
    width: 200,
    height: 200,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  // Counter
  counterSection: {
    alignItems: 'center',
    marginTop: -4,
  },
  streakNumber: {
    fontSize: 72,
    fontWeight: '800',
    color: STREAK_ORANGE,
    textAlign: 'center',
    letterSpacing: -2,
    lineHeight: 80,
  },
  dayBadge: {
    backgroundColor: STREAK_ORANGE + '1A',
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
  },
  dayBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: STREAK_ORANGE,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // Divider
  divider: {
    width: 48,
    height: 2,
    borderRadius: 1,
    marginVertical: 16,
  },

  // Text
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },

  // Button
  buttonWrapper: {
    width: '100%',
    marginTop: 24,
  },
  button: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
