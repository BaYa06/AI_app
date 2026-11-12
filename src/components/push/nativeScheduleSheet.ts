/**
 * Нативный лист «Расписание занятий» на iOS (plan/new/teacher_cabinet.md, Teacher 11) —
 * ios/FlashcardsApp/ScheduleSheet.swift. Лист открывается сразу, расписание приходит в него
 * через setLoaded. «Сохранить» → JS сохраняет → finish → тост, когда лист уже закрылся.
 * Ошибку сохранения показывает сам лист (тост под ним не виден).
 * Android, веб и сборки без нативного модуля — RN-окно из CourseScheduleSheet.tsx.
 */
import { useEffect, useRef } from 'react';
import { NativeEventEmitter, NativeModules, Platform, processColor } from 'react-native';
import { useSettingsStore, useThemeColors } from '@/store';
import { toast } from '@/components/ui';
import { WEEK_DAYS } from './AboutMeForm';
import {
  DEFAULT_MINUTES,
  MAX_MINUTES,
  MIN_MINUTES,
  SCHEDULE_TEXTS,
  STEP_MIN,
  loadScheduleForm,
  saveSchedule,
} from './courseSchedule';

interface ScheduleSheetModule {
  present(options: object): void;
  setLoaded(days: string[], minutes: number): void;
  setBusy(busy: boolean): void;
  setError(error: string | null): void;
  finish(): void;
  dismiss(): void;
}

type SheetEvent =
  | { type: 'save'; days: string[]; minutes: number }
  | { type: 'finished' }
  | { type: 'dismiss' };

const native: ScheduleSheetModule | undefined =
  Platform.OS === 'ios' ? NativeModules.ScheduleSheetModule : undefined;
const emitter = native ? new NativeEventEmitter(NativeModules.ScheduleSheetModule) : null;

export const isNativeScheduleSheet = !!native;

// Токены, которые использует ScheduleSheet.swift (SchedulePalette)
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
  courseId: string;
  onClose: () => void;
}

export function useNativeScheduleSheet(options: Options) {
  const colors = useThemeColors();
  const dark = useSettingsStore((s) => s.resolvedTheme === 'dark');
  const latest = useRef({ ...options, colors, dark });
  latest.current = { ...options, colors, dark };
  const shown = useRef(false);
  // Что показать тостом после закрытия листа
  const savedMessage = useRef<string | null>(null);

  useEffect(() => {
    if (!emitter) return;
    const subscription = emitter.addListener('ScheduleSheetEvent', async (event: SheetEvent) => {
      if (!shown.current) return;
      switch (event.type) {
        case 'save': {
          native?.setError(null);
          native?.setBusy(true);
          const ok = await saveSchedule(latest.current.courseId, event.days, event.minutes);
          if (ok) {
            savedMessage.current = event.days.length
              ? SCHEDULE_TEXTS.saved
              : SCHEDULE_TEXTS.removed;
            native?.finish();
          } else {
            native?.setBusy(false);
            native?.setError(SCHEDULE_TEXTS.saveFailed);
          }
          break;
        }
        case 'finished':
          shown.current = false;
          if (savedMessage.current) toast.success(savedMessage.current);
          savedMessage.current = null;
          latest.current.onClose();
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
      savedMessage.current = null;
      const { colors: theme, dark: isDark, courseId } = latest.current;
      native.present({
        texts: SCHEDULE_TEXTS,
        colors: Object.fromEntries(COLOR_KEYS.map((key) => [key, processColor(theme[key])])),
        dark: isDark,
        days: WEEK_DAYS.map((d) => ({ key: d.key, label: d.label })),
        time: { default: DEFAULT_MINUTES, min: MIN_MINUTES, max: MAX_MINUTES, step: STEP_MIN },
      });
      loadScheduleForm(courseId).then(({ days, minutes }) => {
        if (shown.current) native.setLoaded(days, minutes);
      });
    } else if (!options.visible && shown.current) {
      shown.current = false;
      native.dismiss();
    }
  }, [options.visible]);
}
