import { create } from 'zustand';

export type ChallengeStatus = 'pending' | 'completed' | 'claimed';
/** Совпадает с ключами CHALLENGE_REWARDS в api/push.js */
export type ChallengeId = 'quick_round' | 'sniper' | 'forgotten';

export const CHALLENGE_IDS: ChallengeId[] = ['quick_round', 'sniper', 'forgotten'];

const allPending = (): Record<ChallengeId, ChallengeStatus> =>
  ({ quick_round: 'pending', sniper: 'pending', forgotten: 'pending' });

interface ChallengeState {
  statuses: Record<ChallengeId, ChallengeStatus>;
  /** Игра выиграна — награду можно забрать (если сегодня ещё не забрана). */
  completeChallenge: (id: ChallengeId) => void;
  claimChallenge: (id: ChallengeId) => void;
  /** Применить список забранных сегодня челленджей из БД (источник правды — сервер). */
  syncClaimed: (claimedToday: string[]) => void;
}

export const useChallengeStore = create<ChallengeState>((set, get) => ({
  statuses: allPending(),
  completeChallenge: (id) => {
    const { statuses } = get();
    if (statuses[id] !== 'claimed') set({ statuses: { ...statuses, [id]: 'completed' } });
  },
  claimChallenge: (id) => set({ statuses: { ...get().statuses, [id]: 'claimed' } }),
  syncClaimed: (claimedToday) => {
    const next = { ...get().statuses };
    for (const id of CHALLENGE_IDS) {
      if (claimedToday.includes(id)) next[id] = 'claimed';
      // Забрано было вчера — наступил новый день, челлендж снова доступен
      else if (next[id] === 'claimed') next[id] = 'pending';
    }
    set({ statuses: next });
  },
}));
