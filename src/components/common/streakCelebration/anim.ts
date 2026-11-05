/**
 * Тайминги, пружины, частицы, размеры и функции плавности празднования серии
 * (Clean 8 — перенесено из StreakCelebration.tsx без изменений.)
 */
import { Easing, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';

export const TIMING = {
  backdropMs: 300,
  ember: { start: 300, appearMs: 150, flares: [420, 580], flareMs: 75, fadeAt: 700, fadeMs: 160 },
  ignite: { start: 700, growMs: 300, layerDelay: [0, 50, 100], fromScaleY: 0.2, peakScaleY: 1.15 },
  shock: { start: 780, ms: 520, from: 0.6, to: 2.2, alpha: 0.4 },
  sparks: { start: 780, maxDelay: 80, lifeMin: 500, lifeMax: 700 },
  odo: {
    start: 1100,
    ms: 420,
    digitStagger: 70,
    popStart: 1250,
    popUpMs: 130,
    popScale: 1.2,
    badgeLagMs: 120,
  },
  week: {
    flyStart: 1400,
    flyMs: 320,
    fillAt: 1720,
    fillMs: 120,
    bounceUpMs: 110,
    bounceScale: 1.25,
    waveStart: 1500,
    waveStep: 40,
    waveMs: 240,
    waveScale: 1.15,
  },
  text: { start: 1800, ms: 380, gapMs: 80, rise: 12 },
  button: { start: 2150, ms: 260, enableAt: 2400 },
  idle: {
    start: 2400,
    rampMs: 600,
    periods: [1500, 1200, 900],
    scaleAmp: 0.04,
    tiltDeg: 2,
    sparkLife: 900,
    sparkEvery: [2300, 3100],
  },
  milestone: {
    raysStart: 700,
    raysFadeMs: 400,
    rayPeriodMs: 24000,
    coreShift: 1000,
    coreShiftMs: 300,
    boltFlash: 1150,
    confettiStart: 1300,
  },
  reducedFadeMs: 200,
} as const;

// Общий период часов мерцания: кратен всем периодам слоёв (и удвоенным для наклона) — без скачка на стыке
export const IDLE_LOOP_MS = 36000;

export const SPRING = {
  settle: { damping: 12, stiffness: 180, mass: 1 },
  pop: { damping: 14, stiffness: 220, mass: 1 },
  bounce: { damping: 11, stiffness: 260, mass: 1 },
} as const;

export const PARTICLES = {
  sparksNormal: 18,
  sparksMilestone: 14,
  gravity: 620,
  speedMin: 250,
  speedMax: 420,
  confetti: 30,
  confettiSpread: 300,
};
export const MILESTONES = [7, 30, 50, 100, 365];
export const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

// Пламя: пути в системе 160×160, рисуем в размере FLAME
export const FLAME = 200;
export const K = FLAME / 160;
export const FLAME_ORIGIN_Y = 150 * K; // точка «корня» пламени — вокруг неё растут и качаются слои
export const ORIGIN_OFF = FLAME_ORIGIN_Y - FLAME / 2;
export const NUMBER_H = 80;
export const DIGIT_W = 46;
export const DAY_SIZE = 40;

export const ZAP_PATH =
  'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z';
export const FLAME_PATHS = {
  outer:
    'M82 6 C90 30 120 52 124 90 C128 128 108 152 80 152 C52 152 32 130 36 98 C38 80 48 68 56 54 C58 66 64 74 70 76 C68 52 74 28 82 6 Z',
  mid: 'M80 52 C86 70 108 84 110 108 C112 134 98 148 80 148 C62 148 48 134 50 112 C51 100 58 92 63 82 C65 90 69 94 73 95 C72 78 75 64 80 52 Z',
  core: 'M80 92 C84 104 96 112 96 126 C96 138 89 146 80 146 C71 146 64 138 64 126 C64 118 69 114 72 108 C74 112 76 114 78 114 C77 106 78 98 80 92 Z',
};
// Молния в ядре: центр (80, 126), размер 24 × 0.85 в системе 160
export const BOLT = { size: 20.4 * K, left: (80 - 10.2) * K, top: (126 - 10.2) * K };

export type Mode = 'normal' | 'milestone' | 'first';
export type Phase = { reduced: boolean };

export const easeOut = Easing.out(Easing.cubic);
export const linear = Easing.linear;

/** withDelay с сохранением типа значения (отсчёт задержки — от показа экрана). */
export function at<T extends number>(delayMs: number, anim: T): T {
  return withDelay(delayMs, anim) as T;
}

export function easeInOutCubic(x: number) {
  'worklet';
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** withSequence(withTiming(peak), withSpring(1)) — короткий «поп» 1 → peak → 1. */
export function bump(
  peak: number,
  upMs: number,
  spring: { damping: number; stiffness: number; mass: number }
) {
  return withSequence(withTiming(peak, { duration: upMs, easing: easeOut }), withSpring(1, spring));
}
