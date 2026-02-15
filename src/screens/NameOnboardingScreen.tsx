/**
 * NameOnboardingScreen
 * @description Шаг 3: ввод имени. Только UI, без сохранения.
 */
import React, { useState } from 'react';
import { View, StyleSheet, Platform, KeyboardAvoidingView, ScrollView } from 'react-native';
import { Button, Input, Text } from '@/components/common';
import { spacing, borderRadius } from '@/constants';
import { useThemeColors } from '@/store';


type Props = {
  onContinue?: (fullName?: string) => void;
  onSkip?: () => void;
  onBack?: () => void;
};

export function NameOnboardingScreen({ onContinue, onSkip, onBack }: Props) {
  const colors = useThemeColors();

  const [name, setName] = useState('');

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
          {/* Прогресс */}
          <View style={styles.progressBlock}>
            <View style={styles.progressHeader}>
              <Text variant="bodySmall" color="primary">
                Шаг 3 из 5
              </Text>
              <Text variant="bodySmall" color="secondary">
                60% завершено
              </Text>
            </View>
            <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressFill,
                  { backgroundColor: colors.primary, width: '60%' },
                ]}
              />
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.headlineBlock}>
              <Text variant="h1" style={[styles.headline, { color: colors.textPrimary }]}>
                Как к вам обращаться?
              </Text>
              <Text
                variant="body"
                color="secondary"
                style={styles.bodyText}
              >
                Персонализируйте опыт. Можно пропустить и изменить позже в настройках.
              </Text>
            </View>

            <Input
              label="Полное имя"
              placeholder="Введите имя"
              value={name}
              onChangeText={setName}
              containerStyle={styles.inputContainer}
              inputStyle={styles.input}
              autoFocus
              returnKeyType="done"
            />
          </ScrollView>

          {/* Действия */}
          <View style={styles.footer}>
            <Button
              title="Продолжить"
              onPress={() => onContinue?.(name)}
              fullWidth
            />
            <Button
              title="Пропустить пока"
              variant="ghost"
              onPress={onSkip}
              fullWidth
            />
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
  progressBlock: {
    paddingHorizontal: spacing.l,
    paddingTop: spacing.xl,
    paddingBottom: spacing.l,
    gap: spacing.s,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  content: {
    paddingHorizontal: spacing.l,
    paddingBottom: spacing.xl,
    paddingTop: spacing.l,
    gap: spacing.l,
  },
  headlineBlock: {
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
    paddingVertical: spacing.xl,
    gap: spacing.s,
  },
});
