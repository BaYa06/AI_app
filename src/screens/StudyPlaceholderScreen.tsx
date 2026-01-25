/**
 * Study Placeholder Screen
 * @description Заглушка для вкладки "Учёба"
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { spacing, borderRadius } from '@/constants';

export function StudyPlaceholderScreen() {
  const colors = useThemeColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            shadowColor: colors.shadow,
          },
        ]}
      >
        <Text variant="h2" style={{ color: colors.textPrimary, fontWeight: '800' }}>
          Скоро добавим :-)
        </Text>
        <Text variant="body" color="secondary" align="center">
          Ведём работы над новым режимом
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.l,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    padding: spacing.l,
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    gap: spacing.xs,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
});
