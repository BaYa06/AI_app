/**
 * Library types — public sets sharing system
 */

export interface LibrarySet {
  id: string;
  user_id: string;
  original_set_id: string | null;
  title: string;
  description: string | null;
  category: string | null;
  tags: string[];
  language_from: string | null;
  language_to: string | null;
  /** Тип набора (plan/new/set_kind.md); null — язык */
  kind?: 'language' | 'subject' | null;
  cards_count: number;
  imports_count: number;
  likes_count: number;
  rating_sum: number;
  rating_count: number;
  status: 'published' | 'archived' | 'blocked';
  is_featured: boolean;
  cover_emoji: string | null;
  published_at: string;
  updated_at: string;

  // Joined fields
  author_name?: string;

  // Per-user flags (computed from joins)
  is_imported?: boolean;
  is_liked?: boolean;
  user_rating?: number | null;
  average_rating?: number | null;
}

export interface LibraryCard {
  id: string;
  library_set_id: string;
  front: string;
  back: string;
  hint: string | null;
  order_index: number;
}

export interface LibrarySetDetail extends LibrarySet {
  preview_cards: LibraryCard[];
}

export interface PublishSetPayload {
  setId: string;
  description?: string;
  tags?: string[];
  category?: string;
  coverEmoji?: string;
}

export type LibrarySortType = 'popular' | 'newest' | 'top_rated' | 'featured';

export interface LibraryFilters {
  search?: string;
  category?: string;
  language?: string; // combined key e.g. 'en-ru'
  sort?: LibrarySortType;
  cardsMin?: number;
  cardsMax?: number | null;
  page?: number;
}

export interface LibraryListResponse {
  sets: LibrarySet[];
  has_more: boolean;
  total?: number;
}

export interface PublishResponse {
  librarySetId: string;
}

export interface ImportResponse {
  newSetId: string;
}

export interface CheckPublishedResponse {
  isPublished: boolean;
  librarySetId?: string;
  /** Публиковать в библиотеку может только админ (api/library.js). */
  canPublish?: boolean;
}

export interface ToggleLikeResponse {
  is_liked: boolean;
  likes_count: number;
}

export interface RateResponse {
  user_rating: number;
  average_rating: number;
  rating_count: number;
}

// ── Каталог: предмет → (язык / раздел) → (уровень) → подборка → набор ──────────
// plan/new/library_catalog.md; ответы api/library.js?action=catalog|subject|collection|search
// (api/_handlers/library/catalog.js). «Добавлено» — только личный импорт, без «положил в курс».

/** Шкала уровней предмета: A1–C2, basic / advanced или без уровней. */
export type CatalogLevelScale = 'cefr' | 'stages' | null;

/** Плитка предмета на экране «Библиотека». */
export interface CatalogSubjectTile {
  slug: string;
  title: string;
  subtitle: string | null;
  /** Имя иконки lucide (globe, landmark…) */
  icon: string | null;
  collectionsCount: number;
}

export interface CatalogCollection {
  id: string;
  subject: string;
  /** Код языка (en) или ключ раздела (math); null — у предмета нет разделов */
  track: string | null;
  /** Название раздела; у языков null — название языка берёт приложение */
  trackTitle: string | null;
  /** A1…C2, basic / advanced или null */
  level: string | null;
  title: string;
  description: string | null;
  icon: string | null;
  position: number;
  setsCount: number;
  cardsCount: number;
  addedCount: number;
}

export interface CatalogSet {
  id: string;
  title: string;
  description: string | null;
  /** Номер в подборке (1…N); у набора вне подборки — null */
  position: number | null;
  cardsCount: number;
  isImported: boolean;
}

/** Учебник на полке (юниты — официальные наборы книги). */
export interface CatalogBook {
  id: string;
  title: string;
  edition: string;
  level: string | null;
  subject: string | null;
  languageFrom: string;
  languageTo: string;
  publisher: string | null;
  unitsCount: number;
  addedCount: number;
}

export interface CatalogResponse {
  subjects: CatalogSubjectTile[];
  /** «Продолжить подборку»: последняя подборка, где я добавлял наборы, и следующий недобавленный */
  continue: { collection: CatalogCollection; next: CatalogSet } | null;
  /** «С чего начать» — только если я ещё ничего не добавлял */
  start: CatalogCollection | null;
  books: CatalogBook[];
}

export interface CatalogSubject {
  slug: string;
  title: string;
  subtitle: string | null;
  icon: string | null;
  /** Как называется ряд L2 («Язык», «Раздел»); null — ряда нет */
  trackLabel: string | null;
  levelScale: CatalogLevelScale;
  setKind: 'language' | 'subject';
}

/** Раздел / язык с непустыми уровнями (по шкале предмета, по порядку). */
export interface CatalogTrack {
  key: string | null;
  title: string | null;
  levels: string[];
}

export interface CatalogSubjectResponse {
  subject: CatalogSubject;
  tracks: CatalogTrack[];
  collections: CatalogCollection[];
}

export interface CatalogCollectionResponse {
  collection: CatalogCollection & {
    subjectTitle: string | null;
    setKind: 'language' | 'subject' | null;
    levelScale: CatalogLevelScale;
  };
  sets: CatalogSet[];
}

export interface CatalogSearchResponse {
  collections: CatalogCollection[];
  /** collection: null — старый набор вне подборки */
  sets: (CatalogSet & { collection: CatalogCollection | null })[];
  books: CatalogBook[];
}

export interface ImportCollectionResponse {
  courseId: string;
  imported: { librarySetId: string; newSetId: string; cardsCopied: number }[];
  /** Уже лежали в этом курсе */
  skipped: number;
}
