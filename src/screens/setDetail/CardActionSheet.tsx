/**
 * Действия с карточкой (удалить)
 * (Clean 8 — вынесено из SetDetailScreen.tsx без изменений разметки.)
 */
import React from 'react';
import { View, Pressable } from 'react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { styles } from './styles';

type Props = {
  colors: ReturnType<typeof useThemeColors>;
  backdropColor: string;
  modalSurface: string;
  modalBorder: string;
  modalTextPrimary: string;
  setActionCardId: React.Dispatch<React.SetStateAction<string | null>>;
  handleDeleteCard: () => void;
};

export function CardActionSheet({
  colors,
  backdropColor,
  modalSurface,
  modalBorder,
  modalTextPrimary,
  setActionCardId,
  handleDeleteCard,
}: Props) {
  return (
    <View style={[styles.sheetWrapper, { zIndex: 25 }]} pointerEvents="box-none">
      <Pressable
        style={[styles.sheetBackdrop, { backgroundColor: backdropColor }]}
        onPress={() => setActionCardId(null)}
      />
      <View style={[styles.sheet, { backgroundColor: modalSurface, borderColor: modalBorder }]}>
        <Pressable accessibilityRole="button" style={styles.sheetAction} onPress={handleDeleteCard}>
          <Text variant="body" style={{ color: colors.error, fontWeight: '700' }}>
            Удалить
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={styles.sheetAction}
          onPress={() => setActionCardId(null)}
        >
          <Text variant="body" style={{ color: modalTextPrimary, fontWeight: '700' }}>
            Отмена
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
