/**
 * Создание курса учителем из окна «Новый курс» (plan/new/teacher_cabinet.md, Teacher 6).
 * Одна функция для RN-окна (Android, веб) и Swift-окна (iOS, Teacher 7): курс → учебник → расписание.
 *
 * Курс без сервера не откатываем: учебник и расписание учитель может добавить позже в курсе.
 * Что не получилось — возвращаем списком, сообщение показывает окно.
 */
import { useCoursesStore } from '@/store';
import { BookService } from '@/services/BookService';
import { NeonService } from '@/services/NeonService';
import type { Course } from '@/types';
import type { BookListItem } from '@/types/books';

export interface NewCourseInput {
  title: string;
  /** null — без учебника */
  bookId: string | null;
  /** Ключи дней: 'mon' … 'sun'; пусто — без расписания */
  days: string[];
  /** «10:30»; нужен, только если выбраны дни */
  time: string;
}

export type NewCourseProblem = 'offline' | 'book' | 'schedule';

export interface NewCourseResult {
  course: Course;
  problems: NewCourseProblem[];
}

export async function createCourseWithSetup(input: NewCourseInput): Promise<NewCourseResult> {
  const { course, synced } = await useCoursesStore.getState().createCourseSynced(input.title);
  if (!synced) {
    // Курса нет на сервере — учебник и расписание туда тоже не записать
    const problems: NewCourseProblem[] = ['offline'];
    return { course, problems };
  }

  const problems: NewCourseProblem[] = [];
  if (input.bookId) {
    const attached = await BookService.attachToCourses(input.bookId, [course.id]);
    if (!attached.ok) problems.push('book');
  }
  if (input.days.length > 0) {
    const ok = await NeonService.setCourseSchedule(
      course.id,
      input.days.map((day) => ({ day, time: input.time }))
    );
    if (!ok) problems.push('schedule');
  }
  return { course, problems };
}

/** Текст для тоста, если что-то после создания курса не сохранилось; null — всё хорошо */
export function newCourseProblemMessage(problems: NewCourseProblem[]): string | null {
  if (problems.includes('offline')) {
    return 'Курс сохранён только на этом устройстве. Проверь интернет — учебник и расписание добавишь в курсе';
  }
  const lost = [
    problems.includes('book') ? 'учебник' : null,
    problems.includes('schedule') ? 'расписание' : null,
  ].filter(Boolean);
  if (lost.length === 0) return null;
  return `Курс создан, но ${lost.join(' и ')} не ${lost.length > 1 ? 'сохранились' : 'сохранилось'} — добавь в курсе`;
}

/** Учебники для выбора в окне: опубликованные книги каталога, по названию */
export async function loadBooksForNewCourse(): Promise<BookListItem[]> {
  const books = await BookService.listBooks();
  return [...books].sort((a, b) => a.title.localeCompare(b.title, 'ru'));
}
