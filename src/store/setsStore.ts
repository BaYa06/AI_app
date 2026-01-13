/**
 * Store для наборов карточек
 * @description Управление наборами (колодами) карточек
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { v4 as uuid } from 'uuid';
import type { CardSet, CreateSetInput, UpdateSetInput } from '@/types';

interface SetsState {
  // Данные - объект для O(1) доступа
  sets: Record<string, CardSet>;
  setsOrder: string[]; // Порядок отображения
  
  // Загрузка
  isLoading: boolean;
  error: string | null;
}

interface SetsActions {
  // CRUD
  addSet: (input: CreateSetInput) => CardSet;
  updateSet: (setId: string, input: UpdateSetInput) => void;
  deleteSet: (setId: string) => void;
  
  // Действия
  toggleFavorite: (setId: string) => void;
  archiveSet: (setId: string) => void;
  unarchiveSet: (setId: string) => void;
  updateLastStudied: (setId: string) => void;
  
  // Обновление статистики набора
  updateSetStats: (setId: string, stats: Partial<Pick<CardSet, 'cardCount' | 'newCount' | 'learningCount' | 'reviewCount' | 'masteredCount'>>) => void;
  incrementCardCount: (setId: string) => void;
  decrementCardCount: (setId: string) => void;
  
  // Селекторы
  getSet: (setId: string) => CardSet | undefined;
  getAllSets: () => CardSet[];
  getFavoriteSets: () => CardSet[];
  getRecentSets: (limit?: number) => CardSet[];
  
  // Состояние
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  clearSets: () => void;
}

const DEFAULT_USER_ID = 'local'; // Для локального хранения

export const useSetsStore = create<SetsState & SetsActions>()(
  immer((set, get) => ({
    // Начальное состояние
    sets: {},
    setsOrder: [],
    isLoading: false,
    error: null,

    // ==================== CRUD ====================
    
    addSet: (input) => {
      const now = Date.now();
      const newSet: CardSet = {
        id: uuid(),
        userId: DEFAULT_USER_ID,
        title: input.title,
        description: input.description,
        category: input.category || 'general',
        tags: input.tags || [],
        icon: input.icon,
        color: input.color,
        isPublic: input.isPublic ?? false,
        createdAt: now,
        updatedAt: now,
        lastStudiedAt: undefined,
        cardCount: 0,
        newCount: 0,
        learningCount: 0,
        reviewCount: 0,
        masteredCount: 0,
        isFavorite: false,
        isArchived: false,
      };

      set((state) => {
        state.sets[newSet.id] = newSet;
        state.setsOrder.unshift(newSet.id); // Новые сверху
      });

      return newSet;
    },

    updateSet: (setId, input) => {
      set((state) => {
        const cardSet = state.sets[setId];
        if (cardSet) {
          Object.assign(cardSet, input, { updatedAt: Date.now() });
        }
      });
    },

    deleteSet: (setId) => {
      set((state) => {
        delete state.sets[setId];
        const index = state.setsOrder.indexOf(setId);
        if (index > -1) {
          state.setsOrder.splice(index, 1);
        }
      });
    },

    // ==================== ДЕЙСТВИЯ ====================
    
    toggleFavorite: (setId) => {
      set((state) => {
        const cardSet = state.sets[setId];
        if (cardSet) {
          cardSet.isFavorite = !cardSet.isFavorite;
          cardSet.updatedAt = Date.now();
        }
      });
    },

    archiveSet: (setId) => {
      set((state) => {
        const cardSet = state.sets[setId];
        if (cardSet) {
          cardSet.isArchived = true;
          cardSet.updatedAt = Date.now();
        }
      });
    },

    unarchiveSet: (setId) => {
      set((state) => {
        const cardSet = state.sets[setId];
        if (cardSet) {
          cardSet.isArchived = false;
          cardSet.updatedAt = Date.now();
        }
      });
    },

    updateLastStudied: (setId) => {
      set((state) => {
        const cardSet = state.sets[setId];
        if (cardSet) {
          cardSet.lastStudiedAt = Date.now();
        }
      });
    },

    // ==================== СТАТИСТИКА ====================
    
    updateSetStats: (setId, stats) => {
      set((state) => {
        const cardSet = state.sets[setId];
        if (cardSet) {
          Object.assign(cardSet, stats);
        }
      });
    },

    incrementCardCount: (setId) => {
      set((state) => {
        const cardSet = state.sets[setId];
        if (cardSet) {
          cardSet.cardCount++;
          cardSet.newCount++;
        }
      });
    },

    decrementCardCount: (setId) => {
      set((state) => {
        const cardSet = state.sets[setId];
        if (cardSet && cardSet.cardCount > 0) {
          cardSet.cardCount--;
        }
      });
    },

    // ==================== СЕЛЕКТОРЫ ====================
    
    getSet: (setId) => {
      return get().sets[setId];
    },

    getAllSets: () => {
      const state = get();
      return state.setsOrder
        .map((id) => state.sets[id])
        .filter((s) => s && !s.isArchived);
    },

    getFavoriteSets: () => {
      const state = get();
      return state.setsOrder
        .map((id) => state.sets[id])
        .filter((s) => s && s.isFavorite && !s.isArchived);
    },

    getRecentSets: (limit = 5) => {
      const state = get();
      return state.setsOrder
        .map((id) => state.sets[id])
        .filter((s) => s && !s.isArchived && s.lastStudiedAt)
        .sort((a, b) => (b.lastStudiedAt || 0) - (a.lastStudiedAt || 0))
        .slice(0, limit);
    },

    // ==================== СОСТОЯНИЕ ====================
    
    setLoading: (isLoading) => {
      set((state) => {
        state.isLoading = isLoading;
      });
    },

    setError: (error) => {
      set((state) => {
        state.error = error;
      });
    },

    clearSets: () => {
      set((state) => {
        state.sets = {};
        state.setsOrder = [];
        state.error = null;
      });
    },
  }))
);
