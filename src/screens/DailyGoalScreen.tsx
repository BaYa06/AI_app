/**
 * DailyGoalScreen
 * @description Шаг 5: выбор дневной цели (сколько слов в день). Выбор сохраняет App (handleSubmitDaily)
 * в настройку lessonNewPerDay — квоту новых слов урока дня; id вариантов — числа из NEW_PER_DAY_OPTIONS.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Leaf, Zap, Flame, Rocket } from 'lucide-react-native';
import { Text } from '@/components/common';
import { Button, type IconComponent } from '@/components/ui';
import { OnboardingOption } from '@/components/onboarding/OnboardingOption';
import { OnboardingStep } from '@/components/onboarding/OnboardingStep';
import { useThemeColors } from '@/store';
import { spacing } from '@/constants';

type DailyOption = {
  id: string;
  label: string;
  icon: IconComponent;
  vibe: string;
};

type Props = {
  onContinue?: (optionId: string) => void;
  onBack?: () => void;
};

const OPTIONS: DailyOption[] = [
  { id: '5', label: '5 слов в день', icon: Leaf, vibe: 'Неспешно' },
  { id: '10', label: '10 слов в день', icon: Zap, vibe: 'В ритме' },
  { id: '20', label: '20 слов в день', icon: Flame, vibe: 'Серьезно' },
];

export function DailyGoalScreen({ onContinue, onBack }: Props) {
  const colors = useThemeColors();
  const [selected, setSelected] = useState<string>('10');

  return (
    <OnboardingStep
      onBack={onBack}
      title="Flashly"
      step={6}
      headline="Установи дневную цель"
      description="Сколько новых слов хочешь учить каждый день?"
      align="center"
      footer={
        <>
          <Text variant="bodySmall" align="center" style={{ color: colors.textTertiary }}>
            Это можно изменить в настройках профиля.
          </Text>
          <Button title="Начать обучение" icon={Rocket} onPress={() => onContinue?.(selected)} fullWidth />
        </>
      }
    >
      <View accessibilityRole="radiogroup" style={styles.options}>
        {OPTIONS.map((opt) => (
          <OnboardingOption
            key={opt.id}
            title={opt.label}
            meta={{ icon: opt.icon, text: opt.vibe }}
            selected={selected === opt.id}
            onPress={() => setSelected(opt.id)}
          />
        ))}
      </View>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  options: {
    gap: spacing.m,
  },
});
