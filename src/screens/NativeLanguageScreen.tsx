/**
 * NativeLanguageScreen
 * @description Родной язык (plan/new/new_user_activation.md, Start 2.2): вопрос без слова
 * «родной», мост «Я говорю на → Хочу выучить», пример карточки, язык телефона выбран заранее.
 */
import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui';
import { CardPreview } from '@/components/onboarding/CardPreview';
import { useFlagFlight } from '@/components/onboarding/FlagFlight';
import { LanguageBridge } from '@/components/onboarding/LanguageBridge';
import { OnboardingOption } from '@/components/onboarding/OnboardingOption';
import { OnboardingStep } from '@/components/onboarding/OnboardingStep';
import { languagePrepositional, spacing, TOP_LANGUAGES } from '@/constants';
import { getDeviceLanguage } from '@/utils/deviceLanguage';

type Props = {
  /** Номер шага и сколько всего — считает AppRoot по роли и пути */
  step?: number;
  total?: number;
  /** Уже выбранный родной (вернулись назад) */
  initial?: string;
  onContinue?: (code: string) => void;
  onBack?: () => void;
};

const deviceLanguage = getDeviceLanguage();
const DEVICE_CODE = TOP_LANGUAGES.some((l) => l.code === deviceLanguage) ? deviceLanguage : 'ru';

export function NativeLanguageScreen({ onContinue, onBack, step = 3, total, initial }: Props) {
  const [selected, setSelected] = useState<string>(initial ?? DEVICE_CODE ?? 'ru');
  // Место моста меняется, когда флаг долетит (Start 2.4)
  const [bridgeNative, setBridgeNative] = useState(selected);
  const tiles = useRef<Record<string, View | null>>({});
  const slotRef = useRef<View>(null);
  const { fly, layer } = useFlagFlight();

  const choose = (code: string, flag: string) => {
    if (code === selected) return;
    setSelected(code);
    fly(tiles.current[code], slotRef.current, flag, () => setBridgeNative(code));
  };

  return (
    <OnboardingStep
      onBack={onBack}
      title="Flashly"
      step={step}
      total={total}
      top={<LanguageBridge native={bridgeNative} active="native" nativeFlagRef={slotRef} />}
      overlay={layer}
      headline="На каком языке ты говоришь?"
      description="Это твой родной язык. На нём будут переводы слов."
      footer={
        <Button
          title={`Я говорю на ${languagePrepositional(selected)}`}
          onPress={() => onContinue?.(selected)}
          fullWidth
        />
      }
    >
      <CardPreview native={selected} />
      <View accessibilityRole="radiogroup" style={styles.options}>
        {TOP_LANGUAGES.map((lang) => (
          <OnboardingOption
            key={lang.code}
            title={lang.label}
            flag={lang.flag}
            tone="native"
            badge={
              lang.code === deviceLanguage ? { text: 'язык телефона', tone: 'neutral' } : undefined
            }
            tileRef={(v) => {
              tiles.current[lang.code] = v;
            }}
            selected={selected === lang.code}
            onPress={() => choose(lang.code, lang.flag)}
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
