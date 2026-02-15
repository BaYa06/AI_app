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
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Button, Text } from '@/components/common';
import { spacing, borderRadius } from '@/constants';
import { useThemeColors } from '@/store';


type Props = {
  onBack?: () => void;
  onSubmit?: (code: string) => void;
};

export function OTPVerifyScreen({ onBack, onSubmit }: Props) {
  const colors = useThemeColors();

  const codeLength = 5;
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
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
          paddingTop: 0,
          paddingBottom: 0,
        },
      ]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, width: '100%' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            styles.shell,
            {
              backgroundColor: colors.background,
              shadowColor: colors.shadow,
              borderColor: colors.border,
            },
          ]}
        >
          {/* Статус / хедер */}
          <View style={styles.statusBarSpace} />

          {/* Навигация */}
          <View style={styles.navBar}>
            <Button
              title=""
              variant="ghost"
              onPress={onBack}
              style={styles.backButton}
              leftIcon={<Ionicons name="chevron-back" size={22} color={colors.textPrimary} />}
            />
          </View>

          <ScrollView
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* Прогресс */}
            <View style={styles.progressBlock}>
              <View style={styles.progressHeader}>
                <Text variant="bodySmall" color="primary">
                  Шаг 2 из 5
                </Text>
                <Text variant="bodySmall" color="secondary">
                  2/5
                </Text>
              </View>
              <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.progressFill,
                    { backgroundColor: colors.primary, width: '40%' },
                  ]}
                />
              </View>
            </View>

            {/* Текст */}
            <View style={styles.headlineBlock}>
              <Text variant="h1" style={[styles.headline, { color: colors.textPrimary }]}>
                Проверьте почту
              </Text>
              <Text
                variant="body"
                color="secondary"
                align="center"
                style={styles.bodyText}
              >
                Мы отправили 5-значный код подтверждения. Введите его ниже, чтобы продолжить.
              </Text>
            </View>

            {/* Код */}
            <View style={styles.codeRow}>
              {code.map((digit, idx) => (
                <TextInput
                  key={idx}
                  ref={(el) => (inputsRef.current[idx] = el)}
                  style={[
                    styles.codeInput,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      color: colors.textPrimary,
                    },
                  ]}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  maxLength={1}
                  value={digit}
                  onChangeText={(v) => handleChange(v, idx)}
                  onKeyPress={(e) => handleKeyPress(e, idx)}
                  returnKeyType="next"
                  autoFocus={idx === 0}
                />
              ))}
            </View>

            <View style={styles.meta}>
              <Text variant="bodySmall" color="tertiary" align="center">
                Не пришёл код?
              </Text>
              <Text variant="bodySmall" color="primary" align="center" style={styles.resend}>
                Отправить повторно через 30 секунд
              </Text>
            </View>
          </ScrollView>

          {/* Действие */}
          <View style={styles.footer}>
            <Button
              title="Войти"
              onPress={handleSubmit}
              fullWidth
              leftIcon={<Ionicons name="log-in-outline" size={20} color={colors.textInverse} />}
            />
            <View style={[styles.homeIndicator, { backgroundColor: colors.border }]} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 0,
  },
  shell: {
    flex: 1,
    width: '100%',
    maxWidth: '100%',
    borderRadius: 0,
    borderWidth: 0,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  statusBarSpace: {
    height: 22,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s,
    paddingBottom: spacing.xs,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignSelf: 'flex-start',
  },
  contentContainer: {
    paddingHorizontal: spacing.l,
    paddingBottom: spacing.l,
  },
  progressBlock: {
    marginBottom: spacing.l,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.s,
  },
  progressBar: {
    height: 8,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  headlineBlock: {
    paddingTop: spacing.m,
    paddingBottom: spacing.l,
    gap: spacing.s,
    alignItems: 'center',
  },
  headline: {
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  bodyText: {
    lineHeight: 22,
    textAlign: 'center',
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
    borderRadius: borderRadius.l,
    borderWidth: 2,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
  },
  meta: {
    marginTop: spacing.l,
    gap: 4,
    alignItems: 'center',
  },
  resend: {
    marginTop: 2,
  },
  footer: {
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.l,
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
