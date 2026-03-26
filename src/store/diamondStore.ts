import { create } from 'zustand';
import { NeonService } from '@/services/NeonService';
import { supabase } from '@/services/supabaseClient';

interface DiamondState {
  diamonds: number;
  addDiamonds: (amount: number) => void;
}

export const useDiamondStore = create<DiamondState>((set) => ({
  diamonds: 0,
  addDiamonds: (amount) => {
    set((state) => ({ diamonds: state.diamonds + amount }));
    // Persist to DB
    supabase.auth.getUser().then(({ data }) => {
      const userId = data?.user?.id;
      if (userId) {
        NeonService.addDiamonds(userId, amount);
      }
    });
  },
}));
