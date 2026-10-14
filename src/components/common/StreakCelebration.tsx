/**
 * StreakCelebration — полноэкранный праздник серии (после занятия, когда серия выросла на 1).
 *
 * Плавность: всё движение считается на UI-потоке (Reanimated: shared values + useAnimatedStyle),
 * во время анимации React экран не перерисовывает. Анимируются только transform и opacity
 * обычных View, SVG внутри статичны — их свойства не анимируем.
 *
 * Хореография из прототипа «Серия Flashly»: искра → разжигание (волна, искры, haptic) →
 * смена числа → огонёк перелетает в сегодняшний день → текст и кнопка → спокойное мерцание.
 * Варианты: обычный день, рубеж (7, 30, 50, 100, 365), первый день, уменьшение анимации.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Polyline, RadialGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, screenPadding, spacing, type ColorScheme } from '@/constants';
import { Button } from '@/components/ui/Button';
import { pluralize } from '@/utils';
import { triggerHaptic } from '@/utils/haptic';
import { Text } from './Text';

/* ─────────────── Тайминги (мс от показа экрана), пружины, частицы ─────────────── */

const TIMING = {
  backdropMs: 300,
  ember: { start: 300, appearMs: 150, flares: [420, 580], flareMs: 75, fadeAt: 700, fadeMs: 160 },
  ignite: { start: 700, growMs: 300, layerDelay: [0, 50, 100], fromScaleY: 0.2, peakScaleY: 1.15 },
  shock: { start: 780, ms: 520, from: 0.6, to: 2.2, alpha: 0.4 },
  sparks: { start: 780, maxDelay: 80, lifeMin: 500, lifeMax: 700 },
  odo: { start: 1100, ms: 420, digitStagger: 70, popStart: 1250, popUpMs: 130, popScale: 1.2, badgeLagMs: 120 },
  week: {
    flyStart: 1400, flyMs: 320, fillAt: 1720, fillMs: 120, bounceUpMs: 110, bounceScale: 1.25,
    waveStart: 1500, waveStep: 40, waveMs: 240, waveScale: 1.15,
  },
  text: { start: 1800, ms: 380, gapMs: 80, rise: 12 },
  button: { start: 2150, ms: 260, enableAt: 2400 },
  idle: { start: 2400, rampMs: 600, periods: [1500, 1200, 900], scaleAmp: 0.04, tiltDeg: 2, sparkLife: 900, sparkEvery: [2300, 3100] },
  milestone: { raysStart: 700, raysFadeMs: 400, rayPeriodMs: 24000, coreShift: 1000, coreShiftMs: 300, boltFlash: 1150, confettiStart: 1300 },
  reducedFadeMs: 200,
} as const;

// Общий период часов мерцания: кратен всем периодам слоёв (и удвоенным для наклона) — без скачка на стыке
const IDLE_LOOP_MS = 36000;

const SPRING = {
  settle: { damping: 12, stiffness: 180, mass: 1 },
  pop: { damping: 14, stiffness: 220, mass: 1 },
  bounce: { damping: 11, stiffness: 260, mass: 1 },
} as const;

const PARTICLES = { sparksNormal: 18, sparksMilestone: 14, gravity: 620, speedMin: 250, speedMax: 420, confetti: 30, confettiSpread: 300 };
const MILESTONES = [7, 30, 50, 100, 365];
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

// Пламя: пути в системе 160×160, рисуем в размере FLAME
const FLAME = 200;
const K = FLAME / 160;
const FLAME_ORIGIN_Y = 150 * K; // точка «корня» пламени — вокруг неё растут и качаются слои
const ORIGIN_OFF = FLAME_ORIGIN_Y - FLAME / 2;
const NUMBER_H = 80;
const DIGIT_W = 46;
const DAY_SIZE = 40;

const ZAP_PATH = 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z';
const FLAME_PATHS = {
  outer: 'M82 6 C90 30 120 52 124 90 C128 128 108 152 80 152 C52 152 32 130 36 98 C38 80 48 68 56 54 C58 66 64 74 70 76 C68 52 74 28 82 6 Z',
  mid: 'M80 52 C86 70 108 84 110 108 C112 134 98 148 80 148 C62 148 48 134 50 112 C51 100 58 92 63 82 C65 90 69 94 73 95 C72 78 75 64 80 52 Z',
  core: 'M80 92 C84 104 96 112 96 126 C96 138 89 146 80 146 C71 146 64 138 64 126 C64 118 69 114 72 108 C74 112 76 114 78 114 C77 106 78 98 80 92 Z',
};
// Молния в ядре: центр (80, 126), размер 24 × 0.85 в системе 160
const BOLT = { size: 20.4 * K, left: (80 - 10.2) * K, top: (126 - 10.2) * K };

type Mode = 'normal' | 'milestone' | 'first';
type Phase = { reduced: boolean };

const easeOut = Easing.out(Easing.cubic);
const linear = Easing.linear;

/** withDelay с сохранением типа значения (отсчёт задержки — от показа экрана). */
function at<T extends number>(delayMs: number, anim: T): T {
  return withDelay(delayMs, anim) as T;
}

function easeInOutCubic(x: number) {
  'worklet';
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function clamp01(x: number) {
  'worklet';
  return Math.min(1, Math.max(0, x));
}

/** withSequence(withTiming(peak), withSpring(1)) — короткий «поп» 1 → peak → 1. */
function bump(peak: number, upMs: number, spring: { damping: number; stiffness: number; mass: number }) {
  return withSequence(withTiming(peak, { duration: upMs, easing: easeOut }), withSpring(1, spring));
}

/* ─────────────── Графика ─────────────── */

function MiniFlame({ size, colors, onFill }: { size: number; colors: ColorScheme; onFill: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 160 160">
      <Path d={FLAME_PATHS.outer} fill={onFill ? colors.onPrimary : colors.streak} />
      <Path d={FLAME_PATHS.mid} fill={colors.warning} />
    </Svg>
  );
}

/** Один слой пламени: вырастает из уголька, потом мерцает со своим периодом. */
function FlameLayer({
  index, idleAmp, clock, reduced, children,
}: { index: number; idleAmp: SharedValue<number>; clock: SharedValue<number>; reduced: boolean; children: React.ReactNode }) {
  const ig = TIMING.ignite;
  const sy = useSharedValue<number>(reduced ? 1 : ig.fromScaleY);
  const op = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) return;
    const delay = ig.start + ig.layerDelay[index];
    op.value = at(delay, withTiming(1, { duration: 80 }));
    sy.value = at(delay, withSequence(
      withTiming(ig.peakScaleY, { duration: ig.growMs, easing: easeOut }),
      withSpring(1, SPRING.settle),
    ));
  }, []);

  const style = useAnimatedStyle(() => {
    const per = TIMING.idle.periods[index];
    const t = clock.value;
    const amp = idleAmp.value;
    const flicker = 1 + TIMING.idle.scaleAmp * amp * Math.sin((2 * Math.PI * t) / per + index * 1.3);
    const tilt = TIMING.idle.tiltDeg * amp * Math.sin((2 * Math.PI * t) / (per * 2) + index * 2.6);
    const s = sy.value;
    const sx = interpolate(s, [ig.fromScaleY, 1, ig.peakScaleY], [0.5, 1, 1.05]);
    return {
      opacity: op.value,
      transform: [
        { translateY: ORIGIN_OFF },
        { rotate: `${tilt}deg` },
        { scaleX: sx },
        { scaleY: s * flicker },
        { translateY: -ORIGIN_OFF },
      ],
    };
  });

  return <Animated.View style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>;
}

/** Рубеж: ядро становится фиолетовым, молния вспыхивает и остаётся видимой. */
function MilestoneCore({ colors, reduced }: { colors: ColorScheme } & Phase) {
  const M = TIMING.milestone;
  const shift = useSharedValue(reduced ? 1 : 0);
  const bolt = useSharedValue(reduced ? 1.15 : 1);
  const burst = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    shift.value = at(M.coreShift, withTiming(1, { duration: M.coreShiftMs }));
    bolt.value = at(M.boltFlash, withSequence(
      withTiming(1.7, { duration: 120, easing: easeOut }),
      withSpring(1.15, SPRING.pop),
    ));
    burst.value = at(M.boltFlash, withTiming(1, { duration: 350, easing: easeOut }));
  }, []);

  const shiftStyle = useAnimatedStyle(() => ({ opacity: shift.value }));
  const boltStyle = useAnimatedStyle(() => ({ opacity: shift.value, transform: [{ scale: bolt.value }] }));
  const burstStyle = useAnimatedStyle(() => ({
    opacity: burst.value > 0 && burst.value < 1 ? 0.4 * (1 - burst.value) : 0,
    transform: [{ scale: 0.4 + 1.8 * burst.value }],
  }));

  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, shiftStyle]}>
        <Svg width={FLAME} height={FLAME} viewBox="0 0 160 160">
          <Defs>
            <LinearGradient id="streak-violet" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.secondary} />
              <Stop offset="1" stopColor={colors.primary} />
            </LinearGradient>
          </Defs>
          <Path d={FLAME_PATHS.core} fill="url(#streak-violet)" />
        </Svg>
      </Animated.View>
      <Animated.View
        style={[styles.burst, { backgroundColor: colors.onPrimary, left: 66 * K, top: 112 * K, width: 28 * K, height: 28 * K }, burstStyle]}
      />
      <Animated.View style={[styles.bolt, boltStyle]}>
        <Svg width={BOLT.size} height={BOLT.size} viewBox="0 0 24 24">
          <Path d={ZAP_PATH} fill={colors.onPrimary} />
        </Svg>
      </Animated.View>
    </>
  );
}

function Flame({ colors, mode, reduced }: { colors: ColorScheme; mode: Mode } & Phase) {
  const I = TIMING.idle;
  const idleAmp = useSharedValue(0);
  const clock = useSharedValue(0);
  const glow = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) return;
    glow.value = at(TIMING.ignite.start, withTiming(1, { duration: 300, easing: easeOut }));
    idleAmp.value = at(I.start, withTiming(1, { duration: I.rampMs, easing: Easing.inOut(Easing.quad) }));
    clock.value = at(I.start, withRepeat(withTiming(IDLE_LOOP_MS, { duration: IDLE_LOOP_MS, easing: linear }), -1));
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
    transform: [{ scale: (0.6 + 0.4 * glow.value) * (1 + 0.03 * idleAmp.value * Math.sin((2 * Math.PI * clock.value) / 1500)) }],
  }));

  return (
    <>
      <Animated.View style={[styles.flameGlow, glowStyle]}>
        <Svg width={168 * K} height={168 * K} viewBox="0 0 168 168">
          <Defs>
            <RadialGradient id="streak-glow" cx="84" cy="84" r="84" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={colors.streak} stopOpacity={0.4} />
              <Stop offset="1" stopColor={colors.streak} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="84" cy="84" r="84" fill="url(#streak-glow)" />
        </Svg>
      </Animated.View>
      <FlameLayer index={0} idleAmp={idleAmp} clock={clock} reduced={reduced}>
        <Svg width={FLAME} height={FLAME} viewBox="0 0 160 160">
          <Path d={FLAME_PATHS.outer} fill={colors.streak} />
        </Svg>
      </FlameLayer>
      <FlameLayer index={1} idleAmp={idleAmp} clock={clock} reduced={reduced}>
        <Svg width={FLAME} height={FLAME} viewBox="0 0 160 160">
          <Defs>
            <LinearGradient id="streak-mid" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.streak} />
              <Stop offset="1" stopColor={colors.warning} />
            </LinearGradient>
          </Defs>
          <Path d={FLAME_PATHS.mid} fill="url(#streak-mid)" />
        </Svg>
      </FlameLayer>
      <FlameLayer index={2} idleAmp={idleAmp} clock={clock} reduced={reduced}>
        <Svg width={FLAME} height={FLAME} viewBox="0 0 160 160">
          <Path d={FLAME_PATHS.core} fill={colors.warning} />
          <Path d={FLAME_PATHS.core} fill={colors.onPrimary} fillOpacity={0.4} />
          <G transform={`translate(${80 - 10.2} ${126 - 10.2}) scale(0.85)`}>
            <Path d={ZAP_PATH} fill={colors.streak} fillOpacity={0.4} />
          </G>
        </Svg>
        {mode === 'milestone' && <MilestoneCore colors={colors} reduced={reduced} />}
      </FlameLayer>
      {!reduced && <IdleSpark colors={colors} delay={I.start + 600} every={I.sparkEvery[0]} dx={-30} />}
      {!reduced && <IdleSpark colors={colors} delay={I.start + 1700} every={I.sparkEvery[1]} dx={34} />}
    </>
  );
}

/* ─────────────── Фазы: уголёк, ударная волна, искры, лучи, конфетти ─────────────── */

/** Фаза 1 (300–700): тлеющий уголёк дважды вспыхивает. */
function Ember({ colors }: { colors: ColorScheme }) {
  const E = TIMING.ember;
  const op = useSharedValue(0);
  const flare = useSharedValue(0);

  useEffect(() => {
    op.value = withSequence(
      at(E.start, withTiming(1, { duration: E.appearMs })),
      at(E.fadeAt - E.start - E.appearMs, withTiming(0, { duration: E.fadeMs })),
    );
    const up = () => withTiming(1, { duration: E.flareMs, easing: easeOut });
    const down = () => withTiming(0, { duration: E.flareMs });
    flare.value = withSequence(
      at(E.flares[0] - E.flareMs, up()), down(),
      at(E.flares[1] - E.flares[0] - 2 * E.flareMs, up()), down(),
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: op.value * (0.6 + 0.4 * flare.value),
    transform: [{ scale: 1 + 0.9 * flare.value }],
  }));
  const dotStyle = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ scale: 1 + 0.35 * flare.value }] }));

  const cx = 80 * K, cy = 140 * K;
  return (
    <>
      <Animated.View style={[styles.abs, { left: cx - 36 * K, top: cy - 36 * K }, glowStyle]}>
        <Svg width={72 * K} height={72 * K} viewBox="0 0 72 72">
          <Defs>
            <RadialGradient id="streak-ember" cx="36" cy="36" r="36" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={colors.streak} stopOpacity={0.4} />
              <Stop offset="1" stopColor={colors.streak} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="36" cy="36" r="36" fill="url(#streak-ember)" />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.abs, { left: cx - 6 * K, top: cy - 6 * K }, dotStyle]}>
        <Svg width={12 * K} height={12 * K} viewBox="0 0 12 12">
          <Circle cx="6" cy="6" r="6" fill={colors.streak} />
          <Circle cx="6" cy="6" r="3" fill={colors.warning} />
        </Svg>
      </Animated.View>
    </>
  );
}

/** Фаза 2: круглая ударная волна от пламени. */
function Shockwave({ colors }: { colors: ColorScheme }) {
  const S = TIMING.shock;
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = at(S.start, withTiming(1, { duration: S.ms, easing: easeOut }));
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: p.value > 0 && p.value < 1 ? S.alpha * (1 - p.value) : 0,
    transform: [{ scale: S.from + (S.to - S.from) * p.value }],
  }));
  return <Animated.View style={[styles.shock, { borderColor: colors.streak }, style]} />;
}

type Spark = { vx: number; vy: number; delay: number; life: number; size: number; round: boolean; spin: number; color: string };

function makeSparks(count: number, colors: ColorScheme): Spark[] {
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

function SparkDot({ spark, clock }: { spark: Spark; clock: SharedValue<number> }) {
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
          width: spark.size, height: spark.size, marginLeft: -spark.size / 2, marginTop: -spark.size / 2,
          borderRadius: spark.round ? borderRadius.full : 2, backgroundColor: spark.color,
        },
        style,
      ]}
    />
  );
}

/** Фаза 2: искры разлетаются по дугам с гравитацией. Все частицы читают одни часы. */
function Sparks({ colors, count }: { colors: ColorScheme; count: number }) {
  const sparks = useMemo(() => makeSparks(count, colors), [count, colors]);
  const clock = useSharedValue(0);
  useEffect(() => {
    const total = TIMING.sparks.maxDelay + TIMING.sparks.lifeMax;
    clock.value = at(TIMING.sparks.start, withTiming(total + 1, { duration: total + 1, easing: linear }));
  }, []);
  return (
    <View pointerEvents="none" style={[styles.abs, { left: FLAME / 2, top: 70 * K }]}>
      {sparks.map((s, i) => <SparkDot key={i} spark={s} clock={clock} />)}
    </View>
  );
}

/** Фаза 6: редкая одиночная искра над пламенем. */
function IdleSpark({ colors, delay, every, dx }: { colors: ColorScheme; delay: number; every: number; dx: number }) {
  const p = useSharedValue(0);
  const life = TIMING.idle.sparkLife;
  useEffect(() => {
    p.value = at(delay, withRepeat(withSequence(
      withTiming(1, { duration: life, easing: linear }),
      withTiming(0, { duration: 0 }),
      withDelay(every - life, withTiming(0, { duration: 0 })),
    ), -1));
  }, []);
  const style = useAnimatedStyle(() => {
    const u = p.value;
    if (u <= 0 || u >= 1) return { opacity: 0 };
    const a = (u * life) / 1000;
    return {
      opacity: 0.9 * (1 - u * u),
      transform: [{ translateX: dx * a }, { translateY: -150 * a + 60 * a * a }, { scale: 1 - 0.7 * u }],
    };
  });
  return <Animated.View style={[styles.idleSpark, { backgroundColor: colors.warning, left: FLAME / 2 - 3, top: 46 * K }, style]} />;
}

/** Рубеж: медленно вращающееся кольцо лучей вокруг пламени. */
function RaysRing({ colors, reduced }: { colors: ColorScheme } & Phase) {
  const M = TIMING.milestone;
  const k = useSharedValue(reduced ? 1 : 0);
  const rot = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    k.value = at(M.raysStart, withTiming(1, { duration: M.raysFadeMs, easing: easeOut }));
    rot.value = at(M.raysStart, withRepeat(withTiming(360, { duration: M.rayPeriodMs, easing: linear }), -1));
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
        x1={100 + Math.cos(a) * r0} y1={100 + Math.sin(a) * r0}
        x2={100 + Math.cos(a) * r1} y2={100 + Math.sin(a) * r1}
        stroke={long ? colors.primary : colors.secondary}
        strokeOpacity={long ? 0.4 : 0.2}
        strokeWidth={4}
        strokeLinecap="round"
      />
    );
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { width: size, height: size, left: (FLAME - size) / 2, top: (FLAME - size) / 2 + 8 }, style]}>
      <Svg width={size} height={size} viewBox="0 0 200 200">{rays}</Svg>
    </Animated.View>
  );
}

type ConfettiPiece = { x: number; delay: number; dur: number; sway: number; swayF: number; rot0: number; spin: number; size: number; bolt: boolean; color: string };

function ConfettiItem({ piece, clock, screenH }: { piece: ConfettiPiece; clock: SharedValue<number>; screenH: number }) {
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
        <View style={{ width: piece.size * 0.7, height: piece.size * 0.7, borderRadius: borderRadius.full, backgroundColor: piece.color }} />
      )}
    </Animated.View>
  );
}

/** Рубеж: конфетти из молний и кружков на весь экран. */
function Confetti({ colors, screenH }: { colors: ColorScheme; screenH: number }) {
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
    clock.value = at(TIMING.milestone.confettiStart, withTiming(total, { duration: total, easing: linear }));
  }, []);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => <ConfettiItem key={i} piece={p} clock={clock} screenH={screenH} />)}
    </View>
  );
}

/* ─────────────── Число (одометр) и бейдж ─────────────── */

/** Ячейка табло: старое значение уезжает вверх, новое въезжает снизу. */
function Roll({ from, to, delay, height, width, color, variant, reduced }: {
  from: string; to: string; delay: number; height: number; width?: number; color: string;
  variant: 'hero' | 'label'; reduced: boolean;
}) {
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    p.value = at(delay, withTiming(1, { duration: TIMING.odo.ms, easing: easeOut }));
  }, []);
  const same = from === to;
  const oldStyle = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - p.value), transform: [{ translateY: -height * p.value }] }));
  const newStyle = useAnimatedStyle(() =>
    same ? { opacity: 0.5 + 0.5 * p.value } : { opacity: p.value, transform: [{ translateY: height * (1 - p.value) }] });
  const cell = (s: string) => (
    <Text variant={variant} align="center" style={{ color, lineHeight: height }}>{s}</Text>
  );
  return (
    <View style={{ height, width, overflow: 'hidden' }}>
      {!same && from !== '' && <Animated.View style={[StyleSheet.absoluteFill, oldStyle]}>{cell(from)}</Animated.View>}
      <Animated.View style={newStyle}>{cell(to)}</Animated.View>
    </View>
  );
}

function OdometerNumber({ from, to, colors, reduced }: { from: number; to: number; colors: ColorScheme } & Phase) {
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
      <Animated.View style={[styles.digits, popStyle]} importantForAccessibility="no-hide-descendants">
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
      <View style={[styles.dayBadge, { backgroundColor: alpha(colors.streak, 10) }]} importantForAccessibility="no-hide-descendants">
        <Roll from={wordFrom} to={wordTo} delay={O.start + O.badgeLagMs} height={28} color={colors.warningText} variant="label" reduced={reduced} />
      </View>
    </View>
  );
}

/* ─────────────── Неделя ─────────────── */

type DayState = 'done' | 'today' | 'empty';

/** Закрашены дни серии, которые уже прошли на этой неделе, плюс сегодняшний. */
function weekModel(streak: number, todayIdx: number): DayState[] {
  const prior = Math.min(Math.max(streak - 1, 0), todayIdx);
  return DAYS.map((_, i) => (i === todayIdx ? 'today' : i < todayIdx && i >= todayIdx - prior ? 'done' : 'empty'));
}

function DayCell({ label, state, order, colors, reduced, cellRef }: {
  label: string; state: DayState; order: number; colors: ColorScheme; reduced: boolean; cellRef?: React.Ref<View>;
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
      scale.value = at(delay, withSequence(withTiming(W.waveScale, { duration: half }), withTiming(1, { duration: half })));
      halo.value = at(delay, withSequence(withTiming(0.4, { duration: half }), withTiming(0, { duration: half })));
    } else if (isToday) {
      fill.value = at(W.fillAt, withTiming(1, { duration: W.fillMs, easing: easeOut }));
      scale.value = at(W.fillAt, bump(W.bounceScale, W.bounceUpMs, SPRING.bounce));
      flame.value = at(W.fillAt + 40, withSpring(1, SPRING.bounce));
      check.value = at(W.fillAt + W.fillMs, withSpring(1, SPRING.pop));
    }
  }, []);

  const cellStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ opacity: fill.value, transform: [{ scale: 0.6 + 0.4 * fill.value }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: 1 - fill.value }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: halo.value }));
  const flameStyle = useAnimatedStyle(() => ({ transform: [{ scale: flame.value }] }));
  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: check.value }] }));

  return (
    <View style={styles.dayCol}>
      <Text variant="caption" style={{ color: isToday ? colors.warningText : colors.textSecondary }}>{label}</Text>
      <Animated.View ref={cellRef} collapsable={false} style={[styles.dayCell, cellStyle]}>
        <View style={[styles.dayFill, { backgroundColor: colors.surfaceMuted }]} />
        {isToday && <Animated.View style={[styles.dayFill, styles.dayRing, { borderColor: alpha(colors.streak, 40) }, ringStyle]} />}
        {state !== 'empty' && (
          <>
            <Animated.View style={[styles.dayFill, { backgroundColor: colors.streak }, fillStyle]} />
            <Animated.View style={[styles.dayFill, { backgroundColor: colors.warning }, haloStyle]} />
            <Animated.View style={[styles.dayFill, styles.center, flameStyle]}>
              <MiniFlame size={DAY_SIZE * 0.58} colors={colors} onFill />
            </Animated.View>
          </>
        )}
        {isToday && (
          <Animated.View style={[styles.check, { backgroundColor: colors.success }, checkStyle]}>
            <Svg width={10} height={10} viewBox="0 0 12 12">
              <Polyline points="2.5,6.5 5,9 9.5,3.5" fill="none" stroke={colors.onPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

type Point = { x: number; y: number };

/** Фаза 4: огонёк перелетает по дуге от пламени к сегодняшнему дню (со шлейфом). */
function FlyingFlame({ colors, from, to }: { colors: ColorScheme; from: Point; to: Point }) {
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
        <FlyingFlameCopy key={k} k={k} clock={clock} from={from} to={to} ctrl={ctrl} side={side} colors={colors} />
      ))}
    </View>
  );
}

const TRAIL_OPACITY = [1, 0.4, 0.2, 0.1];

function FlyingFlameCopy({ k, clock, from, to, ctrl, side, colors }: {
  k: number; clock: SharedValue<number>; from: Point; to: Point; ctrl: Point; side: number; colors: ColorScheme;
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

/* ─────────────── Экран ─────────────── */

function Reveal({ delay, rise, ms, reduced, style, children }: {
  delay: number; rise: number; ms: number; reduced: boolean; style?: object; children: React.ReactNode;
}) {
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    p.value = at(delay, withTiming(1, { duration: ms, easing: easeOut }));
  }, []);
  const s = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * rise }] }));
  return <Animated.View style={[style, s]}>{children}</Animated.View>;
}

function copyFor(mode: Mode, n: number) {
  const days = `${n} ${pluralize(n, 'день', 'дня', 'дней')}`;
  if (mode === 'first') return { title: 'Серия началась!', sub: 'Возвращайся завтра, чтобы не дать огню погаснуть' };
  if (mode === 'milestone') return { title: `Рубеж: ${days}!`, sub: `Ты учишься ${days} подряд. Так держать!` };
  return { title: 'Серия продолжается!', sub: `Ты учишься ${days} подряд. Так держать!` };
}

function StreakCelebrationContent({ streakCount, onClose }: { streakCount: number; onClose: () => void }) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const reduced = useReducedMotion();
  const n = Math.max(1, streakCount);
  const mode: Mode = n === 1 ? 'first' : MILESTONES.includes(n) ? 'milestone' : 'normal';
  const todayIdx = (new Date().getDay() + 6) % 7;
  const week = useMemo(() => weekModel(n, todayIdx), [n, todayIdx]);
  const copy = copyFor(mode, n);
  const [buttonEnabled, setButtonEnabled] = useState(reduced);

  // Координаты полёта огонька (от пламени к сегодняшнему дню) в системе экрана
  const rootRef = useRef<View>(null);
  const flameRef = useRef<View>(null);
  const todayRef = useRef<View>(null);
  const [flight, setFlight] = useState<{ from: Point; to: Point } | null>(null);
  const measureFlight = () => {
    const root = rootRef.current, fl = flameRef.current, td = todayRef.current;
    if (!root || !fl || !td) return;
    root.measureInWindow((rx, ry) => {
      fl.measureInWindow((fx, fy, fw, fh) => {
        td.measureInWindow((tx, ty, tw, th) => {
          if (!fw || !tw) return;
          setFlight({
            from: { x: fx - rx + fw / 2, y: fy - ry + fh / 2 + 16 },
            to: { x: tx - rx + tw / 2, y: ty - ry + th / 2 },
          });
        });
      });
    });
  };

  const backdrop = useSharedValue(0);
  const ambient = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      backdrop.value = withTiming(1, { duration: TIMING.reducedFadeMs });
      return;
    }
    backdrop.value = withTiming(1, { duration: TIMING.backdropMs, easing: easeOut });
    ambient.value = at(TIMING.ignite.start, withTiming(1, { duration: 600, easing: easeOut }));
    const timers = [
      setTimeout(() => triggerHaptic('impactMedium'), TIMING.shock.start),
      setTimeout(() => setButtonEnabled(true), TIMING.button.enableAt),
    ];
    if (mode === 'milestone') timers.push(setTimeout(() => triggerHaptic('notificationSuccess'), TIMING.milestone.coreShift));
    return () => timers.forEach(clearTimeout);
  }, []);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const ambientStyle = useAnimatedStyle(() => ({ opacity: ambient.value, transform: [{ scale: 0.8 + 0.2 * ambient.value }] }));
  const ambientSize = Math.min(screenH * 0.9, 640);
  const [flameY, setFlameY] = useState<number | null>(null);

  return (
    <Animated.View ref={rootRef} style={[styles.root, { backgroundColor: colors.background }, backdropStyle]} onLayout={measureFlight}>
      <View
        accessibilityViewIsModal
        style={[styles.content, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.l }]}
      >
        <View style={styles.hero}>
          {/* Тёплое свечение на пол-экрана за пламенем */}
          {flameY !== null && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.ambient,
                { width: ambientSize, height: ambientSize, marginLeft: -ambientSize / 2, top: flameY + FLAME / 2 - ambientSize / 2 },
                ambientStyle,
              ]}
            >
              <Svg width={ambientSize} height={ambientSize} viewBox="0 0 100 100">
                <Defs>
                  <RadialGradient id="streak-ambient" cx="50" cy="50" r="50" gradientUnits="userSpaceOnUse">
                    <Stop offset="0" stopColor={mode === 'milestone' ? colors.primary : colors.streak} stopOpacity={0.2} />
                    <Stop offset="1" stopColor={colors.streak} stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Circle cx="50" cy="50" r="50" fill="url(#streak-ambient)" />
              </Svg>
            </Animated.View>
          )}
          <View
            ref={flameRef}
            collapsable={false}
            style={styles.flame}
            onLayout={(e) => setFlameY(e.nativeEvent.layout.y)}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            {mode === 'milestone' && <RaysRing colors={colors} reduced={reduced} />}
            {!reduced && <Ember colors={colors} />}
            <Flame colors={colors} mode={mode} reduced={reduced} />
            {!reduced && <Shockwave colors={colors} />}
            {!reduced && <Sparks colors={colors} count={mode === 'milestone' ? PARTICLES.sparksMilestone : PARTICLES.sparksNormal} />}
          </View>

          <OdometerNumber from={mode === 'first' || reduced ? n : n - 1} to={n} colors={colors} reduced={reduced} />

          <View style={styles.week} accessibilityLabel="Неделя">
            {week.map((state, i) => (
              <DayCell
                key={i}
                label={DAYS[i]}
                state={state}
                order={week.slice(0, i).filter((s) => s === 'done').length}
                colors={colors}
                reduced={reduced}
                cellRef={state === 'today' ? todayRef : undefined}
              />
            ))}
          </View>

          <Reveal delay={TIMING.text.start} rise={TIMING.text.rise} ms={TIMING.text.ms} reduced={reduced} style={styles.title}>
            <Text variant="h1" align="center" accessibilityRole="header" style={{ color: colors.textPrimary }}>{copy.title}</Text>
          </Reveal>
          <Reveal delay={TIMING.text.start + TIMING.text.gapMs} rise={TIMING.text.rise} ms={TIMING.text.ms} reduced={reduced} style={styles.subtitle}>
            <Text variant="bodyLarge" align="center" style={{ color: colors.textSecondary }}>{copy.sub}</Text>
          </Reveal>
        </View>

        {/* Кнопку нельзя нажать случайно, пока момент не показан */}
        <View pointerEvents={buttonEnabled ? 'auto' : 'none'}>
          <Reveal delay={TIMING.button.start} rise={8} ms={TIMING.button.ms} reduced={reduced}>
            <Button title="Продолжить" onPress={onClose} fullWidth />
          </Reveal>
        </View>
      </View>

      {!reduced && flight && <FlyingFlame colors={colors} from={flight.from} to={flight.to} />}
      {!reduced && mode === 'milestone' && <Confetti colors={colors} screenH={screenH} />}
    </Animated.View>
  );
}

interface Props {
  visible: boolean;
  streakCount: number;
  onClose: () => void;
}

export function StreakCelebration({ visible, streakCount, onClose }: Props) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setEnabled(true), TIMING.button.enableAt);
    return () => {
      clearTimeout(timer);
      setEnabled(false);
    };
  }, [visible]);
  if (!visible) return null;
  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      // Android «назад» закрывает экран, но не раньше, чем пользователь увидел момент
      onRequestClose={() => enabled && onClose()}
    >
      <StreakCelebrationContent streakCount={streakCount} onClose={onClose} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  abs: {
    position: 'absolute',
  },
  ambient: {
    position: 'absolute',
    left: '50%',
  },
  content: {
    flex: 1,
    paddingHorizontal: screenPadding,
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flame: {
    width: FLAME,
    height: FLAME,
    zIndex: 2,
  },
  flameGlow: {
    position: 'absolute',
    left: (FLAME - 168 * K) / 2,
    top: 104 * K - 84 * K,
  },
  burst: {
    position: 'absolute',
    borderRadius: borderRadius.full,
  },
  bolt: {
    position: 'absolute',
    left: BOLT.left,
    top: BOLT.top,
  },
  shock: {
    position: 'absolute',
    left: FLAME / 2 - 75,
    top: FLAME / 2 - 75 + 10,
    width: 150,
    height: 150,
    borderRadius: borderRadius.full,
    borderWidth: 3,
  },
  spark: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  idleSpark: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: borderRadius.full,
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
    marginTop: spacing.xs,
  },
  digits: {
    flexDirection: 'row',
  },
  dayBadge: {
    minWidth: 72,
    paddingHorizontal: spacing.s,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  week: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.l,
    alignSelf: 'stretch',
  },
  dayCol: {
    alignItems: 'center',
    gap: spacing.xxs,
  },
  dayCell: {
    width: DAY_SIZE,
    height: DAY_SIZE,
  },
  dayFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: borderRadius.full,
  },
  dayRing: {
    borderWidth: 2,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    position: 'absolute',
    right: -4,
    top: -4,
    width: 16,
    height: 16,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: spacing.xl,
  },
  subtitle: {
    marginTop: spacing.xs,
    maxWidth: 320,
  },
});
