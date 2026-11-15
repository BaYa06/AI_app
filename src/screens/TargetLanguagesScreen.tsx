/**
 * TargetLanguagesScreen
 * @description Изучаемые языки, 1–3 (plan/new/new_user_activation.md, Start 2.2–2.3).
 * Заранее ничего не выбрано; родной язык в списке есть, но неактивен. Первый выбранный —
 * «Основной», на нём будет стартовый набор. Внизу строка-проверка и «Поменять местами».
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Info } from 'lucide-react-native';
import { Text } from '@/components/common/Text';
import { Button, toast } from '@/components/ui';
import { CardPreview } from '@/components/onboarding/CardPreview';
import { LanguageBridge } from '@/components/onboarding/LanguageBridge';
import { OnboardingOption } from '@/components/onboarding/OnboardingOption';
import { OnboardingStep } from '@/components/onboarding/OnboardingStep';
import { useThemeColors } from '@/store';
import {
  borderRadius,
  iconSize,
  languageAccusative,
  languagePrepositional,
  MAX_TARGET_LANGUAGES,
  spacing,
  TOP_LANGUAGES,
} from '@/constants';
import { Analytics } from '@/services/analytics';

type Props = {
  /** Номер шага и сколько всего — считает AppRoot по роли и пути */
  step?: number;
  total?: number;
  nativeLanguage?: string;
  /** Уже выбранные (вернулись назад) */
  initial?: string[];
  onContinue?: (codes: string[]) => void;
  /** «Поменять местами»: родной становится изучаемым и наоборот */
  onSwap?: (newNative: string) => void;
  onBack?: () => void;
};

export function TargetLanguagesScreen({
  nativeLanguage = 'ru',
  initial,
  onContinue,
  onSwap,
  onBack,
  step = 4,
  total,
}: Props) {
  const colors = useThemeColors();
  const [selected, setSelected] = useState<string[]>(
    () => initial?.filter((c) => c !== nativeLanguage) ?? []
  );
  const main = selected[0];

  // Родной — в конце списка и неактивен: видно, куда он делся
  const options = useMemo(
    () => [
      ...TOP_LANGUAGES.filter((l) => l.code !== nativeLanguage),
      ...TOP_LANGUAGES.filter((l) => l.code === nativeLanguage),
    ],
    [nativeLanguage]
  );

  const toggle = (code: string) => {
    if (selected.includes(code)) {
      setSelected(selected.filter((c) => c !== code));
      return;
    }
    if (selected.length >= MAX_TARGET_LANGUAGES) {
      toast.info(
        'Можно выбрать до 3 языков. Сначала убери один из выбранных, чтобы добавить другой.'
      );
      return;
    }
    setSelected([...selected, code]);
  };

  const swap = () => {
    if (!main) return;
    Analytics.onboardingLanguagesSwapped();
    onSwap?.(main);
    setSelected([nativeLanguage]);
  };

  return (
    <OnboardingStep
      onBack={onBack}
      title="Flashly"
      step={step}
      total={total}
      top={<LanguageBridge native={nativeLanguage} target={main} active="target" />}
      headline="Какой язык хочешь выучить?"
      description="Слова в карточках будут на этом языке. Можно выбрать до 3, первый станет основным."
      footer={
        <>
          {main ? (
            <View style={[styles.check, { backgroundColor: colors.surfaceVariant }]}>
              <Info size={iconSize.s} color={colors.primary} />
              <View style={styles.flex}>
                <Text variant="bodySmall" style={{ color: colors.textPrimary }}>
                  Ты говоришь на{' '}
                  <Text variant="bodySmall" style={styles.bold}>
                    {languagePrepositional(nativeLanguage)}
                  </Text>{' '}
                  и учишь{' '}
                  <Text variant="bodySmall" style={styles.bold}>
                    {languageAccusative(main)}
                  </Text>
                  {selected.length > 1 ? ` (и ещё ${selected.length - 1})` : ''}.
                </Text>
                {selected.length === 1 && onSwap ? (
                  <Button
                    title="Перепутал? Поменять местами"
                    variant="quiet"
                    size="s"
                    onPress={swap}
                    style={styles.swap}
                  />
                ) : null}
              </View>
            </View>
          ) : null}
          <Button
            title={main ? `Учить ${languageAccusative(main)}` : 'Выбери язык'}
            onPress={() => onContinue?.(selected)}
            disabled={!main}
            fullWidth
          />
        </>
      }
    >
      <CardPreview native={nativeLanguage} target={main} />
      <View style={styles.options}>
        {options.map((lang) => {
          if (lang.code === nativeLanguage) {
            return (
              <OnboardingOption
                key={lang.code}
                title={lang.label}
                description="На нём ты уже говоришь"
                flag={lang.flag}
                badge={{ text: 'Твой родной', tone: 'native' }}
                disabled
                selected={false}
                onPress={() => {}}
              />
            );
          }
          return (
            <OnboardingOption
              key={lang.code}
              title={lang.label}
              flag={lang.flag}
              mode="multiple"
              badge={main === lang.code ? { text: 'Основной', tone: 'primary' } : undefined}
              selected={selected.includes(lang.code)}
              onPress={() => toggle(lang.code)}
            />
          );
        })}
      </View>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  options: {
    gap: spacing.m,
  },
  check: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s,
    borderRadius: borderRadius.m,
    padding: spacing.s,
  },
  flex: {
    flex: 1,
  },
  bold: {
    fontWeight: '700',
  },
  swap: {
    alignSelf: 'flex-start',
    marginLeft: -spacing.s,
  },
});
