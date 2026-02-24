/**
 * Store для публичной библиотеки наборов
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { LibraryService } from '@/services/LibraryService';
import type {
  LibrarySet,
  LibrarySetDetail,
  LibraryFilters,
  PublishSetPayload,
} from '@/types/library';

interface LibraryState {
  // Sections
  trendingSets: LibrarySet[];
  topRatedSets: LibrarySet[];
  recentSets: LibrarySet[];

  // Pagination for recent
  recentPage: number;
  hasMoreRecent: boolean;

  // Detail
  currentSet: LibrarySetDetail | null;

  // Filters
  filters: LibraryFilters;

  // Loading
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;

  // My publications
  myPublications: LibrarySet[];
}

interface LibraryActions {
  fetchAllSections: (userId?: string) => Promise<void>;
  fetchMoreRecent: (userId?: string) => Promise<void>;
  fetchSetDetail: (id: string, userId?: string) => Promise<void>;
  setFilters: (filters: Partial<LibraryFilters>, userId?: string) => Promise<void>;
  publishSet: (userId: string, payload: PublishSetPayload) => Promise<string>;
  importSet: (userId: string, librarySetId: string) => Promise<string>;
  toggleLike: (userId: string, librarySetId: string) => Promise<void>;
  rateSet: (userId: string, librarySetId: string, rating: number) => Promise<void>;
  fetchMyPublications: (userId: string) => Promise<void>;
  unpublishSet: (userId: string, librarySetId: string) => Promise<void>;
  updatePublication: (userId: string, librarySetId: string) => Promise<void>;
  clearLibrary: () => void;
}

const DEFAULT_FILTERS: LibraryFilters = {
  sort: 'popular',
  page: 1,
};

export const useLibraryStore = create<LibraryState & LibraryActions>()(
  immer((set, get) => ({
    // Initial state
    trendingSets: [],
    topRatedSets: [],
    recentSets: [],
    recentPage: 1,
    hasMoreRecent: false,
    currentSet: null,
    filters: { ...DEFAULT_FILTERS },
    isLoading: false,
    isLoadingMore: false,
    error: null,
    myPublications: [],

    fetchAllSections: async (userId) => {
      set((s) => { s.isLoading = true; s.error = null; });

      try {
        const baseFilters = get().filters;

        const [trending, topRated, recent] = await Promise.all([
          LibraryService.getLibrarySets(
            { ...baseFilters, sort: 'popular', page: 1 },
            userId
          ),
          LibraryService.getLibrarySets(
            { ...baseFilters, sort: 'top_rated', page: 1 },
            userId
          ),
          LibraryService.getLibrarySets(
            { ...baseFilters, sort: 'newest', page: 1 },
            userId
          ),
        ]);

        set((s) => {
          s.trendingSets = trending.sets.slice(0, 10);
          s.topRatedSets = topRated.sets.slice(0, 10);
          s.recentSets = recent.sets;
          s.hasMoreRecent = recent.has_more;
          s.recentPage = 1;
          s.isLoading = false;
        });
      } catch (error) {
        set((s) => {
          s.isLoading = false;
          s.error = error instanceof Error ? error.message : 'Failed to load library';
        });
      }
    },

    fetchMoreRecent: async (userId) => {
      const { hasMoreRecent, isLoadingMore, recentPage, filters } = get();
      if (!hasMoreRecent || isLoadingMore) return;

      set((s) => { s.isLoadingMore = true; });

      try {
        const nextPage = recentPage + 1;
        const result = await LibraryService.getLibrarySets(
          { ...filters, sort: 'newest', page: nextPage },
          userId
        );

        set((s) => {
          s.recentSets = [...s.recentSets, ...result.sets];
          s.hasMoreRecent = result.has_more;
          s.recentPage = nextPage;
          s.isLoadingMore = false;
        });
      } catch {
        set((s) => { s.isLoadingMore = false; });
      }
    },

    fetchSetDetail: async (id, userId) => {
      set((s) => { s.currentSet = null; s.isLoading = true; });

      try {
        const detail = await LibraryService.getLibrarySetDetail(id, userId);
        set((s) => { s.currentSet = detail; s.isLoading = false; });
      } catch (error) {
        set((s) => {
          s.isLoading = false;
          s.error = error instanceof Error ? error.message : 'Failed to load set';
        });
      }
    },

    setFilters: async (newFilters, userId) => {
      set((s) => {
        s.filters = { ...s.filters, ...newFilters, page: 1 };
      });
      await get().fetchAllSections(userId);
    },

    publishSet: async (userId, payload) => {
      const result = await LibraryService.publishSet(userId, payload);
      return result.librarySetId;
    },

    importSet: async (userId, librarySetId) => {
      const result = await LibraryService.importSet(userId, librarySetId);

      // Update is_imported flag in all lists
      const updateImported = (sets: LibrarySet[]) =>
        sets.map(s => s.id === librarySetId
          ? { ...s, is_imported: true, imports_count: s.imports_count + 1 }
          : s
        );

      set((s) => {
        s.trendingSets = updateImported(s.trendingSets);
        s.topRatedSets = updateImported(s.topRatedSets);
        s.recentSets = updateImported(s.recentSets);
        if (s.currentSet && s.currentSet.id === librarySetId) {
          s.currentSet.is_imported = true;
          s.currentSet.imports_count += 1;
        }
      });

      return result.newSetId;
    },

    toggleLike: async (userId, librarySetId) => {
      const result = await LibraryService.toggleLike(userId, librarySetId);

      const updateLike = (sets: LibrarySet[]) =>
        sets.map(s => s.id === librarySetId
          ? { ...s, is_liked: result.is_liked, likes_count: result.likes_count }
          : s
        );

      set((s) => {
        s.trendingSets = updateLike(s.trendingSets);
        s.topRatedSets = updateLike(s.topRatedSets);
        s.recentSets = updateLike(s.recentSets);
        if (s.currentSet && s.currentSet.id === librarySetId) {
          s.currentSet.is_liked = result.is_liked;
          s.currentSet.likes_count = result.likes_count;
        }
      });
    },

    rateSet: async (userId, librarySetId, rating) => {
      const result = await LibraryService.rateSet(userId, librarySetId, rating);

      const updateRating = (sets: LibrarySet[]) =>
        sets.map(s => s.id === librarySetId
          ? { ...s, user_rating: result.user_rating, average_rating: result.average_rating, rating_count: result.rating_count }
          : s
        );

      set((s) => {
        s.trendingSets = updateRating(s.trendingSets);
        s.topRatedSets = updateRating(s.topRatedSets);
        s.recentSets = updateRating(s.recentSets);
        if (s.currentSet && s.currentSet.id === librarySetId) {
          s.currentSet.user_rating = result.user_rating;
          s.currentSet.average_rating = result.average_rating;
          s.currentSet.rating_count = result.rating_count;
        }
      });
    },

    fetchMyPublications: async (userId) => {
      try {
        const pubs = await LibraryService.getMyPublications(userId);
        set((s) => { s.myPublications = pubs; });
      } catch (error) {
        set((s) => {
          s.error = error instanceof Error ? error.message : 'Failed to load publications';
        });
      }
    },

    unpublishSet: async (userId, librarySetId) => {
      await LibraryService.unpublishSet(userId, librarySetId);
      set((s) => {
        s.myPublications = s.myPublications.map(p =>
          p.id === librarySetId ? { ...p, status: 'archived' as const } : p
        );
        // Remove from public lists
        s.trendingSets = s.trendingSets.filter(s2 => s2.id !== librarySetId);
        s.topRatedSets = s.topRatedSets.filter(s2 => s2.id !== librarySetId);
        s.recentSets = s.recentSets.filter(s2 => s2.id !== librarySetId);
      });
    },

    updatePublication: async (userId, librarySetId) => {
      await LibraryService.updatePublication(userId, librarySetId);
    },

    clearLibrary: () => {
      set((s) => {
        s.trendingSets = [];
        s.topRatedSets = [];
        s.recentSets = [];
        s.currentSet = null;
        s.filters = { ...DEFAULT_FILTERS };
        s.recentPage = 1;
        s.hasMoreRecent = false;
        s.myPublications = [];
        s.isLoading = false;
        s.isLoadingMore = false;
        s.error = null;
      });
    },
  }))
);
