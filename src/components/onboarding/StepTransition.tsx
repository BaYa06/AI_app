/**
 * Смена шагов онбординга сдвигом ~0,3 с вперёд или назад (plan/new/new_user_activation.md,
 * Start 2.4). Раньше экраны просто подменялись. Направление — по порядку шагов.
 * Веб и «Уменьшить движение» — без анимации (layout-анимации Reanimated на вебе ненадёжны).
 */
import React, { useRef } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Animated, {
  FadeInLeft,
  FadeInRight,
  FadeOutLeft,
  FadeOutRight,
  useReducedMotion,
} from 'react-native-reanimated';

/** Порядок шагов: ученик и учитель идут по одному списку, лишние шаги просто пропускаются */
const ORDER = [
  'welcome',
  'role',
  'name',
  'native_language',
  'target_languages',
  'starter_build',
  'first_cards',
  'first_match',
  'first_results',
  'teacher_subject',
  'teacher_size',
  'goal',
  'daily',
  'with_teacher',
  'about',
];

const DURATION = 300;

export function StepTransition({ step, children }: { step: string; children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  const prev = useRef(step);
  const forward = useRef(true);
  if (prev.current !== step) {
    forward.current = ORDER.indexOf(step) >= ORDER.indexOf(prev.current);
    prev.current = step;
  }

  if (Platform.OS === 'web' || reduceMotion) return <>{children}</>;

  const entering = (forward.current ? FadeInRight : FadeInLeft).duration(DURATION);
  const exiting = (forward.current ? FadeOutLeft : FadeOutRight).duration(DURATION * 0.8);

  return (
    <Animated.View style={styles.fill}>
      <Animated.View
        key={step}
        entering={entering}
        exiting={exiting}
        style={StyleSheet.absoluteFill}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
