/**
 * NativeLanguageScreen
 * @description Шаг 3: выбор родного языка. Только UI, без сохранения.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui';
import { OnboardingOption } from '@/components/onboarding/OnboardingOption';
import { OnboardingStep } from '@/components/onboarding/OnboardingStep';
import { spacing, TOP_LANGUAGES } from '@/constants';

type Props = {
  onContinue?: (code: string) => void;
  onBack?: () => void;
};

export function NativeLanguageScreen({ onContinue, onBack }: Props) {
  const [selected, setSelected] = useState<string>('ru');

  return (
    <OnboardingStep
      onBack={onBack}
      title="Flashly"
      step={3}
      headline="Какой язык родной?"
      description="Переводы слов будут показываться на этом языке."
      footer={<Button title="Продолжить" onPress={() => onContinue?.(selected)} fullWidth />}
    >
      <View accessibilityRole="radiogroup" style={styles.options}>
        {TOP_LANGUAGES.map((lang) => (
          <OnboardingOption
            key={lang.code}
            title={lang.label}
            flag={lang.flag}
            selected={selected === lang.code}
            onPress={() => setSelected(lang.code)}
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
