/**
 * «Собираем твой первый набор» (plan/new/new_user_activation.md, Start 2.5): ~2 секунды
 * карточки набора вылетают стопкой, счётчик 0 → 20. Пока идёт анимация, набор создаётся на
 * сервере; экран уходит сам, когда готово и то и другое.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { Text } from '@/components/common/Text';
import { useThemeColors } from '@/store';
import { borderRadius, getLanguageDefByCode, spacing } from '@/constants';
import { STARTER_THEMES, isStarterLang } from '@/constants/starterWords';
import { FirstLessonLayout } from './FirstLessonLayout';

const MIN_MS = 2100;
const SHOWN = STARTER_THEMES.first_words.concepts.slice(0, 5);
const TOTAL_WORDS = 20;

function FlyingCard({ index, front, back }: { index: number; front: string; back: string }) {
  const colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) return;
    t.value = withDelay(150 + index * 210, withSpring(1, { damping: 12, stiffness: 140 }));
  }, [index, reduceMotion, t]);
  const rotate = (index - 2) * 5;
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, t.value * 1.5),
    transform: [
      { translateY: (1 - t.value) * 60 + (index - 2) * -6 },
      { rotate: `${rotate * t.value}deg` },
      { scale: 0.9 + 0.1 * t.value },
    ],
  }));
  return (
    <Animated.View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}
    >
      <Text variant="h3" style={{ color: colors.textPrimary }}>
        {front}
      </Text>
      <Text variant="body" style={{ color: colors.textSecondary }}>
        {back}
      </Text>
    </Animated.View>
  );
}

export function StarterBuildScreen({
  native,
  target,
  ready,
  onDone,
}: {
  native: string;
  target: string;
  /** null — набор ещё создаётся; true/false — готово (false — без урока) */
  ready: boolean | null;
  onDone: (ok: boolean) => void;
}) {
  const colors = useThemeColors();
  const [count, setCount] = useState(0);
  const [minPassed, setMinPassed] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinPassed(true), MIN_MS);
    const tick = setInterval(() => setCount((n) => Math.min(TOTAL_WORDS, n + 1)), 55);
    return () => {
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, []);

  useEffect(() => {
    if (done.current || !minPassed || ready === null) return;
    done.current = true;
    onDone(ready);
  }, [minPassed, ready, onDone]);

  const from = getLanguageDefByCode(target);
  const to = getLanguageDefByCode(native);

  return (
    <FirstLessonLayout>
      <View style={styles.center} accessibilityLiveRegion="polite">
        <View style={styles.stack} accessibilityElementsHidden>
          {SHOWN.map((c, i) => (
            <FlyingCard
              key={c.id}
              index={i}
              front={isStarterLang(target) ? c.words[target].word : ''}
              back={isStarterLang(native) ? c.words[native].word : ''}
            />
          ))}
        </View>
        <Text
          variant="h1"
          align="center"
          accessibilityRole="header"
          style={{ color: colors.textPrimary }}
        >
          Собираем твой первый набор
        </Text>
        <Text variant="body" align="center" style={{ color: colors.textSecondary }}>
          «Первые слова» · {from?.flag} {from?.label} → {to?.flag} {to?.label}
        </Text>
        <Text variant="label" align="center" style={[styles.count, { color: colors.primary }]}>
          {count} из {TOTAL_WORDS} слов
        </Text>
      </View>
    </FirstLessonLayout>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.s,
  },
  stack: {
    alignSelf: 'center',
    width: 220,
    height: 170,
    marginBottom: spacing.l,
  },
  card: {
    position: 'absolute',
    left: spacing.m,
    right: spacing.m,
    top: 30,
    height: 96,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
  },
  count: {
    fontVariant: ['tabular-nums'],
  },
});
