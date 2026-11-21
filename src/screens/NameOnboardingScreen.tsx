/**
 * NameOnboardingScreen
 * @description Шаг 1: ввод имени. Только UI, без сохранения.
 */
import React, { useState } from 'react';
import { Button, TextField } from '@/components/ui';
import { OnboardingStep } from '@/components/onboarding/OnboardingStep';

type Props = {
  /** Номер шага и сколько всего — считает AppRoot по роли и пути */
  step?: number;
  total?: number;
  onContinue?: (fullName?: string) => void;
  onSkip?: () => void;
  onBack?: () => void;
};

export function NameOnboardingScreen({ onContinue, onSkip, onBack, step = 1, total }: Props) {
  const [name, setName] = useState('');

  return (
    <OnboardingStep
      onBack={onBack}
      title={onBack ? 'Flashly' : undefined}
      step={step}
      total={total}
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
