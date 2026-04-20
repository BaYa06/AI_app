/**
 * ProgressBar Component
 * @description Индикатор прогресса
 */
import React, { memo, useEffect, useCallback } from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useThemeColors } from '@/store';

interface ProgressBarProps {
  progress: number; // 0-100
  height?: number;
  color?: string;
  backgroundColor?: string;
  animated?: boolean;
  style?: ViewStyle;
}

export const ProgressBar = memo<ProgressBarProps>(function ProgressBar({
  progress,
  height = 8,
  color,
  backgroundColor,
  animated = true,
  style,
}) {
  const colors = useThemeColors();
  const containerW = useSharedValue(0);
  const scaleX = useSharedValue(0);

  const barColor = color || colors.primary;
  const bgColor = backgroundColor || colors.surfaceVariant;

  const handleLayout = useCallback((e: any) => {
    containerW.value = e.nativeEvent.layout.width;
  }, []);

  useEffect(() => {
    const clamped = Math.min(100, Math.max(0, progress)) / 100;
    if (animated && Platform.OS !== 'web') {
      scaleX.value = withTiming(clamped, {
        duration: 700,
        easing: Easing.bezier(0.34, 1.1, 0.64, 1),
      });
    } else {
      scaleX.value = clamped;
    }
  }, [progress, animated]);

  const animStyle = useAnimatedStyle(() => {
    const w = containerW.value;
    return {
      transform: [
        { translateX: -(w * (1 - scaleX.value)) / 2 },
        { scaleX: scaleX.value },
      ],
    };
  });

  if (Platform.OS === 'web') {
    const clampedProgress = Math.min(100, Math.max(0, progress));
    return (
      <View
        style={[
          styles.container,
          { height, backgroundColor: bgColor, borderRadius: height / 2 },
          style,
        ]}
      >
        <View
          style={[
            styles.bar,
            {
              backgroundColor: barColor,
              borderRadius: height / 2,
              width: `${clampedProgress}%`,
              // @ts-ignore - CSS transition для web
              transition: animated
                ? 'width 0.7s cubic-bezier(0.34, 1.1, 0.64, 1)'
                : 'none',
            },
          ]}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { height, backgroundColor: bgColor, borderRadius: height / 2 },
        style,
      ]}
      onLayout={handleLayout}
    >
      <ReAnimated.View
        style={[
          styles.bar,
          { backgroundColor: barColor, borderRadius: height / 2 },
          animStyle,
        ]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    width: '100%',
  },
});
