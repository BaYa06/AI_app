import { create } from 'zustand';
import { supabase } from '@/services/supabaseClient';
import { API_BASE } from '@/config/apiBase';
import { fetchWithTimeout } from '@/utils/fetchWithTimeout';
import { useChallengeStore, localDay, type ChallengeId } from './challengeStore';
import { readCache, writeCache } from '@/services/localCache';

// Баланс и ежедневные награды живут в БД (users.diamond, daily_rewards). Начисляет только
// сервер (api/push.js?action=claim-reward), он же не даёт забрать награду дважды за день.
const REWARDS_API = `${API_BASE}/push`;

async function callRewardsApi(action: string, init: { method: 'GET' | 'POST'; body?: object }, day: string) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return null;
  try {
    const resp = await fetchWithTimeout(`${REWARDS_API}?action=${action}&day=${day}`, {
      method: init.method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: init.body ? JSON.stringify({ ...init.body, day }) : undefined,
    });
    return resp.ok ? await resp.json() : null;
  } catch (error) {
    console.error(`Rewards API ${action} failed:`, error);
    return null;
  }
}

interface DiamondState {
  diamonds: number;
  /** Подтянуть баланс и уже забранные сегодня челленджи из БД. */
  loadRewards: () => Promise<void>;
  /**
   * Забрать награду за челлендж. Возвращает новый баланс (не применяя его и не меняя статус
   * челленджа — экран делает это после анимации) или null, если сервер недоступен.
   */
  claimReward: (challenge: ChallengeId) => Promise<number | null>;
  setDiamonds: (diamonds: number) => void;
}

export const useDiamondStore = create<DiamondState>((set) => ({
  // Баланс с прошлого запуска — виден сразу и без сети; сервер обновит в loadRewards
  diamonds: readCache<number>('diamonds') ?? 0,
  loadRewards: async () => {
    const day = localDay();
    const data = await callRewardsApi('rewards', { method: 'GET' }, day);
    if (!data) return;
    set({ diamonds: data.diamonds });
    writeCache('diamonds', data.diamonds);
    writeCache('challenges_claimed', { day, claimed: data.claimedToday });
    useChallengeStore.getState().syncClaimed(data.claimedToday);
  },
  claimReward: async (challenge) => {
    const day = localDay();
    const data = await callRewardsApi('claim-reward', { method: 'POST', body: { challenge } }, day);
    if (!data) return null;
    const cached = readCache<{ day: string; claimed: string[] }>('challenges_claimed');
    const claimed = cached?.day === day ? cached.claimed : [];
    writeCache('challenges_claimed', { day, claimed: Array.from(new Set([...claimed, challenge])) });
    return data.diamonds;
  },
  setDiamonds: (diamonds) => {
    set({ diamonds });
    writeCache('diamonds', diamonds);
  },
}));
