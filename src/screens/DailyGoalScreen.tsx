/**
 * DailyGoalScreen
 * @description Шаг 5: выбор дневной цели (сколько слов в день). Выбор сохраняет App (handleSubmitDaily)
 * в настройку lessonNewPerDay — квоту новых слов урока дня; id вариантов — числа из NEW_PER_DAY_OPTIONS.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Leaf, Zap, Flame } from 'lucide-react-native';
import { Button, type IconComponent } from '@/components/ui';
import { OnboardingOption } from '@/components/onboarding/OnboardingOption';
import { OnboardingStep } from '@/components/onboarding/OnboardingStep';
import { spacing } from '@/constants';

type DailyOption = {
  id: string;
  label: string;
  icon: IconComponent;
  vibe: string;
};

type Props = {
  /** Номер шага и сколько всего — считает AppRoot по роли и пути */
  step?: number;
  total?: number;
  onContinue?: (optionId: string) => void;
  onBack?: () => void;
};

const OPTIONS: DailyOption[] = [
  { id: '5', label: '5 слов в день', icon: Leaf, vibe: 'Неспешно' },
  { id: '10', label: '10 слов в день', icon: Zap, vibe: 'В ритме' },
  { id: '20', label: '20 слов в день', icon: Flame, vibe: 'Серьезно' },
];

export function DailyGoalScreen({ onContinue, onBack, step = 6, total }: Props) {
  const [selected, setSelected] = useState<string>('10');

  return (
    <OnboardingStep
      onBack={onBack}
      title="Flashly"
      step={step}
      total={total}
      headline="Сколько слов в день?"
      description="Можно поменять в любой момент."
      align="center"
      footer={
        <>
          <Button title="Продолжить" onPress={() => onContinue?.(selected)} fullWidth />
          <Button title="Пропустить" variant="quiet" onPress={() => onContinue?.('10')} fullWidth />
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
