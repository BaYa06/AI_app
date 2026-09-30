/**
 * TeacherSubjectScreen
 * @description Шаг 3 (учитель): выбор предмета преподавания.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Languages, Calculator, FlaskConical, BookOpen, Briefcase, MoreHorizontal } from 'lucide-react-native';
import { Button, type IconComponent } from '@/components/ui';
import { OnboardingOption } from '@/components/onboarding/OnboardingOption';
import { OnboardingStep } from '@/components/onboarding/OnboardingStep';
import { spacing } from '@/constants';

type SubjectOption = {
  id: string;
  title: string;
  description: string;
  icon: IconComponent;
};

type Props = {
  onContinue?: (subjectId: string) => void;
  onBack?: () => void;
};

const OPTIONS: SubjectOption[] = [
  { id: 'languages', title: 'Языки', description: 'Иностранные и родной язык', icon: Languages },
  { id: 'math', title: 'Математика', description: 'Алгебра, геометрия, статистика', icon: Calculator },
  { id: 'sciences', title: 'Естественные науки', description: 'Физика, химия, биология', icon: FlaskConical },
  { id: 'humanities', title: 'Гуманитарные', description: 'История, литература, право', icon: BookOpen },
  { id: 'corporate', title: 'Корпоративное', description: 'Бизнес-обучение и тренинги', icon: Briefcase },
  { id: 'other', title: 'Другое', description: 'Музыка, спорт, другие предметы', icon: MoreHorizontal },
];

export function TeacherSubjectScreen({ onContinue, onBack }: Props) {
  const [selected, setSelected] = useState<string>('languages');

  return (
    <OnboardingStep
      onBack={onBack}
      title="Flashly"
      progressLabel="Шаг 5 из 6"
      progressValue="83%"
      progress={83}
      headline="Что ты преподаёшь?"
      description="Мы подберём шаблоны и инструменты для твоего предмета."
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
