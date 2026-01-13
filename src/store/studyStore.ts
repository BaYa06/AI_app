/**
 * Store для сессии изучения
 * @description Управление текущей сессией изучения карточек
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { v4 as uuid } from 'uuid';
import type { StudySession, StudySessionConfig, Card } from '@/types';

interface StudyState {
  // Текущая сессия
  session: StudySession | null;
  currentCard: Card | null;
  
  // UI состояние
  isFlipped: boolean;
  isLoading: boolean;
  
  // Время
  cardStartTime: number;
}

interface StudyActions {
  // Управление сессией
  startSession: (config: StudySessionConfig, cards: Card[]) => void;
  endSession: () => StudySession | null;
  
  // Навигация
  showAnswer: () => void;
  hideAnswer: () => void;
  nextCard: () => Card | null;
  previousCard: () => void;
  
  // Ответы
  recordAnswer: (isCorrect: boolean) => void;
  
  // Геттеры
  getProgress: () => { current: number; total: number; percentage: number };
  getTimeSpent: () => number;
  getCurrentCardTime: () => number;
  
  // Сброс
  reset: () => void;
}

const initialState: StudyState = {
  session: null,
  currentCard: null,
  isFlipped: false,
  isLoading: false,
  cardStartTime: 0,
};

export const useStudyStore = create<StudyState & StudyActions>()(
  immer((set, get) => ({
    ...initialState,

    // ==================== СЕССИЯ ====================
    
    startSession: (config, cards) => {
      const queue = config.shuffleCards 
        ? [...cards].sort(() => Math.random() - 0.5).map((c) => c.id)
        : cards.map((c) => c.id);

      const session: StudySession = {
        id: uuid(),
        setId: config.setId,
        mode: config.mode,
        startedAt: Date.now(),
        queue,
        currentIndex: 0,
        totalCards: cards.length,
        completedCards: 0,
        correctAnswers: 0,
        incorrectAnswers: 0,
        totalTimeSpent: 0,
        averageTimePerCard: 0,
      };

      set((state) => {
        state.session = session;
        state.currentCard = cards[0] || null;
        state.isFlipped = false;
        state.cardStartTime = Date.now();
      });
    },

    endSession: () => {
      const { session } = get();
      if (!session) return null;

      const finalSession = {
        ...session,
        totalTimeSpent: Date.now() - session.startedAt,
        averageTimePerCard: session.completedCards > 0 
          ? (Date.now() - session.startedAt) / session.completedCards 
          : 0,
      };

      set((state) => {
        state.session = null;
        state.currentCard = null;
        state.isFlipped = false;
      });

      return finalSession;
    },

    // ==================== НАВИГАЦИЯ ====================
    
    showAnswer: () => {
      set((state) => {
        state.isFlipped = true;
      });
    },

    hideAnswer: () => {
      set((state) => {
        state.isFlipped = false;
      });
    },

    nextCard: () => {
      const state = get();
      if (!state.session) return null;

      const nextIndex = state.session.currentIndex + 1;
      if (nextIndex >= state.session.queue.length) {
        return null; // Сессия завершена
      }

      set((s) => {
        if (s.session) {
          s.session.currentIndex = nextIndex;
          s.session.completedCards++;
          s.isFlipped = false;
          s.cardStartTime = Date.now();
        }
      });

      // Возвращаем ID следующей карточки - компонент должен получить её из store
      return null; // Карточка будет установлена через setCurrentCard
    },

    previousCard: () => {
      const state = get();
      if (!state.session || state.session.currentIndex <= 0) return;

      set((s) => {
        if (s.session && s.session.currentIndex > 0) {
          s.session.currentIndex--;
          s.isFlipped = false;
          s.cardStartTime = Date.now();
        }
      });
    },

    // ==================== ОТВЕТЫ ====================
    
    recordAnswer: (isCorrect) => {
      set((state) => {
        if (state.session) {
          if (isCorrect) {
            state.session.correctAnswers++;
          } else {
            state.session.incorrectAnswers++;
          }
        }
      });
    },

    // ==================== ГЕТТЕРЫ ====================
    
    getProgress: () => {
      const { session } = get();
      if (!session) return { current: 0, total: 0, percentage: 0 };

      return {
        current: session.currentIndex + 1,
        total: session.totalCards,
        percentage: Math.round(((session.currentIndex + 1) / session.totalCards) * 100),
      };
    },

    getTimeSpent: () => {
      const { session } = get();
      if (!session) return 0;
      return Date.now() - session.startedAt;
    },

    getCurrentCardTime: () => {
      const { cardStartTime } = get();
      if (!cardStartTime) return 0;
      return Date.now() - cardStartTime;
    },

    // ==================== СБРОС ====================
    
    reset: () => {
      set(initialState);
    },
  }))
);
