/**
 * Заголовок секции наборов: курс, сортировка, меню
 * (Clean 8 — вынесено из HomeScreen.tsx без изменений разметки.)
 */
import React from 'react';
import { View, Pressable } from 'react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { spacing, iconSize } from '@/constants';
import { Button } from '@/components/ui';
import { MoreHorizontal, ArrowUpDown } from 'lucide-react-native';
import { Analytics } from '@/services/analytics';
import { DEFAULT_SETS_SORT, type SetsSortKey } from '../setsSort';
import { styles } from '../styles';

type Props = {
  colors: ReturnType<typeof useThemeColors>;
  activeCourseId: string | null;
  activeCourseTitle: string | null;
  openSetsMenu: () => void;
  setSortSheetVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setsSort: SetsSortKey;
  setsSortShortLabel: string | undefined;
};

export function SetsSectionHeader({
  colors,
  activeCourseId,
  activeCourseTitle,
  openSetsMenu,
  setSortSheetVisible,
  setsSort,
  setsSortShortLabel,
}: Props) {
  return (
    <View style={styles.sectionHeader}>
      <Text
        variant="h3"
        style={[styles.flexShrink, { color: colors.textPrimary }]}
        numberOfLines={1}
      >
        {activeCourseId === null ? 'Мои наборы' : activeCourseTitle}
      </Text>
      <View style={styles.sectionActions}>
        {/* Порядок показываем, только если он не по умолчанию — иначе список кажется перемешанным */}
        {setsSort !== DEFAULT_SETS_SORT && (
          <Pressable
            onPress={() => {
              Analytics.homeAction('sort');
              setSortSheetVisible(true);
            }}
            hitSlop={spacing.s}
            accessibilityRole="button"
            accessibilityLabel={`Сортировка: ${setsSortShortLabel}`}
            style={({ pressed }) => [styles.sortButton, pressed && styles.pressed]}
          >
            <ArrowUpDown size={iconSize.xs} color={colors.primary} />
            <Text variant="label" style={{ color: colors.primary }}>
              {setsSortShortLabel}
            </Text>
          </Pressable>
        )}
        <Button
          variant="icon"
          icon={MoreHorizontal}
          background="none"
          iconSize={iconSize.s}
          iconColor={colors.textSecondary}
          accessibilityLabel="Действия с наборами"
          onPress={openSetsMenu}
        />
      </View>
    </View>
  );
}
