/**
 * Шторка сортировки наборов
 * (Clean 8a — вынесено из HomeScreen без изменений разметки.)
 */
import React from 'react';
import { Pressable } from 'react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { iconSize } from '@/constants';
import { Sheet } from '@/components/ui';
import { Check } from 'lucide-react-native';
import { SETS_SORT_OPTIONS, type SetsSortKey } from '../setsSort';
import { styles } from '../styles';

type Props = {
  sortSheetVisible: boolean;
  setSortSheetVisible: React.Dispatch<React.SetStateAction<boolean>>;
  colors: ReturnType<typeof useThemeColors>;
  setsSort: SetsSortKey;
  selectSetsSort: (key: SetsSortKey) => void;
};

export function SetsSortSheet({
  sortSheetVisible,
  setSortSheetVisible,
  colors,
  setsSort,
  selectSetsSort,
}: Props) {
  return (
    <Sheet visible={sortSheetVisible} onClose={() => setSortSheetVisible(false)} title="Сортировка">
      {SETS_SORT_OPTIONS.map((option) => {
        const selected = option.key === setsSort;
        return (
          <Pressable
            key={option.key}
            onPress={() => selectSetsSort(option.key)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.sortOption,
              pressed && { backgroundColor: colors.surfaceMuted },
            ]}
          >
            <Text
              variant="body"
              style={[
                { color: selected ? colors.primary : colors.textPrimary },
                selected && styles.semibold,
              ]}
            >
              {option.label}
            </Text>
            {selected && <Check size={iconSize.s} color={colors.primary} />}
          </Pressable>
        );
      })}
    </Sheet>
  );
}
