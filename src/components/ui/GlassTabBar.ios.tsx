/**
 * GlassTabBar — стеклянная панель вкладок (plan/new/liquid_glass.md, Glass 4.1). iOS.
 *
 * Плавающая капсула в тёмной теме: контент вкладки виден и размыт под ней, активная вкладка —
 * светлый стеклянный «пузырь», который перетекает к новой вкладке. Рисует Swift
 * (ios/FlashcardsApp/GlassTabBar.swift): iOS 26 — системное стекло, iOS < 26 — размытие.
 * Вкладки с `tabBarItemStyle: { display: 'none' }` в панели не показываются.
 */
import React from 'react';
import {
  StyleSheet,
  UIManager,
  requireNativeComponent,
  type NativeSyntheticEvent,
  type ViewProps,
} from 'react-native';
import { CommonActions } from '@react-navigation/native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { screenPadding, spacing } from '@/constants';

interface TabItem {
  key: string;
  title: string;
  symbol: string;
}

interface NativeProps extends ViewProps {
  items: TabItem[];
  selectedKey?: string;
  onTabPress: (event: NativeSyntheticEvent<{ key: string }>) => void;
}

export const isGlassTabBarSupported = UIManager.hasViewManagerConfig('GlassTabBar');

const NativeGlassTabBar = isGlassTabBarSupported ? requireNativeComponent<NativeProps>('GlassTabBar') : null;

/** Иконки вкладок — SF Symbols (в Android-панели те же вкладки рисует Ionicons) */
const SYMBOLS: Record<string, string> = {
  Home: 'house.fill',
  Library: 'square.stack.fill',
  TestTab: 'qrcode',
  Study: 'graduationcap.fill',
  Statistics: 'chart.bar.fill',
  Profile: 'person.fill',
};

const BAR_HEIGHT = 62;

/** Капсула висит над «полоской Home», на устройствах без неё — в 12 от края */
function barBottom(safeBottom: number) {
  return Math.max(safeBottom - spacing.xs, spacing.s);
}

/** Нижний отступ контента вкладки: чтобы последний блок можно было прокрутить выше панели. */
export function useTabBarOverlayInset(): number {
  const insets = useSafeAreaInsets();
  return isGlassTabBarSupported ? barBottom(insets.bottom) + BAR_HEIGHT + spacing.s : 0;
}

export function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  if (!NativeGlassTabBar) return null;

  const items: TabItem[] = state.routes
    .filter((route) => (descriptors[route.key].options.tabBarItemStyle as { display?: string } | undefined)?.display !== 'none')
    .map((route) => {
      const { options } = descriptors[route.key];
      const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : options.title ?? route.name;
      return { key: route.key, title: label, symbol: SYMBOLS[route.name] ?? 'circle.fill' };
    });

  // Как в стандартной панели @react-navigation/bottom-tabs: событие tabPress, затем переход
  const handleTabPress = (event: NativeSyntheticEvent<{ key: string }>) => {
    const route = state.routes.find((r) => r.key === event.nativeEvent.key);
    if (!route) return;
    const focused = state.routes[state.index].key === route.key;
    const pressEvent = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !pressEvent.defaultPrevented) {
      navigation.dispatch({ ...CommonActions.navigate({ name: route.name, merge: true }), target: state.key });
    }
  };

  return (
    <NativeGlassTabBar
      items={items}
      selectedKey={state.routes[state.index].key}
      onTabPress={handleTabPress}
      style={[styles.bar, { bottom: barBottom(insets.bottom) }]}
    />
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: screenPadding,
    right: screenPadding,
    height: BAR_HEIGHT,
  },
});
