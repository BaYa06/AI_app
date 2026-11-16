/**
 * «Введи код от учителя» на онбординге (plan/new/new_user_activation.md, Start 7.1): ученик с кодом
 * не проходит весь онбординг — код → «Курс найден» → имя → главная курса.
 */
import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Info } from 'lucide-react-native';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui';
import { OnboardingStep } from '@/components/onboarding/OnboardingStep';
import { useThemeColors } from '@/store';
import { borderRadius, iconSize, spacing, typography } from '@/constants';
import { NeonService } from '@/services/NeonService';
import type { CourseInviteInfo } from '@/services/neon/courses';
import { describeTeacherApiReason } from '@/utils/teacherApiErrors';

const CODE_LENGTH = 6;

type Props = {
  onFound: (code: string, info: CourseInviteInfo) => void;
  onBack: () => void;
};

export function TeacherCodeScreen({ onFound, onBack }: Props) {
  const colors = useThemeColors();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  const find = async () => {
    if (code.length < CODE_LENGTH || looking) return;
    setLooking(true);
    setError(null);
    try {
      const result = await NeonService.getCourseInviteInfoByCode(code);
      if (result.ok) onFound(code, result);
      else setError(describeTeacherApiReason(result.reason));
    } catch {
      setError(describeTeacherApiReason('network'));
    } finally {
      setLooking(false);
    }
  };

  return (
    <OnboardingStep
      onBack={onBack}
      title="Flashly"
      step={1}
      total={2}
      headline="Введи код от учителя"
      description="6 символов. Учитель видит код в своём курсе."
      keyboard
      footer={
        <Button
          title="Найти курс"
          loading={looking}
          disabled={code.length < CODE_LENGTH}
          onPress={find}
          fullWidth
        />
      }
    >
      <TextInput
        value={code}
        onChangeText={(t) => {
          setError(null);
          setCode(
            t
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, '')
              .slice(0, CODE_LENGTH)
          );
        }}
        placeholder="K7M2QX"
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
        maxLength={CODE_LENGTH}
        returnKeyType="search"
        onSubmitEditing={find}
        accessibilityLabel="Код от учителя"
        style={[
          styles.input,
          typography.h1,
          {
            color: colors.textPrimary,
            borderColor: error ? colors.error : colors.border,
            backgroundColor: colors.surface,
          },
        ]}
      />
      {error ? (
        <Text variant="bodySmall" accessibilityRole="alert" style={{ color: colors.errorText }}>
          {error}
        </Text>
      ) : null}
      <View style={[styles.note, { backgroundColor: colors.surfaceVariant }]}>
        <Info size={iconSize.s} color={colors.primary} />
        <Text variant="bodySmall" style={[styles.flex, { color: colors.textSecondary }]}>
          Есть ссылка от учителя? Просто открой её — код вводить не нужно.
        </Text>
      </View>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 2,
    borderRadius: borderRadius.l,
    height: 72,
    textAlign: 'center',
    letterSpacing: 8,
  },
  note: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'flex-start',
    borderRadius: borderRadius.m,
    padding: spacing.s,
  },
  flex: { flex: 1 },
});
