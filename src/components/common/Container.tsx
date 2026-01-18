/**
 * Container Component
 * @description Базовый контейнер с темой
 */
import React, { memo, ReactNode } from 'react';
import { View, StyleSheet, ViewStyle, StatusBar } from 'react-native';
import { useThemeColors, useSettingsStore } from '@/store';
import { useEdgeSwipeBack } from '@/hooks/useEdgeSwipeBack';

interface ContainerProps {
  children: ReactNode;
  style?: ViewStyle;
  padded?: boolean;
  enableSwipeBack?: boolean; // Веб свайп назад от края
}

export const Container = memo<ContainerProps>(function Container({
  children,
  style,
  padded = true,
  enableSwipeBack = true,
}) {
  const colors = useThemeColors();
  const theme = useSettingsStore((s) => s.resolvedTheme);
  // Веб/PWA свайп назад (iOS-like). Native жесты работают через stack.
  useEdgeSwipeBack(enableSwipeBack);

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
