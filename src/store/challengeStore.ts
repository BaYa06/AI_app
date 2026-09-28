import { create } from 'zustand';
import { readCache } from '@/services/localCache';

export type ChallengeStatus = 'pending' | 'completed' | 'claimed';
/** Совпадает с ключами CHALLENGE_REWARDS в api/push.js */
export type ChallengeId = 'quick_round' | 'sniper' | 'forgotten';

export const CHALLENGE_IDS: ChallengeId[] = ['quick_round', 'sniper', 'forgotten'];

const allPending = (): Record<ChallengeId, ChallengeStatus> =>
  ({ quick_round: 'pending', sniper: 'pending', forgotten: 'pending' });

/** Сегодняшняя дата по локальному времени (YYYY-MM-DD) */
export function localDay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Забранные сегодня награды с прошлого запуска — «Получено» видно сразу и без сети */
function initialStatuses(): Record<ChallengeId, ChallengeStatus> {
  const statuses = allPending();
  const cached = readCache<{ day: string; claimed: string[] }>('challenges_claimed');
  if (cached?.day === localDay()) {
    for (const id of CHALLENGE_IDS) if (cached.claimed.includes(id)) statuses[id] = 'claimed';
  }
  return statuses;
}

interface ChallengeState {
  statuses: Record<ChallengeId, ChallengeStatus>;
  /** Игра выиграна — награду можно забрать (если сегодня ещё не забрана). */
  completeChallenge: (id: ChallengeId) => void;
  claimChallenge: (id: ChallengeId) => void;
  /** Откат оптимистичного «Получено», если сервер не выдал награду */
  revertClaim: (id: ChallengeId) => void;
  /** Применить список забранных сегодня челленджей из БД (источник правды — сервер). */
  syncClaimed: (claimedToday: string[]) => void;
}

export const useChallengeStore = create<ChallengeState>((set, get) => ({
  statuses: initialStatuses(),
  completeChallenge: (id) => {
    const { statuses } = get();
    if (statuses[id] !== 'claimed') set({ statuses: { ...statuses, [id]: 'completed' } });
  },
  claimChallenge: (id) => set({ statuses: { ...get().statuses, [id]: 'claimed' } }),
  revertClaim: (id) => set({ statuses: { ...get().statuses, [id]: 'completed' } }),
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
