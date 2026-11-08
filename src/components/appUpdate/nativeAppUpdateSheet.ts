/**
 * Нативная шторка «Вышла новая версия» на iOS (plan/new/app_update_prompt.md, шаг Update 3).
 *
 * Лист показывает система (UISheetPresentationController) — ios/FlashcardsApp/AppUpdateSheet.swift.
 * Какое окно и когда, решает JS (src/services/appUpdate.ts), Swift только рисует.
 * Только iOS: Android пока не в Google Play, веб всегда свежий. Нет модуля — хук ничего не делает.
 */
import { useEffect, useRef } from 'react';
import { NativeEventEmitter, NativeModules, Platform, processColor } from 'react-native';
import { useSettingsStore, useThemeColors } from '@/store';

interface AppUpdateSheetModule {
  present(options: object): void;
  dismiss(): void;
}

type SheetEvent = { type: 'update' } | { type: 'later' } | { type: 'dismiss' };

const native: AppUpdateSheetModule | undefined =
  Platform.OS === 'ios' ? NativeModules.AppUpdateSheetModule : undefined;
const emitter = native ? new NativeEventEmitter(NativeModules.AppUpdateSheetModule) : null;

export const isNativeAppUpdateSheet = !!native;

// Токены, которые использует шторка (AppUpdatePalette в AppUpdateSheet.swift)
const COLOR_KEYS = [
  'surface',
  'surfaceVariant',
  'textPrimary',
  'textSecondary',
  'textTertiary',
  'primary',
  'primaryFill',
  'onPrimary',
] as const;

export type AppUpdateVariant = 'soft' | 'force';

export interface AppUpdateSheetProps {
  visible: boolean;
  /** Меняется только при закрытом листе: открытый лист вариант не меняет */
  variant: AppUpdateVariant;
  /** Версия на телефоне */
  current: string;
  /** Последняя в магазине; null — без блока версий */
  latest: string | null;
  /**
   * «Обновить». Мягкий лист к этому моменту закрыт — открывай магазин и снимай `visible`.
   * Обязательный остаётся открытым: человек вернётся из магазина, а лист на месте.
   */
  onUpdate: () => void;
  /** Мягкий лист закрыт: `later` — кнопкой «Позже», `dismiss` — свайпом вниз */
  onClose: (reason: 'later' | 'dismiss') => void;
}

/** Показывает нативную шторку, пока `visible`. Ничего не делает, если нативного модуля нет. */
export function useNativeAppUpdateSheet(options: AppUpdateSheetProps) {
  const colors = useThemeColors();
  const dark = useSettingsStore((s) => s.resolvedTheme === 'dark');
  const latest = useRef({ ...options, colors, dark });
  latest.current = { ...options, colors, dark };
  const shown = useRef(false);

  useEffect(() => {
    if (!emitter) return;
    const subscription = emitter.addListener('AppUpdateSheetEvent', (event: SheetEvent) => {
      if (!shown.current) return;
      const { variant, onUpdate, onClose } = latest.current;
      switch (event.type) {
        case 'update':
          if (variant !== 'force') shown.current = false;
          onUpdate();
          break;
        case 'later':
        case 'dismiss':
          shown.current = false;
          onClose(event.type);
          break;
      }
    });
    return () => {
      subscription.remove();
      if (shown.current) native?.dismiss();
    };
  }, []);

  useEffect(() => {
    if (!native) return;
    if (options.visible && !shown.current) {
      shown.current = true;
      const { variant, current, latest: newest, colors: theme, dark: isDark } = latest.current;
      native.present({
        variant,
        current,
        latest: newest ?? '',
        colors: Object.fromEntries(COLOR_KEYS.map((key) => [key, processColor(theme[key])])),
        dark: isDark,
      });
    } else if (!options.visible && shown.current) {
      shown.current = false;
      native.dismiss();
    }
  }, [options.visible]);
}
