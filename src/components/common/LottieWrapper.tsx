/**
 * LottieWrapper - Web fallback (no Lottie on web)
 * Вместо анимации Lottie — иконка огня серии (lucide, цвет streak) с пружинным появлением.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { Flame } from 'lucide-react-native';
import { useThemeColors } from '@/store';

// Иконка крупнее шкалы iconSize: заменяет полноэкранную анимацию 240×240
const FLAME_SIZE = 120;

export function LottieStreak({ style }: { style?: any }) {
  const colors = useThemeColors();
  const scale = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 3,
      tension: 100,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.container, style, { transform: [{ scale }] }]}
    >
      <Flame size={FLAME_SIZE} color={colors.streak} fill={colors.streak} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 240,
    height: 240,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
