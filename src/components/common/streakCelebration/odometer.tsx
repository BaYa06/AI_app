/**
 * Счётчик-одометр числа дней
 * (Clean 8 — перенесено из StreakCelebration.tsx без изменений.)
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { alpha, type ColorScheme } from '@/constants';
import { pluralize } from '@/utils';
import { Text } from '../Text';
import { styles } from './styles';
import { TIMING, SPRING, NUMBER_H, DIGIT_W, type Phase, easeOut, at, bump } from './anim';

/** Ячейка табло: старое значение уезжает вверх, новое въезжает снизу. */
export function Roll({
  from,
  to,
  delay,
  height,
  width,
  color,
  variant,
  reduced,
}: {
  from: string;
  to: string;
  delay: number;
  height: number;
  width?: number;
  color: string;
  variant: 'hero' | 'label';
  reduced: boolean;
}) {
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    p.value = at(delay, withTiming(1, { duration: TIMING.odo.ms, easing: easeOut }));
  }, []);
  const same = from === to;
  const oldStyle = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - p.value),
    transform: [{ translateY: -height * p.value }],
  }));
  const newStyle = useAnimatedStyle(() =>
    same
      ? { opacity: 0.5 + 0.5 * p.value }
      : { opacity: p.value, transform: [{ translateY: height * (1 - p.value) }] }
  );
  const cell = (s: string) => (
    <Text variant={variant} align="center" style={{ color, lineHeight: height }}>
      {s}
    </Text>
  );
  return (
    <View style={{ height, width, overflow: 'hidden' }}>
      {!same && from !== '' && (
        <Animated.View style={[StyleSheet.absoluteFill, oldStyle]}>{cell(from)}</Animated.View>
      )}
      <Animated.View style={newStyle}>{cell(to)}</Animated.View>
    </View>
  );
}

export function OdometerNumber({
  from,
  to,
  colors,
  reduced,
}: { from: number; to: number; colors: ColorScheme } & Phase) {
  const O = TIMING.odo;
  const toS = String(to);
  const fromS = String(from);
  const len = Math.max(fromS.length, toS.length);
  const pf = fromS.padStart(len, ' ');
  const pt = toS.padStart(len, ' ');
  const pop = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    pop.value = at(O.popStart, bump(O.popScale, O.popUpMs, SPRING.pop));
  }, []);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const wordTo = pluralize(to, 'день', 'дня', 'дней');
  const wordFrom = pluralize(from, 'день', 'дня', 'дней');

  return (
    <View style={styles.numberRow} accessible accessibilityLabel={`${to} ${wordTo} подряд`}>
      <Animated.View
        style={[styles.digits, popStyle]}
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length: len }, (_, i) => (
          <Roll
            key={i}
            from={pf[i].trim()}
            to={pt[i].trim()}
            delay={O.start + (len - 1 - i) * O.digitStagger}
            height={NUMBER_H}
            width={DIGIT_W}
            color={colors.streak}
            variant="hero"
            reduced={reduced}
          />
        ))}
      </Animated.View>
      <View
        style={[styles.dayBadge, { backgroundColor: alpha(colors.streak, 10) }]}
        importantForAccessibility="no-hide-descendants"
      >
        <Roll
          from={wordFrom}
          to={wordTo}
          delay={O.start + O.badgeLagMs}
          height={28}
          color={colors.warningText}
          variant="label"
          reduced={reduced}
        />
      </View>
    </View>
  );
}
