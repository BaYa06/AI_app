/**
 * RoleSelectionScreen
 * @description Шаг 2: выбор роли (ученик / учитель).
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GraduationCap, Users } from 'lucide-react-native';
import { Button, type IconComponent } from '@/components/ui';
import { OnboardingOption } from '@/components/onboarding/OnboardingOption';
import { OnboardingStep } from '@/components/onboarding/OnboardingStep';
import { spacing } from '@/constants';

type RoleOption = {
  id: string;
  title: string;
  description: string;
  icon: IconComponent;
};

type Props = {
  onContinue?: (roleId: string) => void;
  onBack?: () => void;
};

const OPTIONS: RoleOption[] = [
  { id: 'student', title: 'Я учусь', description: 'Создавай карточки и учи новое', icon: GraduationCap },
  { id: 'teacher', title: 'Я преподаю', description: 'Создавай курсы для учеников', icon: Users },
];

export function RoleSelectionScreen({ onContinue, onBack }: Props) {
  const [selected, setSelected] = useState<string>('student');

  return (
    <OnboardingStep
      onBack={onBack}
      title="Flashly"
      step={2}
      headline="Кто ты?"
      description="Это поможет нам настроить приложение под тебя."
      footer={<Button title="Продолжить" onPress={() => onContinue?.(selected)} fullWidth />}
    >
      <View accessibilityRole="radiogroup" style={styles.options}>
        {OPTIONS.map((option) => (
          <OnboardingOption
            key={option.id}
            title={option.title}
            description={option.description}
            icon={option.icon}
            selected={selected === option.id}
            onPress={() => setSelected(option.id)}
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
