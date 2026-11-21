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
  /** Цвет выбора: native — родной язык (success), иначе фирменный */
  tone?: 'primary' | 'native';
  /** Пометка справа: «язык телефона», «Основной», «Твой родной» */
  badge?: { text: string; tone: 'primary' | 'native' | 'neutral' };
  /** Плитка флага/иконки — источник перелёта флага на мост (Start 2.4) */
  tileRef?: React.Ref<View>;
  /** Неактивный вариант (родной язык в списке изучаемых) — без индикатора выбора */
  disabled?: boolean;
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
  tone = 'primary',
  badge,
  disabled = false,
  tileRef,
  onPress,
}: OnboardingOptionProps) {
  const colors = useThemeColors();
  const accent = tone === 'native' ? colors.success : colors.primary;
  const accentFill = tone === 'native' ? colors.success : colors.primaryFill;
  const MetaIcon = meta?.icon;
  const large = !!meta;

  return (
    <Pressable
      accessibilityRole={mode === 'single' ? 'radio' : 'checkbox'}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      accessibilityLabel={[title, description ?? meta?.text].filter(Boolean).join('. ')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          borderColor: selected ? accent : colors.border,
          backgroundColor: selected ? alpha(accent, 10) : colors.surface,
        },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {Glyph || flag ? (
        <View
          ref={tileRef}
          style={[
            styles.tile,
            { backgroundColor: selected && Glyph ? accentFill : colors.surfaceMuted },
          ]}
        >
          {Glyph ? (
            <Glyph size={iconSize.m} color={selected ? colors.onPrimary : colors.primary} />
          ) : (
            <Text variant="h2">{flag}</Text>
          )}
        </View>
      ) : null}

      <View style={styles.text}>
        <Text
          variant={large ? 'bodyLarge' : 'body'}
          style={[styles.title, { color: colors.textPrimary }]}
        >
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

      {badge ? (
        <View
          style={[
            styles.badge,
            {
              backgroundColor:
                badge.tone === 'primary'
                  ? colors.primaryFill
                  : badge.tone === 'native'
                    ? alpha(colors.success, 10)
                    : colors.surfaceMuted,
            },
          ]}
        >
          <Text
            variant="caption"
            style={[
              styles.badgeText,
              {
                color:
                  badge.tone === 'primary'
                    ? colors.onPrimary
                    : badge.tone === 'native'
                      ? colors.successText
                      : colors.textSecondary,
              },
            ]}
          >
            {badge.text}
          </Text>
        </View>
      ) : null}

      {disabled ? null : mode === 'single' ? (
        <View style={[styles.radio, { borderColor: selected ? accent : colors.border }]}>
          {selected ? <View style={[styles.radioDot, { backgroundColor: accent }]} /> : null}
        </View>
      ) : (
        <View
          style={[
            styles.checkbox,
            {
              borderColor: selected ? accent : colors.border,
              backgroundColor: selected ? accentFill : colors.surface,
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
  disabled: {
    opacity: 0.5,
  },
  badge: {
    borderRadius: borderRadius.s,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  badgeText: {
    fontWeight: '700',
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
