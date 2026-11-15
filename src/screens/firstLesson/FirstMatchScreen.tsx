/**
 * Первый урок · «Пары» (plan/new/new_user_activation.md, Start 2.5): соедини слово и перевод.
 * Верная пара гаснет, ошибка — красная рамка на полсекунды. Пары кончились — итоги сами.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/common/Text';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, spacing } from '@/constants';
import type { Card } from '@/types';
import { triggerHaptic } from '@/utils/haptic';
import { FIRST_LESSON_SIZE, FirstLessonLayout } from './FirstLessonLayout';

type Side = 'l' | 'r';

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function FirstMatchScreen({ cards, onDone }: { cards: Card[]; onDone: () => void }) {
  const colors = useThemeColors();
  const words = cards.slice(0, FIRST_LESSON_SIZE);
  const right = useMemo(() => shuffle(words), [words.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selected, setSelected] = useState<{ side: Side; id: string } | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [wrong, setWrong] = useState<string[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (matched.length !== words.length || words.length === 0) return;
    const t = setTimeout(onDone, 600);
    timers.current.push(t);
  }, [matched.length, words.length, onDone]);

  const press = (side: Side, id: string) => {
    if (matched.includes(id)) return;
    if (!selected || selected.side === side) {
      setSelected({ side, id });
      return;
    }
    setSelected(null);
    if (selected.id === id) {
      triggerHaptic('notificationSuccess');
      setMatched((m) => [...m, id]);
    } else {
      triggerHaptic('notificationError');
      const pair = [`${selected.side}:${selected.id}`, `${side}:${id}`];
      setWrong(pair);
      timers.current.push(setTimeout(() => setWrong([]), 500));
    }
  };

  const tile = (side: Side, card: Card) => {
    const key = `${side}:${card.id}`;
    const isMatched = matched.includes(card.id);
    const isSelected = selected?.side === side && selected.id === card.id;
    const isWrong = wrong.includes(key);
    const border = isMatched
      ? colors.success
      : isWrong
        ? colors.error
        : isSelected
          ? colors.primary
          : colors.border;
    const bg = isMatched
      ? alpha(colors.success, 10)
      : isWrong
        ? alpha(colors.error, 10)
        : isSelected
          ? alpha(colors.primary, 10)
          : colors.surface;
    const text = side === 'l' ? card.frontText : card.backText.replace(/\s*\([^)]+\)$/, '');
    return (
      <Pressable
        key={key}
        disabled={isMatched}
        onPress={() => press(side, card.id)}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected, disabled: isMatched }}
        style={[
          styles.tile,
          { borderColor: border, backgroundColor: bg },
          isMatched && styles.done,
        ]}
      >
        <Text
          variant="body"
          align="center"
          style={[styles.tileText, { color: isMatched ? colors.successText : colors.textPrimary }]}
        >
          {text}
        </Text>
      </Pressable>
    );
  };

  const left = words.length - matched.length;
  return (
    <FirstLessonLayout
      label="Первый урок · Пары"
      counter={left ? `${left} ${left === 1 ? 'пара' : left < 5 ? 'пары' : 'пар'}` : 'Готово'}
      progress={60 + (matched.length / Math.max(1, words.length)) * 40}
    >
      <View style={styles.head}>
        <Text variant="h2" accessibilityRole="header" style={{ color: colors.textPrimary }}>
          Найди пары
        </Text>
        <Text variant="body" style={{ color: colors.textSecondary }}>
          Нажми слово, потом его перевод.
        </Text>
      </View>
      <View style={styles.columns}>
        <View style={styles.column}>{words.map((c) => tile('l', c))}</View>
        <View style={styles.column}>{right.map((c) => tile('r', c))}</View>
      </View>
    </FirstLessonLayout>
  );
}

const styles = StyleSheet.create({
  head: {
    gap: spacing.xxs,
  },
  columns: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  column: {
    flex: 1,
    gap: spacing.s,
  },
  tile: {
    minHeight: 58,
    borderWidth: 2,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xs,
  },
  tileText: {
    fontWeight: '600',
  },
  done: {
    opacity: 0.6,
  },
});
