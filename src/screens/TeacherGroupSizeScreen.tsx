/**
 * TeacherGroupSizeScreen
 * @description Шаг 4 (учитель): выбор размера группы учеников.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { User, Users, School, HelpCircle, Rocket } from 'lucide-react-native';
import { Text } from '@/components/common';
import { Button, type IconComponent } from '@/components/ui';
import { OnboardingOption } from '@/components/onboarding/OnboardingOption';
import { OnboardingStep } from '@/components/onboarding/OnboardingStep';
import { useThemeColors } from '@/store';
import { spacing } from '@/constants';

type SizeOption = {
  id: string;
  label: string;
  icon: IconComponent;
  vibe: string;
};

type Props = {
  onContinue?: (optionId: string) => void;
  onBack?: () => void;
};

const OPTIONS: SizeOption[] = [
  { id: '1-10', label: '1–10 учеников', icon: User, vibe: 'Индивидуально' },
  { id: '11-30', label: '11–30 учеников', icon: Users, vibe: 'Небольшая группа' },
  { id: '30+', label: '30+ учеников', icon: School, vibe: 'Большая группа' },
  { id: 'unknown', label: 'Пока не знаю', icon: HelpCircle, vibe: 'Определюсь позже' },
];

export function TeacherGroupSizeScreen({ onContinue, onBack }: Props) {
  const colors = useThemeColors();
  const [selected, setSelected] = useState<string>('1-10');

  return (
    <OnboardingStep
      onBack={onBack}
      title="Flashly"
      step={6}
      headline="Сколько у тебя учеников?"
      description="Это поможет нам подобрать оптимальные инструменты."
      align="center"
      footer={
        <>
          <Text variant="bodySmall" align="center" style={{ color: colors.textTertiary }}>
            Это можно изменить в настройках профиля.
          </Text>
          <Button title="Начать работу" icon={Rocket} onPress={() => onContinue?.(selected)} fullWidth />
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
