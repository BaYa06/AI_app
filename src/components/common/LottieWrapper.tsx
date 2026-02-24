/**
 * LottieWrapper - Web fallback (no Lottie on web)
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

export function LottieStreak({ style }: { style?: any }) {
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
    <Animated.View style={[styles.container, style, { transform: [{ scale }] }]}>
      <Animated.Text style={styles.emoji}>🔥</Animated.Text>
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
  emoji: {
    fontSize: 120,
    textAlign: 'center',
  },
});
