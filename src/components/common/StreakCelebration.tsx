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
 * Показывается слоем поверх экрана, не системным окном — почему, см. StreakCelebration ниже.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/store';
import { spacing } from '@/constants';
import { Button } from '@/components/ui/Button';
import { pluralize } from '@/utils';
import { triggerHaptic } from '@/utils/haptic';
import { Text } from './Text';
import { styles } from './streakCelebration/styles';
import {
  TIMING,
  PARTICLES,
  MILESTONES,
  DAYS,
  FLAME,
  type Mode,
  easeOut,
  at,
} from './streakCelebration/anim';
import { Flame, Ember, Shockwave } from './streakCelebration/flame';
import { Sparks, RaysRing, Confetti } from './streakCelebration/particles';
import { OdometerNumber } from './streakCelebration/odometer';
import { weekModel, DayCell } from './streakCelebration/week';
import { type Point, FlyingFlame } from './streakCelebration/flyingFlame';

function Reveal({
  delay,
  rise,
  ms,
  reduced,
  style,
  children,
}: {
  delay: number;
  rise: number;
  ms: number;
  reduced: boolean;
  style?: object;
  children: React.ReactNode;
}) {
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    p.value = at(delay, withTiming(1, { duration: ms, easing: easeOut }));
  }, []);
  const s = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * rise }],
  }));
  return <Animated.View style={[style, s]}>{children}</Animated.View>;
}

function copyFor(mode: Mode, n: number) {
  const days = `${n} ${pluralize(n, 'день', 'дня', 'дней')}`;
  if (mode === 'first')
    return { title: 'Серия началась!', sub: 'Возвращайся завтра, чтобы не дать огню погаснуть' };
  if (mode === 'milestone')
    return { title: `Рубеж: ${days}!`, sub: `Ты учишься ${days} подряд. Так держать!` };
  return { title: 'Серия продолжается!', sub: `Ты учишься ${days} подряд. Так держать!` };
}

function StreakCelebrationContent({
  streakCount,
  onClose,
}: {
  streakCount: number;
  onClose: () => void;
}) {
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
    const root = rootRef.current,
      fl = flameRef.current,
      td = todayRef.current;
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
    if (mode === 'milestone')
      timers.push(
        setTimeout(() => triggerHaptic('notificationSuccess'), TIMING.milestone.coreShift)
      );
    return () => timers.forEach(clearTimeout);
  }, []);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const ambientStyle = useAnimatedStyle(() => ({
    opacity: ambient.value,
    transform: [{ scale: 0.8 + 0.2 * ambient.value }],
  }));
  const ambientSize = Math.min(screenH * 0.9, 640);
  const [flameY, setFlameY] = useState<number | null>(null);

  return (
    <Animated.View
      ref={rootRef}
      style={[styles.root, { backgroundColor: colors.background }, backdropStyle]}
      onLayout={measureFlight}
    >
      <View
        accessibilityViewIsModal
        style={[
          styles.content,
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.l },
        ]}
      >
        <View style={styles.hero}>
          {/* Тёплое свечение на пол-экрана за пламенем */}
          {flameY !== null && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.ambient,
                {
                  width: ambientSize,
                  height: ambientSize,
                  marginLeft: -ambientSize / 2,
                  top: flameY + FLAME / 2 - ambientSize / 2,
                },
                ambientStyle,
              ]}
            >
              <Svg width={ambientSize} height={ambientSize} viewBox="0 0 100 100">
                <Defs>
                  <RadialGradient
                    id="streak-ambient"
                    cx="50"
                    cy="50"
                    r="50"
                    gradientUnits="userSpaceOnUse"
                  >
                    <Stop
                      offset="0"
                      stopColor={mode === 'milestone' ? colors.primary : colors.streak}
                      stopOpacity={0.2}
                    />
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
            {!reduced && (
              <Sparks
                colors={colors}
                count={mode === 'milestone' ? PARTICLES.sparksMilestone : PARTICLES.sparksNormal}
              />
            )}
          </View>

          <OdometerNumber
            from={mode === 'first' || reduced ? n : n - 1}
            to={n}
            colors={colors}
            reduced={reduced}
          />

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

          <Reveal
            delay={TIMING.text.start}
            rise={TIMING.text.rise}
            ms={TIMING.text.ms}
            reduced={reduced}
            style={styles.title}
          >
            <Text
              variant="h1"
              align="center"
              accessibilityRole="header"
              style={{ color: colors.textPrimary }}
            >
              {copy.title}
            </Text>
          </Reveal>
          <Reveal
            delay={TIMING.text.start + TIMING.text.gapMs}
            rise={TIMING.text.rise}
            ms={TIMING.text.ms}
            reduced={reduced}
            style={styles.subtitle}
          >
            <Text variant="bodyLarge" align="center" style={{ color: colors.textSecondary }}>
              {copy.sub}
            </Text>
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

/**
 * Слой поверх экрана, а не <Modal>. Системное окно iOS падало, когда его закрытие совпадало
 * с переходом на другой экран («Продолжить» → следующая сессия через replace): React Native
 * показывал ещё открытый контроллер второй раз — NSInvalidArgumentException «already being
 * presented» (Crashlytics, 1.8.1). Слой живёт и умирает вместе с экраном, переход ему не мешает.
 * Поэтому рисовать его нужно последним ребёнком корневого View экрана на весь экран.
 */
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

  // Android «назад» закрывает праздник, но не раньше, чем пользователь увидел момент,
  // и не уводит с экрана под ним
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (enabled) onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, enabled, onClose]);

  if (!visible) return null;
  return (
    <View style={overlayStyles.overlay}>
      <StreakCelebrationContent streakCount={streakCount} onClose={onClose} />
    </View>
  );
}

const overlayStyles = StyleSheet.create({
  // Поверх всего на экране; касания под слой не проходят
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 1000, elevation: 1000 },
});
