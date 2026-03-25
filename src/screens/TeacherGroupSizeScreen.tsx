/**
 * TeacherGroupSizeScreen
 * @description Шаг 4 (учитель): выбор размера группы учеников.
 */
import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Button, Text } from '@/components/common';
import { spacing, borderRadius } from '@/constants';
import { useThemeColors } from '@/store';

type SizeOption = {
  id: string;
  label: string;
  icon: string;
  vibe: string;
};

type Props = {
  onContinue?: (sizeId: string) => void;
  onBack?: () => void;
};

const OPTIONS: SizeOption[] = [
  { id: '1-10', label: '1–10 учеников', icon: 'person-outline', vibe: 'Индивидуально' },
  { id: '11-30', label: '11–30 учеников', icon: 'people-outline', vibe: 'Небольшая группа' },
  { id: '30+', label: '30+ учеников', icon: 'people', vibe: 'Большая группа' },
  { id: 'unknown', label: 'Пока не знаю', icon: 'help-circle-outline', vibe: 'Определюсь позже' },
];

export function TeacherGroupSizeScreen({ onContinue, onBack }: Props) {
  const colors = useThemeColors();
  const [selected, setSelected] = useState<string>('1-10');

  const renderOption = (opt: SizeOption) => {
    const active = selected === opt.id;
    return (
      <Pressable
        key={opt.id}
        onPress={() => setSelected(opt.id)}
        style={[
          styles.option,
          {
            borderColor: active ? colors.primary : colors.border,
            backgroundColor: active ? `${colors.primary}0D` : colors.surface,
            flexDirection: 'row-reverse',
          },
        ]}
      >
        <View style={styles.radioContainer}>
          <View
            style={[
              styles.radioOuter,
              { borderColor: active ? colors.primary : colors.border },
            ]}
          >
            {active && <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />}
          </View>
        </View>
        <View style={styles.optionText}>
          <Text variant="bodyLarge" style={{ color: colors.textPrimary, fontWeight: '700' }}>
            {opt.label}
          </Text>
          <View style={styles.vibeRow}>
            <Ionicons name={opt.icon as any} size={16} color={colors.primary} />
            <Text variant="bodySmall" color="secondary">
              {opt.vibe}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
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
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable onPress={onBack} hitSlop={12} style={styles.backHit}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text variant="h3" align="center" style={{ flex: 1, color: colors.textPrimary }}>
            Шаг 4 из 4
          </Text>
          <View style={styles.backHit} />
        </View>

        {/* Progress */}
        <View style={styles.progressBlock}>
          <View style={styles.progressHeader}>
            <Text variant="bodySmall" color="primary">
              Прогресс онбординга
            </Text>
            <Text variant="bodySmall" color="secondary">
              4 / 4
            </Text>
          </View>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: colors.primary, width: '100%' },
              ]}
            />
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.headlineBlock}>
            <Text variant="h1" style={[styles.headline, { color: colors.textPrimary }]}>
              Сколько у вас учеников?
            </Text>
            <Text
              variant="body"
              color="secondary"
              align="center"
              style={styles.bodyText}
            >
              Это поможет нам подобрать оптимальные инструменты.
            </Text>
          </View>

          <View style={styles.options}>{OPTIONS.map(renderOption)}</View>
        </ScrollView>

        <View style={styles.footer}>
          <Text
            variant="bodySmall"
            color="tertiary"
            align="center"
            style={styles.footerNote}
          >
            Это можно изменить в настройках профиля.
          </Text>
          <Button
            title="Начать работу"
            onPress={() => onContinue?.(selected)}
            fullWidth
            leftIcon={<Ionicons name="rocket-outline" size={20} color={colors.textInverse} />}
          />
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
    alignItems: 'center',
  },
  headline: {
    letterSpacing: -0.4,
    textAlign: 'center',
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
  optionText: {
    flex: 1,
    gap: 4,
  },
  vibeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  radioContainer: {
    width: 32,
    alignItems: 'center',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  footer: {
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.xl,
    gap: spacing.m,
  },
  footerNote: {
    lineHeight: 18,
  },
});
