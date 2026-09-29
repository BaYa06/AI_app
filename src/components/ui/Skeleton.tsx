/**
 * Skeleton — заготовки на время загрузки (брендбук, 7.8).
 *
 * Серые блоки формы контента (surfaceMuted) с мягким мерцанием.
 * Все заготовки на экране мерцают синхронно — одна общая анимация.
 */
import React, { useEffect } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { useThemeColors } from '@/store';
import { borderRadius, heights, spacing } from '@/constants';

// ---- Общая анимация мерцания: запускается с первой заготовкой, останавливается с последней ----
const pulse = new Animated.Value(1);
let subscribers = 0;
let loop: Animated.CompositeAnimation | null = null;

function usePulse() {
  useEffect(() => {
    subscribers += 1;
    if (subscribers === 1) {
      const useNativeDriver = Platform.OS !== 'web';
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.5, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver }),
          Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver }),
        ]),
      );
      loop.start();
    }
    return () => {
      subscribers -= 1;
      if (subscribers === 0) {
        loop?.stop();
        loop = null;
        pulse.setValue(1);
      }
    };
  }, []);
  return pulse;
}

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  /** Скругление: s — строки текста (по умолчанию), m, l — карточки, full — аватары. */
  radius?: 's' | 'm' | 'l' | 'full';
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = '100%', height = 16, radius = 's', style }: SkeletonProps) {
  const colors = useThemeColors();
  const opacity = usePulse();
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: borderRadius[radius], backgroundColor: colors.surfaceMuted, opacity },
        style,
      ]}
    />
  );
}

/** Несколько строк текста; последняя короче. */
export function SkeletonText({ lines = 2, lineHeight = 14, style }: { lines?: number; lineHeight?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.text, style]}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={lineHeight} width={i === lines - 1 && lines > 1 ? '60%' : '100%'} />
      ))}
    </View>
  );
}

/** Строка списка: иконка / аватар + две строки текста. */
export function SkeletonListRow({ avatar = true, style }: { avatar?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.row, style]}>
      {avatar ? <Skeleton width={40} height={40} radius="m" /> : null}
      <View style={styles.rowText}>
        <Skeleton height={16} width="70%" />
        <Skeleton height={12} width="40%" />
      </View>
    </View>
  );
}

/** Карточка-заготовка в форме Card (скругление 16). */
export function SkeletonCard({ height = 120, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  return <Skeleton height={height} radius="l" style={style} />;
}

/** Список из нескольких строк — замена спиннеру при загрузке списка. */
export function SkeletonList({ rows = 5, avatar = true, style }: { rows?: number; avatar?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View accessibilityLabel="Загрузка" accessibilityRole="progressbar" style={style}>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonListRow key={i} avatar={avatar} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  text: {
    gap: spacing.xs,
  },
  row: {
    minHeight: heights.listRow + spacing.s,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingVertical: spacing.xs,
  },
  rowText: {
    flex: 1,
    gap: spacing.xs,
  },
});
