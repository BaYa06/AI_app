/**
 * Library Service — публичная библиотека наборов.
 * Все запросы идут через backend (api/library.js); пользователь определяется по Supabase JWT.
 * Строки подключения к БД в приложении нет — см. plan/course_rating_and_review_plan.md, этап 0.
 */

import { supabase } from './supabaseClient';
import { API_BASE } from '@/config/apiBase';
import { fetchWithTimeout } from '@/utils/fetchWithTimeout';
import type {
  LibraryFilters,
  LibraryListResponse,
  LibrarySetDetail,
  PublishSetPayload,
  PublishResponse,
  ImportResponse,
  CheckPublishedResponse,
  ToggleLikeResponse,
  RateResponse,
  LibrarySet,
} from '@/types/library';

const LIBRARY_API = `${API_BASE}/library`;

/**
 * Запрос к api/library.js. Токен добавляется, если есть сессия (для списка/деталей он
 * необязателен — без него сервер вернёт is_imported/is_liked = false).
 * Ошибка сервера превращается в Error с его текстом.
 */
async function callLibraryApi<T>(
  params: Record<string, string | number | boolean | null | undefined>,
  { method = 'GET', body, requireAuth = false }: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: object; requireAuth?: boolean } = {},
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (requireAuth && !token) throw new Error('Необходимо войти в аккаунт');

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  }
  const qs = query.toString();
  const resp = await fetchWithTimeout(qs ? `${LIBRARY_API}?${qs}` : LIBRARY_API, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    if (resp.status === 403) throw new Error('Можно добавлять только в свои курсы');
    throw new Error(json?.error || `HTTP ${resp.status}`);
  }
  return json as T;
}

class LibraryServiceClass {

  /** Get library sets with filters */
  async getLibrarySets(filters: LibraryFilters, _userId?: string): Promise<LibraryListResponse> {
    const { search, category, language, sort = 'popular', cardsMin, cardsMax, page = 1, curatedOnly } = filters;
    return callLibraryApi<LibraryListResponse>({
      search,
      category,
      language,
      sort,
      cardsMin,
      cardsMax,
      page,
      curatedOnly: curatedOnly ? true : undefined,
    });
  }

  /** Get single library set detail */
  async getLibrarySetDetail(id: string, _userId?: string): Promise<LibrarySetDetail> {
    return callLibraryApi<LibrarySetDetail>({ id });
  }

  /** Publish a personal set to the library */
  async publishSet(_userId: string, payload: PublishSetPayload): Promise<PublishResponse> {
    return callLibraryApi<PublishResponse>({ action: 'publish' }, { method: 'POST', body: payload, requireAuth: true });
  }

  /** Update published set cards and metadata from original */
  async updatePublication(_userId: string, librarySetId: string, meta?: { description?: string; category?: string; coverEmoji?: string }): Promise<{ success: boolean }> {
    return callLibraryApi<{ success: boolean }>(
      { action: 'publish' },
      { method: 'PUT', body: { librarySetId, ...meta }, requireAuth: true },
    );
  }

  /** Unpublish (archive) a set */
  async unpublishSet(_userId: string, librarySetId: string): Promise<{ success: boolean }> {
    return callLibraryApi<{ success: boolean }>(
      { action: 'publish' },
      { method: 'DELETE', body: { librarySetId }, requireAuth: true },
    );
  }

  /**
   * Import a library set into personal collection (optionally into one of the user's own courses).
   * Сервер сам определяет пользователя, проверяет, что курс принадлежит ему, и создаёт набор
   * с карточками одним атомарным запросом.
   */
  async importSet(_userId: string, librarySetId: string, courseId: string | null = null): Promise<ImportResponse> {
    const json = await callLibraryApi<{ newSetId: string }>(
      { action: 'import' },
      { method: 'POST', body: { librarySetId, courseId }, requireAuth: true },
    );
    return { newSetId: json.newSetId };
  }

  /** Fetch all cards for a library set (READ only, used for guest import) */
  async getLibraryCards(librarySetId: string): Promise<{ front: string; back: string; hint: string | null }[]> {
    return callLibraryApi<{ front: string; back: string; hint: string | null }[]>({ action: 'cards', id: librarySetId });
  }

  /** Toggle like on a library set */
  async toggleLike(_userId: string, librarySetId: string): Promise<ToggleLikeResponse> {
    return callLibraryApi<ToggleLikeResponse>({ action: 'like' }, { method: 'POST', body: { librarySetId }, requireAuth: true });
  }

  /** Rate a library set (1-5) */
  async rateSet(_userId: string, librarySetId: string, rating: number): Promise<RateResponse> {
    const ratingNum = Math.max(1, Math.min(5, Math.round(rating)));
    const json = await callLibraryApi<RateResponse>(
      { action: 'rate' },
      { method: 'POST', body: { librarySetId, rating: ratingNum }, requireAuth: true },
    );
    return { ...json, average_rating: json.average_rating ?? 0 };
  }

  /** Report a library set */
  async reportSet(_userId: string, librarySetId: string, reason: string): Promise<{ success: boolean }> {
    return callLibraryApi<{ success: boolean }>(
      { action: 'report' },
      { method: 'POST', body: { librarySetId, reason: reason || null }, requireAuth: true },
    );
  }

  /** Get user's own publications */
  async getMyPublications(_userId: string): Promise<LibrarySet[]> {
    return callLibraryApi<LibrarySet[]>({ action: 'my-publications' }, { requireAuth: true });
  }

  /** Check if a personal set is published */
  async checkPublished(setId: string, _userId: string): Promise<CheckPublishedResponse> {
    return callLibraryApi<CheckPublishedResponse>({ action: 'check-published', setId }, { requireAuth: true });
  }
}

export const LibraryService = new LibraryServiceClass();
