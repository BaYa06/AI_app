/**
 * Store для карточек
 * @description Управление карточками с оптимизацией производительности
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { v4 as uuid } from 'uuid';
import type { Card, CreateCardInput, UpdateCardInput } from '@/types';
import { NeonService } from '@/services/NeonService';

interface CardsState {
  // Данные - храним в объекте для O(1) доступа
  cards: Record<string, Card>;
  cardsBySet: Record<string, string[]>; // setId -> cardIds для быстрого поиска
  
  // Загрузка
  isLoading: boolean;
  error: string | null;
}

interface CardsActions {
  // CRUD операции
  addCard: (input: CreateCardInput) => Card;
  updateCard: (cardId: string, input: UpdateCardInput) => void;
  deleteCard: (cardId: string) => void;
  
  // Пакетные операции
  addCards: (inputs: CreateCardInput[]) => Card[];
  deleteCardsBySet: (setId: string) => void;
  
  // SRS обновления
  updateCardSRS: (cardId: string, srsData: Partial<Pick<Card, 'learningStep' | 'nextReviewDate' | 'lastReviewDate' | 'status'>>) => void;
  resetCardProgress: (cardId: string) => void;
  
  // Селекторы (встроенные геттеры)
  getCard: (cardId: string) => Card | undefined;
  getCardsBySet: (setId: string) => Card[];
  getDueCards: (setId: string) => Card[];
  getNewCards: (setId: string) => Card[];
  
  // Состояние
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  clearCards: () => void;
}

const createDefaultSRSData = (): Pick<Card, 'learningStep' | 'nextReviewDate' | 'lastReviewDate' | 'status'> => ({
  learningStep: 0,
  nextReviewDate: Date.now(), // Доступна сразу
  lastReviewDate: 0,
  status: 'new',
});

export const useCardsStore = create<CardsState & CardsActions>()(
  immer((set, get) => ({
    // Начальное состояние
    cards: {},
    cardsBySet: {},
    isLoading: false,
    error: null,

    // ==================== CRUD ====================
    
    addCard: (input) => {
      const now = Date.now();
      const card: Card = {
        id: uuid(),
        ...input,
        createdAt: now,
        updatedAt: now,
        ...createDefaultSRSData(),
      };

      set((state) => {
        state.cards[card.id] = card;
        
        if (!state.cardsBySet[input.setId]) {
          state.cardsBySet[input.setId] = [];
        }
        state.cardsBySet[input.setId].push(card.id);
      });

      return card;
    },

    updateCard: (cardId, input) => {
      set((state) => {
        const card = state.cards[cardId];
        if (card) {
          Object.assign(card, input, { updatedAt: Date.now() });
        }
      });
    },

    deleteCard: (cardId) => {
      set((state) => {
        const card = state.cards[cardId];
        if (card) {
          // Удаляем из индекса setId -> cardIds
          const setCards = state.cardsBySet[card.setId];
          if (setCards) {
            const index = setCards.indexOf(cardId);
            if (index > -1) {
              setCards.splice(index, 1);
            }
          }
          // Удаляем саму карточку
          delete state.cards[cardId];
        }
      });
    },

    // ==================== ПАКЕТНЫЕ ====================
    
    addCards: (inputs) => {
      const now = Date.now();
      const newCards: Card[] = inputs.map((input) => ({
        id: uuid(),
        ...input,
        createdAt: now,
        updatedAt: now,
        ...createDefaultSRSData(),
      }));

      set((state) => {
        for (const card of newCards) {
          state.cards[card.id] = card;
          
          if (!state.cardsBySet[card.setId]) {
            state.cardsBySet[card.setId] = [];
          }
          state.cardsBySet[card.setId].push(card.id);
        }
      });

      return newCards;
    },

    deleteCardsBySet: (setId) => {
      set((state) => {
        const cardIds = state.cardsBySet[setId] || [];
        for (const cardId of cardIds) {
          delete state.cards[cardId];
        }
        delete state.cardsBySet[setId];
      });
    },

    // ==================== SRS ====================
    
    updateCardSRS: (cardId, srsData) => {
      set((state) => {
        const card = state.cards[cardId];
        if (card) {
          Object.assign(card, srsData, { updatedAt: Date.now() });
        }
      });

      // Синхронизируем SRS с базой (best-effort)
      (async () => {
        try {
          await NeonService.updateCardSRS(cardId, srsData);
        } catch (error) {
          console.error('Failed to sync SRS to Neon:', error);
        }
      })();
    },

    resetCardProgress: (cardId) => {
      set((state) => {
        const card = state.cards[cardId];
        if (card) {
          Object.assign(card, createDefaultSRSData(), { updatedAt: Date.now() });
        }
      });
    },

    // ==================== СЕЛЕКТОРЫ ====================
    
    getCard: (cardId) => {
      return get().cards[cardId];
    },

    getCardsBySet: (setId) => {
      const state = get();
      const cardIds = state.cardsBySet[setId] || [];
      return cardIds.map((id) => state.cards[id]).filter(Boolean);
    },

    getDueCards: (setId) => {
      const state = get();
      const cardIds = state.cardsBySet[setId] || [];
      const now = Date.now();
      
      return cardIds
        .map((id) => state.cards[id])
        .filter((card) => card && card.nextReviewDate <= now && card.status !== 'new');
    },

    getNewCards: (setId) => {
      const state = get();
      const cardIds = state.cardsBySet[setId] || [];
      
      return cardIds
        .map((id) => state.cards[id])
        .filter((card) => card && card.status === 'new');
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

    clearCards: () => {
      set((state) => {
        state.cards = {};
        state.cardsBySet = {};
        state.error = null;
      });
    },
  }))
);

// ==================== МЕМОИЗИРОВАННЫЕ СЕЛЕКТОРЫ ====================

/**
 * Селектор для получения количества карточек по статусам для набора
 * Упрощенная логика: выученной считается карточка с nextReview > сейчас
 */
export const selectSetStats = (setId: string) => {
  const state = useCardsStore.getState();
  const cardIds = state.cardsBySet[setId] || [];
  
  let learnedCount = 0;   // Выученные (nextReview > сейчас)
  let dueCount = 0;       // К повторению (nextReview <= сейчас)
  const now = Date.now();

  for (const id of cardIds) {
    const card = state.cards[id];
    if (!card) continue;

    // Простая логика: только время повторения
    if (card.nextReviewDate > now) {
      learnedCount++;  // Выучено - повторение в будущем
    } else {
      dueCount++;      // Нужно повторить
    }
  }

  const total = cardIds.length;

  return {
    total,
    newCount: dueCount,         // Для совместимости - все что нужно повторить
    learningCount: 0,           // Deprecated
    youngCount: 0,              // Deprecated
    matureCount: 0,             // Deprecated
    masteredCount: learnedCount,// Выученные
    dueCount,                   // К повторению
    learnedCount,               // Выученные
    reviewCount: dueCount,      // Для совместимости
  };
};
