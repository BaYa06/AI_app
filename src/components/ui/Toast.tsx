/**
 * Toast — короткое сообщение об успехе снизу экрана (брендбук, 7.7).
 *
 * Для сообщений без выбора, которые раньше показывались системным Alert:
 *   toast.success('Сохранено');  toast.info('Код скопирован');  toast.error('Не удалось сохранить');
 * Показывается 2 с (длинный текст — дольше), без кнопок, над панелью вкладок.
 * Новый тост заменяет текущий.
 *
 * ToastHost — в App.tsx и внутри Sheet / Dialog: системный Modal перекрывает приложение,
 * поэтому тост показывает последний смонтированный хост (окно поверх — его хост).
 */
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, Info, AlertCircle } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common/Text';
import { animation, borderRadius, heights, iconSize, screenPadding, spacing } from '@/constants';

export type ToastTone = 'success' | 'info' | 'error';

interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
  duration: number;
}

const MIN_DURATION = 2000;
const MAX_DURATION = 5000;
/** Время на прочтение: 2 с + ~40 мс на символ, но не больше 5 с. */
const readingTime = (message: string) => Math.min(MAX_DURATION, MIN_DURATION + message.length * 40);
const ICONS = { success: CheckCircle2, info: Info, error: AlertCircle } as const;

// ---- Мини-хранилище: показать тост можно из любого места, даже вне React ----
type Listener = (toast: ToastMessage) => void;
/** Стек хостов: тост получает только верхний (последний смонтированный). */
const hosts: Listener[] = [];
let nextId = 1;

function show(message: string, options: { tone?: ToastTone; duration?: number } = {}) {
  const toastMessage: ToastMessage = {
    id: nextId++,
    message,
    tone: options.tone ?? 'success',
    duration: options.duration ?? readingTime(message),
  };
  hosts[hosts.length - 1]?.(toastMessage);
}

export const toast = {
  show,
  success: (message: string) => show(message, { tone: 'success' }),
  info: (message: string) => show(message, { tone: 'info' }),
  error: (message: string) => show(message, { tone: 'error' }),
};

// ---- Хост ----
const useNativeDriver = Platform.OS !== 'web';

export function ToastHost({ offset }: { offset?: number } = {}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<ToastMessage | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const listener: Listener = (next) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setCurrent(next);
      AccessibilityInfo.announceForAccessibility(next.message);
      progress.stopAnimation();
      Animated.timing(progress, { toValue: 1, duration: animation.normal, useNativeDriver }).start();
      hideTimer.current = setTimeout(() => {
        Animated.timing(progress, { toValue: 0, duration: animation.normal, useNativeDriver }).start(({ finished }) => {
          if (finished) setCurrent((shown) => (shown?.id === next.id ? null : shown));
        });
      }, next.duration);
    };
    hosts.push(listener);
    return () => {
      const index = hosts.lastIndexOf(listener);
      if (index >= 0) hosts.splice(index, 1);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [progress]);

  if (!current) return null;

  const Icon = ICONS[current.tone];
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [spacing.m, 0] });

  return (
    <View
      pointerEvents="none"
      style={[styles.host, { bottom: offset ?? insets.bottom + heights.tabBar + spacing.xs }]}
    >
      <Animated.View
        accessibilityLiveRegion="polite"
        style={[
          styles.toast,
          // Инверсная поверхность: тёмный тост в светлой теме, светлый — в тёмной
          { backgroundColor: colors.textPrimary, opacity: progress, transform: [{ translateY }] },
        ]}
      >
        <Icon size={iconSize.s} color={colors.textInverse} />
        <Text variant="bodySmall" numberOfLines={2} style={[styles.text, { color: colors.textInverse }]}>
          {current.message}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: screenPadding,
    right: screenPadding,
    alignItems: 'center',
  },
  toast: {
    maxWidth: 480,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: borderRadius.m,
  },
  text: {
    flexShrink: 1,
    fontWeight: '600',
  },
});
