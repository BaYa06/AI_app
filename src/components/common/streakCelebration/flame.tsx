/**
 * Пламя: мини-огонь, слои, ядро рубежа, угольки, ударная волна
 * (Clean 8 — перенесено из StreakCelebration.tsx без изменений.)
 */
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { type ColorScheme } from '@/constants';
import { styles } from './styles';
import {
  TIMING,
  IDLE_LOOP_MS,
  SPRING,
  FLAME,
  K,
  ORIGIN_OFF,
  ZAP_PATH,
  FLAME_PATHS,
  BOLT,
  type Mode,
  type Phase,
  easeOut,
  linear,
  at,
} from './anim';
import { IdleSpark } from './particles';

export function MiniFlame({
  size,
  colors,
  onFill,
}: {
  size: number;
  colors: ColorScheme;
  onFill: boolean;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 160 160">
      <Path d={FLAME_PATHS.outer} fill={onFill ? colors.onPrimary : colors.streak} />
      <Path d={FLAME_PATHS.mid} fill={colors.warning} />
    </Svg>
  );
}

/** Один слой пламени: вырастает из уголька, потом мерцает со своим периодом. */
export function FlameLayer({
  index,
  idleAmp,
  clock,
  reduced,
  children,
}: {
  index: number;
  idleAmp: SharedValue<number>;
  clock: SharedValue<number>;
  reduced: boolean;
  children: React.ReactNode;
}) {
  const ig = TIMING.ignite;
  const sy = useSharedValue<number>(reduced ? 1 : ig.fromScaleY);
  const op = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) return;
    const delay = ig.start + ig.layerDelay[index];
    op.value = at(delay, withTiming(1, { duration: 80 }));
    sy.value = at(
      delay,
      withSequence(
        withTiming(ig.peakScaleY, { duration: ig.growMs, easing: easeOut }),
        withSpring(1, SPRING.settle)
      )
    );
  }, []);

  const style = useAnimatedStyle(() => {
    const per = TIMING.idle.periods[index];
    const t = clock.value;
    const amp = idleAmp.value;
    const flicker =
      1 + TIMING.idle.scaleAmp * amp * Math.sin((2 * Math.PI * t) / per + index * 1.3);
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
export function MilestoneCore({ colors, reduced }: { colors: ColorScheme } & Phase) {
  const M = TIMING.milestone;
  const shift = useSharedValue(reduced ? 1 : 0);
  const bolt = useSharedValue(reduced ? 1.15 : 1);
  const burst = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    shift.value = at(M.coreShift, withTiming(1, { duration: M.coreShiftMs }));
    bolt.value = at(
      M.boltFlash,
      withSequence(
        withTiming(1.7, { duration: 120, easing: easeOut }),
        withSpring(1.15, SPRING.pop)
      )
    );
    burst.value = at(M.boltFlash, withTiming(1, { duration: 350, easing: easeOut }));
  }, []);

  const shiftStyle = useAnimatedStyle(() => ({ opacity: shift.value }));
  const boltStyle = useAnimatedStyle(() => ({
    opacity: shift.value,
    transform: [{ scale: bolt.value }],
  }));
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
        style={[
          styles.burst,
          {
            backgroundColor: colors.onPrimary,
            left: 66 * K,
            top: 112 * K,
            width: 28 * K,
            height: 28 * K,
          },
          burstStyle,
        ]}
      />
      <Animated.View style={[styles.bolt, boltStyle]}>
        <Svg width={BOLT.size} height={BOLT.size} viewBox="0 0 24 24">
          <Path d={ZAP_PATH} fill={colors.onPrimary} />
        </Svg>
      </Animated.View>
    </>
  );
}

export function Flame({ colors, mode, reduced }: { colors: ColorScheme; mode: Mode } & Phase) {
  const I = TIMING.idle;
  const idleAmp = useSharedValue(0);
  const clock = useSharedValue(0);
  const glow = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) return;
    glow.value = at(TIMING.ignite.start, withTiming(1, { duration: 300, easing: easeOut }));
    idleAmp.value = at(
      I.start,
      withTiming(1, { duration: I.rampMs, easing: Easing.inOut(Easing.quad) })
    );
    clock.value = at(
      I.start,
      withRepeat(withTiming(IDLE_LOOP_MS, { duration: IDLE_LOOP_MS, easing: linear }), -1)
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
    transform: [
      {
        scale:
          (0.6 + 0.4 * glow.value) *
          (1 + 0.03 * idleAmp.value * Math.sin((2 * Math.PI * clock.value) / 1500)),
      },
    ],
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
      {!reduced && (
        <IdleSpark colors={colors} delay={I.start + 600} every={I.sparkEvery[0]} dx={-30} />
      )}
      {!reduced && (
        <IdleSpark colors={colors} delay={I.start + 1700} every={I.sparkEvery[1]} dx={34} />
      )}
    </>
  );
}

/* ─────────────── Фазы: уголёк, ударная волна, искры, лучи, конфетти ─────────────── */

/** Фаза 1 (300–700): тлеющий уголёк дважды вспыхивает. */
export function Ember({ colors }: { colors: ColorScheme }) {
  const E = TIMING.ember;
  const op = useSharedValue(0);
  const flare = useSharedValue(0);

  useEffect(() => {
    op.value = withSequence(
      at(E.start, withTiming(1, { duration: E.appearMs })),
      at(E.fadeAt - E.start - E.appearMs, withTiming(0, { duration: E.fadeMs }))
    );
    const up = () => withTiming(1, { duration: E.flareMs, easing: easeOut });
    const down = () => withTiming(0, { duration: E.flareMs });
    flare.value = withSequence(
      at(E.flares[0] - E.flareMs, up()),
      down(),
      at(E.flares[1] - E.flares[0] - 2 * E.flareMs, up()),
      down()
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: op.value * (0.6 + 0.4 * flare.value),
    transform: [{ scale: 1 + 0.9 * flare.value }],
  }));
  const dotStyle = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ scale: 1 + 0.35 * flare.value }],
  }));

  const cx = 80 * K,
    cy = 140 * K;
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
export function Shockwave({ colors }: { colors: ColorScheme }) {
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
