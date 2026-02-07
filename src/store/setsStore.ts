/**
 * Store для наборов карточек
 * @description Управление наборами (колодами) карточек
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { v4 as uuid } from 'uuid';
import type { CardSet, CreateSetInput, UpdateSetInput } from '@/types';
import { NeonService } from '@/services/NeonService';
import { DatabaseService } from '@/services/DatabaseService';
import { supabase } from '@/services/supabaseClient';

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
  addSet: (input: CreateSetInput) => Promise<CardSet>;
  updateSet: (setId: string, input: UpdateSetInput) => void;
  deleteSet: (setId: string) => void;
  
  // Действия
  toggleFavorite: (setId: string) => void;
  archiveSet: (setId: string) => void;
  unarchiveSet: (setId: string) => void;
  updateLastStudied: (setId: string) => void;
  
  // Курсы
  moveSetsFromCourse: (courseId: string) => void; // Перемещает наборы из курса в "All"
  getSetsByCourse: (courseId: string | null) => CardSet[]; // Получить наборы по курсу
  
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

const LOCAL_USER_ID = 'local'; // Для локального хранения
const REMOTE_USER_ID = process.env.POSTGRES_DEFAULT_USER_ID || '00000000-0000-0000-0000-000000000001';

export const useSetsStore = create<SetsState & SetsActions>()(
  immer((set, get) => ({
    // Начальное состояние
    sets: {},
    setsOrder: [],
    isLoading: false,
    error: null,

    // ==================== CRUD ====================
    
    addSet: async (input) => {
      const now = Date.now();
      const currentUserId = NeonService.isEnabled()
        ? (await supabase.auth.getSession()).data.session?.user?.id || REMOTE_USER_ID
        : LOCAL_USER_ID;

      const newSet: CardSet = {
        id: uuid(),
        userId: currentUserId,
        courseId: input.courseId ?? null, // ID курса (null = глобальный)
        title: input.title,
        description: input.description,
        category: input.category || 'general',
        tags: input.tags || [],
        icon: input.icon,
        color: input.color,
        languageFrom: input.languageFrom || 'de',
        languageTo: input.languageTo || 'ru',
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

      // Сохраняем локально сразу, чтобы не потерять набор при выходе
      DatabaseService.saveSets();
      console.log('✅ Набор сохранен локально:', newSet.title);

      // Асинхронно отправляем в Neon (best-effort)
      if (NeonService.isEnabled()) {
        console.log('🔄 Отправка набора в Neon PostgreSQL...');
        (async () => {
          const ok = await NeonService.createSet({
            id: newSet.id,
            userId: newSet.userId,
            courseId: newSet.courseId,
            title: newSet.title,
            description: newSet.description,
            category: newSet.category,
            isPublic: newSet.isPublic,
            createdAt: newSet.createdAt,
            updatedAt: newSet.updatedAt,
          });
          if (ok) {
            console.log('✅ Набор сохранен в Neon PostgreSQL:', newSet.title);
          } else {
            console.warn('⚠️  Не удалось синхронизировать набор с Neon:', newSet.title);
          }
        })();
      } else {
        console.log('ℹ️  Neon PostgreSQL не настроен, набор сохранен только локально');
      }

      return newSet;
    },

    updateSet: (setId, input) => {
      set((state) => {
        const cardSet = state.sets[setId];
        if (cardSet) {
          Object.assign(cardSet, input, { updatedAt: Date.now() });
        }
      });

      // Сохраняем локально
      DatabaseService.saveSets();

      // Синхронизируем courseId в Neon, если задан и включён Neon
      if (NeonService.isEnabled() && 'courseId' in input) {
        const courseId = (input as any).courseId ?? null;
        console.log('🔄 Обновление course_id набора в Neon:', { setId, courseId });
        (async () => {
          const ok = await NeonService.updateSetCourse(setId, courseId);
          if (ok) {
            console.log('✅ Course_id обновлен в Neon PostgreSQL для набора:', setId);
          } else {
            console.warn('⚠️  Не удалось обновить course_id набора в Neon:', setId);
          }
        })();
      }
    },

    deleteSet: (setId) => {
      set((state) => {
        delete state.sets[setId];
        const index = state.setsOrder.indexOf(setId);
        if (index > -1) {
          state.setsOrder.splice(index, 1);
        }
      });

      // Сохраняем локально
      DatabaseService.saveSets();
      console.log('✅ Набор удален локально:', setId);

      // Асинхронно удаляем из Neon
      if (NeonService.isEnabled()) {
        console.log('🔄 Удаление набора из Neon PostgreSQL...');
        (async () => {
          const ok = await NeonService.deleteSet(setId);
          if (!ok) {
            console.warn('⚠️  Не удалось удалить набор из Neon:', setId);
          }
        })();
      }
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

    // ==================== КУРСЫ ====================

    moveSetsFromCourse: (courseId) => {
      set((state) => {
        Object.values(state.sets).forEach((cardSet) => {
          if (cardSet.courseId === courseId) {
            cardSet.courseId = null; // Перемещаем в "All"
            cardSet.updatedAt = Date.now();
          }
        });
      });

      // Сохраняем изменения
      DatabaseService.saveSets();
      console.log('✅ Наборы перемещены из курса в "All":', courseId);
    },

    getSetsByCourse: (courseId) => {
      const state = get();
      return state.setsOrder
        .map((id) => state.sets[id])
        .filter((s) => {
          if (!s || s.isArchived) return false;
          if (courseId === null) return true; // "All" показывает все
          // Учитываем, что courseId может быть undefined для старых наборов
          return s.courseId === courseId;
        });
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
