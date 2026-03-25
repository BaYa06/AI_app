import { create } from 'zustand';

export type ChallengeStatus = 'pending' | 'completed' | 'claimed';

interface ChallengeState {
  quickRoundStatus: ChallengeStatus;
  completeQuickRound: () => void;
  claimQuickRound: () => void;
  resetQuickRound: () => void;
}

export const useChallengeStore = create<ChallengeState>((set) => ({
  quickRoundStatus: 'pending',
  completeQuickRound: () => set({ quickRoundStatus: 'completed' }),
  claimQuickRound: () => set({ quickRoundStatus: 'claimed' }),
  resetQuickRound: () => set({ quickRoundStatus: 'pending' }),
}));
