/**
 * Нативная шторка выбора режима на iOS (plan/new/liquid_glass.md, шаг Glass 0).
 *
 * RN-шторка ехала рывками: её положение каждый кадр выставляет главный поток, занятый созданием
 * содержимого. На iOS лист показывает система (UISheetPresentationController) —
 * ios/FlashcardsApp/StudyModeSheet.swift. Настройки шторка меняет сама и сообщает о каждом
 * изменении событием, выбор режима приходит после закрытия листа.
 * Android, веб и сборки без нативного модуля — RN-шторка из StudyModeSheet.tsx.
 */
import { useEffect, useRef } from 'react';
import { NativeEventEmitter, NativeModules, Platform, processColor } from 'react-native';
import { useSettingsStore, useThemeColors } from '@/store';
import type { StudyMode, StudyModeGame, StudyModeSettings, WordLimit } from './StudyModeSheet';

interface StudyModeSheetModule {
  present(options: object): void;
  dismiss(): void;
}

type SheetEvent =
  | { type: 'onlyHard' | 'showMnemonic'; value: boolean }
  | { type: 'wordLimit'; value: WordLimit }
  | { type: 'select'; mode: StudyMode }
  | { type: 'dismiss' };

const native: StudyModeSheetModule | undefined =
  Platform.OS === 'ios' ? NativeModules.StudyModeSheetModule : undefined;
const emitter = native ? new NativeEventEmitter(NativeModules.StudyModeSheetModule) : null;

export const isNativeStudyModeSheet = !!native;

// Токены, которые использует шторка (StudyModeSheet, GameRow, RecommendedModeCard, Chip)
const COLOR_KEYS = [
  'surface', 'surfaceMuted', 'border', 'textPrimary', 'textSecondary', 'textTertiary',
  'primary', 'primaryFill', 'onPrimary', 'ratingAgain', 'ratingHard', 'ratingEasy', 'ratingGood',
  'errorText', 'warningText', 'info', 'successText',
] as const;

interface Options {
  visible: boolean;
  onClose: () => void;
  subtitle: string;
  onSelectMode: (mode: StudyMode) => void;
  games: StudyModeGame[];
  settings: StudyModeSettings;
}

/** Показывает нативную шторку, пока `visible`. Ничего не делает, если нативного модуля нет. */
export function useNativeStudyModeSheet(options: Options) {
  const colors = useThemeColors();
  const dark = useSettingsStore((s) => s.resolvedTheme === 'dark');
  const latest = useRef({ ...options, colors, dark });
  latest.current = { ...options, colors, dark };
  // Шторку открыл этот экземпляр: события получают все подписчики (главная и набор живут в стеке)
  const shown = useRef(false);

  useEffect(() => {
    if (!emitter) return;
    const subscription = emitter.addListener('StudyModeSheetEvent', (event: SheetEvent) => {
      if (!shown.current) return;
      const { settings, onClose, onSelectMode } = latest.current;
      switch (event.type) {
        case 'onlyHard':
          if (event.value !== settings.onlyHard) settings.onToggleOnlyHard();
          break;
        case 'showMnemonic':
          if (event.value !== settings.showMnemonic) settings.onToggleShowMnemonic();
          break;
        case 'wordLimit':
          settings.onSelectWordLimit(event.value);
          break;
        case 'select':
          shown.current = false;
          onSelectMode(event.mode);
          onClose();
          break;
        case 'dismiss':
          shown.current = false;
          onClose();
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
      const { subtitle, games, settings, colors: theme, dark: isDark } = latest.current;
      native.present({
        subtitle,
        games: games.map(({ mode, title, tag, description }) => ({ mode, title, tag, description })),
        settings: { onlyHard: settings.onlyHard, showMnemonic: settings.showMnemonic, wordLimit: settings.wordLimit },
        colors: Object.fromEntries(COLOR_KEYS.map((key) => [key, processColor(theme[key])])),
        dark: isDark,
      });
    } else if (!options.visible && shown.current) {
      shown.current = false;
      native.dismiss();
    }
  }, [options.visible]);
}
