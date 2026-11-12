/**
 * Задания учителя (plan/new/teacher_cabinet.md, этап 2) — типы и чистые правила для экранов.
 *
 * «Сдано» — вариант Б: слово засчитано, когда ученик прошёл его в законченной сессии
 * «Изучить» / «Повторить». Задание сдано, когда засчитаны все слова и оценка ≥ порога.
 * Считает сервер (api/_homework.js); здесь — подписи, объём и план сессии по словам задания.
 */
import type { Card } from '@/types';
import { isCardWaitingReview } from './SRSService';
import { SESSION_NEW_WORDS, SESSION_REVIEW_MAX } from './LessonService';
import { pluralize } from '@/utils';

/** Задание глазами ученика (api/progress.js?action=my-homework) */
export interface StudentHomework {
  id: string;
  courseId: string;
  courseTitle: string;
  title: string;
  teacher: string;
  cardIds: string[];
  setIds: string[];
  /** Слов в задании (существующих) */
  words: number;
  creditedCardIds: string[];
  /** Засчитаны, но в последней сессии с ошибкой — «Путаешь», «Повторить N трудных» */
  wrongCardIds: string[];
  /** % верных по засчитанным словам; null — ещё ничего не засчитано */
  score: number | null;
  /** Порог, %; null — без порога */
  minScore: number | null;
  dueAt: string;
  createdAt: string;
  submitted: { at: string; late: boolean; score: number; diamonds: number } | null;
  group: { assigned: number; submitted: number };
}

/** Строка списка заданий курса у учителя (api/teacher.js?action=homework-list) */
export interface TeacherHomeworkSummary {
  id: string;
  title: string;
  words: number;
  dueAt: string;
  minScore: number | null;
  assignAll: boolean;
  createdAt: string;
  assigned: number;
  submitted: number;
  /** В процессе: начали, но не сдали */
  started: number;
}

export type HomeworkStudentStatus = 'submitted' | 'in_progress' | 'not_started';

/** Ученик на экране сдачи (api/teacher.js?action=homework-status) */
export interface HomeworkStudentRow {
  id: string;
  displayName: string;
  lastActiveDate: string | null;
  status: HomeworkStudentStatus;
  credited: number;
  score: number | null;
  submittedAt: string | null;
  late: boolean;
  remindedAt: string | null;
  /** «Закреплено» — слов на «Знаю»; null — ещё не прошло 7 дней */
  fixed: number | null;
}

export interface HomeworkStatusData {
  homework: {
    id: string;
    courseId: string;
    title: string;
    words: number;
    dueAt: string;
    minScore: number | null;
    createdAt: string;
    canceled: boolean;
  };
  students: HomeworkStudentRow[];
}

/** Ответ session-complete: какие задания сдались этой сессией */
export interface HomeworkSubmission {
  homeworkId: string;
  late: boolean;
  score: number;
  diamonds: number;
}

/** Порог по умолчанию и варианты в окне «Новое задание» (решение 4) */
export const DEFAULT_MIN_SCORE = 80;
export const MIN_SCORE_OPTIONS: Array<number | null> = [60, 70, 80, 90, null];
/** Больше — плашка «Много к сроку» в окне выбора слов (макет 11а) */
export const HOMEWORK_MANY_WORDS = 30;
/** «Взять 25» в плашке «Много к сроку» */
export const HOMEWORK_PART_WORDS = 25;
/** Объём: 5 слов и ~7 минут на сессию (план, «48 слов ≈ 10 сессий ≈ 70 мин») */
const WORDS_PER_SESSION = 5;
const MINUTES_PER_SESSION = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function homeworkVolume(words: number): { sessions: number; minutes: number } {
  const sessions = words > 0 ? Math.ceil(words / WORDS_PER_SESSION) : 0;
  return { sessions, minutes: sessions * MINUTES_PER_SESSION };
}

/** «≈ 10 сессий · ≈ 70 мин» */
export function homeworkVolumeText(words: number): string {
  const { sessions, minutes } = homeworkVolume(words);
  if (sessions === 0) return '';
  return `≈ ${sessions} ${pluralize(sessions, 'сессия', 'сессии', 'сессий')} · ≈ ${minutes} мин`;
}

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

/** «15.11.2026 20:00» — в часовом поясе устройства */
export function formatDue(due: string | number | Date): string {
  const d = new Date(due);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** «сегодня» / «завтра» / «через 3 дня» / «просрочено» — по календарным дням устройства */
export function dueRelative(due: string | number | Date, now: number = Date.now()): string {
  const t = new Date(due).getTime();
  if (t < now) return 'просрочено';
  const days = Math.round((startOfDay(t) - startOfDay(now)) / DAY_MS);
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'завтра';
  return `через ${days} ${pluralize(days, 'день', 'дня', 'дней')}`;
}

/** Слов в день до срока (плашка «Много к сроку»): минимум 1 день */
export function wordsPerDay(words: number, due: string | number | Date, now = Date.now()): number {
  const days = Math.max(
    1,
    Math.round((startOfDay(new Date(due).getTime()) - startOfDay(now)) / DAY_MS)
  );
  return Math.ceil(words / days);
}

/** Сколько слов осталось засчитать (только существующие слова задания) */
export function homeworkLeft(hw: Pick<StudentHomework, 'words' | 'creditedCardIds'>): number {
  return Math.max(0, hw.words - hw.creditedCardIds.length);
}

/** Все слова засчитаны, но оценка ниже порога — нужно повторить трудные (решение 4) */
export function needsScoreRetry(hw: StudentHomework): boolean {
  return (
    !hw.submitted && homeworkLeft(hw) === 0 && hw.minScore !== null && (hw.score ?? 0) < hw.minScore
  );
}

/** Активное задание для главной ученика: несданное, ближайшее по сроку (решение плана) */
export function nearestActiveHomework(list: StudentHomework[]): StudentHomework | null {
  const active = list.filter((h) => !h.submitted);
  if (active.length === 0) return null;
  return [...active].sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0];
}

export interface HomeworkSessionPlan {
  kind: 'learn' | 'review';
  cardIds: string[];
}

/**
 * Следующая сессия по словам задания. Дневной лимит новых слов здесь не действует (решение 1):
 * 1) трудные (засчитаны с ошибкой) или ученику пора их повторить — «Повторить», до 10;
 * 2) иначе незасчитанные слова — «Изучить», по 5 (новые первыми, в порядке задания).
 * Пусто — всё засчитано и трудных нет.
 */
export function buildHomeworkSessionPlan(
  hw: Pick<StudentHomework, 'cardIds' | 'creditedCardIds' | 'wrongCardIds'>,
  cards: Record<string, Card | undefined>,
  options: { prefer?: 'learn' | 'review'; now?: number } = {}
): HomeworkSessionPlan {
  const now = options.now ?? Date.now();
  const credited = new Set(hw.creditedCardIds);
  const wrong = new Set(hw.wrongCardIds);
  const existing = hw.cardIds.filter((id) => !!cards[id]);
  const left = existing.filter((id) => !credited.has(id));
  const review = existing.filter((id) => {
    const c = cards[id] as Card;
    return wrong.has(id) || (credited.has(id) && isCardWaitingReview(c, now));
  });
  const learn = (): HomeworkSessionPlan => {
    const step = (id: string) => (cards[id] as Card).learningStep || 0;
    const ordered = [...left].sort((a, b) => step(a) - step(b));
    return { kind: 'learn', cardIds: ordered.slice(0, SESSION_NEW_WORDS) };
  };
  const rev = (): HomeworkSessionPlan => ({
    kind: 'review',
    cardIds: review.slice(0, SESSION_REVIEW_MAX),
  });
  if (options.prefer === 'learn' && left.length > 0) return learn();
  if (review.length > 0) return rev();
  if (left.length > 0) return learn();
  return { kind: 'review', cardIds: [] };
}
