/**
 * ToggleSwitch
 * @description Переиспользуемый переключатель настроек (тема применяется автоматически)
 */
import React, { memo } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { useThemeColors } from '@/store';
import { borderRadius } from '@/constants';

interface Props {
  value: boolean;
  onToggle: () => void;
}

export const ToggleSwitch = memo(function ToggleSwitch({ value, onToggle }: Props) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onToggle}
      style={[styles.track, { backgroundColor: value ? colors.primary : colors.border }]}
    >
      <View
        style={[
          styles.thumb,
          { backgroundColor: colors.surface, transform: [{ translateX: value ? 18 : 0 }] },
        ]}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  track: {
    width: 42,
    height: 24,
    borderRadius: borderRadius.full,
    padding: 2,
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: borderRadius.full,
  },
});
