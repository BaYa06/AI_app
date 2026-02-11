/**
 * LoadingSplash Component
 * @description Экран загрузки приложения при старте
 */
import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useThemeColors } from '@/store';
import { spacing } from '@/constants';
import { Text } from './Text';

export function LoadingSplash() {
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: '#ffffff' },
      ]}
    >
      <View style={styles.content}>
        <View style={[styles.logoCircle, { backgroundColor: 'rgba(243, 244, 246, 0.8)' }]}>
          <Ionicons name="flash" size={48} color={colors.primary} />
        </View>
        <Text
          variant="h1"
          align="center"
          style={[styles.title, { color: '#1a1a1a' }]}
        >
          Flashly
        </Text>
        <Text
          variant="bodyLarge"
          align="center"
          style={[styles.subtitle, { color: '#6b7280' }]}
        >
          Learn smarter. Remember longer.
        </Text>
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={styles.spinner}
        />
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
    borderRadius: 24,
    marginBottom: spacing.m,
  },
  title: {
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: spacing.xs,
  },
  subtitle: {
    marginBottom: spacing.xl,
  },
  spinner: {
    marginTop: spacing.m,
  },
});
