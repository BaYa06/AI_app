/**
 * Icon, CategoryIcon, CelebrationIcon — иконки lucide по брендбуку (раздел 6).
 *
 * Icon — размеры из iconSize (xs 16 · s 20 · m 24 · l 32 · xl 48), цвет по умолчанию textSecondary.
 * CategoryIcon — иконка категории набора вместо эмодзи (constants/categoryIcons).
 * CelebrationIcon — медали и празднования вместо 🥇🥈🥉🏆🎯🔥💪, в цветном круге 10 %.
 */
import React, { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Medal, Trophy, Target, Flame, Dumbbell, Star, Gem, PartyPopper } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, iconSize, type ColorToken } from '@/constants';
import { getCategoryIcon } from '@/constants/categoryIcons';
import type { IconComponent } from './types';

export type IconSizeName = keyof typeof iconSize;

function resolveSize(size: IconSizeName | number): number {
  return typeof size === 'number' ? size : iconSize[size];
}

// ==================== Icon ====================

export interface IconProps {
  icon: IconComponent;
  size?: IconSizeName | number;
  /** Токен цвета (по умолчанию textSecondary) или готовый цвет. */
  color?: ColorToken | (string & {});
  strokeWidth?: number;
}

export const Icon = memo(function Icon({ icon: Glyph, size = 's', color = 'textSecondary', strokeWidth }: IconProps) {
  const colors = useThemeColors();
  const resolved = color in colors ? colors[color as ColorToken] : color;
  return <Glyph size={resolveSize(size)} color={resolved} strokeWidth={strokeWidth} />;
});

// ==================== Круг-подложка ====================

interface IconCircleProps {
  icon: IconComponent;
  color: string;
  size: number;
  /** Квадрат со скруглением вместо круга (иконки наборов). */
  shape?: 'circle' | 'rounded';
  style?: StyleProp<ViewStyle>;
}

/** Иконка в подложке alpha(color, 10); подложка вдвое больше иконки. */
function IconCircle({ icon: Glyph, color, size, shape = 'circle', style }: IconCircleProps) {
  const box = size * 2;
  return (
    <View
      style={[
        styles.circle,
        {
          width: box,
          height: box,
          borderRadius: shape === 'circle' ? borderRadius.full : box >= 48 ? borderRadius.l : borderRadius.m,
          backgroundColor: alpha(color, 10),
        },
        style,
      ]}
    >
      <Glyph size={size} color={color} />
    </View>
  );
}

// ==================== CategoryIcon ====================

export interface CategoryIconProps {
  category?: string | null;
  size?: IconSizeName | number;
  /** Цвет иконки (по умолчанию primary; для наборов — getDeckAccentColor). */
  color?: string;
  /** Показать в подложке 10 % (скруглённый квадрат). */
  background?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const CategoryIcon = memo(function CategoryIcon({
  category,
  size = 's',
  color,
  background = false,
  style,
}: CategoryIconProps) {
  const colors = useThemeColors();
  const Glyph = getCategoryIcon(category);
  const tint = color ?? colors.primary;
  const px = resolveSize(size);
  if (background) return <IconCircle icon={Glyph} color={tint} size={px} shape="rounded" style={style} />;
  return <Glyph size={px} color={tint} />;
});

// ==================== CelebrationIcon ====================

export type CelebrationKind =
  | 'gold'
  | 'silver'
  | 'bronze'
  | 'trophy'
  | 'target'
  | 'streak'
  | 'strength'
  | 'star'
  | 'diamond'
  | 'party';

const CELEBRATIONS: Record<CelebrationKind, { icon: IconComponent; color: ColorToken }> = {
  gold: { icon: Medal, color: 'star' },
  silver: { icon: Medal, color: 'silver' },
  bronze: { icon: Medal, color: 'bronze' },
  trophy: { icon: Trophy, color: 'star' },
  target: { icon: Target, color: 'success' },
  streak: { icon: Flame, color: 'streak' },
  strength: { icon: Dumbbell, color: 'primary' },
  star: { icon: Star, color: 'star' },
  diamond: { icon: Gem, color: 'diamond' },
  party: { icon: PartyPopper, color: 'primary' },
};

export interface CelebrationIconProps {
  kind: CelebrationKind;
  /** Размер иконки; подложка — вдвое больше. По умолчанию xl (48 в круге 96). */
  size?: IconSizeName | number;
  /** Без круга — просто иконка в своём цвете (например, медаль в строке рейтинга). */
  plain?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const CelebrationIcon = memo(function CelebrationIcon({ kind, size = 'xl', plain = false, style }: CelebrationIconProps) {
  const colors = useThemeColors();
  const { icon: Glyph, color } = CELEBRATIONS[kind];
  const px = resolveSize(size);
  if (plain) return <Glyph size={px} color={colors[color]} />;
  return <IconCircle icon={Glyph} color={colors[color]} size={px} style={style} />;
});

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
