/**
 * LoadingSplash Component
 * @description Экран загрузки приложения при старте.
 * Всегда в светлой палитре: тема ещё не определена, а системный экран запуска — белый,
 * поэтому тёмная заставка мигнула бы между ними.
 */
import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Zap } from 'lucide-react-native';
import { borderRadius, colors, iconSize, spacing } from '@/constants';
import { Text } from './Text';

const palette = colors.light;

export function LoadingSplash() {
  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <View style={styles.content}>
        <View style={[styles.logoCircle, { backgroundColor: palette.surfaceMuted }]}>
          <Zap size={iconSize.xl} color={palette.primary} fill={palette.primary} />
        </View>
        <Text variant="h1" align="center" style={[styles.title, { color: palette.textPrimary }]}>
          Flashly
        </Text>
        <Text variant="bodyLarge" align="center" style={[styles.subtitle, { color: palette.textSecondary }]}>
          Учись умнее. Запоминай надолго.
        </Text>
        <ActivityIndicator size="large" color={palette.primary} accessibilityLabel="Загрузка" style={styles.spinner} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: spacing.l,
  },
  logoCircle: {
    padding: spacing.l,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.m,
  },
  title: {
    marginBottom: spacing.xs,
  },
  subtitle: {
    marginBottom: spacing.xl,
  },
  spinner: {
    marginTop: spacing.m,
  },
});
