/**
 * Container Component
 * @description Базовый контейнер с темой
 */
import React, { memo, ReactNode } from 'react';
import { View, StyleSheet, ViewStyle, StatusBar } from 'react-native';
import { useThemeColors, useSettingsStore } from '@/store';

interface ContainerProps {
  children: ReactNode;
  style?: ViewStyle;
  padded?: boolean;
}

export const Container = memo<ContainerProps>(function Container({
  children,
  style,
  padded = true,
}) {
  const colors = useThemeColors();
  const theme = useSettingsStore((s) => s.resolvedTheme);

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: colors.background,
  };

  const content = (
    <View style={[styles.content, padded && styles.padded, style]}>
      {children}
    </View>
  );

  return (
    <>
      <StatusBar
        barStyle={theme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />
      <View style={containerStyle}>{content}</View>
    </>
  );
});

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: 16,
  },
});
