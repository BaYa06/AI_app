import { create } from 'zustand';
import { supabase } from '@/services/supabaseClient';
import { API_BASE } from '@/config/apiBase';
import { useChallengeStore, type ChallengeId } from './challengeStore';

// Баланс и ежедневные награды живут в БД (users.diamond, daily_rewards). Начисляет только
// сервер (api/push.js?action=claim-reward), он же не даёт забрать награду дважды за день.
const REWARDS_API = `${API_BASE}/push`;

/** Сегодняшняя дата по локальному времени — "день" челленджа для пользователя. */
function localDay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function callRewardsApi(action: string, init: { method: 'GET' | 'POST'; body?: object }, day: string) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return null;
  try {
    const resp = await fetch(`${REWARDS_API}?action=${action}&day=${day}`, {
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
  diamonds: 0,
  loadRewards: async () => {
    const day = localDay();
    const data = await callRewardsApi('rewards', { method: 'GET' }, day);
    if (!data) return;
    set({ diamonds: data.diamonds });
    useChallengeStore.getState().syncClaimed(data.claimedToday);
  },
  claimReward: async (challenge) => {
    const day = localDay();
    const data = await callRewardsApi('claim-reward', { method: 'POST', body: { challenge } }, day);
    if (!data) return null;
    return data.diamonds;
  },
  setDiamonds: (diamonds) => set({ diamonds }),
}));
