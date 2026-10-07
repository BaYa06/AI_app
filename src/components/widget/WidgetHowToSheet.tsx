/**
 * WidgetHowToSheet — «Как добавить виджет» (plan/widgets.md, шаги 3.1 и 3.2)
 * @description iOS не даёт поставить виджет из приложения, поэтому показываем шаги.
 * Шаги — настоящая последовательность действий, отсюда и номера.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button, Sheet } from '@/components/ui';
import { spacing, borderRadius, alpha } from '@/constants';

const STEPS = [
  { title: 'Зажми экран блокировки', hint: 'iPhone должен быть разблокирован — например, через Face ID.' },
  { title: 'Нажми «Настроить»', hint: 'Затем выбери «Экран блокировки».' },
  { title: 'Нажми на поле под часами', hint: 'Откроется список «Добавить виджеты».' },
  { title: 'Найди Flashly', hint: 'Выбери «Вспомни слово» — прямоугольник показывает больше всего.' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function WidgetHowToSheet({ visible, onClose }: Props) {
  const colors = useThemeColors();

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Как добавить виджет"
      footer={<Button title="Понятно" variant="secondary" onPress={onClose} fullWidth />}
    >
      <View style={st.steps}>
        {STEPS.map((step, index) => (
          <View key={step.title} style={st.step}>
            <View style={[st.number, { backgroundColor: alpha(colors.primary, 10) }]}>
              <Text variant="label" style={{ color: colors.primary }}>{index + 1}</Text>
            </View>
            <View style={st.stepText}>
              <Text variant="body" style={{ color: colors.textPrimary }}>{step.title}</Text>
              <Text variant="bodySmall" color="secondary">{step.hint}</Text>
            </View>
          </View>
        ))}
      </View>
      <Text variant="bodySmall" color="secondary" style={st.footnote}>
        Виджет показывает слово, а через 20 минут — перевод. Вспомни его, пока не открылся ответ.
      </Text>
    </Sheet>
  );
}

const st = StyleSheet.create({
  steps: {
    gap: spacing.m,
  },
  step: {
    flexDirection: 'row',
    gap: spacing.m,
    alignItems: 'flex-start',
  },
  number: {
    width: spacing.xl,
    height: spacing.xl,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
    gap: spacing.xxs,
  },
  footnote: {
    marginTop: spacing.l,
  },
});
