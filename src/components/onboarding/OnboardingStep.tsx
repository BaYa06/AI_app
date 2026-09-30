/**
 * OnboardingStep — общий каркас шага регистрации (брендбук, разделы 4 и 7).
 *
 * Шапка (ScreenHeader) → прогресс шага → заголовок h1 и пояснение → контент в скролле →
 * закреплённый низ с кнопками. Экраны онбординга живут вне навигатора, поэтому
 * Screen (он читает навигацию) здесь не используется — safe area снизу считаем сами.
 */
import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/common/Text';
import { ProgressBar, ScreenHeader } from '@/components/ui';
import { useThemeColors } from '@/store';
import { screenPadding, spacing } from '@/constants';

export interface OnboardingStepProps {
  /** Есть — показываем шапку с кнопкой «назад». */
  onBack?: () => void;
  /** Заголовок шапки («Flashly»). */
  title?: string;
  /** Номер шага 1…ONBOARDING_STEPS — по нему считаются подпись «Шаг N из 6» и процент. */
  step: number;
  headline: string;
  description?: string;
  /** Выравнивание заголовка и пояснения. */
  align?: 'left' | 'center';
  /** Поднимать контент над клавиатурой (шаг с полем ввода). */
  keyboard?: boolean;
  children?: React.ReactNode;
  /** Закреплённый низ: главная кнопка, тихая кнопка, примечание. */
  footer?: React.ReactNode;
}

/**
 * Шагов у ученика и учителя одинаково: имя → роль → родной язык → изучаемые языки →
 * (ученик: цель → дневная норма | учитель: предмет → размер группы).
 */
export const ONBOARDING_STEPS = 6;

export function OnboardingStep({
  onBack,
  title,
  step,
  headline,
  description,
  align = 'left',
  keyboard = false,
  children,
  footer,
}: OnboardingStepProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const hasHeader = !!onBack || !!title;
  const progress = Math.round((step / ONBOARDING_STEPS) * 100);
  const progressLabel = `Шаг ${step} из ${ONBOARDING_STEPS}`;

  const body = (
    <>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.headlineBlock, align === 'center' && styles.centered]}>
          <Text
            variant="h1"
            accessibilityRole="header"
            align={align}
            style={{ color: colors.textPrimary }}
          >
            {headline}
          </Text>
          {description ? (
            <Text variant="body" align={align} style={{ color: colors.textSecondary }}>
              {description}
            </Text>
          ) : null}
        </View>
        {children}
      </ScrollView>

      {footer ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.l) }]}>{footer}</View>
      ) : null}
    </>
  );

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      {hasHeader ? <ScreenHeader title={title} onBack={onBack} /> : null}

      <View style={[styles.progressBlock, !hasHeader && styles.progressBlockTop]}>
        <View style={styles.progressHeader}>
          <Text variant="bodySmall" style={{ color: colors.primary }}>
            {progressLabel}
          </Text>
          <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
            {progress}%
          </Text>
        </View>
        <ProgressBar progress={progress} animated={false} accessibilityLabel={progressLabel} />
      </View>

      {keyboard ? (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  progressBlock: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.xs,
    gap: spacing.xs,
  },
  progressBlockTop: {
    paddingTop: spacing.xl,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.l,
  },
  headlineBlock: {
    gap: spacing.xs,
  },
  centered: {
    alignItems: 'center',
  },
  footer: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.m,
    gap: spacing.s,
  },
});
