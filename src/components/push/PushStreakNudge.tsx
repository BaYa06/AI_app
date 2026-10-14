/**
 * PushStreakNudge — «Включи напоминания, чтобы не потерять серию» (plan/push_notifications.md, 1.3)
 * @description Ненавязчивая строка на главной под уроком дня. Когда показывать — services/pushPrompt.ts.
 * Отказал в iOS — открываем настройки iPhone (второй раз системный диалог не появится);
 * ещё не отвечал — системный диалог.
 */
import React, { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Bell, X } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button, toast } from '@/components/ui';
import { spacing, borderRadius, iconSize, alpha } from '@/constants';
import { Analytics } from '@/services/analytics';
import { requestPushPermission } from '@/services/pushNotifications';
import { supabase } from '@/services/supabaseClient';

interface Props {
  /** denied — разрешение отозвано в iOS, default — ещё не спрашивали */
  permission: string;
  onClose: () => void;
}

export function PushStreakNudge({ permission, onClose }: Props) {
  const colors = useThemeColors();
  const [busy, setBusy] = useState(false);

  const handlePress = useCallback(async () => {
    if (busy) return;
    Analytics.pushStreakNudge('tap');
    if (permission === 'denied') {
      Linking.openSettings().catch(() => {});
      onClose();
      return;
    }
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const status = await requestPushPermission(data.session?.user?.id ?? null);
      if (status.permission === 'granted') {
        Analytics.pushPermissionGranted();
        toast.success('Напоминания включены');
      } else {
        Analytics.pushPermissionDenied();
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }, [busy, permission, onClose]);

  const handleDismiss = useCallback(() => {
    Analytics.pushStreakNudge('dismiss');
    onClose();
  }, [onClose]);

  return (
    <View style={[st.row, { backgroundColor: alpha(colors.primary, 10) }]}>
      <Pressable
        onPress={handlePress}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Включи напоминания, чтобы не потерять серию"
        style={({ pressed }) => [st.main, pressed && st.pressed]}
      >
        <Bell size={iconSize.s} color={colors.primary} />
        <Text variant="bodySmall" style={[st.text, { color: colors.textPrimary }]}>
          Включи напоминания, чтобы не потерять серию
        </Text>
      </Pressable>
      <Button variant="icon" icon={X} background="none" accessibilityLabel="Скрыть" onPress={handleDismiss} />
    </View>
  );
}

const st = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.m,
    paddingLeft: spacing.m,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingVertical: spacing.s,
  },
  pressed: {
    opacity: 0.6,
  },
  text: {
    flex: 1,
  },
});
