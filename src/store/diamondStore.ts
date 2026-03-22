import { create } from 'zustand';

interface DiamondState {
  diamonds: number;
  addDiamonds: (amount: number) => void;
}

export const useDiamondStore = create<DiamondState>((set) => ({
  diamonds: 0,
  addDiamonds: (amount) => set((state) => ({ diamonds: state.diamonds + amount })),
}));
