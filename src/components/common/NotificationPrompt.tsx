/**
 * NotificationPrompt
 * @description Bottom-sheet модал для запроса разрешения на push-уведомления.
 * Показывается один раз при первом входе на HomeScreen.
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Modal,
  Platform,
  Text as RNText,
} from 'react-native';
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Bell } from '@/components/common/Icons';
import { useThemeColors } from '@/store';
import { requestPushPermission } from '@/services/pushNotifications';
import { StorageService } from '@/services/StorageService';
import { supabase } from '@/services';
import { spacing, borderRadius } from '@/constants';

const STORAGE_KEY = 'notification_prompt_shown';
const ANIMATION_DURATION = 300;

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export function NotificationPrompt({ visible, onDismiss }: Props) {
  const colors = useThemeColors();
  const [resultText, setResultText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const translateY = useSharedValue(400);
  const backdropOpacity = useSharedValue(0);

  const markShown = useCallback(() => {
    StorageService.setString(STORAGE_KEY, 'true');
  }, []);

  const close = useCallback(() => {
    markShown();
    translateY.value = withTiming(400, {
      duration: ANIMATION_DURATION,
      easing: Easing.in(Easing.ease),
    }, () => {
      runOnJS(onDismiss)();
    });
    backdropOpacity.value = withTiming(0, { duration: ANIMATION_DURATION });
  }, [onDismiss, markShown]);

  // Animate in when modal becomes visible
  React.useEffect(() => {
    if (visible) {
      setResultText(null);
      translateY.value = 400;
      backdropOpacity.value = 0;
      // Start entrance animation on next frame
      requestAnimationFrame(() => {
        translateY.value = withTiming(0, {
          duration: ANIMATION_DURATION,
          easing: Easing.out(Easing.ease),
        });
        backdropOpacity.value = withTiming(1, { duration: ANIMATION_DURATION });
      });
    }
  }, [visible]);

  const handleAllow = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id ?? null;
      const status = await requestPushPermission(userId);

      if (status.permission === 'granted') {
        setResultText('Уведомления включены \u2713');
      } else if (status.permission === 'denied') {
        setResultText('Разреши в настройках телефона');
      }
    } catch {
      setResultText('Не удалось включить');
    } finally {
      setLoading(false);
      // Close after showing result briefly
      setTimeout(close, 1200);
    }
  }, [close]);

  const handleDismiss = useCallback(() => {
    close();
  }, [close]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} statusBarTranslucent animationType="none">
      <View style={styles.container}>
        {/* Backdrop */}
        <ReAnimated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
        </ReAnimated.View>

        {/* Bottom sheet */}
        <ReAnimated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              ...Platform.select({
                ios: {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: -4 },
                  shadowOpacity: 0.15,
                  shadowRadius: 16,
                },
                android: { elevation: 16 },
                web: { boxShadow: '0 -4px 24px rgba(0,0,0,0.15)' },
              }),
            },
            sheetStyle,
          ]}
        >
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Bell icon */}
          <View style={[styles.iconCircle, { backgroundColor: colors.primary + '15' }]}>
            <Bell size={64} color={colors.primary} />
          </View>

          {/* Title */}
          <RNText style={[styles.title, { color: colors.textPrimary }]}>
            Включи уведомления
          </RNText>

          {/* Subtitle */}
          <RNText style={[styles.subtitle, { color: colors.textSecondary }]}>
            {'Напомним когда пора повторить карточки\nи не дадим пропустить streak \uD83D\uDD25'}
          </RNText>

          {/* Result text (after action) */}
          {resultText && (
            <RNText style={[styles.resultText, { color: colors.primary }]}>
              {resultText}
            </RNText>
          )}

          {/* Buttons (hidden after action) */}
          {!resultText && (
            <>
              {/* Primary button */}
              <Pressable
                style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
                onPress={handleAllow}
                disabled={loading}
              >
                <Bell size={20} color="#FFFFFF" />
                <RNText style={styles.primaryButtonText}>
                  {loading ? 'Запрашиваем...' : 'Разрешить уведомления'}
                </RNText>
              </Pressable>

              {/* Secondary button */}
              <Pressable style={styles.secondaryButton} onPress={handleDismiss}>
                <RNText style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>
                  Не сейчас
                </RNText>
              </Pressable>
            </>
          )}
        </ReAnimated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.l,
    paddingTop: spacing.s,
    paddingBottom: spacing.xxl,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.l,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.m,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.l,
  },
  resultText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.m,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
    width: '100%',
    height: 52,
    borderRadius: borderRadius.l,
    marginBottom: spacing.s,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: spacing.m,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
