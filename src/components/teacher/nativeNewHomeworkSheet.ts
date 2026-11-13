/**
 * Нативные окна «Новое задание» и «Слова для задания» на iOS (plan/new/teacher_cabinet.md, Teacher 20) —
 * ios/FlashcardsApp/NewHomeworkSheet.swift. Лист показывает система, как шторку режимов
 * (nativeStudyModeSheet.ts). Swift показывает форму и присылает «create»; задание создаёт
 * createHomework — та же логика, что у RN-окна. Android, веб и сборки без модуля — RN-окна.
 */
import { useEffect, useRef } from 'react';
import { NativeEventEmitter, NativeModules, Platform, processColor } from 'react-native';
import { useSettingsStore, useThemeColors } from '@/store';
import { toast } from '@/components/ui';
import { TEACHER_LESSON_PREP_ENABLED } from '@/config/features';
import {
  HOMEWORK_MANY_WORDS,
  HOMEWORK_PART_WORDS,
  MIN_SCORE_OPTIONS,
  MINUTES_PER_SESSION,
  WORDS_PER_SESSION,
} from '@/services/homework';
import { NeonService } from '@/services/NeonService';
import { pluralize } from '@/utils';
import {
  DEFAULT_MIN_SCORE,
  DUE_MAX_DAYS,
  NEW_HOMEWORK_TEXTS as T,
  createHomework,
  dayAt,
  duePresets,
  homeworkFormStart,
  homeworkTasks,
  type HomeworkWords,
} from './newHomework';
import { WORD_PICKER_TEXTS as W, type PickerSet } from './wordPicker';
import { useCoursePickerSets } from './useCoursePickerSets';
import type { NewHomeworkSheetProps } from './NewHomeworkSheet';

interface NewHomeworkSheetModule {
  present(options: object): void;
  setSets(sets: object[]): void;
  /** Трудные слова группы для типа «Повторить трудные» (Teacher 43); в старой сборке метода нет */
  setHardCards?(cardIds: string[]): void;
  setBusy(busy: boolean): void;
  setError(message: string | null): void;
  finish(): void;
  dismiss(): void;
}

type SheetEvent =
  | {
      type: 'create';
      cardIds: string[];
      due: number;
      minScore: number;
      userIds: string[] | null;
      /** Тип задания; сборка со старым Swift поле не шлёт */
      task?: string;
    }
  | { type: 'finished' }
  | { type: 'dismiss' };

const native: NewHomeworkSheetModule | undefined =
  Platform.OS === 'ios' ? NativeModules.NewHomeworkSheetModule : undefined;
const emitter = native ? new NativeEventEmitter(NativeModules.NewHomeworkSheetModule) : null;

export const isNativeNewHomeworkSheet = !!native;

// Токены, которые использует NewHomeworkSheet.swift (HwPalette)
const COLOR_KEYS = [
  'surface',
  'surfaceMuted',
  'border',
  'borderLight',
  'textPrimary',
  'textSecondary',
  'textTertiary',
  'primary',
  'primaryFill',
  'onPrimary',
  'homework',
  'homeworkText',
  'warningText',
  'errorText',
] as const;

/** Тексты для Swift: строки окон + формы слов (в Swift строк нет — только правило числа) */
export const NATIVE_HOMEWORK_TEXTS = {
  ...T,
  close: 'Закрыть',
  assign: 'Задать',
  pickedPrefix: 'Выбрано:',
  moreSets: '+ ещё',
  minutes: 'мин',
  allPrefix: 'все',
  ofWord: 'из',
  inPrefix: 'через',
  pickerTitle: W.title,
  search: W.search,
  setsLabel: W.setsLabel,
  footnote: W.footnote,
  empty: W.empty,
  manyTitle: W.manyTitle,
  manyPrefix: 'До срока это',
  manySuffix: 'в день. Можно задать часть, остальное — следующим заданием.',
  takePart: W.takePart,
  pickHint: W.pickHint,
  selectedPrefix: 'Выбрано',
  selectAll: W.selectAll,
  clearAll: W.clearAll,
  wordForms: ['слово', 'слова', 'слов'],
  sessionForms: ['сессия', 'сессии', 'сессий'],
  dayForms: ['день', 'дня', 'дней'],
  studentForms: ['ученик', 'ученика', 'учеников'],
  studentDative: ['ученику', 'ученикам', 'ученикам'],
};

/** Слова из Swift → HomeworkWords (наборы — для названия задания) */
export function wordsFromIds(sets: PickerSet[], cardIds: string[]): HomeworkWords {
  const chosen = new Set(cardIds);
  const used = sets.filter((s) => s.words.some((w) => chosen.has(w.id)));
  const ordered = used.flatMap((s) => s.words.filter((w) => chosen.has(w.id)).map((w) => w.id));
  return { cardIds: ordered, sets: used.map((s) => ({ id: s.id, title: s.title })) };
}

/** Показывает нативное окно, пока `visible`. Ничего не делает, если нативного модуля нет. */
export function useNativeNewHomeworkSheet(props: NewHomeworkSheetProps) {
  const colors = useThemeColors();
  const dark = useSettingsStore((s) => s.resolvedTheme === 'dark');
  const sets = useCoursePickerSets(props.courseId, !!native && props.visible);
  const latest = useRef({ ...props, colors, dark, sets });
  latest.current = { ...props, colors, dark, sets };
  const shown = useRef(false);
  const created = useRef<{ id: string; students: number } | null>(null);

  useEffect(() => {
    if (!emitter) return;
    const subscription = emitter.addListener('NewHomeworkSheetEvent', async (event: SheetEvent) => {
      if (!shown.current) return;
      switch (event.type) {
        case 'create': {
          native?.setError(null);
          native?.setBusy(true);
          const current = latest.current;
          const res = await createHomework({
            courseId: current.courseId,
            words: wordsFromIds(current.sets ?? [], event.cardIds),
            due: new Date(event.due),
            minScore: event.minScore < 0 ? null : event.minScore,
            userIds: event.userIds,
            task: event.task === 'hard' ? 'hard' : 'learn',
          });
          if (res.ok) {
            created.current = {
              id: res.id,
              students: event.userIds?.length ?? current.students.length,
            };
            native?.finish();
          } else {
            native?.setBusy(false);
            native?.setError(res.message);
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
          toast.success(
            `Задание выдано: ${result.students} ${pluralize(result.students, 'ученик', 'ученика', 'учеников')}`
          );
          latest.current.onCreated(result.id);
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
    if (props.visible && !shown.current) {
      shown.current = true;
      created.current = null;
      const {
        colors: theme,
        dark: isDark,
        schedule,
        students,
        initialWords,
        preset,
        courseTitle,
      } = latest.current;
      const now = new Date();
      const taskKeys = homeworkTasks(TEACHER_LESSON_PREP_ENABLED);
      // Готовые слова, ученики и срок (Teacher 42)
      const start = homeworkFormStart({
        now,
        schedule,
        initialWords,
        preset,
        studentIds: students.map((s) => s.id),
        tasks: taskKeys,
      });
      native.present({
        texts: NATIVE_HOMEWORK_TEXTS,
        colors: Object.fromEntries(COLOR_KEYS.map((key) => [key, processColor(theme[key])])),
        dark: isDark,
        courseTitle,
        students: students.map((s) => ({ id: s.id, name: s.displayName })),
        tasks: [
          { key: 'learn', title: T.taskLearn, sub: '' },
          ...(taskKeys.includes('hard')
            ? [{ key: 'hard', title: T.taskHard, sub: T.taskHardHint }]
            : []),
        ],
        task: start.task,
        userIds: start.userIds,
        scores: MIN_SCORE_OPTIONS.map((s) => s ?? -1),
        minScore: DEFAULT_MIN_SCORE,
        presets: duePresets(now, schedule).map((p) => ({
          key: p.key,
          label: p.label,
          date: p.date.getTime(),
        })),
        hasSchedule: !!schedule?.length,
        due: start.due.getTime(),
        minDate: now.getTime(),
        maxDate: dayAt(now, DUE_MAX_DAYS, 23, 55).getTime(),
        cardIds: start.words?.cardIds ?? [],
        wordsPerSession: WORDS_PER_SESSION,
        minutesPerSession: MINUTES_PER_SESSION,
        manyWords: HOMEWORK_MANY_WORDS,
        partWords: HOMEWORK_PART_WORDS,
      });
    } else if (!props.visible && shown.current) {
      shown.current = false;
      native.dismiss();
    }
  }, [props.visible]);

  // Наборы со словами — в открытое окно, как только загрузились
  useEffect(() => {
    if (!native || !shown.current || !sets) return;
    native.setSets(sets.map((s) => ({ id: s.id, title: s.title, words: s.words })));
  }, [sets, props.visible]);

  // Трудные слова группы — для типа «Повторить трудные» (Teacher 43): Swift отметит их при выборе типа
  useEffect(() => {
    if (!native?.setHardCards || !props.visible || !TEACHER_LESSON_PREP_ENABLED) return;
    let cancelled = false;
    NeonService.loadCourseHardCards(props.courseId).then((hard) => {
      if (!cancelled && shown.current && hard) native.setHardCards?.(hard.map((c) => c.cardId));
    });
    return () => {
      cancelled = true;
    };
  }, [props.visible, props.courseId]);
}
