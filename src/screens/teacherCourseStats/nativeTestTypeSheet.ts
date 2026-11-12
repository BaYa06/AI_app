/**
 * Нативный лист «Выбери тип теста» на iOS (plan/new/teacher_cabinet.md, Teacher 11) —
 * ios/FlashcardsApp/TestTypeSheet.swift. Выбор приходит, когда лист уже закрылся, — переход
 * на экзамен или устный тренажёр без рывка анимации.
 * Android, веб и сборки без нативного модуля — RN-шторка из TestLobbySheet.tsx.
 */
import { useEffect, useRef } from 'react';
import { NativeEventEmitter, NativeModules, Platform, processColor } from 'react-native';
import { useSettingsStore, useThemeColors } from '@/store';
import { TEST_TYPE_TEXTS, type TestKind } from './testType';

interface TestTypeSheetModule {
  present(options: object): void;
  dismiss(): void;
}

type SheetEvent = { type: 'select'; kind: TestKind } | { type: 'dismiss' };

const native: TestTypeSheetModule | undefined =
  Platform.OS === 'ios' ? NativeModules.TestTypeSheetModule : undefined;
const emitter = native ? new NativeEventEmitter(NativeModules.TestTypeSheetModule) : null;

export const isNativeTestTypeSheet = !!native;

// Токены, которые использует TestTypeSheet.swift (TestTypePalette)
const COLOR_KEYS = [
  'surface',
  'surfaceMuted',
  'textPrimary',
  'textSecondary',
  'textTertiary',
  'primary',
  'primaryFill',
  'onPrimary',
  'streak',
] as const;

interface Options {
  visible: boolean;
  onClose: () => void;
  onSelect: (kind: TestKind) => void;
}

export function useNativeTestTypeSheet(options: Options) {
  const colors = useThemeColors();
  const dark = useSettingsStore((s) => s.resolvedTheme === 'dark');
  const latest = useRef({ ...options, colors, dark });
  latest.current = { ...options, colors, dark };
  const shown = useRef(false);

  useEffect(() => {
    if (!emitter) return;
    const subscription = emitter.addListener('TestTypeSheetEvent', (event: SheetEvent) => {
      if (!shown.current) return;
      shown.current = false;
      latest.current.onClose();
      if (event.type === 'select') latest.current.onSelect(event.kind);
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
      const { colors: theme, dark: isDark } = latest.current;
      native.present({
        texts: TEST_TYPE_TEXTS,
        colors: Object.fromEntries(COLOR_KEYS.map((key) => [key, processColor(theme[key])])),
        dark: isDark,
      });
    } else if (!options.visible && shown.current) {
      shown.current = false;
      native.dismiss();
    }
  }, [options.visible]);
}
