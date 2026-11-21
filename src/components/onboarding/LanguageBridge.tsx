/**
 * «Мост» языков над экранами родного и изучаемого языка (plan/new/new_user_activation.md, 2.2):
 * два места «Я говорю на» → «Хочу выучить». Место, которое сейчас заполняется, подсвечено;
 * у родного свой цвет (success), у изучаемого — фирменный (primary). Люди путали эти экраны,
 * а два места рядом показывают, что выбираются два разных языка.
 */
import React, { memo, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ArrowRight } from 'lucide-react-native';
import { Text } from '@/components/common/Text';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, getLanguageDefByCode, iconSize, spacing } from '@/constants';

export type BridgeSide = 'native' | 'target';

interface Props {
  native?: string;
  target?: string;
  active: BridgeSide;
  /** Круги флагов — цель перелёта флага (FlagFlight) */
  nativeFlagRef?: React.Ref<View>;
  targetFlagRef?: React.Ref<View>;
}

/** Цвет стороны моста — им же красятся выбранный вариант и пометка в примере карточки */
export function useBridgeTone(side: BridgeSide): { line: string; text: string; soft: string } {
  const colors = useThemeColors();
  return side === 'native'
    ? { line: colors.success, text: colors.successText, soft: alpha(colors.success, 10) }
    : { line: colors.primary, text: colors.primary, soft: alpha(colors.primary, 10) };
}

function Slot({
  side,
  code,
  active,
  flagRef,
}: {
  side: BridgeSide;
  code?: string;
  active: boolean;
  flagRef?: React.Ref<View>;
}) {
  const colors = useThemeColors();
  const tone = useBridgeTone(side);
  const reduceMotion = useReducedMotion();

  // Флаг сменился — короткий «прыжок» (Start 2.4); на первом показе — нет
  const scale = useSharedValue(1);
  const firstCode = useRef(code);
  useEffect(() => {
    if (reduceMotion || code === firstCode.current) return;
    firstCode.current = undefined;
    scale.value = withSequence(
      withTiming(0.6, { duration: 0 }),
      withSpring(1, { damping: 9, stiffness: 220 })
    );
  }, [code, reduceMotion, scale]);
  const flagStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  // Место, которое сейчас заполняется, мягко пульсирует кольцом
  const ring = useSharedValue(0);
  useEffect(() => {
    if (!active || reduceMotion) {
      ring.value = 0;
      return;
    }
    ring.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1);
  }, [active, reduceMotion, ring]);
  const ringStyle = useAnimatedStyle(() => ({
    opacity: active ? 0.5 * (1 - ring.value) : 0,
    transform: [{ scale: 0.96 + 0.1 * ring.value }],
  }));
  const lang = code ? getLanguageDefByCode(code) : undefined;
  const filled = !!lang && !active;
  const empty = side === 'native' ? 'выбери' : active ? 'выбери' : 'дальше';

  return (
    <View
      style={[
        styles.slot,
        {
          borderColor: active || filled ? tone.line : colors.border,
          borderStyle: active || filled ? 'solid' : 'dashed',
          backgroundColor: active ? tone.soft : 'transparent',
        },
      ]}
    >
      <Text variant="overline" style={{ color: tone.text }}>
        {side === 'native' ? 'Я говорю на' : 'Хочу выучить'}
      </Text>
      <Animated.View
        pointerEvents="none"
        style={[styles.ring, { borderColor: tone.line }, ringStyle]}
      />
      <Animated.View
        ref={flagRef}
        collapsable={false}
        style={[styles.flag, { backgroundColor: colors.surfaceMuted }, flagStyle]}
      >
        <Text variant="h2" style={!lang && { color: colors.textTertiary }}>
          {lang ? lang.flag : '?'}
        </Text>
      </Animated.View>
      <Text
        variant="label"
        numberOfLines={1}
        style={{ color: lang ? colors.textPrimary : colors.textTertiary }}
      >
        {lang ? lang.label : empty}
      </Text>
    </View>
  );
}

export const LanguageBridge = memo(function LanguageBridge({
  native,
  target,
  active,
  nativeFlagRef,
  targetFlagRef,
}: Props) {
  const colors = useThemeColors();
  const nativeLabel = native ? getLanguageDefByCode(native)?.label : undefined;
  const targetLabel = target ? getLanguageDefByCode(target)?.label : undefined;

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`Я говорю на: ${nativeLabel ?? 'не выбрано'}. Хочу выучить: ${
        targetLabel ?? 'не выбрано'
      }`}
    >
      <Slot side="native" code={native} active={active === 'native'} flagRef={nativeFlagRef} />
      <ArrowRight size={iconSize.s} color={colors.textTertiary} />
      <Slot side="target" code={target} active={active === 'target'} flagRef={targetFlagRef} />
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  slot: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xxs,
    borderWidth: 2,
    borderRadius: borderRadius.l,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.xs,
  },
  ring: {
    position: 'absolute',
    top: -6,
    bottom: -6,
    left: -6,
    right: -6,
    borderWidth: 2,
    borderRadius: borderRadius.l + 6,
  },
  flag: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
