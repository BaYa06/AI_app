/**
 * «Собираем экзамен» (plan/new/live_exam.md, LiveExam 14; макет «1.5»). Сборка на сервере
 * уже прошла (< 1 с) — здесь настоящие шаги алгоритма с настоящими цифрами. Пауза ~300 мс на
 * шаг только чтобы их успели прочитать.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AlertTriangle, Check } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text } from '@/components/common';
import { Button, Card, Screen, ScreenHeader } from '@/components/ui';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, iconSize, screenPadding, alpha } from '@/constants';
import type { RootStackParamList } from '@/types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ExamBuild'>;

const STEP_MS = 320;

export function ExamBuildScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const { steps, warnings, sessionId, courseId, courseTitle } = route.params;
  const [shown, setShown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const run = () => {
    if (timer.current) clearInterval(timer.current);
    setShown(0);
    timer.current = setInterval(() => {
      setShown((n) => {
        if (n + 1 >= steps.length && timer.current) clearInterval(timer.current);
        return n + 1;
      });
    }, STEP_MS);
  };
  useEffect(() => {
    run();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = shown >= steps.length;

  return (
    <Screen
      header={<ScreenHeader onBack={() => navigation.goBack()} />}
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          {ready ? (
            <Button
              title="Посмотреть превью"
              fullWidth
              onPress={() =>
                navigation.replace('ExamPreview', { sessionId, courseId, courseTitle })
              }
            />
          ) : null}
          <Button title="Показать сборку ещё раз" variant="quiet" onPress={run} />
        </View>
      }
    >
      <View style={styles.titleBlock}>
        <Text variant="caption" style={{ color: colors.textSecondary }}>
          {courseTitle}
        </Text>
        <Text variant="h1" accessibilityRole="header" accessibilityLiveRegion="polite">
          {ready ? 'Экзамен готов' : 'Собираем экзамен…'}
        </Text>
        <Text variant="body" style={{ color: colors.textSecondary }}>
          Подбираем слова по тому, как класс их учил
        </Text>
      </View>

      <View>
        {steps.map((s, i) => {
          const done = i < shown;
          const active = i === shown;
          const last = i === steps.length - 1;
          return (
            <View key={s.key} style={[styles.step, { opacity: i > shown ? 0.4 : 1 }]}>
              <View style={styles.rail}>
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: done ? colors.success : colors.surface,
                      borderColor: done ? colors.success : active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  {done ? (
                    <Check size={iconSize.xs} color={colors.onPrimary} />
                  ) : active ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : null}
                </View>
                {!last ? (
                  <View
                    style={[
                      styles.line,
                      { backgroundColor: done ? colors.success : colors.borderLight },
                    ]}
                  />
                ) : null}
              </View>
              <View style={styles.stepText}>
                <Text variant="label">{s.title}</Text>
                <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                  {s.detail}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {ready && warnings.length > 0 ? (
        <Card
          style={[
            styles.warn,
            { backgroundColor: alpha(colors.warning, 10), borderColor: alpha(colors.warning, 40) },
          ]}
        >
          {warnings.map((w) => (
            <View key={w.code + w.text} style={styles.warnRow}>
              <AlertTriangle size={iconSize.xs} color={colors.warningText} />
              <Text variant="bodySmall" style={[styles.flex, { color: colors.warningText }]}>
                {w.text}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.l, gap: spacing.l },
  footer: { paddingHorizontal: screenPadding, gap: spacing.xs },
  titleBlock: { gap: spacing.xs },
  step: { flexDirection: 'row', gap: spacing.s },
  rail: { alignItems: 'center', width: 28 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: { width: 2, flex: 1, minHeight: 18 },
  stepText: { flex: 1, paddingTop: 3, paddingBottom: spacing.m, gap: spacing.xxs },
  warn: { gap: spacing.xs, borderWidth: 1 },
  warnRow: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' },
  flex: { flex: 1 },
});
