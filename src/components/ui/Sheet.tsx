/**
 * Sheet и Dialog — всплывающие окна (брендбук, 7.6).
 *
 * Sheet — нижний лист: surface, верхние углы 24, «ручка» 36×4, затемнение overlay.
 * Dialog — окно по центру: surface, скругление 24, отступ 24.
 * Формат окна (снизу / по центру) у экранов не меняем — выбираем тот компонент, что был.
 *
 * По фону закрываем только необязательные окна (меню, выбор); формы с вводом —
 * `dismissOnBackdrop={false}`. Контент монтируется, пока окно видно или закрывается.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common/Text';
import { alpha, animation, borderRadius, screenPadding, spacing } from '@/constants';
import { ToastHost } from './Toast';

const useNativeDriver = Platform.OS !== 'web';

interface OverlayProps {
  visible: boolean;
  onClose: () => void;
  /** Закрывать по нажатию на затемнение (по умолчанию — да). */
  dismissOnBackdrop?: boolean;
  title?: string;
  /** Правый элемент заголовка (например, тихая кнопка «Отмена», если она уже есть в окне). */
  headerRight?: React.ReactNode;
  children?: React.ReactNode;
  /** Закреплённый низ окна: кнопки действий. */
  footer?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Монтирует окно на время открытия и анимации закрытия.
 * Анимация открытия стартует только когда окно уже смонтировано и готово (`ready`),
 * в следующем кадре: иначе таймер идёт, пока React монтирует содержимое, и первые
 * кадры теряются — окно появляется рывком.
 */
function useOverlayAnimation(
  visible: boolean,
  ready: boolean,
  durations: { open: number; close: number },
) {
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: durations.close,
      easing: Easing.in(Easing.cubic),
      useNativeDriver,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [visible, progress, durations.close]);

  useEffect(() => {
    if (!visible || !mounted || !ready) return;
    const frame = requestAnimationFrame(() => {
      Animated.timing(progress, {
        toValue: 1,
        duration: durations.open,
        easing: Easing.out(Easing.cubic),
        useNativeDriver,
      }).start();
    });
    return () => cancelAnimationFrame(frame);
  }, [visible, mounted, ready, progress, durations.open]);

  return { mounted, progress };
}

const SHEET_DURATIONS = { open: animation.sheet, close: animation.normal };
const DIALOG_DURATIONS = { open: animation.normal, close: animation.fast };

function OverlayHeader({
  title,
  headerRight,
  inset = true,
}: {
  title?: string;
  headerRight?: React.ReactNode;
  /** Свой боковой отступ (лист). В Dialog отступ уже задан окном. */
  inset?: boolean;
}) {
  const colors = useThemeColors();
  if (!title && !headerRight) return null;
  return (
    <View style={[styles.header, !inset && styles.headerFlush]}>
      <Text variant="h3" accessibilityRole="header" style={[styles.headerTitle, { color: colors.textPrimary }]}>
        {title}
      </Text>
      {headerRight}
    </View>
  );
}

// ==================== Sheet ====================

export interface SheetProps extends OverlayProps {
  /** Контент в ScrollView (по умолчанию). */
  scroll?: boolean;
}

export function Sheet({
  visible,
  onClose,
  dismissOnBackdrop = true,
  title,
  headerRight,
  children,
  footer,
  scroll = true,
  style,
}: SheetProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  // Лист уезжает на свою высоту, а не на высоту экрана: путь короче — движение ровнее.
  // Пока высота не измерена, лист стоит за экраном и анимация не стартует.
  const [sheetHeight, setSheetHeight] = useState(0);
  const { mounted, progress } = useOverlayAnimation(visible, sheetHeight > 0, SHEET_DURATIONS);

  useEffect(() => {
    if (!mounted) setSheetHeight(0);
  }, [mounted]);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const next = Math.ceil(e.nativeEvent.layout.height);
    setSheetHeight((prev) => (Math.abs(prev - next) > 1 ? next : prev));
  }, []);

  if (!mounted) return null;

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight || height, 0] });
  const bottomPadding = Math.max(insets.bottom, spacing.m);

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheetWrapper}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: progress }]}>
            <Pressable
              style={styles.fill}
              onPress={dismissOnBackdrop ? onClose : undefined}
              accessibilityLabel="Закрыть"
              accessible={dismissOnBackdrop}
            />
          </Animated.View>
          <Animated.View
            accessibilityViewIsModal
            onLayout={handleLayout}
            style={[
              styles.sheet,
              { backgroundColor: colors.surface, maxHeight: height * 0.9, transform: [{ translateY }] },
              style,
            ]}
          >
            <View style={[styles.handle, { backgroundColor: alpha(colors.textTertiary, 40) }]} />
            <OverlayHeader title={title} headerRight={headerRight} />
            {scroll ? (
              <ScrollView
                style={styles.body}
                contentContainerStyle={[styles.content, !footer && { paddingBottom: bottomPadding }]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {children}
              </ScrollView>
            ) : (
              <View style={[styles.content, !footer && { paddingBottom: bottomPadding }]}>{children}</View>
            )}
            {footer ? <View style={[styles.footer, { paddingBottom: bottomPadding }]}>{footer}</View> : null}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
      {/* Тосты поверх окна — Modal перекрывает хост приложения */}
      <ToastHost offset={insets.bottom + spacing.xl} />
    </Modal>
  );
}

// ==================== Dialog ====================

export interface DialogProps extends OverlayProps {
  /** center — по центру (по умолчанию); top — у верхнего края (окно серии). */
  placement?: 'center' | 'top';
}

export function Dialog({
  visible,
  onClose,
  dismissOnBackdrop = true,
  title,
  headerRight,
  children,
  footer,
  placement = 'center',
  style,
}: DialogProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { mounted, progress } = useOverlayAnimation(visible, true, DIALOG_DURATIONS);

  if (!mounted) return null;

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[
          styles.fill,
          styles.dialogWrapper,
          placement === 'top' && { justifyContent: 'flex-start', paddingTop: insets.top + spacing.xl },
        ]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: progress }]}>
          <Pressable
            style={styles.fill}
            onPress={dismissOnBackdrop ? onClose : undefined}
            accessibilityLabel="Закрыть"
            accessible={dismissOnBackdrop}
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.dialog,
            { backgroundColor: colors.surface, opacity: progress, transform: [{ scale }] },
            style,
          ]}
        >
          <OverlayHeader title={title} headerRight={headerRight} inset={false} />
          {children}
          {footer ? <View style={styles.dialogFooter}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
      <ToastHost offset={insets.bottom + spacing.xl} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  sheetWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingTop: spacing.xs,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: borderRadius.full,
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: screenPadding,
    paddingTop: spacing.xs,
    paddingBottom: spacing.s,
  },
  headerFlush: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  headerTitle: {
    flex: 1,
  },
  body: {
    flexGrow: 0,
  },
  content: {
    paddingHorizontal: screenPadding,
  },
  footer: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.s,
    gap: spacing.s,
  },
  dialogWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: screenPadding,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    borderRadius: borderRadius.xl,
    padding: spacing.l,
  },
  dialogFooter: {
    marginTop: spacing.l,
    gap: spacing.s,
  },
});
