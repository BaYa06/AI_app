/**
 * ImportProcessing
 * @description Экран «Создаём карточки» во время запроса к ИИ (plan/done/ai_import.md, AI 5):
 * шаги вместо голой крутилки, честные сроки, кнопка «Отменить».
 * Сервер распознаёт и переводит одним запросом, поэтому шаг «Распознаём и переводим» — один;
 * подписи меняются по времени, чтобы долгий ответ не выглядел зависанием.
 */
import React, { memo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/common';
import { Button, ProgressBar } from '@/components/ui';
import { useThemeColors } from '@/store';
import { borderRadius, iconSize, screenPadding, spacing } from '@/constants';
import { pluralize } from '@/utils';

interface Props {
  photoCount: number;
  fileCount: number;
  onCancel: () => void;
}

function hintFor(seconds: number): string {
  if (seconds < 15) return 'Обычно 5–15 секунд';
  if (seconds < 40) return 'ИИ сейчас загружен — ещё немного';
  return 'Пробуем другую модель ИИ — это бывает при большой нагрузке';
}

export const ImportProcessing = memo(function ImportProcessing({ photoCount, fileCount, onCancel }: Props) {
  const colors = useThemeColors();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const uploaded = photoCount > 0
    ? `${photoCount} ${pluralize(photoCount, 'фото', 'фото', 'фото')}`
    : `${fileCount} ${pluralize(fileCount, 'файл', 'файла', 'файлов')}`;
  // Плавно к 90 %: настоящего прогресса сервер не сообщает
  const progress = Math.min(90, 10 + 80 * (1 - Math.exp(-seconds / 15)));

  const steps: Array<{ title: string; hint: string; state: 'done' | 'active' | 'pending' }> = [
    { title: 'Отправили', hint: uploaded, state: 'done' },
    { title: 'Распознаём и переводим', hint: hintFor(seconds), state: 'active' },
    { title: 'Проверка', hint: 'Ты подтверждаешь список перед добавлением', state: 'pending' },
  ];

  return (
    <View style={styles.root}>
      <Text variant="h2" style={{ color: colors.textPrimary }}>Создаём карточки</Text>

      <View style={styles.steps} accessibilityLiveRegion="polite">
        {steps.map(step => (
          <View key={step.title} style={[styles.step, step.state === 'pending' && styles.pending]}>
            <View
              style={[
                styles.dot,
                step.state === 'done' && { backgroundColor: colors.success },
                step.state === 'active' && { borderWidth: 3, borderColor: colors.primary },
                step.state === 'pending' && { borderWidth: 2, borderColor: colors.border },
              ]}
            >
              {step.state === 'done' && <Check size={iconSize.xs} color={colors.onPrimary} />}
              {step.state === 'active' && <View style={[styles.activeCore, { backgroundColor: colors.primary }]} />}
            </View>
            <View style={styles.stepText}>
              <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>{step.title}</Text>
              <Text variant="bodySmall" color="secondary">{step.hint}</Text>
            </View>
          </View>
        ))}
      </View>

      <ProgressBar progress={progress} accessibilityLabel="Создание карточек" />

      <Text variant="bodySmall" color="secondary">
        Лучше не сворачивать приложение. Если связь оборвётся — файлы останутся, повторим одной кнопкой.
      </Text>

      <View style={styles.spacer} />
      <Button variant="secondary" title="Отменить" onPress={onCancel} fullWidth />
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: screenPadding, paddingTop: spacing.l, paddingBottom: spacing.l, gap: spacing.l },
  steps: { gap: spacing.m },
  step: { flexDirection: 'row', gap: spacing.s, alignItems: 'flex-start' },
  pending: { opacity: 0.5 },
  dot: { width: 28, height: 28, borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  activeCore: { width: 10, height: 10, borderRadius: borderRadius.full },
  stepText: { flex: 1, gap: spacing.xxs },
  spacer: { flex: 1 },
});
