/**
 * OTPVerifyScreen
 * @description Шаг 2: ввод 6-значного кода из email. Только UI, без отправки на бэкенд.
 */
import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  TextInput,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogIn } from 'lucide-react-native';
import { Text } from '@/components/common';
import { Button, ProgressBar, ScreenHeader } from '@/components/ui';
import { spacing, borderRadius, screenPadding, typography } from '@/constants';
import { useThemeColors } from '@/store';


type Props = {
  onBack?: () => void;
  onSubmit?: (code: string) => void;
};

export function OTPVerifyScreen({ onBack, onSubmit }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const codeLength = 5;
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [code, setCode] = useState<string[]>(Array(codeLength).fill(''));

  const inputsRef = useRef<Array<TextInput | null>>([]);

  const codeValue = useMemo(() => code.join(''), [code]);

  const handleChange = (value: string, idx: number) => {
    // берём только последнюю цифру
    const digit = value.replace(/\D/g, '').slice(-1);
    setCode((prev) => {
      const next = [...prev];
      next[idx] = digit;
      return next;
    });

    if (digit && idx < codeLength - 1) {
      inputsRef.current[idx + 1]?.focus();
    }
  };

  const handleKeyPress = (
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
    idx: number
  ) => {
    if (e.nativeEvent.key === 'Backspace' && !code[idx] && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    }
  };

  const handleSubmit = () => {
    onSubmit?.(codeValue);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Навигация */}
        <ScreenHeader onBack={onBack} />

        <ScrollView contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
          {/* Прогресс */}
          <View style={styles.progressBlock}>
            <View style={styles.progressHeader}>
              <Text variant="bodySmall" style={{ color: colors.primary }}>
                Шаг 2 из 5
              </Text>
              <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                2/5
              </Text>
            </View>
            <ProgressBar progress={40} animated={false} accessibilityLabel="Шаг 2 из 5" />
          </View>

          {/* Текст */}
          <View style={styles.headlineBlock}>
            <Text variant="h1" align="center" accessibilityRole="header" style={{ color: colors.textPrimary }}>
              Проверь почту
            </Text>
            <Text variant="body" align="center" style={[styles.bodyText, { color: colors.textSecondary }]}>
              Мы отправили 5-значный код подтверждения. Введи его ниже, чтобы продолжить.
            </Text>
          </View>

          {/* Код */}
          <View style={styles.codeRow}>
            {code.map((digit, idx) => (
              <TextInput
                key={idx}
                ref={(el) => {
                  inputsRef.current[idx] = el;
                }}
                style={[
                  styles.codeInput,
                  {
                    backgroundColor: colors.surface,
                    borderColor: focusedIndex === idx || digit ? colors.primary : colors.border,
                    borderWidth: focusedIndex === idx ? 2 : 1,
                    color: colors.textPrimary,
                  },
                ]}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                maxLength={1}
                value={digit}
                onChangeText={(v) => handleChange(v, idx)}
                onKeyPress={(e) => handleKeyPress(e, idx)}
                onFocus={() => setFocusedIndex(idx)}
                onBlur={() => setFocusedIndex((cur) => (cur === idx ? null : cur))}
                returnKeyType="next"
                autoFocus={idx === 0}
                accessibilityLabel={`Цифра ${idx + 1} из ${codeLength}`}
              />
            ))}
          </View>

          <View style={styles.meta}>
            <Text variant="bodySmall" align="center" style={{ color: colors.textTertiary }}>
              Не пришёл код?
            </Text>
            <Text variant="bodySmall" align="center" style={{ color: colors.primary }}>
              Отправить повторно через 30 секунд
            </Text>
          </View>
        </ScrollView>

        {/* Действие */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.l) }]}>
          <Button title="Войти" icon={LogIn} onPress={handleSubmit} fullWidth />
          <View style={[styles.homeIndicator, { backgroundColor: colors.border }]} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.l,
  },
  progressBlock: {
    marginBottom: spacing.l,
    gap: spacing.xs,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headlineBlock: {
    paddingTop: spacing.m,
    paddingBottom: spacing.l,
    gap: spacing.s,
    alignItems: 'center',
  },
  bodyText: {
    paddingHorizontal: spacing.m,
  },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.s,
    paddingHorizontal: spacing.s,
  },
  codeInput: {
    width: 48,
    height: 56,
    borderRadius: borderRadius.m,
    ...typography.h2,
    lineHeight: undefined,
    textAlign: 'center',
  },
  meta: {
    marginTop: spacing.l,
    gap: spacing.xxs,
    alignItems: 'center',
  },
  footer: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.l,
    gap: spacing.s,
  },
  homeIndicator: {
    alignSelf: 'center',
    width: 120,
    height: 6,
    borderRadius: borderRadius.full,
    opacity: 0.6,
    marginTop: spacing.m,
  },
});
