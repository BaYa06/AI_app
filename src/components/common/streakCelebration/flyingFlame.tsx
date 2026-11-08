/**
 * Огонёк, летящий к дню недели, со шлейфом
 * (Clean 8 — перенесено из StreakCelebration.tsx без изменений.)
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { type ColorScheme } from '@/constants';
import { styles } from './styles';
import { TIMING, linear, at, easeInOutCubic } from './anim';
import { MiniFlame } from './flame';

export type Point = { x: number; y: number };

/** Фаза 4: огонёк перелетает по дуге от пламени к сегодняшнему дню (со шлейфом). */
export function FlyingFlame({ colors, from, to }: { colors: ColorScheme; from: Point; to: Point }) {
  const W = TIMING.week;
  const clock = useSharedValue(0);
  useEffect(() => {
    // Отсчёт идёт с момента вылета, даже если координаты пришли чуть позже
    clock.value = at(W.flyStart, withTiming(1.21, { duration: W.flyMs * 1.21, easing: linear }));
  }, []);
  const side = to.x >= from.x ? 1 : -1;
  const ctrl = { x: from.x + (to.x - from.x) * 0.9 + side * 50, y: from.y - 10 };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {[0, 1, 2, 3].map((k) => (
        <FlyingFlameCopy
          key={k}
          k={k}
          clock={clock}
          from={from}
          to={to}
          ctrl={ctrl}
          side={side}
          colors={colors}
        />
      ))}
    </View>
  );
}

export const TRAIL_OPACITY = [1, 0.4, 0.2, 0.1];

export function FlyingFlameCopy({
  k,
  clock,
  from,
  to,
  ctrl,
  side,
  colors,
}: {
  k: number;
  clock: SharedValue<number>;
  from: Point;
  to: Point;
  ctrl: Point;
  side: number;
  colors: ColorScheme;
}) {
  const BASE = 36;
  const style = useAnimatedStyle(() => {
    const raw = clock.value - k * 0.07;
    if (raw <= 0 || raw >= 1) return { opacity: 0 };
    const e = easeInOutCubic(raw);
    const m = 1 - e;
    const x = m * m * from.x + 2 * m * e * ctrl.x + e * e * to.x;
    const y = m * m * from.y + 2 * m * e * ctrl.y + e * e * to.y;
    const size = (36 - 16 * e) * (1 - k * 0.12);
    return {
      opacity: TRAIL_OPACITY[k] * (raw > 0.88 ? (1 - raw) / 0.12 : 1),
      transform: [
        { translateX: x - BASE / 2 },
        { translateY: y - BASE / 2 },
        { rotate: `${side * 18 * (1 - 2 * e)}deg` },
        { scale: size / BASE },
      ],
    };
  });
  return (
    <Animated.View style={[styles.abs, { left: 0, top: 0 }, style]}>
      <MiniFlame size={BASE} colors={colors} onFill={false} />
    </Animated.View>
  );
}
