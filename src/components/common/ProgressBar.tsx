/**
 * ProgressBar Component
 * @description Индикатор прогресса
 */
import React, { memo, useState, useEffect } from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
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
  const [currentProgress, setCurrentProgress] = useState(0);

  const barColor = color || colors.primary;
  const bgColor = backgroundColor || colors.surfaceVariant;

  useEffect(() => {
    const clampedProgress = Math.min(100, Math.max(0, progress));
    
    if (animated && Platform.OS === 'web') {
      // Простая CSS анимация для веб
      setCurrentProgress(clampedProgress);
    } else {
      setCurrentProgress(clampedProgress);
    }
  }, [progress, animated]);

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
            width: `${currentProgress}%`,
            // @ts-ignore - CSS transition для web
            transition: animated ? 'width 0.3s ease-out' : 'none',
          },
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
  },
});
