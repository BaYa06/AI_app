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
  language?: string;     // combined key e.g. 'en-ru'
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
