/**
 * Неделя серии: модель дней и ячейка
 * (Clean 8 — перенесено из StreakCelebration.tsx без изменений.)
 */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Polyline } from 'react-native-svg';
import { alpha, type ColorScheme } from '@/constants';
import { Text } from '../Text';
import { styles } from './styles';
import { TIMING, SPRING, DAYS, DAY_SIZE, easeOut, at, bump } from './anim';
import { MiniFlame } from './flame';

export type DayState = 'done' | 'today' | 'empty';

/** Закрашены дни серии, которые уже прошли на этой неделе, плюс сегодняшний. */
export function weekModel(streak: number, todayIdx: number): DayState[] {
  const prior = Math.min(Math.max(streak - 1, 0), todayIdx);
  return DAYS.map((_, i) =>
    i === todayIdx ? 'today' : i < todayIdx && i >= todayIdx - prior ? 'done' : 'empty'
  );
}

export function DayCell({
  label,
  state,
  order,
  colors,
  reduced,
  cellRef,
}: {
  label: string;
  state: DayState;
  order: number;
  colors: ColorScheme;
  reduced: boolean;
  cellRef?: React.Ref<View>;
}) {
  const W = TIMING.week;
  const isToday = state === 'today';
  const scale = useSharedValue(1);
  const halo = useSharedValue(0);
  const fill = useSharedValue(state === 'done' || (isToday && reduced) ? 1 : 0);
  const flame = useSharedValue(state === 'done' || (isToday && reduced) ? 1 : 0);
  const check = useSharedValue(isToday && reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) return;
    if (state === 'done') {
      const delay = W.waveStart + order * W.waveStep;
      const half = W.waveMs / 2;
      scale.value = at(
        delay,
        withSequence(withTiming(W.waveScale, { duration: half }), withTiming(1, { duration: half }))
      );
      halo.value = at(
        delay,
        withSequence(withTiming(0.4, { duration: half }), withTiming(0, { duration: half }))
      );
    } else if (isToday) {
      fill.value = at(W.fillAt, withTiming(1, { duration: W.fillMs, easing: easeOut }));
      scale.value = at(W.fillAt, bump(W.bounceScale, W.bounceUpMs, SPRING.bounce));
      flame.value = at(W.fillAt + 40, withSpring(1, SPRING.bounce));
      check.value = at(W.fillAt + W.fillMs, withSpring(1, SPRING.pop));
    }
  }, []);

  const cellStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const fillStyle = useAnimatedStyle(() => ({
    opacity: fill.value,
    transform: [{ scale: 0.6 + 0.4 * fill.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: 1 - fill.value }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: halo.value }));
  const flameStyle = useAnimatedStyle(() => ({ transform: [{ scale: flame.value }] }));
  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: check.value }] }));

  return (
    <View style={styles.dayCol}>
      <Text
        variant="caption"
        style={{ color: isToday ? colors.warningText : colors.textSecondary }}
      >
        {label}
      </Text>
      <Animated.View ref={cellRef} collapsable={false} style={[styles.dayCell, cellStyle]}>
        <View style={[styles.dayFill, { backgroundColor: colors.surfaceMuted }]} />
        {isToday && (
          <Animated.View
            style={[
              styles.dayFill,
              styles.dayRing,
              { borderColor: alpha(colors.streak, 40) },
              ringStyle,
            ]}
          />
        )}
        {state !== 'empty' && (
          <>
            <Animated.View
              style={[styles.dayFill, { backgroundColor: colors.streak }, fillStyle]}
            />
            <Animated.View
              style={[styles.dayFill, { backgroundColor: colors.warning }, haloStyle]}
            />
            <Animated.View style={[styles.dayFill, styles.center, flameStyle]}>
              <MiniFlame size={DAY_SIZE * 0.58} colors={colors} onFill />
            </Animated.View>
          </>
        )}
        {isToday && (
          <Animated.View style={[styles.check, { backgroundColor: colors.success }, checkStyle]}>
            <Svg width={10} height={10} viewBox="0 0 12 12">
              <Polyline
                points="2.5,6.5 5,9 9.5,3.5"
                fill="none"
                stroke={colors.onPrimary}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}
