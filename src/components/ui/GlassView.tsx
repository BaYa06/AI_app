/**
 * GlassView — подложка Liquid Glass (plan/new/liquid_glass.md, Glass 1). Android и веб.
 *
 * Стекло есть только на iOS 26 (GlassView.ios.tsx). Здесь — обычный View с `fallbackColor`:
 * элемент выглядит как раньше. Стекло — только для навигации и управления, не для контента.
 */
import React, { memo } from 'react';
import { View, type ViewProps } from 'react-native';

export interface GlassViewProps extends ViewProps {
  /** Фон там, где стекла нет (iOS < 26, Android, веб) — прежний вид элемента. */
  fallbackColor: string;
  /** Оттенок стекла, например основной цвет для FAB. */
  tint?: string;
  /** Скругление — и стекла, и фона-заглушки. */
  cornerRadius?: number;
}

export const isGlassSupported = false;

export const GlassView = memo(function GlassView({ fallbackColor, tint: _tint, cornerRadius = 0, style, ...rest }: GlassViewProps) {
  return <View {...rest} style={[{ backgroundColor: fallbackColor, borderRadius: cornerRadius }, style]} />;
});
