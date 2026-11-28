/**
 * Плашка «Идёт тест — вернуться» (plan/new/live_test_return.md, LiveReturn 3–4): учитель вышел
 * из лобби или монитора, а тест идёт. Нажатие ведёт в лобби (ещё не начат) или в монитор.
 * Несколько тестов — несколько строк под общим заголовком.
 */
import React, { useEffect } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Radio } from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, alpha, iconSize, screenPadding } from '@/constants';
import { Analytics } from '@/services/analytics';
import type { ActiveTest } from '@/services/activeTest';

export type ActiveTestPlace = 'home' | 'course' | 'history';

type Props = {
  tests: ActiveTest[];
  navigation: any;
  place: ActiveTestPlace;
  /** false — без внешних отступов (внутри списка с собственными) */
  padded?: boolean;
};

/** Слово для числа: «1 ученик», «2 ученика», «5 учеников» */
function studentsText(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} ученик`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} ученика`;
  return `${n} учеников`;
}

/** Куда вести: лобби с кодом (waiting) или монитор (active) */
export function openActiveTest(navigation: any, t: ActiveTest) {
  const rootNav = navigation?.getParent?.() ?? navigation;
  const base = {
    courseId: t.courseId,
    courseTitle: t.courseTitle || 'Курс',
    sessionId: t.sessionId,
  };
  if (t.status === 'waiting') {
    rootNav?.navigate('TestLobby', {
      ...base,
      code: t.code,
      testMode: t.testMode,
      questionCount: t.questionCount,
      timePerQuestion: t.timePerQuestion,
    });
  } else {
    rootNav?.navigate('LiveTest', base);
  }
}

export function ActiveTestBanner({ tests, navigation, place, padded = true }: Props) {
  const colors = useThemeColors();
  const count = tests.length;

  useEffect(() => {
    if (count > 0) Analytics.activeTestBannerShown(place, count);
  }, [count > 0, place]); // eslint-disable-line react-hooks/exhaustive-deps

  if (count === 0) return null;

  return (
    <View style={padded ? styles.wrap : undefined}>
      {count > 1 ? (
        <Text variant="label" style={[styles.heading, { color: colors.textSecondary }]}>
          Идёт тестов: {count}
        </Text>
      ) : null}
      {tests.map((t) => {
        const waiting = t.status === 'waiting';
        return (
          <Pressable
            key={t.sessionId}
            accessibilityRole="button"
            accessibilityLabel={`${waiting ? 'Тест ещё не начат' : 'Идёт тест'}, вернуться`}
            onPress={() => {
              Analytics.activeTestReturned(place, t.status);
              openActiveTest(navigation, t);
            }}
            style={({ pressed }) => [
              styles.card,
              { backgroundColor: pressed ? colors.primaryPressed : colors.primaryFill },
            ]}
          >
            <View style={[styles.icon, { backgroundColor: alpha(colors.onPrimary, 20) }]}>
              <Radio size={iconSize.s} color={colors.onPrimary} />
            </View>
            <View style={styles.text}>
              <Text variant="label" style={{ color: colors.onPrimary }} numberOfLines={1}>
                {waiting ? 'Тест ещё не начат' : 'Идёт тест'}
              </Text>
              <Text
                variant="caption"
                style={[styles.muted, { color: colors.onPrimary }]}
                numberOfLines={1}
              >
                {[t.setTitle, studentsText(t.participantCount)].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <View style={[styles.button, { backgroundColor: colors.onPrimary }]}>
              <Text variant="caption" style={[styles.buttonText, { color: colors.primaryFill }]}>
                Вернуться →
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.m,
    paddingBottom: spacing.xxs,
    gap: spacing.xs,
  },
  heading: { marginBottom: spacing.xxs },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    padding: spacing.s,
    borderRadius: borderRadius.l,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  muted: { opacity: 0.85 },
  button: {
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  buttonText: { fontWeight: '600' },
});
