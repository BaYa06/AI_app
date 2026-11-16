/**
 * Последний известный список заданий по курсу (plan/done/teacher_cabinet.md, Teacher 24, 57).
 * Карточка урока и страница курса не мигают при возврате, а отмена и перенос срока на экране
 * задания сразу видны там, откуда учитель пришёл: подписчики (useTeacherHomework) получают новый список.
 */
import type { TeacherHomeworkSummary } from '@/services/homework';

const cache = new Map<string, TeacherHomeworkSummary[]>();
const listeners = new Set<(courseId: string) => void>();

export function getCachedHomework(courseId: string): TeacherHomeworkSummary[] | undefined {
  return cache.get(courseId);
}

export function setCachedHomework(courseId: string, list: TeacherHomeworkSummary[]): void {
  cache.set(courseId, list);
  listeners.forEach((l) => l(courseId));
}

/** Подписка на изменения; возвращает отписку */
export function subscribeHomeworkCache(listener: (courseId: string) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function patch(
  courseId: string,
  update: (list: TeacherHomeworkSummary[]) => TeacherHomeworkSummary[]
): void {
  const list = cache.get(courseId);
  if (list) setCachedHomework(courseId, update(list));
}

/** Задание отменено — из живого списка убираем */
export function forgetCachedHomework(courseId: string, homeworkId: string): void {
  patch(courseId, (list) => list.filter((h) => h.id !== homeworkId));
}

/** Новый срок — сразу в кэше, следующая загрузка его подтвердит */
export function setCachedHomeworkDue(courseId: string, homeworkId: string, dueAt: string): void {
  patch(courseId, (list) => list.map((h) => (h.id === homeworkId ? { ...h, dueAt } : h)));
}
