/**
 * GameRow
 * @description Строка выбора игрового режима внутри StudyModeSheet
 */
import React, { memo } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Badge, type IconComponent } from '@/components/ui';
import { spacing, borderRadius, iconSize } from '@/constants';

interface Props {
  icon: IconComponent;
  title: string;
  tag: string;
  description: string;
  onPress: () => void;
}

export const GameRow = memo(function GameRow({ icon: Icon, title, tag, description, onPress }: Props) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.icon, { backgroundColor: colors.surfaceMuted }]}>
        <Icon size={iconSize.s} color={colors.textPrimary} />
      </View>
      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text variant="body" style={[styles.title, { color: colors.textPrimary }]}>
            {title}
          </Text>
          <Badge label={tag} tone="neutral" />
        </View>
        <Text variant="caption" color="secondary" numberOfLines={1}>
          {description}
        </Text>
      </View>
      <ChevronRight size={iconSize.xs} color={colors.textTertiary} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.l,
    padding: spacing.m,
    gap: spacing.s,
  },
  pressed: {
    opacity: 0.85,
  },
  title: {
    fontWeight: '600',
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: spacing.xxs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
});
