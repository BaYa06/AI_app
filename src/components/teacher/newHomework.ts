/**
 * Окно «Новое задание» (plan/new/teacher_cabinet.md, Teacher 18–20): правила и тексты — общие для
 * RN-окна (Android, веб) и Swift-окна (iOS). В Swift строк нет — всё из NEW_HOMEWORK_TEXTS.
 */
import { NeonService, type TeacherApiReason } from '@/services/NeonService';
import { Analytics } from '@/services/analytics';
import { DEFAULT_MIN_SCORE } from '@/services/homework';
import { getNextLesson, type ScheduleItem } from '@/utils/nextLesson';
import { pluralize } from '@/utils';

export interface HomeworkWords {
  cardIds: string[];
  /** Наборы, из которых слова (для названия задания и строки «Ünite 5 · 50 слов») */
  sets: Array<{ id: string; title: string }>;
}

/** Тип задания: выучить / тест дома (отложен) / повторить трудные (Teacher 43) */
export type HomeworkTask = 'learn' | 'test' | 'hard';

/**
 * Готовые значения окна «Новое задание» (Teacher 42): слова, ученики и срок — например, из итогов
 * разминки. Учитель может всё поменять перед «Задать».
 */
export interface HomeworkPreset {
  words: HomeworkWords;
  /** null — вся группа */
  userIds: string[] | null;
  /** null — срок по умолчанию (к уроку или через 3 дня) */
  due: Date | null;
  task?: HomeworkTask;
}

export interface NewHomeworkInput {
  courseId: string;
  words: HomeworkWords;
  due: Date;
  /** null — без порога */
  minScore: number | null;
  /** null — вся группа */
  userIds: string[] | null;
}

/** Срок по умолчанию и у быстрых вариантов — в 20:00 (как в макете) */
export const DEFAULT_DUE_HOUR = 20;
export const DUE_MINUTE_STEP = 5;
/** Сколько дней вперёд в барабане */
export const DUE_MAX_DAYS = 60;

export const NEW_HOMEWORK_TEXTS = {
  title: 'Новое задание',
  whoLabel: 'Кому',
  whoAll: 'Вся группа',
  whoPick: 'Выбрать учеников',
  wordsLabel: 'Слова',
  wordsPick: 'Выбрать слова',
  taskLabel: 'Что сделать',
  taskLearn: 'Выучить все слова',
  taskTest: 'Пройти тест',
  taskTestHint: '20 вопросов, одна попытка',
  taskHard: 'Повторить трудные',
  taskHardHint: 'Трудные слова группы',
  dueLabel: 'Срок',
  duePrefix: 'до:',
  dueTomorrow: 'Завтра',
  dueIn3: 'Через 3 дня',
  dueWeek: 'Через неделю',
  dueLesson: 'К уроку',
  duePast: 'Срок уже прошёл — выбери позже',
  noScheduleHint: 'У курса нет расписания — укажи дни, и срок «к уроку» появится сам',
  dayColumn: 'День',
  hourColumn: 'Часы',
  minuteColumn: 'Минуты',
  today: 'Сегодня',
  scoreLabel: 'Засчитывать от',
  scoreNone: 'Без порога',
  scoreHint: 'Меньше — «в процессе»: ученик повторяет трудные слова',
  noStudents: 'В курсе пока нет учеников — сначала дай им код подключения',
  done: 'Готово',
} as const;

const DAY_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTH_SHORT = [
  'янв.',
  'февр.',
  'мар.',
  'апр.',
  'мая',
  'июн.',
  'июл.',
  'авг.',
  'сент.',
  'окт.',
  'нояб.',
  'дек.',
];

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** День через n дней от now, время h:m */
export function dayAt(now: Date, days: number, h: number, m = 0): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, h, m);
}

/** Срок по умолчанию: к ближайшему уроку, иначе через 3 дня в 20:00 */
export function defaultDue(now: Date, schedule: ScheduleItem[] | null): Date {
  const lesson = getNextLesson(schedule, now);
  // Урок раньше чем через сутки — не успеют; берём через 3 дня
  if (lesson && lesson.date.getTime() - now.getTime() >= 24 * 3600 * 1000) return lesson.date;
  return dayAt(now, 3, DEFAULT_DUE_HOUR);
}

export interface DuePreset {
  key: 'tomorrow' | 'in3' | 'week' | 'lesson';
  label: string;
  date: Date;
}

/** Быстрые варианты над барабаном; «К уроку» — только если у курса есть расписание */
export function duePresets(now: Date, schedule: ScheduleItem[] | null): DuePreset[] {
  const T = NEW_HOMEWORK_TEXTS;
  const list: DuePreset[] = [
    { key: 'tomorrow', label: T.dueTomorrow, date: dayAt(now, 1, DEFAULT_DUE_HOUR) },
    { key: 'in3', label: T.dueIn3, date: dayAt(now, 3, DEFAULT_DUE_HOUR) },
    { key: 'week', label: T.dueWeek, date: dayAt(now, 7, DEFAULT_DUE_HOUR) },
  ];
  const lesson = getNextLesson(schedule, now);
  if (lesson) list.unshift({ key: 'lesson', label: T.dueLesson, date: lesson.date });
  return list;
}

/** Подписи колонки «День» барабана: «Сегодня», «Пт 13 нояб.», … на DUE_MAX_DAYS дней */
export function dueDayLabels(now: Date, count = DUE_MAX_DAYS): string[] {
  return Array.from({ length: count }, (_, i) => {
    if (i === 0) return NEW_HOMEWORK_TEXTS.today;
    const d = dayAt(now, i, 0);
    return `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
  });
}

/** Индекс дня в барабане для даты (0 — сегодня) */
export function dueDayIndex(now: Date, due: Date): number {
  return Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

/** Минуты — на сетке шага барабана */
export function snapMinutes(m: number): number {
  return Math.min(55, Math.round(m / DUE_MINUTE_STEP) * DUE_MINUTE_STEP);
}

/** «Вс, 15.11.2026 20:00» — карточка «до: …» */
export function dueCardText(due: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${DAY_SHORT[due.getDay()]}, ${p(due.getDate())}.${p(due.getMonth() + 1)}.${due.getFullYear()} ${p(due.getHours())}:${p(due.getMinutes())}`;
}

/** Название задания по наборам: «Ünite 5» или «Ünite 4 + ещё 2» */
export function homeworkTitle(sets: Array<{ title: string }>): string {
  if (sets.length === 0) return '';
  if (sets.length === 1) return sets[0].title.slice(0, 80);
  const more = sets.length - 1;
  return `${sets[0].title} + ещё ${more}`.slice(0, 80);
}

/** «Ünite 5 · 50 слов» */
export function wordsSummary(words: HomeworkWords): string {
  const n = words.cardIds.length;
  const title = homeworkTitle(words.sets);
  const count = `${n} ${pluralize(n, 'слово', 'слова', 'слов')}`;
  return title ? `${title} · ${count}` : count;
}

/** «Задать 21 ученику» */
export function assignButtonText(students: number): string {
  return `Задать ${students} ${pluralize(students, 'ученику', 'ученикам', 'ученикам')}`;
}

export function scoreChipLabel(score: number | null): string {
  return score === null ? NEW_HOMEWORK_TEXTS.scoreNone : `${score}%`;
}

export { DEFAULT_MIN_SCORE };

/** Текст ошибки создания по причине с сервера */
export function newHomeworkErrorMessage(reason: TeacherApiReason | string): string {
  switch (reason) {
    case 'network':
      return 'Нет интернета — задание не создано. Попробуй ещё раз';
    case 'dueAt':
      return 'Срок уже прошёл — выбери позже';
    case 'cardIds':
      return 'Часть слов больше не в курсе — выбери слова заново';
    case 'userIds':
      return 'Кто-то из учеников вышел из курса — выбери учеников заново';
    case 'forbidden':
      return 'Задание может выдать только учитель курса';
    default:
      return 'Не получилось создать задание. Попробуй ещё раз';
  }
}

/** Выдать задание. ok — id нового задания; иначе текст ошибки для окна. */
export async function createHomework(
  input: NewHomeworkInput
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const res = await NeonService.createHomework({
    courseId: input.courseId,
    title: homeworkTitle(input.words.sets) || 'Задание',
    cardIds: input.words.cardIds,
    dueAt: input.due.toISOString(),
    minScore: input.minScore,
    userIds: input.userIds,
  });
  Analytics.teacherHomeworkCreated({
    words: input.words.cardIds.length,
    sets: input.words.sets.length,
    minScore: input.minScore ?? 0,
    allStudents: input.userIds === null,
    days: Math.max(0, dueDayIndex(new Date(), input.due)),
    result: res.ok ? 'ok' : res.reason,
  });
  return res.ok ? res : { ok: false, message: newHomeworkErrorMessage(res.reason) };
}
