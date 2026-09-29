/**
 * Screen — каркас экрана (брендбук, раздел 4).
 *
 * Фон background, боковой отступ 16, скролл, клавиатура, нижний safe area.
 * Верхний safe area уже учтён в App.tsx — здесь его не добавляем.
 * Внутри вкладок нижний отступ берёт панель вкладок, на остальных экранах — Screen.
 */
import React, { useContext } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useThemeColors } from '@/store';
import { screenPadding, spacing } from '@/constants';

export interface ScreenProps {
  children?: React.ReactNode;
  /** Шапка над контентом — не скроллится. */
  header?: React.ReactNode;
  /** Нижняя панель (главная кнопка) — закреплена под контентом, с safe area. */
  footer?: React.ReactNode;
  /** Контент в ScrollView (по умолчанию). false — обычный View, например для FlatList. */
  scroll?: boolean;
  /** Боковой отступ 16 (по умолчанию). */
  padded?: boolean;
  /** Поднимать контент над клавиатурой (экраны с полями ввода). */
  keyboard?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  scrollRef?: React.Ref<ScrollView>;
  scrollProps?: Omit<ScrollViewProps, 'contentContainerStyle' | 'refreshControl'>;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

/** Нижний отступ экрана: safe area, если снизу нет панели вкладок. */
export function useScreenBottomInset(): number {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  return tabBarHeight === undefined ? insets.bottom : 0;
}

export function Screen({
  children,
  header,
  footer,
  scroll = true,
  padded = true,
  keyboard = false,
  refreshControl,
  scrollRef,
  scrollProps,
  style,
  contentStyle,
}: ScreenProps) {
  const colors = useThemeColors();
  const bottomInset = useScreenBottomInset();
  const horizontal = padded ? { paddingHorizontal: screenPadding } : null;

  const body = scroll ? (
    <ScrollView
      ref={scrollRef}
      style={styles.flex}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
      contentContainerStyle={[
        horizontal,
        // Если есть footer, safe area отдаёт он; иначе — запас снизу под последний блок
        { paddingBottom: footer ? spacing.l : spacing.xl + bottomInset },
        contentStyle,
      ]}
      {...scrollProps}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, horizontal, !footer && { paddingBottom: bottomInset }, contentStyle]}>{children}</View>
  );

  const content = (
    <>
      {body}
      {footer ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(bottomInset, spacing.m), backgroundColor: colors.background },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </>
  );

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }, style]}>
      {header}
      {keyboard ? (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.s,
    gap: spacing.s,
  },
});
