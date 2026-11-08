/** Плитка набора на главной: появляется с задержкой по индексу (Clean 8a — вынесено из HomeScreen). */
import React, { useEffect } from 'react';
import ReanimatedAnimated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

export const StaggerCard = React.memo(function StaggerCard({
  index,
  children,
}: {
  index: number;
  children: React.ReactNode;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(14);

  useEffect(() => {
    const delay = Math.min(index, 7) * 70;
    opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
    translateY.value = withDelay(delay, withTiming(0, { duration: 300 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <ReanimatedAnimated.View style={animStyle}>{children}</ReanimatedAnimated.View>;
});
