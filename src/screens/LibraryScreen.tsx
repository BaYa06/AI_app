/**
 * Library Screen
 * @description Экран публичной библиотеки (заглушка для MVP)
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Container, Text, Heading2 } from '@/components/common';
import { spacing } from '@/constants';

export function LibraryScreen() {
  return (
    <Container edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.icon}>📚</Text>
        <Heading2 align="center">Библиотека</Heading2>
        <Text variant="body" color="secondary" align="center" style={styles.text}>
          Здесь будут публичные наборы карточек от других пользователей
        </Text>
        <Text variant="caption" color="tertiary" align="center">
          Скоро в следующих версиях
        </Text>
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },

  icon: {
    fontSize: 64,
    marginBottom: spacing.l,
  },

  text: {
    marginTop: spacing.s,
    marginBottom: spacing.m,
  },
});
