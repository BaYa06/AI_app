/**
 * Container Component
 * @description Базовый контейнер с SafeArea и темой
 */
import React, { memo, ReactNode } from 'react';
import { View, StyleSheet, ViewStyle, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors, useSettingsStore } from '@/store';

interface ContainerProps {
  children: ReactNode;
  style?: ViewStyle;
  safeArea?: boolean;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  padded?: boolean;
}

export const Container = memo<ContainerProps>(function Container({
  children,
  style,
  safeArea = true,
  edges = ['top'],
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
      {safeArea ? (
        <SafeAreaView style={containerStyle} edges={edges}>
          {content}
        </SafeAreaView>
      ) : (
        <View style={containerStyle}>{content}</View>
      )}
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
