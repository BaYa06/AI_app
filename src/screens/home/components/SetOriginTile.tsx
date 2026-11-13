/**
 * Плитка слева в строке набора: значок, откуда набор (plan/new/teacher_cabinet.md, Teacher 31).
 * Фон — цвет набора 10 %, значок — textSecondary: обе темы из токенов.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import {
  BookOpen,
  PenLine,
  Sparkles,
  FileSpreadsheet,
  Library,
  Link2,
  Layers,
  type LucideIcon,
} from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, iconSize } from '@/constants';
import type { CardSet } from '@/types';
import { setOriginIcon, type SetOriginIcon } from '@/utils/setOrigin';

const ICONS: Record<SetOriginIcon, LucideIcon> = {
  book: BookOpen,
  manual: PenLine,
  ai: Sparkles,
  file: FileSpreadsheet,
  library: Library,
  share: Link2,
  set: Layers,
};

export function SetOriginTile({
  set,
  accentColor,
}: {
  set: Pick<CardSet, 'isOfficial' | 'origin'>;
  accentColor: string;
}) {
  const colors = useThemeColors();
  const Icon = ICONS[setOriginIcon(set)];
  return (
    <View style={[styles.tile, { backgroundColor: alpha(accentColor, 10) }]}>
      <Icon size={iconSize.m} color={colors.textSecondary} strokeWidth={2} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.m,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
