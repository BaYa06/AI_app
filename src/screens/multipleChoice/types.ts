/**
 * Типы теста с вариантами ответа
 * (Clean 8 — перенесено из MultipleChoiceScreen.tsx без изменений.)
 */

export type ChallengeResult = {
  finished: boolean;
  timesUp: boolean;
  correct?: number;
  total?: number;
  timeSpent?: number;
} | null;

export type OptionState = 'neutral' | 'correct' | 'wrong';
export type Option = { id: string; label: string; text: string; isCorrect: boolean };
