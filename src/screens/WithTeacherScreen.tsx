/**
 * WithTeacherScreen — «Ты учишься с учителем?» после нормы (plan/new/new_user_activation.md,
 * Start 3.6). «Да» — на главной появится карточка «Подключиться к учителю»; можно пропустить.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GraduationCap, User } from 'lucide-react-native';
import { Button } from '@/components/ui';
import { OnboardingOption } from '@/components/onboarding/OnboardingOption';
import { OnboardingStep } from '@/components/onboarding/OnboardingStep';
import { spacing } from '@/constants';

type Props = {
  step?: number;
  total?: number;
  /** undefined — «Пропустить» */
  onContinue: (withTeacher?: boolean) => void;
  onBack?: () => void;
};

export function WithTeacherScreen({ step, total, onContinue, onBack }: Props) {
  const [selected, setSelected] = useState<boolean | null>(null);

  return (
    <OnboardingStep
      onBack={onBack}
      title="Flashly"
      step={step}
      total={total}
      headline="Ты учишься с учителем?"
      description="Если учитель ведёт курс во Flashly, его задания и наборы появятся у тебя на главной."
      footer={
        <>
          <Button
            title="Готово"
            onPress={() => selected !== null && onContinue(selected)}
            disabled={selected === null}
            fullWidth
          />
          <Button title="Пропустить" variant="quiet" onPress={() => onContinue()} fullWidth />
        </>
      }
    >
      <View accessibilityRole="radiogroup" style={styles.options}>
        <OnboardingOption
          title="Да, у меня есть учитель"
          description="Покажем, где ввести код от учителя"
          icon={GraduationCap}
          selected={selected === true}
          onPress={() => setSelected(true)}
        />
        <OnboardingOption
          title="Нет, учусь сам"
          description="Всегда можно подключиться позже"
          icon={User}
          selected={selected === false}
          onPress={() => setSelected(false)}
        />
      </View>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  options: {
    gap: spacing.m,
  },
});
