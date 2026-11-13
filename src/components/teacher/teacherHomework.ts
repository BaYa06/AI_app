/**
 * Задание курса для главной и страницы курса учителя (plan/new/teacher_cabinet.md, Teacher 24).
 * Чистые правила: какое задание «текущее», сводка для карточки, слова по умолчанию.
 */
import type { TeacherHomeworkSummary as HomeworkRow } from '@/services/homework';
import { formatDue } from '@/services/homework';
import { pluralize } from '@/utils';
import type { HomeworkWords } from './newHomework';
import type { PickerSet } from './wordPicker';

/** Сводка для карточки урока (TeacherLessonCard) */
export interface HomeworkCardSummary {
  id: string;
  title: string;
  /** «15.11.2026 20:00» */
  dueLabel: string;
  done: number;
  inProgress: number;
  notStarted: number;
}

/** Задание остаётся «текущим» ещё 2 дня после срока — учитель проверяет на уроке */
export const CURRENT_AFTER_DUE_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Текущее задание курса: ближайшее по сроку среди тех, чей срок не прошёл больше 2 дней назад.
 * null — заданий нет (карточка «Задания пока нет»).
 */
export function currentHomework(list: HomeworkRow[], now: number = Date.now()): HomeworkRow | null {
  const live = list
    .filter((h) => Date.parse(h.dueAt) > now - CURRENT_AFTER_DUE_MS)
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  return live[0] ?? null;
}

export function homeworkCardSummary(h: HomeworkRow): HomeworkCardSummary {
  const done = Math.min(h.submitted, h.assigned);
  const inProgress = Math.min(h.started, h.assigned - done);
  return {
    id: h.id,
    title: h.title,
    dueLabel: formatDue(h.dueAt),
    done,
    inProgress,
    notStarted: Math.max(0, h.assigned - done - inProgress),
  };
}

/** Подпись плитки «Задание» на странице курса */
export function homeworkTileCaption(h: HomeworkRow | null): string {
  if (!h) return 'с дедлайном';
  return `сдали ${Math.min(h.submitted, h.assigned)} из ${h.assigned}`;
}

/** Слова по умолчанию в окне «Новое задание»: весь последний набор курса (обычно — свежий юнит) */
export function defaultHomeworkWords(sets: PickerSet[]): HomeworkWords | null {
  const last = sets[sets.length - 1];
  if (!last || last.words.length === 0) return null;
  return { cardIds: last.words.map((w) => w.id), sets: [{ id: last.id, title: last.title }] };
}

/** «22 ученика» */
export function studentsText(n: number): string {
  return `${n} ${pluralize(n, 'ученик', 'ученика', 'учеников')}`;
}
