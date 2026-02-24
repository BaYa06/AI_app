/**
 * LottieWrapper - Native implementation with lottie-react-native
 */
import React from 'react';
import LottieView from 'lottie-react-native';

export function LottieStreak({ style }: { style?: any }) {
  return (
    <LottieView
      source={require('@/assets/animations/streak.json')}
      autoPlay
      loop={false}
      style={[{ width: 240, height: 240 }, style]}
    />
  );
}
