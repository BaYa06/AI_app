/**
 * Нативная шторка «Что нового» на iOS (plan/new/whats_new.md, шаг News 2).
 *
 * Лист показывает система (UISheetPresentationController) — ios/FlashcardsApp/WhatsNewSheet.swift.
 * Какие страницы показать, решает JS (src/services/whatsNew.ts), Swift только рисует их.
 * Android, веб и сборки без нативного модуля — RN-окно (News 2.1).
 */
import { useEffect, useRef } from 'react';
import { NativeEventEmitter, NativeModules, Platform, processColor } from 'react-native';
import { useSettingsStore, useThemeColors } from '@/store';
import { toSheetPages } from '@/services/whatsNew';
import type { WhatsNewItem, WhatsNewPage } from '@/types/whatsNew';

interface WhatsNewSheetModule {
  present(options: object): void;
  dismiss(): void;
}

type SheetEvent =
  | { type: 'page'; index: number }
  | { type: 'try'; index: number }
  | { type: 'close'; index: number };

const native: WhatsNewSheetModule | undefined =
  Platform.OS === 'ios' ? NativeModules.WhatsNewSheetModule : undefined;
const emitter = native ? new NativeEventEmitter(NativeModules.WhatsNewSheetModule) : null;

export const isNativeWhatsNewSheet = !!native;

// Токены, которые использует шторка (WhatsNewPalette в WhatsNewSheet.swift)
const COLOR_KEYS = [
  'surface', 'surfaceMuted', 'surfaceVariant', 'border', 'textPrimary', 'textSecondary', 'textTertiary',
  'primary', 'primaryFill', 'onPrimary', 'error', 'errorText', 'warningText', 'success', 'successText',
  'streak', 'like', 'gameViolet', 'gameRose', 'gameTeal', 'gameGreen',
] as const;

export interface WhatsNewCloseResult {
  /** На какой странице закрыли */
  index: number;
  /** Нажали «Попробовать» у этой новости — окно уже закрыто, можно переходить */
  tryItem?: WhatsNewItem;
}

interface Options {
  visible: boolean;
  /** Версия в надписи «ЧТО НОВОГО · 1.6.9» */
  version: string;
  pages: WhatsNewPage[];
  onPage?: (index: number) => void;
  onClose: (result: WhatsNewCloseResult) => void;
}

/** Показывает нативную шторку, пока `visible`. Ничего не делает, если нативного модуля нет. */
export function useNativeWhatsNewSheet(options: Options) {
  const colors = useThemeColors();
  const dark = useSettingsStore((s) => s.resolvedTheme === 'dark');
  const latest = useRef({ ...options, colors, dark });
  latest.current = { ...options, colors, dark };
  const shown = useRef(false);

  useEffect(() => {
    if (!emitter) return;
    const subscription = emitter.addListener('WhatsNewSheetEvent', (event: SheetEvent) => {
      if (!shown.current) return;
      const { pages, onPage, onClose } = latest.current;
      switch (event.type) {
        case 'page':
          onPage?.(event.index);
          break;
        case 'try': {
          shown.current = false;
          const page = pages[event.index];
          onClose({ index: event.index, tryItem: page?.kind === 'item' ? page.item : undefined });
          break;
        }
        case 'close':
          shown.current = false;
          onClose({ index: event.index });
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
    if (options.visible && !shown.current && options.pages.length > 0) {
      shown.current = true;
      const { version, pages, colors: theme, dark: isDark } = latest.current;
      native.present({
        version,
        pages: toSheetPages(pages),
        colors: Object.fromEntries(COLOR_KEYS.map((key) => [key, processColor(theme[key])])),
        dark: isDark,
      });
    } else if (!options.visible && shown.current) {
      shown.current = false;
      native.dismiss();
    }
  }, [options.visible]);
}
