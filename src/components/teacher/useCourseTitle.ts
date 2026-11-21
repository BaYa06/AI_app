/**
 * Название курса для экранов учителя, открытых по ссылке (пуш, колокольчик): в ссылке есть
 * только id курса, название берём из списка курсов на устройстве.
 */
import { useCoursesStore } from '@/store';

export function useCourseTitle(courseId: string, fromRoute?: string | null): string {
  const stored = useCoursesStore((s) => s.courses.find((c) => c.id === courseId)?.title);
  return fromRoute || stored || '';
}
