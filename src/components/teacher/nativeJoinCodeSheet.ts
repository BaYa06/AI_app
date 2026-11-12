/**
 * Нативный лист «Код подключения к курсу» на iOS (plan/new/teacher_cabinet.md, Teacher 10) —
 * ios/FlashcardsApp/JoinCodeSheet.swift. Данные и действия — useCourseJoinCode (общие с RN-окном):
 * JS присылает состояние в update(), Swift — нажатия событиями copy / share / regenerate / dismiss.
 * «Обновить код?» Swift подтверждает системным алертом — RN-окно под нативным листом не видно.
 * Android, веб и сборки без нативного модуля — RN-диалог в CourseJoinCodeDialog.tsx.
 */
import { useEffect, useRef } from 'react';
import { NativeEventEmitter, NativeModules, Platform, processColor } from 'react-native';
import { useSettingsStore, useThemeColors } from '@/store';
import { JOIN_CODE_TEXTS, membersCountLabel, type CourseJoinCodeState } from './useCourseJoinCode';

interface JoinCodeSheetModule {
  present(options: object): void;
  update(state: object): void;
  dismiss(): void;
}

type SheetEvent = { type: 'copy' | 'share' | 'regenerate' | 'dismiss' };

const native: JoinCodeSheetModule | undefined =
  Platform.OS === 'ios' ? NativeModules.JoinCodeSheetModule : undefined;
const emitter = native ? new NativeEventEmitter(NativeModules.JoinCodeSheetModule) : null;

export const isNativeJoinCodeSheet = !!native;

// Токены, которые использует JoinCodeSheet.swift (JoinCodePalette)
const COLOR_KEYS = [
  'surface',
  'surfaceMuted',
  'border',
  'textPrimary',
  'textSecondary',
  'primary',
  'primaryFill',
  'onPrimary',
  'errorText',
] as const;

interface Options {
  visible: boolean;
  onClose: () => void;
  state: CourseJoinCodeState;
  copy: () => void;
  share: () => void;
  regenerate: () => void;
}

/** Состояние для Swift: только то, что он показывает, тексты уже готовые */
function toNative(state: CourseJoinCodeState) {
  return {
    code: state.code,
    loading: state.loading,
    regenerating: state.regenerating,
    copied: state.copied,
    error: state.error,
    membersLabel: state.membersCount === null ? null : membersCountLabel(state.membersCount),
    recent: state.recent,
  };
}

/** Показывает нативный лист, пока `visible`. Ничего не делает, если нативного модуля нет. */
export function useNativeJoinCodeSheet(options: Options) {
  const colors = useThemeColors();
  const dark = useSettingsStore((s) => s.resolvedTheme === 'dark');
  const latest = useRef({ ...options, colors, dark });
  latest.current = { ...options, colors, dark };
  const shown = useRef(false);

  useEffect(() => {
    if (!emitter) return;
    const subscription = emitter.addListener('JoinCodeSheetEvent', (event: SheetEvent) => {
      if (!shown.current) return;
      switch (event.type) {
        case 'copy':
          latest.current.copy();
          break;
        case 'share':
          latest.current.share();
          break;
        case 'regenerate':
          latest.current.regenerate();
          break;
        case 'dismiss':
          shown.current = false;
          latest.current.onClose();
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
      const { colors: theme, dark: isDark, state } = latest.current;
      native.present({
        texts: JOIN_CODE_TEXTS,
        colors: Object.fromEntries(COLOR_KEYS.map((key) => [key, processColor(theme[key])])),
        dark: isDark,
        state: toNative(state),
      });
    } else if (!options.visible && shown.current) {
      shown.current = false;
      native.dismiss();
    }
  }, [options.visible]);

  // Код загрузился, обновился, скопирован, пришли ученики — лист перерисовывается
  useEffect(() => {
    if (native && shown.current) native.update(toNative(options.state));
  }, [options.state]);
}
