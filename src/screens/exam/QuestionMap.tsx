/**
 * Карта вопросов экзамена (plan/new/live_exam.md, решения пользователя): блоки 44×44 с номерами
 * в одну строку с прокруткой вбок. Текущий — жёлтый, отвеченный — фиолетовый, без ответа — белый.
 * Блок пар занимает номера подряд и подсвечивается целиком.
 */
import React, { useEffect, useRef } from 'react';
import { ScrollView, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, heights, alpha } from '@/constants';

export type MapCell = { number: number; screenIndex: number; answered: boolean };

type Props = {
  cells: MapCell[];
  currentScreen: number;
  onSelect: (screenIndex: number) => void;
};

const CELL = heights.touch;
const GAP = spacing.xxs + 2;

export function QuestionMap({ cells, currentScreen, onSelect }: Props) {
  const colors = useThemeColors();
  const scrollRef = useRef<ScrollView>(null);

  // Прокрутка к текущему вопросу
  useEffect(() => {
    const first = cells.findIndex((c) => c.screenIndex === currentScreen);
    if (first < 0) return;
    scrollRef.current?.scrollTo({
      x: Math.max(0, first * (CELL + GAP) - CELL * 2),
      animated: true,
    });
  }, [currentScreen, cells]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityLabel="Карта вопросов"
    >
      {cells.map((c) => {
        const current = c.screenIndex === currentScreen;
        const bg = current
          ? alpha(colors.warning, 40)
          : c.answered
            ? colors.primaryFill
            : colors.surface;
        const border = current ? colors.warning : c.answered ? colors.primaryFill : colors.border;
        const fg = current
          ? colors.textPrimary
          : c.answered
            ? colors.onPrimary
            : colors.textSecondary;
        return (
          <Pressable
            key={c.number}
            onPress={() => onSelect(c.screenIndex)}
            accessibilityRole="button"
            accessibilityLabel={`Вопрос ${c.number}${c.answered ? ', есть ответ' : ''}${
              current ? ', текущий' : ''
            }`}
            style={({ pressed }) => [
              styles.cell,
              { backgroundColor: bg, borderColor: border, borderWidth: current ? 2 : 1 },
              pressed && styles.pressed,
            ]}
          >
            <Text variant="label" style={[styles.num, { color: fg }]}>
              {c.number}
            </Text>
          </Pressable>
        );
      })}
      <View style={styles.tail} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: GAP, paddingVertical: spacing.xxs },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  num: { fontVariant: ['tabular-nums'] },
  pressed: { opacity: 0.8 },
  tail: { width: spacing.xs },
});
