/**
 * Частицы: искры, лучи, конфетти
 * (Clean 8 — перенесено из StreakCelebration.tsx без изменений.)
 */
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Line, Path } from 'react-native-svg';
import { borderRadius, type ColorScheme } from '@/constants';
import { styles } from './styles';
import { TIMING, PARTICLES, FLAME, K, ZAP_PATH, type Phase, easeOut, linear, at } from './anim';

export type Spark = {
  vx: number;
  vy: number;
  delay: number;
  life: number;
  size: number;
  round: boolean;
  spin: number;
  color: string;
};

export function makeSparks(count: number, colors: ColorScheme): Spark[] {
  return Array.from({ length: count }, (_, i) => {
    const ang = ((-155 + 130 * Math.random()) * Math.PI) / 180;
    const speed = PARTICLES.speedMin + (PARTICLES.speedMax - PARTICLES.speedMin) * Math.random();
    return {
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      delay: Math.random() * TIMING.sparks.maxDelay,
      life: TIMING.sparks.lifeMin + (TIMING.sparks.lifeMax - TIMING.sparks.lifeMin) * Math.random(),
      size: 6 + 5 * Math.random(),
      round: Math.random() > 0.35,
      spin: -180 + 360 * Math.random(),
      color: i < 2 ? colors.primary : i % 3 === 0 ? colors.streak : colors.warning,
    };
  });
}

export function SparkDot({ spark, clock }: { spark: Spark; clock: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const age = clock.value - spark.delay;
    if (age < 0 || age > spark.life) return { opacity: 0 };
    const a = age / 1000;
    const u = age / spark.life;
    const fade = u < 0.4 ? 1 : 1 - Math.pow((u - 0.4) / 0.6, 2);
    return {
      opacity: fade,
      transform: [
        { translateX: spark.vx * a },
        { translateY: spark.vy * a + 0.5 * PARTICLES.gravity * a * a },
        { rotate: `${spark.spin * u}deg` },
        { scale: 1 - 0.8 * u },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.spark,
        {
          width: spark.size,
          height: spark.size,
          marginLeft: -spark.size / 2,
          marginTop: -spark.size / 2,
          borderRadius: spark.round ? borderRadius.full : 2,
          backgroundColor: spark.color,
        },
        style,
      ]}
    />
  );
}

/** Фаза 2: искры разлетаются по дугам с гравитацией. Все частицы читают одни часы. */
export function Sparks({ colors, count }: { colors: ColorScheme; count: number }) {
  const sparks = useMemo(() => makeSparks(count, colors), [count, colors]);
  const clock = useSharedValue(0);
  useEffect(() => {
    const total = TIMING.sparks.maxDelay + TIMING.sparks.lifeMax;
    clock.value = at(
      TIMING.sparks.start,
      withTiming(total + 1, { duration: total + 1, easing: linear })
    );
  }, []);
  return (
    <View pointerEvents="none" style={[styles.abs, { left: FLAME / 2, top: 70 * K }]}>
      {sparks.map((s, i) => (
        <SparkDot key={i} spark={s} clock={clock} />
      ))}
    </View>
  );
}

/** Фаза 6: редкая одиночная искра над пламенем. */
export function IdleSpark({
  colors,
  delay,
  every,
  dx,
}: {
  colors: ColorScheme;
  delay: number;
  every: number;
  dx: number;
}) {
  const p = useSharedValue(0);
  const life = TIMING.idle.sparkLife;
  useEffect(() => {
    p.value = at(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: life, easing: linear }),
          withTiming(0, { duration: 0 }),
          withDelay(every - life, withTiming(0, { duration: 0 }))
        ),
        -1
      )
    );
  }, []);
  const style = useAnimatedStyle(() => {
    const u = p.value;
    if (u <= 0 || u >= 1) return { opacity: 0 };
    const a = (u * life) / 1000;
    return {
      opacity: 0.9 * (1 - u * u),
      transform: [
        { translateX: dx * a },
        { translateY: -150 * a + 60 * a * a },
        { scale: 1 - 0.7 * u },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.idleSpark,
        { backgroundColor: colors.warning, left: FLAME / 2 - 3, top: 46 * K },
        style,
      ]}
    />
  );
}

/** Рубеж: медленно вращающееся кольцо лучей вокруг пламени. */
export function RaysRing({ colors, reduced }: { colors: ColorScheme } & Phase) {
  const M = TIMING.milestone;
  const k = useSharedValue(reduced ? 1 : 0);
  const rot = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    k.value = at(M.raysStart, withTiming(1, { duration: M.raysFadeMs, easing: easeOut }));
    rot.value = at(
      M.raysStart,
      withRepeat(withTiming(360, { duration: M.rayPeriodMs, easing: linear }), -1)
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: k.value,
    transform: [{ rotate: `${rot.value}deg` }, { scale: 0.85 + 0.15 * k.value }],
  }));
  const size = 200 * K;
  const rays = Array.from({ length: 16 }, (_, i) => {
    const long = i % 2 === 0;
    const a = (i * 22.5 * Math.PI) / 180;
    const r0 = long ? 80 : 82;
    const r1 = long ? 98 : 91;
    return (
      <Line
        key={i}
        x1={100 + Math.cos(a) * r0}
        y1={100 + Math.sin(a) * r0}
        x2={100 + Math.cos(a) * r1}
        y2={100 + Math.sin(a) * r1}
        stroke={long ? colors.primary : colors.secondary}
        strokeOpacity={long ? 0.4 : 0.2}
        strokeWidth={4}
        strokeLinecap="round"
      />
    );
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.abs,
        { width: size, height: size, left: (FLAME - size) / 2, top: (FLAME - size) / 2 + 8 },
        style,
      ]}
    >
      <Svg width={size} height={size} viewBox="0 0 200 200">
        {rays}
      </Svg>
    </Animated.View>
  );
}

export type ConfettiPiece = {
  x: number;
  delay: number;
  dur: number;
  sway: number;
  swayF: number;
  rot0: number;
  spin: number;
  size: number;
  bolt: boolean;
  color: string;
};

export function ConfettiItem({
  piece,
  clock,
  screenH,
}: {
  piece: ConfettiPiece;
  clock: SharedValue<number>;
  screenH: number;
}) {
  const style = useAnimatedStyle(() => {
    const age = clock.value - piece.delay;
    if (age < 0 || age > piece.dur) return { opacity: 0 };
    const u = age / piece.dur;
    return {
      opacity: u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25,
      transform: [
        { translateX: Math.sin(u * piece.swayF * Math.PI) * piece.sway },
        { translateY: -30 + (screenH + 60) * (0.3 * u + 0.7 * u * u) },
        { rotate: `${piece.rot0 + piece.spin * u}deg` },
      ],
    };
  });
  return (
    <Animated.View style={[styles.abs, { left: `${piece.x}%`, top: 0 }, style]}>
      {piece.bolt ? (
        <Svg width={piece.size * 1.3} height={piece.size * 1.3} viewBox="0 0 24 24">
          <Path d={ZAP_PATH} fill={piece.color} />
        </Svg>
      ) : (
        <View
          style={{
            width: piece.size * 0.7,
            height: piece.size * 0.7,
            borderRadius: borderRadius.full,
            backgroundColor: piece.color,
          }}
        />
      )}
    </Animated.View>
  );
}

/** Рубеж: конфетти из молний и кружков на весь экран. */
export function Confetti({ colors, screenH }: { colors: ColorScheme; screenH: number }) {
  const pieces = useMemo<ConfettiPiece[]>(() => {
    const palette = [colors.primary, colors.secondary, colors.streak, colors.warning];
    return Array.from({ length: PARTICLES.confetti }, (_, i) => ({
      x: 3 + 94 * Math.random(),
      delay: Math.random() * PARTICLES.confettiSpread,
      dur: 1300 + 400 * Math.random(),
      sway: 8 + 14 * Math.random(),
      swayF: 2 + 2 * Math.random(),
      rot0: 360 * Math.random(),
      spin: -540 + 1080 * Math.random(),
      size: 9 + 6 * Math.random(),
      bolt: i % 2 === 0,
      color: palette[i % 4],
    }));
  }, [colors]);
  const clock = useSharedValue(0);
  useEffect(() => {
    const total = PARTICLES.confettiSpread + 1700;
    clock.value = at(
      TIMING.milestone.confettiStart,
      withTiming(total, { duration: total, easing: linear })
    );
  }, []);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <ConfettiItem key={i} piece={p} clock={clock} screenH={screenH} />
      ))}
    </View>
  );
}
