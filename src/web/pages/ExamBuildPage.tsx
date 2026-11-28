/**
 * «Собираем экзамен» (plan/new/web_cabinet.md, Web 14; макет E2): настоящие шаги алгоритма с
 * настоящими цифрами. Сборка занимает меньше секунды — пауза ~300 мс на шаг только затем, чтобы
 * шаги успели прочитаться.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AlertTriangle, Check } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { navigate } from '../router';
import { takeBuild } from '../exam/buildCache';
import { PageHeader } from '../ui/kit';

const STEP_MS = 300;

export function ExamBuildPage({ sessionId }: { sessionId: string }) {
  const colors = useThemeColors();
  const info = takeBuild(sessionId);
  const [shown, setShown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // После перезагрузки страницы шагов нет — сразу к превью
  useEffect(() => {
    if (!info) navigate(`/exams/${sessionId}`, { replace: true });
  }, [info, sessionId]);

  const run = () => {
    if (!info) return;
    if (timer.current) clearInterval(timer.current);
    setShown(0);
    timer.current = setInterval(() => {
      setShown((n) => {
        if (n + 1 >= info.steps.length && timer.current) clearInterval(timer.current);
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

  if (!info) return null;
  const ready = shown >= info.steps.length;

  return (
    <View style={{ maxWidth: 640 }}>
      <PageHeader
        title={ready ? 'Экзамен готов' : 'Собираем экзамен…'}
        subtitle="Подбираем слова по тому, как класс их учил"
      />
      <View accessibilityLiveRegion="polite">
        {info.steps.map((s, i) => {
          const done = i < shown;
          const active = i === shown;
          const last = i === info.steps.length - 1;
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
                    <Check size={16} color={colors.onPrimary} />
                  ) : active ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : null}
                </View>
                {!last ? (
                  <View
                    style={[
                      styles.line,
                      { backgroundColor: done ? colors.success : colors.border },
                    ]}
                  />
                ) : null}
              </View>
              <View style={styles.stepText}>
                <Text variant="label">{s.title}</Text>
                <Text variant="bodySmall" color="secondary">
                  {s.detail}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {ready && info.warnings.length > 0 ? (
        <Card
          style={{
            backgroundColor: alpha(colors.warning, 10),
            borderColor: alpha(colors.warning, 40),
            gap: spacing.xs,
            marginTop: spacing.m,
          }}
        >
          {info.warnings.map((w) => (
            <View key={w.code + w.text} style={styles.warnRow}>
              <AlertTriangle size={16} color={colors.warningText} />
              <Text variant="bodySmall" style={{ flex: 1, color: colors.warningText }}>
                {w.text}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      <View style={styles.actions}>
        {ready ? (
          <Button title="Посмотреть превью" onPress={() => navigate(`/exams/${sessionId}`)} />
        ) : null}
        <Button variant="quiet" title="Показать сборку ещё раз" onPress={run} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  warnRow: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' },
  actions: { flexDirection: 'row', gap: spacing.s, marginTop: spacing.l, alignItems: 'center' },
});
