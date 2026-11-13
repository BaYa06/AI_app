/**
 * Подготовка к уроку у учителя (plan/new/teacher_cabinet.md, этап 3, Teacher 37): типы и чистые
 * правила экрана 10 — трудные слова, готовность группы, состав разминки. Запросы — services/neon/lessonPrep.
 */
import { pluralize } from '@/utils';
import type { HomeworkStatusData, TeacherHomeworkSummary } from './homework';

/** Трудное слово группы (api/teacher.js?action=course-hard-cards) */
export interface HardCard {
  cardId: string;
  front: string;
  back: string;
  setId: string;
  setTitle: string;
  /** Доля неверных ответов 0..1 */
  errorRate: number;
  wrongUsers: number;
  answers: number;
}

export type SetStudentStatus = 'completed' | 'started' | 'not_opened';
export interface SetStudent {
  id: string;
  name: string;
  status: SetStudentStatus;
}

/** Строка course-set-stats, нужная готовности */
export interface PrepSetRow {
  setId: string;
  title: string;
  totalCards: number;
  isOfficial?: boolean;
  bookTitle?: string | null;
  unitOpen?: boolean | null;
}

/** Готовность группы к уроку: по текущему заданию, а без него — по последнему набору курса */
export interface PrepReadiness {
  source: 'homework' | 'set';
  /** «Ünite 4» */
  title: string;
  words: number;
  /** Учебник набора — для шапки экрана */
  bookTitle: string | null;
  total: number;
  ready: number;
  started: number;
  notOpened: number;
  /** «сдали» / «прошли все слова» — подпись к «7/22» */
  readyCaption: string;
  /** «Не начали» / «Не открывали» — третья подпись полоски и заголовок списка */
  notOpenedCaption: string;
  notOpenedStudents: Array<{ id: string; name: string }>;
  homeworkId: string | null;
  /** Слова задания (для «Проверить на уроке»); у набора — null */
  setId: string | null;
}

export interface LessonPrepData {
  /** null — не удалось загрузить */
  hardCards: HardCard[] | null;
  /** null — в курсе нет ни задания, ни наборов (или не удалось загрузить) */
  readiness: PrepReadiness | null;
}

/** Разминка: столько самых трудных слов; меньше минимума — разминку не предлагаем */
export const WARMUP_WORDS = 6;
export const WARMUP_MIN_WORDS = 3;
/** Доля ошибок, с которой слово подсвечивается красным (макет 10) */
export const HARD_HIGH_RATE = 0.32;
/** На слово в живом тесте: вопрос, ответ, пауза */
const WARMUP_SEC_PER_WORD = 50;

/** Слова разминки: до 6 самых трудных (список уже отсортирован сервером); мало слов — пусто */
export function warmupCards(hard: HardCard[] | null): HardCard[] {
  if (!hard || hard.length < WARMUP_MIN_WORDS) return [];
  return hard.slice(0, WARMUP_WORDS);
}

export function warmupMinutes(words: number): number {
  return Math.max(1, Math.round((words * WARMUP_SEC_PER_WORD) / 60));
}

/** «6 трудных слов · ~5 минут» */
export function warmupCaption(words: number): string {
  const m = warmupMinutes(words);
  return `${words} ${pluralize(words, 'трудное слово', 'трудных слова', 'трудных слов')} · ~${m} ${pluralize(m, 'минута', 'минуты', 'минут')}`;
}

export function errorPercent(card: Pick<HardCard, 'errorRate'>): number {
  return Math.round(card.errorRate * 100);
}

export function isHighError(card: Pick<HardCard, 'errorRate'>): boolean {
  return card.errorRate >= HARD_HIGH_RATE;
}

/** «Ünite 1 · ошибались 17 учеников» */
export function hardCardCaption(card: HardCard): string {
  const n = card.wrongUsers;
  return `${card.setTitle} · ${pluralize(n, 'ошибался', 'ошибались', 'ошибались')} ${n} ${pluralize(n, 'ученик', 'ученика', 'учеников')}`;
}

export function readinessFromHomework(status: HomeworkStatusData): PrepReadiness {
  const students = status.students;
  const notStarted = students.filter((s) => s.status === 'not_started');
  return {
    source: 'homework',
    title: status.homework.title,
    words: status.homework.words,
    bookTitle: null,
    total: students.length,
    ready: students.filter((s) => s.status === 'submitted').length,
    started: students.filter((s) => s.status === 'in_progress').length,
    notOpened: notStarted.length,
    readyCaption: 'сдали задание',
    notOpenedCaption: 'Не начали',
    notOpenedStudents: notStarted.map((s) => ({ id: s.id, name: s.displayName })),
    homeworkId: status.homework.id,
    setId: null,
  };
}

/**
 * Последний набор курса для готовности: последний открытый юнит учебника, а без учебника —
 * последний свой набор (строки course-set-stats идут в порядке создания, юниты — после своих).
 */
export function lastCourseSet(rows: PrepSetRow[]): PrepSetRow | null {
  const filled = rows.filter((r) => r.totalCards > 0);
  const units = filled.filter((r) => r.isOfficial && r.unitOpen !== false);
  return units[units.length - 1] ?? filled[filled.length - 1] ?? null;
}

export function readinessFromSet(set: PrepSetRow, students: SetStudent[]): PrepReadiness {
  const notOpened = students.filter((s) => s.status === 'not_opened');
  return {
    source: 'set',
    title: set.title,
    words: set.totalCards,
    bookTitle: set.bookTitle || null,
    total: students.length,
    ready: students.filter((s) => s.status === 'completed').length,
    started: students.filter((s) => s.status === 'started').length,
    notOpened: notOpened.length,
    readyCaption: 'прошли все слова',
    notOpenedCaption: 'Не открывали',
    notOpenedStudents: notOpened.map((s) => ({ id: s.id, name: s.name })),
    homeworkId: null,
    setId: set.setId,
  };
}

/** «ÜNITE 4 · 48 СЛОВ» */
export function readinessOverline(r: Pick<PrepReadiness, 'title' | 'words'>): string {
  return `${r.title} · ${r.words} ${pluralize(r.words, 'слово', 'слова', 'слов')}`.toUpperCase();
}

/** «Завтра, пт · 10:30 · Harmoni Türkçe · Ünite 4» — пустые части пропускаются */
export function prepSubtitle(
  lessonLabel: string | null,
  readiness: Pick<PrepReadiness, 'title' | 'bookTitle'> | null
): string {
  return [lessonLabel, readiness?.bookTitle, readiness?.title].filter(Boolean).join(' · ');
}

/** «Напомнить 7» */
export function remindLabel(n: number): string {
  return `Напомнить ${n}`;
}

/** Запросы, из которых собирается экран (подставляются в тестах) */
export interface LessonPrepApi {
  loadCourseHardCards: (courseId: string) => Promise<HardCard[] | null>;
  loadCourseHomework: (courseId: string) => Promise<TeacherHomeworkSummary[] | null>;
  loadHomeworkStatus: (homeworkId: string) => Promise<HomeworkStatusData | null>;
  loadCourseSetStats: (courseId: string) => Promise<PrepSetRow[]>;
  loadCourseSetStudents: (courseId: string, setId: string) => Promise<SetStudent[] | null>;
}

/**
 * Данные экрана 10 одним вызовом. Готовность — по текущему заданию (решение 5); задания нет
 * (или задания выключены) — по последнему набору курса. Ошибка одной части не роняет остальное.
 */
export async function loadLessonPrep(
  courseId: string,
  api: LessonPrepApi,
  options: {
    homeworkEnabled: boolean;
    pickCurrent: (list: TeacherHomeworkSummary[]) => TeacherHomeworkSummary | null;
  }
): Promise<LessonPrepData> {
  const readiness = async (): Promise<PrepReadiness | null> => {
    if (options.homeworkEnabled) {
      const list = await api.loadCourseHomework(courseId);
      const current = list ? options.pickCurrent(list) : null;
      if (current) {
        const status = await api.loadHomeworkStatus(current.id);
        if (status) return readinessFromHomework(status);
      }
    }
    const set = lastCourseSet(await api.loadCourseSetStats(courseId));
    if (!set) return null;
    const students = await api.loadCourseSetStudents(courseId, set.setId);
    return students ? readinessFromSet(set, students) : null;
  };
  const [hardCards, ready] = await Promise.all([
    api.loadCourseHardCards(courseId).catch(() => null),
    readiness().catch(() => null),
  ]);
  return { hardCards, readiness: ready };
}
