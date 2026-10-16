/**
 * AboutMeOnboardingScreen — «Ещё два вопроса» после основных шагов онбординга ученика
 * (plan/new/push_notifications.md, шаг 2.7). Необязательный: без счётчика шагов, с «Пропустить».
 * Ответы — только для времени напоминаний; их можно изменить или стереть в «Профиль → Мои данные».
 */
import React, { useState } from 'react';
import { Text } from '@/components/common';
import { Button } from '@/components/ui';
import { OnboardingStep } from '@/components/onboarding/OnboardingStep';
import { AboutMeForm, DEFAULT_CLASS_HOUR, type AboutMeValue } from '@/components/push/AboutMeForm';
import { useThemeColors } from '@/store';

export interface AboutMeAnswers {
  ageRange?: AboutMeValue['ageRange'];
  classDays?: string[];
  classHour?: number;
}

type Props = {
  onBack?: () => void;
  onContinue: (answers: AboutMeAnswers) => void;
};

export function AboutMeOnboardingScreen({ onBack, onContinue }: Props) {
  const colors = useThemeColors();
  const [value, setValue] = useState<AboutMeValue>({
    ageRange: null,
    attendsClasses: null,
    classDays: [],
    classHour: DEFAULT_CLASS_HOUR,
  });

  const handleContinue = () => {
    const classes = value.attendsClasses === true && value.classDays.length > 0;
    onContinue({
      ageRange: value.ageRange ?? undefined,
      classDays: classes ? value.classDays : undefined,
      classHour: classes ? value.classHour : undefined,
    });
  };

  return (
    <OnboardingStep
      onBack={onBack}
      title="Flashly"
      headline="Ещё два вопроса"
      description="Чтобы напоминания приходили вовремя. Можно пропустить."
      footer={
        <>
          <Button title="Готово" onPress={handleContinue} fullWidth />
          <Button title="Пропустить" variant="quiet" tone="secondary" onPress={() => onContinue({})} fullWidth />
          <Text variant="caption" align="center" style={{ color: colors.textTertiary }}>
            Изменить или стереть ответы можно в «Профиль → Мои данные»
          </Text>
        </>
      }
    >
      <AboutMeForm value={value} onChange={setValue} />
    </OnboardingStep>
  );
}
