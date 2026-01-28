/**
 * LearningGoalScreen
 * @description Шаг 4: выбор цели обучения. Только UI, без сохранения.
 */
import React, { useState } from 'react';
import { View, StyleSheet, Platform, ScrollView, Pressable } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Button, Text } from '@/components/common';
import { spacing, borderRadius } from '@/constants';
import { useThemeColors } from '@/store';

type GoalOption = {
  id: string;
  title: string;
  description: string;
  icon: string;
};

type Props = {
  onContinue?: (goalId: string) => void;
  onBack?: () => void;
};

const OPTIONS: GoalOption[] = [
  { id: 'studies', title: 'Для учебы', description: 'Подготовка к экзаменам и зачетам', icon: 'school' },
  { id: 'courses', title: 'Для курсов', description: 'Освоить конкретный предмет', icon: 'book' },
  { id: 'travel', title: 'Для путешествий', description: 'Выучить базовые фразы и слова', icon: 'airplane' },
  { id: 'self', title: 'Для себя', description: 'Личное развитие и новые хобби', icon: 'leaf' },
];

export function LearningGoalScreen({ onContinue, onBack }: Props) {
  const colors = useThemeColors();
  const [selected, setSelected] = useState<string>('studies');

  const renderOption = (option: GoalOption) => {
    const active = selected === option.id;
    return (
      <Pressable
        key={option.id}
        onPress={() => setSelected(option.id)}
        style={[
          styles.option,
          {
            borderColor: active ? colors.primary : colors.border,
            backgroundColor: active ? `${colors.primary}0D` : colors.surface,
          },
        ]}
      >
        <View
          style={[
            styles.optionIcon,
            { backgroundColor: active ? colors.primary : `${colors.surface}99` },
          ]}
        >
          <Ionicons
            name={option.icon as any}
            size={26}
            color={active ? colors.textInverse : colors.primary}
          />
        </View>
        <View style={styles.optionText}>
          <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>
            {option.title}
          </Text>
          <Text variant="bodySmall" color="secondary">
            {option.description}
          </Text>
        </View>
        <View
          style={[
            styles.optionRadio,
            {
              borderColor: active ? colors.primary : colors.border,
              backgroundColor: active ? colors.primary : 'transparent',
            },
          ]}
        >
          {active && <Ionicons name="checkmark" size={14} color={colors.textInverse} />}
        </View>
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
        },
      ]}
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
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable onPress={onBack} hitSlop={12} style={styles.backHit}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text variant="h3" align="center" style={{ flex: 1, color: colors.textPrimary }}>
            Flashly
          </Text>
          <View style={styles.backHit} />
        </View>

        {/* Progress */}
        <View style={styles.progressBlock}>
          <View style={styles.progressHeader}>
            <Text variant="bodySmall" color="primary">
              Шаг 4 из 5
            </Text>
            <Text variant="bodySmall" color="secondary">
              80%
            </Text>
          </View>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: colors.primary, width: '80%' },
              ]}
            />
          </View>
        </View>

        {/* Content */}
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.headlineBlock}>
            <Text variant="h1" style={[styles.headline, { color: colors.textPrimary }]}>
              Зачем вы учите?
            </Text>
            <Text variant="body" color="secondary" style={styles.bodyText}>
              Мы персонализируем карточки под ваши цели.
            </Text>
          </View>

          <View style={styles.options}>{OPTIONS.map(renderOption)}</View>
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <Button
            title="Продолжить"
            onPress={() => onContinue?.(selected)}
            fullWidth
          />
          <Text
            variant="caption"
            color="tertiary"
            align="center"
            style={styles.footerNote}
          >
            Цель можно поменять в настройках в любой момент
          </Text>
        </View>
      </View>
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
  progressBlock: {
    paddingHorizontal: spacing.l,
    paddingTop: spacing.s,
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
  options: {
    gap: spacing.m,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    borderWidth: 2,
    borderRadius: borderRadius.l,
    padding: spacing.m,
  },
  optionIcon: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  optionRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.xl,
    gap: spacing.s,
  },
  footerNote: {
    lineHeight: 16,
  },
});
