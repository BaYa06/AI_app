/**
 * BottomBar — плавающая нижняя панель с кнопками поверх прокрутки (plan/new/liquid_glass.md, Glass 6).
 *
 * iOS 26 — стеклянная подложка; iOS < 26 и Android — фон background; веб — градиент снизу вверх.
 * Положение и отступы задаёт экран через `style`. Кнопки внутри — обычные, без своего стекла.
 */
import React from 'react';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { useThemeColors } from '@/store';
import { GlassView, isGlassSupported } from './GlassView';

export interface BottomBarProps extends ViewProps {
  /** Фон без стекла (по умолчанию background). */
  color?: string;
  /** Веб: до какой высоты (в %) градиент непрозрачный. */
  webFade?: number;
}

export function BottomBar({ color, webFade = 60, style, children, ...rest }: BottomBarProps) {
  const colors = useThemeColors();
  const background = color ?? colors.background;
  const fill =
    Platform.OS === 'web'
      ? ({ background: `linear-gradient(to top, ${background} ${webFade}%, transparent)` } as any)
      : isGlassSupported
        ? null
        : { backgroundColor: background };

  return (
    <View {...rest} style={[fill, style]}>
      {isGlassSupported ? (
        <GlassView pointerEvents="none" fallbackColor={background} style={StyleSheet.absoluteFill} />
      ) : null}
      {children}
    </View>
  );
}
