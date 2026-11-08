/**
 * Панель настроек сессии «Карточки» (перевернуть карточки)
 * (Clean 8 — вынесено из StudyScreen.tsx без изменений разметки.)
 */
import React from 'react';
import { View, Pressable, Animated, Modal } from 'react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Switch } from '@/components/ui';
import { spacing, iconSize, alpha } from '@/constants';
import { Settings } from 'lucide-react-native';
import { styles } from './styles';
import type { EdgeInsets } from 'react-native-safe-area-context';

type Props = {
  colors: ReturnType<typeof useThemeColors>;
  isSettingsOpen: boolean;
  closeSettings: () => void;
  backdropOpacity: Animated.Value;
  sheetTranslate: Animated.Value;
  insets: EdgeInsets;
  reverseEnabled: boolean;
  handleToggleReverse: (value: boolean) => void;
};

export function StudySettingsModal({
  colors,
  isSettingsOpen,
  closeSettings,
  backdropOpacity,
  sheetTranslate,
  insets,
  reverseEnabled,
  handleToggleReverse,
}: Props) {
  return (
    <Modal
      visible={isSettingsOpen}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={closeSettings}
    >
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          style={styles.backdrop}
          onPress={closeSettings}
          accessibilityLabel="Закрыть настройки"
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.backdropTint,
              { opacity: backdropOpacity, backgroundColor: colors.overlay },
            ]}
          />
        </Pressable>

        {/* Панель настроек выезжает сверху (формат прежний) */}
        <Animated.View
          style={[
            styles.settingsSheet,
            {
              top: insets.top + spacing.m,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              transform: [{ translateY: sheetTranslate }],
            },
          ]}
        >
          <View style={styles.settingsRow}>
            <View style={[styles.settingsIconWrap, { backgroundColor: alpha(colors.primary, 10) }]}>
              <Settings size={iconSize.s} color={colors.primary} />
            </View>
            <View style={styles.settingsTexts}>
              <Text variant="body" style={[styles.semibold, { color: colors.textPrimary }]}>
                Реверс карточек
              </Text>
              <Text variant="caption" style={{ color: colors.textSecondary }}>
                Сначала показывать обратную сторону
              </Text>
            </View>
            <Switch
              value={reverseEnabled}
              onValueChange={handleToggleReverse}
              accessibilityLabel="Реверс карточек"
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
