/**
 * Нативное окно «Новый курс» на iOS (plan/new/teacher_cabinet.md, Teacher 7) —
 * ios/FlashcardsApp/NewCourseSheet.swift. Лист показывает система, как шторку режимов
 * (nativeStudyModeSheet.ts). Swift только показывает форму и присылает «create»; курс, учебник
 * и расписание сохраняет createCourseWithSetup — та же логика, что у RN-окна.
 * Android, веб и сборки без нативного модуля — RN-окно из NewCourseSheet.tsx.
 */
import { useEffect, useRef } from 'react';
import { NativeEventEmitter, NativeModules, Platform, processColor } from 'react-native';
import { useSettingsStore, useThemeColors } from '@/store';
import { toast } from '@/components/ui';
import { WEEK_DAYS } from '@/components/push/AboutMeForm';
import {
  DEFAULT_MINUTES,
  MAX_MINUTES,
  MIN_MINUTES,
  STEP_MIN,
  toTime,
} from '@/components/push/CourseScheduleSheet';
import type { Course } from '@/types';
import {
  NEW_COURSE_SEARCH_FROM,
  NEW_COURSE_TEXTS,
  bookSubtitle,
  createCourseWithSetup,
  loadBooksForNewCourse,
  newCourseProblemMessage,
} from './newCourse';

interface NewCourseSheetModule {
  present(options: object): void;
  setBooks(books: object[]): void;
  setBusy(busy: boolean): void;
  finish(): void;
  dismiss(): void;
}

type SheetEvent =
  | { type: 'create'; title: string; bookId: string | null; days: string[]; minutes: number }
  | { type: 'finished' }
  | { type: 'dismiss' };

const native: NewCourseSheetModule | undefined =
  Platform.OS === 'ios' ? NativeModules.NewCourseSheetModule : undefined;
const emitter = native ? new NativeEventEmitter(NativeModules.NewCourseSheetModule) : null;

export const isNativeNewCourseSheet = !!native;

// Токены, которые использует NewCourseSheet.swift (NewCoursePalette)
const COLOR_KEYS = [
  'surface',
  'surfaceMuted',
  'border',
  'textPrimary',
  'textSecondary',
  'textTertiary',
  'primary',
  'primaryFill',
  'onPrimary',
] as const;

interface Options {
  visible: boolean;
  onClose: () => void;
  onCreated: (course: Course) => void;
}

/** Показывает нативное окно, пока `visible`. Ничего не делает, если нативного модуля нет. */
export function useNativeNewCourseSheet(options: Options) {
  const colors = useThemeColors();
  const dark = useSettingsStore((s) => s.resolvedTheme === 'dark');
  const latest = useRef({ ...options, colors, dark });
  latest.current = { ...options, colors, dark };
  const shown = useRef(false);
  // Созданный курс ждёт, пока лист закроется: тост и код подключения под листом не видны
  const created = useRef<{ course: Course; message: string | null } | null>(null);

  useEffect(() => {
    if (!emitter) return;
    const subscription = emitter.addListener('NewCourseSheetEvent', async (event: SheetEvent) => {
      if (!shown.current) return;
      switch (event.type) {
        case 'create': {
          native?.setBusy(true);
          try {
            const { course, problems } = await createCourseWithSetup({
              title: event.title,
              bookId: event.bookId,
              days: event.days,
              time: toTime(event.minutes),
            });
            created.current = { course, message: newCourseProblemMessage(problems) };
            native?.finish();
          } catch {
            native?.setBusy(false);
            toast.error('Не удалось создать курс. Попробуй ещё раз');
          }
          break;
        }
        case 'finished': {
          shown.current = false;
          const result = created.current;
          created.current = null;
          if (!result) {
            latest.current.onClose();
            break;
          }
          if (result.message) toast.info(result.message);
          else toast.success(`Курс «${result.course.title}» создан`);
          latest.current.onCreated(result.course);
          break;
        }
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
      created.current = null;
      const { colors: theme, dark: isDark } = latest.current;
      native.present({
        texts: NEW_COURSE_TEXTS,
        colors: Object.fromEntries(COLOR_KEYS.map((key) => [key, processColor(theme[key])])),
        dark: isDark,
        days: WEEK_DAYS.map((d) => ({ key: d.key, label: d.label })),
        time: { default: DEFAULT_MINUTES, min: MIN_MINUTES, max: MAX_MINUTES, step: STEP_MIN },
        searchFrom: NEW_COURSE_SEARCH_FROM,
      });
      loadBooksForNewCourse().then((books) => {
        if (!shown.current) return;
        native.setBooks(
          books.map((b) => ({ id: b.id, title: b.title, subtitle: bookSubtitle(b) }))
        );
      });
    } else if (!options.visible && shown.current) {
      shown.current = false;
      native.dismiss();
    }
  }, [options.visible]);
}
