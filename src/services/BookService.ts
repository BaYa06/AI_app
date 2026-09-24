/**
 * Каталог книг (Книга → Юнит → официальный набор) — клиент к api/books.js.
 * Все запросы идут через backend с Supabase JWT, напрямую в Neon — ничего.
 * План: plan/book_catalog_plan.md, части 3–4.
 */

import { supabase } from './supabaseClient';
import { API_BASE } from '@/config/apiBase';
import type { Card, CardSet, CardStatus } from '@/types';
import type { BookDetail, BookFilters, BookListItem, CoursePlan } from '@/types/books';

const BOOKS_API_BASE = `${API_BASE}/books`;

// Ленивый доступ к сторам — как в DatabaseService: сторы импортируют сервисы, прямой импорт дал бы цикл.
const getStores = () => ({
  useSetsStore: require('../store/setsStore').useSetsStore as typeof import('../store/setsStore').useSetsStore,
  useCardsStore: require('../store/cardsStore').useCardsStore as typeof import('../store/cardsStore').useCardsStore,
});

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

async function callBooksApi<T>(
  action: string,
  { method = 'GET', body, params }: { method?: 'GET' | 'POST'; body?: Record<string, unknown>; params?: Record<string, string> } = {},
): Promise<ApiResult<T>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { ok: false, error: 'Not authenticated', status: 401 };

  const query = new URLSearchParams({ action, ...(params || {}) }).toString();
  try {
    const resp = await fetch(`${BOOKS_API_BASE}?${query}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: json?.error || `HTTP ${resp.status}`, status: resp.status };
    return { ok: true, data: json as T };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Network error', status: 0 };
  }
}

// Тот же расчёт статуса, что в NeonService (статус карточки выводится из шага обучения).
function statusFromStep(learningStep: number): CardStatus {
  if (learningStep === 0) return 'new';
  if (learningStep <= 2) return 'learning';
  if (learningStep <= 4) return 'young';
  return 'mature';
}

interface OfficialSetsResponse {
  sets: Array<{
    id: string; title: string; description: string; category: string;
    languageFrom: string; languageTo: string; createdAt: string; updatedAt: string | null;
    unitId: string; unitNumber: number; unitTitle: string; bookId: string; bookTitle: string;
  }>;
  cards: Array<{
    id: string; setId: string; front: string; back: string; example: string;
    wordForm: string | null; wordType: Card['wordType'] | null; imageUrl: string | null; audioUrl: string | null;
    createdAt: string; learningStep: number; nextReview: string; lastReviewed: string | null;
  }>;
}

export interface OfficialSetsBundle {
  sets: CardSet[];
  cardsBySet: Record<string, Card[]>;
}

export const BookService = {
  async listBooks(filters: BookFilters = {}): Promise<BookListItem[]> {
    const params: Record<string, string> = {};
    if (filters.subject) params.subject = filters.subject;
    if (filters.level) params.level = filters.level;
    if (filters.q) params.q = filters.q;
    const result = await callBooksApi<{ books: BookListItem[] }>('list-books', { params });
    if (!result.ok) {
      console.warn('[BookService] listBooks failed:', result.error);
      return [];
    }
    return result.data.books;
  },

  async getBookDetail(bookId: string): Promise<BookDetail | null> {
    const result = await callBooksApi<BookDetail>('book-detail', { params: { bookId } });
    if (!result.ok) {
      console.warn('[BookService] getBookDetail failed:', result.error);
      return null;
    }
    return result.data;
  },

  /**
   * Официальные наборы с карточками и личным прогрессом: запрошенные setIds + уже начатые.
   * Наборы всегда read-only — SRS пишется только в card_progress, не в общую таблицу cards.
   * `courseIdBySet` — под каким курсом показывать набор (для открытых юнитов курса).
   */
  async loadOfficialSets(setIds: string[] = [], courseIdBySet: Record<string, string> = {}): Promise<OfficialSetsBundle | null> {
    const params: Record<string, string> = {};
    if (setIds.length > 0) params.setIds = [...new Set(setIds)].slice(0, 100).join(',');
    const result = await callBooksApi<OfficialSetsResponse>('official-sets', { params });
    if (!result.ok) {
      console.warn('[BookService] loadOfficialSets failed:', result.error);
      return null;
    }

    const cardsBySet: Record<string, Card[]> = {};
    for (const row of result.data.cards) {
      const createdAt = new Date(row.createdAt).getTime();
      const card: Card = {
        id: row.id,
        setId: row.setId,
        frontText: row.front,
        backText: row.back,
        example: row.example || '',
        wordForm: row.wordForm || undefined,
        wordType: row.wordType || undefined,
        frontImage: row.imageUrl || undefined,
        frontAudio: row.audioUrl || undefined,
        createdAt,
        updatedAt: createdAt,
        learningStep: row.learningStep || 0,
        nextReviewDate: row.nextReview ? new Date(row.nextReview).getTime() : Date.now(),
        lastReviewDate: row.lastReviewed ? new Date(row.lastReviewed).getTime() : 0,
        status: statusFromStep(row.learningStep || 0),
      };
      (cardsBySet[row.setId] ||= []).push(card);
    }

    const sets: CardSet[] = result.data.sets.map((row) => {
      const cards = cardsBySet[row.id] || [];
      return {
        id: row.id,
        userId: '',
        courseId: courseIdBySet[row.id] ?? null,
        ownerCourseId: courseIdBySet[row.id],
        title: row.title,
        description: row.description,
        category: row.category as CardSet['category'],
        tags: [],
        languageFrom: row.languageFrom,
        languageTo: row.languageTo,
        createdAt: new Date(row.createdAt).getTime(),
        updatedAt: row.updatedAt ? new Date(row.updatedAt).getTime() : new Date(row.createdAt).getTime(),
        cardCount: cards.length,
        newCount: cards.filter((c) => c.status === 'new').length,
        learningCount: cards.filter((c) => c.status === 'learning').length,
        reviewCount: 0,
        masteredCount: cards.filter((c) => c.status === 'mature').length,
        isPublic: false,
        isFavorite: false,
        isArchived: false,
        isReadOnly: true,
        isOfficial: true,
        unitId: row.unitId,
        unitNumber: row.unitNumber,
        bookId: row.bookId,
        bookTitle: row.bookTitle,
      };
    });

    return { sets, cardsBySet };
  },

  /**
   * Положить официальные наборы и их карточки в сторы (без синка в Neon).
   * preserveCourse: если набор уже показан под курсом, а пришёл без курса — курс сохраняется
   * (нужно, когда юнит открывают из каталога). При обновлении плана курса передаётся false —
   * там размещение по курсам известно точно.
   * Если прогресс по карточке на устройстве новее серверного (ответ ещё не дошёл до card_progress),
   * локальный прогресс не затирается.
   */
  applyOfficialSets(bundle: OfficialSetsBundle, { preserveCourse = true }: { preserveCourse?: boolean } = {}): void {
    const { useSetsStore, useCardsStore } = getStores();
    const currentSets = useSetsStore.getState().sets;
    const currentCards = useCardsStore.getState().cards;
    const sets = bundle.sets.map((cardSet) => {
      const existing = currentSets[cardSet.id];
      return preserveCourse && !cardSet.courseId && existing?.courseId
        ? { ...cardSet, courseId: existing.courseId, ownerCourseId: existing.ownerCourseId }
        : cardSet;
    });
    useSetsStore.getState().mergeSets(sets);
    const { replaceSetCards } = useCardsStore.getState();
    for (const cardSet of sets) {
      const cards = (bundle.cardsBySet[cardSet.id] || []).map((card) => {
        const local = currentCards[card.id];
        return local && local.lastReviewDate > card.lastReviewDate
          ? { ...card, learningStep: local.learningStep, nextReviewDate: local.nextReviewDate, lastReviewDate: local.lastReviewDate, status: local.status }
          : card;
      });
      replaceSetCards(cardSet.id, cards);
    }
  },

  /**
   * Обновить открытые юниты курсов ученика без полной перезагрузки данных (при возврате в приложение):
   * новые открытые юниты появляются в курсе, закрытые — пропадают из него. Если ученик уже учил
   * закрытый юнит, набор остаётся в «Все» вместе с прогрессом.
   */
  async refreshStudentCourseUnits(studentCourseIds: string[]): Promise<void> {
    const plans = await Promise.all(studentCourseIds.map(async (courseId) => ({ courseId, plan: await BookService.getCoursePlan(courseId) })));
    // Если хоть один план не загрузился (нет сети) — ничего не трогаем, чтобы не убрать юниты по ошибке.
    if (plans.some((p) => p.plan === null)) return;

    const courseIdBySet: Record<string, string> = {};
    for (const { courseId, plan } of plans) {
      for (const book of plan!.books) {
        for (const unit of book.units) {
          if (unit.isOpen && unit.set) courseIdBySet[unit.set.id] = courseId;
        }
      }
    }

    const bundle = await BookService.loadOfficialSets(Object.keys(courseIdBySet), courseIdBySet);
    if (!bundle) return;

    const { useSetsStore, useCardsStore } = getStores();
    const keep = new Set(bundle.sets.map((x) => x.id));
    // Убираем только юниты, показанные под курсами ученика, которые учитель закрыл (и которые ученик
    // не начинал). Юниты, открытые из каталога без курса, не трогаем — их экран может быть открыт.
    const stale = Object.values(useSetsStore.getState().sets).filter(
      (x) => x.isOfficial && !!x.courseId && studentCourseIds.includes(x.courseId) && !keep.has(x.id),
    );
    for (const cardSet of stale) {
      useCardsStore.getState().replaceSetCards(cardSet.id, []);
      useSetsStore.getState().deleteSet(cardSet.id); // read-only: удаляется только локально
    }
    BookService.applyOfficialSets(bundle, { preserveCourse: false });
  },

  // ─── Учитель: книги в курсах ───────────────────────────────

  async attachToCourses(bookId: string, courseIds: string[]): Promise<ApiResult<{ attachedCourseIds: string[]; alreadyAttachedCourseIds: string[] }>> {
    return callBooksApi('attach-to-courses', { method: 'POST', body: { bookId, courseIds } });
  },

  async detachFromCourse(bookId: string, courseId: string): Promise<ApiResult<{ ok: true }>> {
    return callBooksApi('detach-from-course', { method: 'POST', body: { bookId, courseId } });
  },

  async getCoursePlan(courseId: string): Promise<CoursePlan | null> {
    const result = await callBooksApi<CoursePlan>('course-plan', { params: { courseId } });
    if (!result.ok) {
      console.warn('[BookService] getCoursePlan failed:', result.error);
      return null;
    }
    return result.data;
  },

  async setUnitOpen(courseId: string, unitId: string, isOpen: boolean): Promise<ApiResult<{ isOpen: boolean; openedAt: string | null }>> {
    return callBooksApi('set-unit-open', { method: 'POST', body: { courseId, unitId, isOpen } });
  },

  /** Копия официального набора в обычный свой набор (можно редактировать). Прогресс не копируется. */
  async forkSet(setId: string, courseId: string | null = null): Promise<ApiResult<{ newSetId: string; cardsCopied: number }>> {
    return callBooksApi('fork-set', { method: 'POST', body: { setId, courseId } });
  },

  /** Загрузить официальный набор (юнит из каталога) в сторы перед открытием экрана набора. */
  async openOfficialSet(setId: string): Promise<boolean> {
    const bundle = await BookService.loadOfficialSets([setId]);
    if (!bundle || !bundle.sets.some((s) => s.id === setId)) return false;
    BookService.applyOfficialSets(bundle);
    return true;
  },
};
