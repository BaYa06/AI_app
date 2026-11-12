/**
 * Барабан срока задания «день · часы · минуты» (plan/new/teacher_cabinet.md, решение 3 этапа 2)
 * для Android и веба. На iOS — системный SwiftUI DatePicker(.wheel) в Swift-окне (Teacher 20).
 *
 * Колонка — ScrollView с привязкой к строке; строки вокруг центра наклоняются (rotateX), бледнеют
 * и уменьшаются — как в «Будильнике». Без нативных зависимостей: работает и на вебе.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useThemeColors } from '@/store';
import { borderRadius, spacing, typography } from '@/constants';
import {
  DUE_MINUTE_STEP,
  NEW_HOMEWORK_TEXTS as T,
  dayAt,
  dueDayIndex,
  dueDayLabels,
  snapMinutes,
} from './newHomework';

const ROW = 36;
const VISIBLE = 5;
const PAD = ((VISIBLE - 1) / 2) * ROW;
const NATIVE_DRIVER = Platform.OS !== 'web';

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 / DUE_MINUTE_STEP }, (_, i) =>
  String(i * DUE_MINUTE_STEP).padStart(2, '0')
);

interface ColumnProps {
  labels: string[];
  index: number;
  onIndex: (i: number) => void;
  align: 'flex-end' | 'center' | 'flex-start';
  flex: number;
  accessibilityLabel: string;
}

function WheelColumn({ labels, index, onIndex, align, flex, accessibilityLabel }: ColumnProps) {
  const colors = useThemeColors();
  const scrollY = useRef(new Animated.Value(index * ROW)).current;
  const ref = useRef<ScrollViewRef>(null);
  const current = useRef(index);

  // Значение пришло снаружи (быстрый вариант) — докручиваем барабан сам
  useEffect(() => {
    if (index === current.current) return;
    current.current = index;
    ref.current?.scrollTo({ y: index * ROW, animated: true });
  }, [index]);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.max(
      0,
      Math.min(labels.length - 1, Math.round(e.nativeEvent.contentOffset.y / ROW))
    );
    if (i !== current.current) {
      current.current = i;
      onIndex(i);
    }
  };

  return (
    <Animated.ScrollView
      ref={ref as never}
      style={[st.column, { flex }]}
      contentContainerStyle={st.columnContent}
      contentOffset={{ x: 0, y: index * ROW }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ROW}
      decelerationRate="fast"
      scrollEventThrottle={16}
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: NATIVE_DRIVER,
      })}
      onMomentumScrollEnd={settle}
      onScrollEndDrag={Platform.OS === 'web' ? settle : undefined}
      accessibilityRole="adjustable"
      accessibilityLabel={`${accessibilityLabel}: ${labels[index]}`}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const next = index + (e.nativeEvent.actionName === 'increment' ? 1 : -1);
        if (next >= 0 && next < labels.length) onIndex(next);
      }}
    >
      {labels.map((label, i) => {
        const range = [(i - 3) * ROW, i * ROW, (i + 3) * ROW];
        const rotateX = scrollY.interpolate({
          inputRange: range,
          outputRange: ['60deg', '0deg', '-60deg'],
          extrapolate: 'clamp',
        });
        const opacity = scrollY.interpolate({
          inputRange: range,
          outputRange: [0.15, 1, 0.15],
          extrapolate: 'clamp',
        });
        const scale = scrollY.interpolate({
          inputRange: range,
          outputRange: [0.88, 1, 0.88],
          extrapolate: 'clamp',
        });
        return (
          <Animated.View
            key={i}
            style={[
              st.row,
              {
                alignItems: align,
                opacity,
                transform: [{ perspective: 500 }, { rotateX }, { scale }],
              },
            ]}
          >
            <Animated.Text
              numberOfLines={1}
              style={[st.rowText, { color: colors.textPrimary }]}
              allowFontScaling={false}
            >
              {label}
            </Animated.Text>
          </Animated.View>
        );
      })}
    </Animated.ScrollView>
  );
}

type ScrollViewRef = { scrollTo: (o: { y: number; animated: boolean }) => void };

interface Props {
  value: Date;
  onChange: (due: Date) => void;
  now: Date;
}

export function DueWheelPicker({ value, onChange, now }: Props) {
  const colors = useThemeColors();
  const days = useMemo(() => dueDayLabels(now), [now]);
  const dayIndex = Math.max(0, Math.min(days.length - 1, dueDayIndex(now, value)));
  const hour = value.getHours();
  const minuteIndex = snapMinutes(value.getMinutes()) / DUE_MINUTE_STEP;

  const set = (d: number, h: number, mi: number) =>
    onChange(dayAt(now, d, h, mi * DUE_MINUTE_STEP));

  return (
    <View style={st.wrap}>
      <View
        pointerEvents="none"
        style={[st.band, { backgroundColor: colors.surfaceMuted, borderRadius: borderRadius.m }]}
      />
      <WheelColumn
        labels={days}
        index={dayIndex}
        onIndex={(i) => set(i, hour, minuteIndex)}
        align="flex-end"
        flex={1.8}
        accessibilityLabel={T.dayColumn}
      />
      <WheelColumn
        labels={HOURS}
        index={hour}
        onIndex={(h) => set(dayIndex, h, minuteIndex)}
        align="center"
        flex={0.7}
        accessibilityLabel={T.hourColumn}
      />
      <WheelColumn
        labels={MINUTES}
        index={minuteIndex}
        onIndex={(m) => set(dayIndex, hour, m)}
        align="flex-start"
        flex={0.7}
        accessibilityLabel={T.minuteColumn}
      />
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {
    height: ROW * VISIBLE,
    flexDirection: 'row',
    position: 'relative',
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: PAD,
    height: ROW,
  },
  column: {
    height: ROW * VISIBLE,
  },
  columnContent: {
    paddingVertical: PAD,
  },
  row: {
    height: ROW,
    justifyContent: 'center',
    paddingHorizontal: spacing.s,
  },
  rowText: {
    fontSize: typography.h3.fontSize,
    fontVariant: ['tabular-nums'],
  },
});
