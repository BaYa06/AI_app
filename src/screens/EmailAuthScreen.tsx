/**
 * EmailAuthScreen
 * @description Шаг 1: ввод email для получения кода. Визуал похож на переданный макет, текст переведён на русский.
 */
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Button, Input, Text } from '@/components/common';
import { spacing, borderRadius } from '@/constants';
import { useThemeColors } from '@/store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  onBack?: () => void;
  onRequestCode?: (email?: string, password?: string) => void;
};

export function EmailAuthScreen({ onBack, onRequestCode }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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
              backgroundColor: colors.surface,
              shadowColor: colors.shadow,
              borderColor: colors.border,
            },
          ]}
        >
          {/* Статусная строка / хедер */}
          <View style={styles.statusBarSpace} />

          {/* Навигационная панель */}
          <View style={styles.navBar}>
            <Button
              title=""
              variant="ghost"
              onPress={onBack}
              style={styles.backButton}
              leftIcon={<Ionicons name="chevron-back" size={22} color={colors.textPrimary} />}
            />
          </View>

          {/* Контент */}
          <ScrollView
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* Прогресс */}
            <View style={styles.progressBlock}>
              <View style={styles.progressHeader}>
                <Text variant="bodySmall" color="primary">
                  Шаг 1 из 5
                </Text>
                <Text variant="bodySmall" color="secondary">
                  20%
                </Text>
              </View>
              <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.progressFill,
                    { backgroundColor: colors.primary, width: '20%' },
                  ]}
                />
              </View>
            </View>

            {/* Заголовок */}
            <View style={styles.headlineBlock}>
              <Text variant="h1" style={[styles.headline, { color: colors.textPrimary }]}>
                Добро пожаловать в Flashly
              </Text>
              <Text
                variant="body"
                color="secondary"
                style={styles.bodyText}
              >
                Мы отправим на вашу почту 6-значный код, чтобы вы могли начать.
              </Text>
            </View>

            {/* Поле ввода */}
            <Input
              label="Электронная почта"
              placeholder="name@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
              containerStyle={styles.inputContainer}
              inputStyle={styles.input}
            />
            <Input
              label="Пароль"
              placeholder="Введите пароль"
              secureTextEntry
              autoCapitalize="none"
              textContentType="password"
              value={password}
              onChangeText={setPassword}
              containerStyle={styles.inputContainer}
              inputStyle={styles.input}
            />
          </ScrollView>

          {/* Кнопка + футер */}
          <View style={styles.footer}>
            <Button
              title="Получить код"
              onPress={() => onRequestCode?.(email, password)}
              fullWidth
            />
            <Button
              title="Через Google"
              variant="outline"
              onPress={() => {}}
              fullWidth
              leftIcon={<Ionicons name="logo-google" size={18} color={colors.primary} />}
            />
            <Text
              variant="caption"
              color="tertiary"
              align="center"
              style={styles.footerText}
            >
              Продолжая, вы соглашаетесь с Условиями использования и Политикой конфиденциальности Flashly.
            </Text>
          </View>

          {/* Home indicator */}
          <View style={[styles.homeIndicator, { backgroundColor: colors.border }]} />
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
    paddingBottom: spacing.m,
    gap: spacing.s,
  },
  headline: {
    letterSpacing: -0.4,
  },
  bodyText: {
    lineHeight: 22,
  },
  inputContainer: {
    marginTop: spacing.s,
  },
  input: {
    height: 56,
  },
  footer: {
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.l,
    gap: spacing.s,
  },
  footerText: {
    lineHeight: 16,
  },
  homeIndicator: {
    alignSelf: 'center',
    width: 120,
    height: 6,
    borderRadius: borderRadius.full,
    opacity: 0.6,
    marginBottom: spacing.s,
  },
});
