/**
 * Sound Settings Screen
 * @description Звуки ответов и вибрация
 */
import React, { useCallback } from 'react';
import { StyleSheet, Platform } from 'react-native';
import { useSettingsStore } from '@/store';
import { DatabaseService } from '@/services';
import { ListGroup, ListRow, Screen, ScreenHeader, Switch } from '@/components/ui';
import { spacing } from '@/constants';
import { playCorrectSound } from '@/utils/sound';
import { triggerHaptic } from '@/utils/haptic';

export function SoundSettingsScreen({ navigation }: any) {
  const soundEnabled = useSettingsStore((s) => s.settings.soundEnabled);
  const hapticEnabled = useSettingsStore((s) => s.settings.hapticEnabled);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const handleToggleSound = useCallback(
    (value: boolean) => {
      updateSettings({ soundEnabled: value });
      DatabaseService.saveSettings();
      // Даём услышать, как звучит
      if (value) playCorrectSound();
    },
    [updateSettings],
  );

  const handleToggleHaptic = useCallback(
    (value: boolean) => {
      updateSettings({ hapticEnabled: value });
      DatabaseService.saveSettings();
      if (value) triggerHaptic('impactMedium');
    },
    [updateSettings],
  );

  return (
    <Screen
      header={<ScreenHeader title="Звук и вибрация" onBack={() => navigation.goBack()} bordered />}
      contentStyle={st.content}
    >
      <ListGroup>
        <ListRow
          title="Звуки ответов"
          subtitle="Сигнал при правильном ответе в тренировках"
          right={<Switch value={soundEnabled} onValueChange={handleToggleSound} accessibilityLabel="Звуки ответов" />}
        />
        {/* Вибрация — на вебе её нет */}
        {Platform.OS !== 'web' && (
          <ListRow
            title="Вибрация"
            subtitle="Отклик на нажатия и ответы"
            right={<Switch value={hapticEnabled} onValueChange={handleToggleHaptic} accessibilityLabel="Вибрация" />}
          />
        )}
      </ListGroup>
    </Screen>
  );
}

// ==================== СТИЛИ ====================

const st = StyleSheet.create({
  content: {
    paddingTop: spacing.l,
  },
});
