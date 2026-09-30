/**
 * LearningGoalScreen
 * @description Шаг 4: выбор цели обучения. Только UI, без сохранения.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GraduationCap, BookOpen, Plane, Leaf } from 'lucide-react-native';
import { Text } from '@/components/common';
import { Button, type IconComponent } from '@/components/ui';
import { OnboardingOption } from '@/components/onboarding/OnboardingOption';
import { OnboardingStep } from '@/components/onboarding/OnboardingStep';
import { useThemeColors } from '@/store';
import { spacing } from '@/constants';

type GoalOption = {
  id: string;
  title: string;
  description: string;
  icon: IconComponent;
};

type Props = {
  onContinue?: (goalId: string) => void;
  onBack?: () => void;
};

const OPTIONS: GoalOption[] = [
  { id: 'studies', title: 'Для учебы', description: 'Подготовка к экзаменам и зачетам', icon: GraduationCap },
  { id: 'courses', title: 'Для курсов', description: 'Освоить конкретный предмет', icon: BookOpen },
  { id: 'travel', title: 'Для путешествий', description: 'Выучить базовые фразы и слова', icon: Plane },
  { id: 'self', title: 'Для себя', description: 'Личное развитие и новые хобби', icon: Leaf },
];

export function LearningGoalScreen({ onContinue, onBack }: Props) {
  const colors = useThemeColors();
  const [selected, setSelected] = useState<string>('studies');

  return (
    <OnboardingStep
      onBack={onBack}
      title="Flashly"
      step={5}
      headline="Зачем ты учишь?"
      description="Мы персонализируем карточки под твои цели."
      footer={
        <>
          <Button title="Продолжить" onPress={() => onContinue?.(selected)} fullWidth />
          <Text variant="caption" align="center" style={{ color: colors.textTertiary }}>
            Цель можно поменять в настройках в любой момент
          </Text>
        </>
      }
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
