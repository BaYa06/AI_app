/**
 * NameOnboardingScreen
 * @description Шаг 1: ввод имени. Только UI, без сохранения.
 */
import React, { useState } from 'react';
import { Button, TextField } from '@/components/ui';
import { OnboardingStep } from '@/components/onboarding/OnboardingStep';

type Props = {
  onContinue?: (fullName?: string) => void;
  onSkip?: () => void;
  onBack?: () => void;
};

export function NameOnboardingScreen({ onContinue, onSkip }: Props) {
  const [name, setName] = useState('');

  return (
    <OnboardingStep
      progressLabel="Шаг 1 из 6"
      progressValue="17% завершено"
      progress={17}
      headline="Как к тебе обращаться?"
      description="Персонализируй опыт. Можно пропустить и изменить позже в настройках."
      keyboard
      footer={
        <>
          <Button title="Продолжить" onPress={() => onContinue?.(name)} fullWidth />
          <Button title="Пропустить пока" variant="quiet" onPress={onSkip} fullWidth />
        </>
      }
    >
      <TextField
        label="Полное имя"
        placeholder="Введи имя"
        value={name}
        onChangeText={setName}
        autoFocus
        returnKeyType="done"
      />
    </OnboardingStep>
  );
}
