/**
 * Книга учебного центра = мой курс (plan/new/center_books.md, этап 7).
 *
 * «Добавить книгу» (первый вход по коду) и «Добавить себе» (Библиотека) создают на сервере мой курс
 * с названием книги (book-course). Все юниты книги приходят официальными наборами под этим курсом
 * (official-sets), главная переключается на него — урок дня, разминка и юниты как обычные наборы.
 */
import { BookService } from '@/services/BookService';
import { CenterService, type MyCenters } from '@/services/CenterService';
import { Analytics } from '@/services/analytics';
import { useCenterStore } from '@/store/centerStore';
import { useCoursesStore } from '@/store/coursesStore';
import { isCenterOpen } from '@/services/centerBooks';

export type AddBookCourseOutcome = { ok: true; courseId: string } | { ok: false; message: string };

const FAIL_TEXT = {
  network: 'Нет интернета. Проверь соединение и попробуй ещё раз',
  no_access: 'Доступ к книгам центра закончился. Возьми новый код у менеджера курса',
  unknown: 'Не получилось добавить книгу. Попробуй ещё раз',
} as const;

/** Положить курс книги в стор и подтянуть его юниты. Без запроса createCourse — курс уже на сервере. */
async function placeBookCourse(course: {
  id: string;
  title: string;
  sourceBookId: string;
  createdAt?: string;
  updatedAt?: string | null;
}): Promise<void> {
  useCoursesStore.getState().upsertServerCourse({
    id: course.id,
    title: course.title,
    createdAt: (course.createdAt && Date.parse(course.createdAt)) || Date.now(),
    updatedAt: course.updatedAt ? Date.parse(course.updatedAt) : undefined,
    sourceBookId: course.sourceBookId,
  });
  await BookService.syncOfficialSets().catch(() => {});
}

/**
 * Добавить книгу центра как мой курс и сделать его текущим на главной. Уже добавлена — тот же курс.
 * via — откуда: экран выбора книги после кода или «Библиотека».
 */
export async function addCenterBookCourse(
  bookId: string,
  via: 'onboarding' | 'library'
): Promise<AddBookCourseOutcome> {
  const r = await CenterService.addBookCourse(bookId);
  if (!r.ok) return { ok: false, message: FAIL_TEXT[r.reason] };
  await placeBookCourse(r.course);
  useCoursesStore.getState().setActiveCourse(r.course.id);
  if (r.created) Analytics.orgBookAdded(via);
  useCenterStore
    .getState()
    .refresh()
    .catch(() => {});
  return { ok: true, courseId: r.course.id };
}

/** Мой курс книги центра (первый по порядку книг) или null. */
export function centerCourseOf(
  data: MyCenters | null,
  orgId: string
): { courseId: string; bookId: string; title: string } | null {
  const center = data?.organizations.find((o) => o.id === orgId);
  const book = center?.books.find((b) => !!b.courseId);
  return book?.courseId ? { courseId: book.courseId, bookId: book.id, title: book.title } : null;
}

/**
 * После кода центра: курса книги ещё нет — выбор книги; есть (продление новым кодом) — главная на
 * этом курсе. navigate — из экрана или navigationRef.
 */
export async function openCenterBooks(
  navigate: (screen: 'CenterBookPick' | 'Home', params?: { orgId: string }) => void,
  orgId: string
): Promise<void> {
  const data = await useCenterStore.getState().refresh();
  const mine = centerCourseOf(data, orgId);
  const center = data?.organizations.find((o) => o.id === orgId);
  if (!mine || !center || !isCenterOpen(center)) {
    navigate('CenterBookPick', { orgId });
    return;
  }
  if (!useCoursesStore.getState().courses.some((c) => c.id === mine.courseId)) {
    await placeBookCourse({ id: mine.courseId, title: mine.title, sourceBookId: mine.bookId });
  } else {
    // Новый код после конца доступа: юниты вернулись — подтянуть их
    await BookService.syncOfficialSets().catch(() => {});
  }
  useCoursesStore.getState().setActiveCourse(mine.courseId);
  navigate('Home');
}
