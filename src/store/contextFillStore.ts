import { create } from 'zustand';

/**
 * Статистика режима "Fill in the Blank"
 * Хранится отдельно — не влияет на SRS и основные счётчики.
 */
interface ContextFillState {
  totalAnswered: number;       // всего вопросов отвечено за все сессии
  totalCorrect: number;        // правильных ответов
  correctCardIds: string[];    // уникальные ID карточек, угаданных хотя бы раз

  recordSession: (correct: number, total: number, correctIds: string[]) => void;
}

export const useContextFillStore = create<ContextFillState>((set) => ({
  totalAnswered: 0,
  totalCorrect: 0,
  correctCardIds: [],

  recordSession: (correct, total, correctIds) =>
    set((state) => {
      const merged = Array.from(
        new Set([...state.correctCardIds, ...correctIds]),
      );
      return {
        totalAnswered: state.totalAnswered + total,
        totalCorrect: state.totalCorrect + correct,
        correctCardIds: merged,
      };
    }),
}));
