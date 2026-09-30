/**
 * OnboardingOption — вариант ответа на шаге онбординга.
 *
 * Карточка: скругление 16, рамка 2 (border / primary) — толщина одна в обоих
 * состояниях, чтобы вариант не «прыгал». Выбранный — подложка primary 10 %.
 * Слева — иконка lucide или флаг языка в плитке 52; справа — индикатор выбора:
 * круг с точкой (один вариант) или квадрат с галочкой (несколько).
 */
import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/common/Text';
import type { IconComponent } from '@/components/ui';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, iconSize, spacing } from '@/constants';

export interface OnboardingOptionProps {
  title: string;
  description?: string;
  /** Иконка в плитке слева. */
  icon?: IconComponent;
  /** Флаг языка вместо иконки (эмодзи флагов разрешены брендбуком). */
  flag?: string;
  /** Подпись с маленькой иконкой под заголовком («Неспешно», «Большая группа»). */
  meta?: { icon: IconComponent; text: string };
  selected: boolean;
  /** single — радио (один вариант), multiple — чекбокс. */
  mode?: 'single' | 'multiple';
  onPress: () => void;
}

export const OnboardingOption = memo(function OnboardingOption({
  title,
  description,
  icon: Glyph,
  flag,
  meta,
  selected,
  mode = 'single',
  onPress,
}: OnboardingOptionProps) {
  const colors = useThemeColors();
  const MetaIcon = meta?.icon;
  const large = !!meta;

  return (
    <Pressable
      accessibilityRole={mode === 'single' ? 'radio' : 'checkbox'}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={[title, description ?? meta?.text].filter(Boolean).join('. ')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: selected ? alpha(colors.primary, 10) : colors.surface,
        },
        pressed && styles.pressed,
      ]}
    >
      {Glyph || flag ? (
        <View style={[styles.tile, { backgroundColor: selected ? colors.primaryFill : colors.surfaceMuted }]}>
          {Glyph ? (
            <Glyph size={iconSize.m} color={selected ? colors.onPrimary : colors.primary} />
          ) : (
            <Text variant="h2">{flag}</Text>
          )}
        </View>
      ) : null}

      <View style={styles.text}>
        <Text variant={large ? 'bodyLarge' : 'body'} style={[styles.title, { color: colors.textPrimary }]}>
          {title}
        </Text>
        {description ? (
          <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
            {description}
          </Text>
        ) : null}
        {meta && MetaIcon ? (
          <View style={styles.metaRow}>
            <MetaIcon size={iconSize.xs} color={colors.primary} />
            <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
              {meta.text}
            </Text>
          </View>
        ) : null}
      </View>

      {mode === 'single' ? (
        <View style={[styles.radio, { borderColor: selected ? colors.primary : colors.border }]}>
          {selected ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}
        </View>
      ) : (
        <View
          style={[
            styles.checkbox,
            {
              borderColor: selected ? colors.primary : colors.border,
              backgroundColor: selected ? colors.primaryFill : colors.surface,
            },
          ]}
        >
          {selected ? <Check size={iconSize.xs} color={colors.onPrimary} strokeWidth={3} /> : null}
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    borderWidth: 2,
    borderRadius: borderRadius.l,
    padding: spacing.m,
  },
  pressed: {
    opacity: 0.85,
  },
  tile: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: spacing.xxs,
  },
  title: {
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: borderRadius.full,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.s,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
