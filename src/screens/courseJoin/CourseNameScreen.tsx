/**
 * Имя ученика курса (plan/new/new_user_activation.md, Start 7.4): обязательно, без «Пропустить» —
 * учитель видит его в списке класса. Имя из Sign in with Apple подставляется.
 */
import React, { useState } from 'react';
import { Button, TextField } from '@/components/ui';
import { OnboardingStep } from '@/components/onboarding/OnboardingStep';

type Props = {
  initial?: string;
  onContinue: (name: string) => void;
};

export function CourseNameScreen({ initial = '', onContinue }: Props) {
  const [name, setName] = useState(initial);
  const trimmed = name.trim();
  return (
    <OnboardingStep
      step={2}
      total={2}
      headline="Как тебя зовут?"
      description="Учитель увидит это имя в списке класса."
      keyboard
      footer={
        <Button title="Готово" disabled={!trimmed} onPress={() => onContinue(trimmed)} fullWidth />
      }
    >
      <TextField
        label="Имя и фамилия"
        placeholder="Например, Анна Ким"
        value={name}
        onChangeText={setName}
        autoFocus={!initial}
        returnKeyType="done"
        onSubmitEditing={() => trimmed && onContinue(trimmed)}
      />
    </OnboardingStep>
  );
}
