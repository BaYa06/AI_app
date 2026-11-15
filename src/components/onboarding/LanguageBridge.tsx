/**
 * «Мост» языков над экранами родного и изучаемого языка (plan/new/new_user_activation.md, 2.2):
 * два места «Я говорю на» → «Хочу выучить». Место, которое сейчас заполняется, подсвечено;
 * у родного свой цвет (success), у изучаемого — фирменный (primary). Люди путали эти экраны,
 * а два места рядом показывают, что выбираются два разных языка.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { Text } from '@/components/common/Text';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, getLanguageDefByCode, iconSize, spacing } from '@/constants';

export type BridgeSide = 'native' | 'target';

interface Props {
  native?: string;
  target?: string;
  active: BridgeSide;
}

/** Цвет стороны моста — им же красятся выбранный вариант и пометка в примере карточки */
export function useBridgeTone(side: BridgeSide): { line: string; text: string; soft: string } {
  const colors = useThemeColors();
  return side === 'native'
    ? { line: colors.success, text: colors.successText, soft: alpha(colors.success, 10) }
    : { line: colors.primary, text: colors.primary, soft: alpha(colors.primary, 10) };
}

function Slot({ side, code, active }: { side: BridgeSide; code?: string; active: boolean }) {
  const colors = useThemeColors();
  const tone = useBridgeTone(side);
  const lang = code ? getLanguageDefByCode(code) : undefined;
  const filled = !!lang && !active;
  const empty = side === 'native' ? 'выбери' : active ? 'выбери' : 'дальше';

  return (
    <View
      style={[
        styles.slot,
        {
          borderColor: active || filled ? tone.line : colors.border,
          borderStyle: active || filled ? 'solid' : 'dashed',
          backgroundColor: active ? tone.soft : 'transparent',
        },
      ]}
    >
      <Text variant="overline" style={{ color: tone.text }}>
        {side === 'native' ? 'Я говорю на' : 'Хочу выучить'}
      </Text>
      <View style={[styles.flag, { backgroundColor: colors.surfaceMuted }]}>
        <Text variant="h2" style={!lang && { color: colors.textTertiary }}>
          {lang ? lang.flag : '?'}
        </Text>
      </View>
      <Text
        variant="label"
        numberOfLines={1}
        style={{ color: lang ? colors.textPrimary : colors.textTertiary }}
      >
        {lang ? lang.label : empty}
      </Text>
    </View>
  );
}

export const LanguageBridge = memo(function LanguageBridge({ native, target, active }: Props) {
  const colors = useThemeColors();
  const nativeLabel = native ? getLanguageDefByCode(native)?.label : undefined;
  const targetLabel = target ? getLanguageDefByCode(target)?.label : undefined;

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`Я говорю на: ${nativeLabel ?? 'не выбрано'}. Хочу выучить: ${
        targetLabel ?? 'не выбрано'
      }`}
    >
      <Slot side="native" code={native} active={active === 'native'} />
      <ArrowRight size={iconSize.s} color={colors.textTertiary} />
      <Slot side="target" code={target} active={active === 'target'} />
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  slot: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xxs,
    borderWidth: 2,
    borderRadius: borderRadius.l,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.xs,
  },
  flag: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
