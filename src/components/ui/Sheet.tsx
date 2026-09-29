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
import React, { useEffect, useRef, useState } from 'react';
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
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common/Text';
import { alpha, animation, borderRadius, screenPadding, spacing } from '@/constants';

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

/** Монтирует окно на время открытия и анимации закрытия. */
function useOverlayAnimation(visible: boolean) {
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: animation.normal,
        easing: Easing.out(Easing.cubic),
        useNativeDriver,
      }).start();
    } else {
      Animated.timing(progress, {
        toValue: 0,
        duration: animation.fast,
        easing: Easing.in(Easing.cubic),
        useNativeDriver,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, progress]);

  return { mounted, progress };
}

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
  const { mounted, progress } = useOverlayAnimation(visible);

  if (!mounted) return null;

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });
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
    </Modal>
  );
}

// ==================== Dialog ====================

export type DialogProps = OverlayProps;

export function Dialog({
  visible,
  onClose,
  dismissOnBackdrop = true,
  title,
  headerRight,
  children,
  footer,
  style,
}: DialogProps) {
  const colors = useThemeColors();
  const { mounted, progress } = useOverlayAnimation(visible);

  if (!mounted) return null;

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.fill, styles.dialogWrapper]}
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
