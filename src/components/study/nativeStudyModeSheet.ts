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
import { useCardsStore, useSettingsStore, useThemeColors } from '@/store';
import type { SetSheetSession, StudyMode, StudyModeGame, StudyModeSettings, WordLimit } from './StudyModeSheet';
import { sessionSheetMeta, sessionSheetStages, sessionSheetText } from './sessionSheetText';

interface StudyModeSheetModule {
  present(options: object): void;
  dismiss(): void;
}

type SheetEvent =
  | { type: 'onlyHard'; value: boolean }
  | { type: 'wordLimit'; value: WordLimit }
  | { type: 'select'; mode: StudyMode }
  // Шторка набора (plan/new/study_session.md, Session 12): кнопка сессии и «Добавить слова»
  | { type: 'start' }
  | { type: 'addWords' }
  | { type: 'dismiss' };

const native: StudyModeSheetModule | undefined =
  Platform.OS === 'ios' ? NativeModules.StudyModeSheetModule : undefined;
const emitter = native ? new NativeEventEmitter(NativeModules.StudyModeSheetModule) : null;

export const isNativeStudyModeSheet = !!native;

// Токены, которые использует нативная шторка (StudyModeSheet.swift: кнопка сессии, режимы, Chip)
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
  /** Вся свободная практика: Карточки и режимы */
  games: StudyModeGame[];
  settings: StudyModeSettings;
  /** Есть — шторка набора с кнопкой сессии; нет — главная, только свободная практика */
  setSession?: SetSheetSession;
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
      const { settings, onClose, onSelectMode, setSession } = latest.current;
      switch (event.type) {
        case 'onlyHard':
          if (event.value !== settings.onlyHard) settings.onToggleOnlyHard();
          break;
        case 'wordLimit':
          settings.onSelectWordLimit(event.value);
          break;
        case 'select':
          shown.current = false;
          onSelectMode(event.mode);
          onClose();
          break;
        case 'start':
          shown.current = false;
          if (setSession) setSession.onStart();
          else onClose();
          break;
        case 'addWords':
          shown.current = false;
          if (setSession) setSession.onAddWords();
          else onClose();
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
      const { subtitle, games, settings, setSession, colors: theme, dark: isDark } = latest.current;
      // Тексты кнопки сессии считает JS (sessionSheetText) — Swift только показывает
      const plan = setSession?.info.plan;
      const cardsMap = useCardsStore.getState().cards;
      native.present({
        title: setSession ? setSession.title : 'Свободная практика',
        subtitle: plan ? sessionSheetMeta(plan) : subtitle,
        home: !setSession,
        noWords: plan?.mode === 'empty',
        session: plan ? sessionSheetText(plan, sessionSheetStages(plan, cardsMap)) : null,
        games: games.map(({ mode, title, tag, description }) => ({ mode, title, tag, description })),
        settings: { onlyHard: settings.onlyHard, wordLimit: settings.wordLimit },
        colors: Object.fromEntries(COLOR_KEYS.map((key) => [key, processColor(theme[key])])),
        dark: isDark,
      });
    } else if (!options.visible && shown.current) {
      shown.current = false;
      native.dismiss();
    }
  }, [options.visible]);
}
