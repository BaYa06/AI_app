/**
 * SignInScreen
 * @description Экран входа по email с отправкой кода. UI only.
 */
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Pressable,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Button, Input, Text } from '@/components/common';
import { spacing, borderRadius } from '@/constants';
import { useThemeColors } from '@/store';

type Props = {
  onBack?: () => void;
  onSendCode?: (email?: string) => void;
  onCreateAccount?: () => void;
};

export function SignInScreen({ onBack, onSendCode, onCreateAccount }: Props) {
  const colors = useThemeColors();
  const [email, setEmail] = useState('');

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1, width: '100%' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            styles.shell,
            { backgroundColor: colors.surface, shadowColor: colors.shadow, borderColor: colors.border },
          ]}
        >
          {/* Top app bar */}
          <View style={styles.topBar}>
            <Pressable onPress={onBack} hitSlop={12} style={styles.backHit}>
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            </Pressable>
            <View style={styles.backHit} />
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.headerText}>
              <Text variant="h1" align="center" style={{ color: colors.textPrimary }}>
                С возвращением
              </Text>
              <Text
                variant="body"
                color="secondary"
                align="center"
                style={styles.subheader}
              >
                Войдите, чтобы продолжить обучение в Flashly
              </Text>
            </View>

            <Input
              label="Email"
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
              containerStyle={styles.inputContainer}
              inputStyle={styles.input}
            />

            <View style={styles.ctaBlock}>
              <Button
                title="Отправить код"
                onPress={() => onSendCode?.(email)}
                fullWidth
              />
              <Button
                title="Войти через Google"
                variant="outline"
                onPress={() => {}}
                fullWidth
                leftIcon={<Ionicons name="logo-google" size={18} color={colors.primary} />}
              />
              <Text variant="caption" color="tertiary" align="center" style={styles.hint}>
                Мы отправим 5-значный код на ваш email
              </Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.footerRow}>
              <Text variant="bodySmall" color="tertiary">
                Нет аккаунта?
              </Text>
              <Pressable onPress={onCreateAccount} hitSlop={8}>
                <Text variant="bodySmall" style={{ color: colors.primary, fontWeight: '700' }}>
                  Создать
                </Text>
              </Pressable>
            </View>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    paddingTop: spacing.m,
    paddingBottom: spacing.s,
  },
  backHit: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.l,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.l,
  },
  headerText: {
    gap: spacing.s,
  },
  subheader: {
    paddingHorizontal: spacing.s,
  },
  inputContainer: {
    marginTop: spacing.s,
  },
  input: {
    height: 56,
  },
  ctaBlock: {
    gap: spacing.s,
  },
  hint: {
    lineHeight: 16,
  },
  footer: {
    paddingHorizontal: spacing.l,
    paddingBottom: spacing.xl,
    paddingTop: spacing.s,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    justifyContent: 'center',
  },
});
