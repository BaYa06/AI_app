/**
 * NotificationPrompt
 * @description Нижний лист с запросом разрешения на push-уведомления.
 * Показывается один раз при первом входе на HomeScreen.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Bell, Flame } from 'lucide-react-native';
import { Button, Sheet } from '@/components/ui';
import { useThemeColors } from '@/store';
import { requestPushPermission } from '@/services/pushNotifications';
import { StorageService } from '@/services/StorageService';
import { supabase } from '@/services';
import { spacing, borderRadius, alpha, iconSize } from '@/constants';
import { Text } from './Text';

const STORAGE_KEY = 'notification_prompt_shown';

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export function NotificationPrompt({ visible, onDismiss }: Props) {
  const colors = useThemeColors();
  const [resultText, setResultText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) setResultText(null);
  }, [visible]);

  const close = useCallback(() => {
    StorageService.setString(STORAGE_KEY, 'true');
    onDismiss();
  }, [onDismiss]);

  const handleAllow = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id ?? null;
      const status = await requestPushPermission(userId);

      if (status.permission === 'granted') {
        setResultText('Уведомления включены ✓');
      } else if (status.permission === 'denied') {
        setResultText('Разреши в настройках телефона');
      }
    } catch {
      setResultText('Не удалось включить');
    } finally {
      setLoading(false);
      // Закрываем, показав результат
      setTimeout(close, 1200);
    }
  }, [close]);

  return (
    <Sheet visible={visible} onClose={close} scroll={false}>
      <View style={styles.body}>
        {/* Bell icon */}
        <View style={[styles.iconCircle, { backgroundColor: alpha(colors.primary, 10) }]}>
          <Bell size={iconSize.xl} color={colors.primary} />
        </View>

        <Text variant="h3" align="center" accessibilityRole="header" style={{ color: colors.textPrimary }}>
          Включи уведомления
        </Text>

        <Text variant="body" align="center" style={[styles.subtitle, { color: colors.textSecondary }]}>
          {'Напомним когда пора повторить карточки\nи не дадим пропустить серию '}
          <Flame size={iconSize.xs} color={colors.streak} />
        </Text>

        {/* Result text (after action) */}
        {resultText ? (
          <Text variant="button" align="center" accessibilityRole="alert" style={[styles.result, { color: colors.primary }]}>
            {resultText}
          </Text>
        ) : (
          /* Buttons (hidden after action) */
          <View style={styles.actions}>
            <Button
              title={loading ? 'Запрашиваем...' : 'Разрешить уведомления'}
              icon={Bell}
              onPress={handleAllow}
              disabled={loading}
              fullWidth
            />
            <Button title="Не сейчас" variant="quiet" tone="secondary" onPress={close} fullWidth />
          </View>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.m,
  },
  subtitle: {
    marginTop: spacing.xs,
    marginBottom: spacing.l,
  },
  result: {
    letterSpacing: 0,
    marginBottom: spacing.m,
  },
  actions: {
    alignSelf: 'stretch',
    gap: spacing.xs,
  },
});
