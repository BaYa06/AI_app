/**
 * GlassView — подложка Liquid Glass (plan/new/liquid_glass.md, Glass 1). iOS.
 *
 * На iOS 26 — системное стекло под детьми (ios/FlashcardsApp/GlassView.swift).
 * На iOS < 26 и в сборке без модуля — обычный View с `fallbackColor`, как на Android (GlassView.tsx).
 * Стекло — только для навигации и управления, не для контента; стекло в стекло не кладём.
 * GlassContainer (Glass 2) — соседние GlassView кладём в один контейнер (UIGlassContainerEffect).
 */
import React, { memo } from 'react';
import { UIManager, View, requireNativeComponent, type ViewProps } from 'react-native';
import { useSettingsStore } from '@/store';
import type { GlassContainerProps, GlassViewProps } from './GlassView';

export type { GlassContainerProps, GlassViewProps } from './GlassView';

interface NativeGlassViewProps extends ViewProps {
  tint?: string;
  cornerRadius?: number;
  dark?: boolean;
}

const config = UIManager.hasViewManagerConfig('GlassView') ? (UIManager.getViewManagerConfig('GlassView') as any) : null;

export const isGlassSupported: boolean = !!config?.Constants?.isSupported;

const NativeGlassView = isGlassSupported ? requireNativeComponent<NativeGlassViewProps>('GlassView') : null;
const NativeGlassContainer = isGlassSupported ? requireNativeComponent<GlassContainerProps>('GlassContainer') : null;

export const GlassView = memo(function GlassView({ fallbackColor, tint, cornerRadius = 0, style, ...rest }: GlassViewProps) {
  const dark = useSettingsStore((s) => s.resolvedTheme === 'dark');
  if (!NativeGlassView) {
    return <View {...rest} style={[{ backgroundColor: fallbackColor, borderRadius: cornerRadius }, style]} />;
  }
  return <NativeGlassView {...rest} tint={tint} cornerRadius={cornerRadius} dark={dark} style={[{ borderRadius: cornerRadius }, style]} />;
});

export const GlassContainer = memo(function GlassContainer({ spacing = 0, ...rest }: GlassContainerProps) {
  if (!NativeGlassContainer) return <View {...rest} />;
  return <NativeGlassContainer {...rest} spacing={spacing} />;
});
