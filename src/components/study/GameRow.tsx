/**
 * GameRow
 * @description Строка выбора игрового режима внутри StudyModeSheet
 */
import React, { memo } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { spacing, borderRadius } from '@/constants';

interface Props {
  // lucide-react-native's icon component type isn't exported, so this stays loosely typed
  icon: React.ComponentType<any>;
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
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={styles.icon}>
        <Icon size={18} color={colors.textPrimary} />
      </View>
      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>
            {title}
          </Text>
          <Text
            variant="caption"
            style={{
              color: colors.textSecondary,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              paddingHorizontal: spacing.xs,
              paddingVertical: 2,
              borderRadius: borderRadius.s,
              borderWidth: 1,
            }}
          >
            {tag}
          </Text>
        </View>
        <Text variant="caption" color="secondary" numberOfLines={1}>
          {description}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.textTertiary} />
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
  icon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.m,
    backgroundColor: 'rgba(148,163,184,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
});
