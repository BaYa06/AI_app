/**
 * Метка «Тестовый сервер» поверх всего приложения — только в тестовых сборках (APP_ENV=staging).
 * Чтобы тестовую TestFlight-сборку нельзя было спутать с рабочей и случайно отправить в
 * App Store. plan/release_safety.md, Release 3.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/common/Text';
import { IS_STAGING } from '@/config/apiBase';
import { borderRadius, colors } from '@/constants';

export function StagingBadge() {
  const insets = useSafeAreaInsets();
  if (!IS_STAGING) return null;
  return (
    <View pointerEvents="none" style={[styles.badge, { top: insets.top }]}>
      <Text style={styles.label}>Тестовый сервер</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  label: {
    fontSize: 12,
    color: colors.light.onPrimary,
    backgroundColor: colors.light.warningText,
    paddingHorizontal: 8,
    borderBottomLeftRadius: borderRadius.s,
    borderBottomRightRadius: borderRadius.s,
    overflow: 'hidden',
  },
});
