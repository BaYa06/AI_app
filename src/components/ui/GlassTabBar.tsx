/**
 * GlassTabBar — стеклянная панель вкладок (plan/new/liquid_glass.md, Glass 4.1). Android и веб.
 *
 * Своя панель есть только на iOS (GlassTabBar.ios.tsx). Здесь — обычная панель навигатора,
 * контент под неё не заезжает.
 */
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

export const isGlassTabBarSupported = false;

/** Нижний отступ контента вкладки под плавающую панель (0 — панель не плавающая). */
export function useTabBarOverlayInset(): number {
  return 0;
}

export function GlassTabBar(_props: BottomTabBarProps) {
  return null;
}
