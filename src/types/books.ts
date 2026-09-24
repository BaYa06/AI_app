/**
 * Каталог книг: Книга → Юнит → официальный набор. Ответы api/books.js.
 */

export interface Book {
  id: string;
  title: string;
  edition: string;
  level: string | null;
  subject: string | null;
  languageFrom: string;
  languageTo: string;
  publisher: string | null;
  isPublished: boolean;
}

export interface BookListItem extends Book {
  unitsCount: number;
  cardsCount: number;
}

export interface BookUnitSet {
  id: string;
  title: string;
  totalCards: number;
}

export interface BookUnit {
  id: string;
  number: number;
  title: string;
  pages: string | null;
  /** На старте 1 юнит = 1 набор, но схема допускает несколько. */
  sets: BookUnitSet[];
}

export interface BookDetail {
  book: Book;
  units: BookUnit[];
  /** Свои курсы вызывающего, к которым книга уже подключена. */
  attachedCourseIds: string[];
}

export interface BookFilters {
  subject?: string;
  level?: string;
  q?: string;
}

export interface CoursePlanUnit {
  id: string;
  number: number;
  title: string;
  pages: string | null;
  isOpen: boolean;
  openedAt: string | null;
  set: BookUnitSet | null;
  /** Прогресс вызывающего: сколько карточек юнита он уже начинал. */
  progress: { startedCards: number };
}

export interface CoursePlanBook extends Book {
  units: CoursePlanUnit[];
}

export interface CoursePlan {
  isOwner: boolean;
  books: CoursePlanBook[];
}
