/**
 * TargetLanguagesScreen
 * @description Шаг 4: выбор изучаемых языков (1-3). Только UI, без сохранения.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, toast } from '@/components/ui';
import { OnboardingOption } from '@/components/onboarding/OnboardingOption';
import { OnboardingStep } from '@/components/onboarding/OnboardingStep';
import { spacing, TOP_LANGUAGES, MAX_TARGET_LANGUAGES } from '@/constants';

type Props = {
  nativeLanguage?: string;
  onContinue?: (codes: string[]) => void;
  onBack?: () => void;
};

export function TargetLanguagesScreen({ nativeLanguage, onContinue, onBack }: Props) {
  const [selected, setSelected] = useState<string[]>(['en']);

  // Изучать свой же родной язык бессмысленно — убираем его из списка выбора.
  const options = useMemo(
    () => TOP_LANGUAGES.filter((l) => l.code !== nativeLanguage),
    [nativeLanguage]
  );

  const toggle = (code: string) => {
    if (selected.includes(code)) {
      setSelected(selected.filter((c) => c !== code));
      return;
    }
    if (selected.length >= MAX_TARGET_LANGUAGES) {
      toast.info('Можно выбрать до 3 языков. Сначала убери один из выбранных, чтобы добавить другой.');
      return;
    }
    setSelected([...selected, code]);
  };

  return (
    <OnboardingStep
      onBack={onBack}
      title="Flashly"
      progressLabel="Шаг 4 из 6"
      progressValue="67%"
      progress={67}
      headline="Какие языки хочешь учить?"
      description="Выбери от 1 до 3 языков — можно изменить позже в настройках."
      footer={
        <Button
          title="Продолжить"
          onPress={() => onContinue?.(selected)}
          disabled={selected.length === 0}
          fullWidth
        />
      }
    >
      <View style={styles.options}>
        {options.map((lang) => (
          <OnboardingOption
            key={lang.code}
            title={lang.label}
            flag={lang.flag}
            mode="multiple"
            selected={selected.includes(lang.code)}
            onPress={() => toggle(lang.code)}
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
