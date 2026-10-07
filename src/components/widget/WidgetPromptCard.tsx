/**
 * WidgetPromptCard — «Учи слова прямо с экрана блокировки» (plan/widgets.md, шаг 3.1)
 * @description Карточка на итогах урока дня. Когда показывать — services/widgetPrompt.ts.
 * Главная кнопка экрана итогов уже залитая, поэтому здесь кнопка второго уровня.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Lock, X } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button, Card } from '@/components/ui';
import { spacing, iconSize, alpha, borderRadius, heights } from '@/constants';

interface Props {
  onHowTo: () => void;
  onDismiss: () => void;
}

export function WidgetPromptCard({ onHowTo, onDismiss }: Props) {
  const colors = useThemeColors();

  return (
    <Card style={st.card}>
      <View style={st.header}>
        <View style={[st.icon, { backgroundColor: alpha(colors.primary, 10) }]}>
          <Lock size={iconSize.s} color={colors.primary} />
        </View>
        <View style={st.text}>
          <Text variant="body" style={[st.title, { color: colors.textPrimary }]}>
            Учи слова прямо с экрана блокировки
          </Text>
          <Text variant="bodySmall" color="secondary">
            Виджет покажет слово из сегодняшнего урока, а потом перевод. Вспоминать можно, не открывая приложение.
          </Text>
        </View>
        <Button variant="icon" icon={X} background="none" accessibilityLabel="Не сейчас" onPress={onDismiss} />
      </View>
      <Button title="Как добавить" variant="secondary" size="s" onPress={onHowTo} style={st.action} />
    </Card>
  );
}

const st = StyleSheet.create({
  card: {
    gap: spacing.m,
  },
  header: {
    flexDirection: 'row',
    gap: spacing.m,
    alignItems: 'flex-start',
  },
  icon: {
    width: heights.buttonSmall,
    height: heights.buttonSmall,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: spacing.xxs,
  },
  title: {
    fontWeight: '600',
  },
  action: {
    alignSelf: 'flex-start',
  },
});
