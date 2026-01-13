/**
 * Loading Component
 * @description Индикатор загрузки
 */
import React, { memo } from 'react';
import { View, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import { useThemeColors } from '@/store';
import { Text } from './Text';
import { spacing } from '@/constants';

interface LoadingProps {
  size?: 'small' | 'large';
  message?: string;
  fullScreen?: boolean;
  style?: ViewStyle;
}

export const Loading = memo<LoadingProps>(function Loading({
  size = 'large',
  message,
  fullScreen = false,
  style,
}) {
  const colors = useThemeColors();

  const content = (
    <>
      <ActivityIndicator size={size} color={colors.primary} />
      {message && (
        <Text variant="body" color="secondary" style={styles.message}>
          {message}
        </Text>
      )}
    </>
  );

  if (fullScreen) {
    return (
      <View
        style={[
          styles.fullScreen,
          { backgroundColor: colors.background },
          style,
        ]}
      >
        {content}
      </View>
    );
  }

  return <View style={[styles.container, style]}>{content}</View>;
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.l,
  },
  fullScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    marginTop: spacing.m,
  },
});
