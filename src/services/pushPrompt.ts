/**
 * Лист «Напомнить завтра повторить эти слова?» (plan/push_notifications.md, шаг 1.2)
 * @description Системный диалог iOS бывает один раз, поэтому спрашиваем не сразу после онбординга,
 * а на итогах урока дня, когда человек только что увидел пользу. «Не сейчас» — следующая попытка
 * не раньше чем через 3 дня, снова после пройденного урока; всего не больше 3 попыток.
 * Только нативное приложение: в вебе свой баннер (App.tsx).
 */
import { API_BASE } from '@/config/apiBase';
import { readCache, writeCache } from './localCache';
import { supabase } from './supabaseClient';

const CACHE_NAME = 'push_prompt';
export const PUSH_PROMPT_MAX_ATTEMPTS = 3;
export const PUSH_PROMPT_RETRY_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PushPromptState {
  /** Даты показа листа (YYYY-MM-DD) */
  shownDays: string[];
}

const EMPTY: PushPromptState = { shownDays: [] };

/** Пора ли показать лист: разрешение ещё не спрашивали, попытки остались, прошло 3 дня с прошлой */
export function shouldShowPushPrompt(
  state: PushPromptState,
  today: string,
  opts: { permission: string; supported: boolean },
): boolean {
  if (!opts.supported || opts.permission !== 'default') return false;
  if (state.shownDays.length >= PUSH_PROMPT_MAX_ATTEMPTS) return false;
  const last = state.shownDays[state.shownDays.length - 1];
  if (!last) return true;
  return Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`) >= PUSH_PROMPT_RETRY_DAYS * DAY_MS;
}

export function markPushPromptShown(state: PushPromptState, date: string): PushPromptState {
  if (state.shownDays.includes(date)) return state;
  return { shownDays: [...state.shownDays, date] };
}

export function loadPushPromptState(): PushPromptState {
  return readCache<PushPromptState>(CACHE_NAME) ?? EMPTY;
}

export function savePushPromptState(state: PushPromptState): void {
  writeCache(CACHE_NAME, state);
}

// ==================== Время напоминания ====================

export type ReminderSlot = 'morning' | 'day' | 'evening';

export const REMINDER_SLOTS: { key: ReminderSlot; label: string; hour: number }[] = [
  { key: 'morning', label: 'Утром', hour: 9 },
  { key: 'day', label: 'Днём', hour: 13 },
  { key: 'evening', label: 'Вечером', hour: 19 },
];

/** Предлагаем время, близкое к тому, когда человек учится сейчас: кто учится вечером, тому вечером */
export function suggestedSlot(hourNow: number): ReminderSlot {
  if (hourNow < 11) return 'morning';
  if (hourNow < 16) return 'day';
  return 'evening';
}

/**
 * Сохранить выбранный час на сервере, не трогая остальные настройки (дни, серия).
 * POST settings перезаписывает всё — поэтому сначала читаем текущие.
 */
export async function saveReminderHour(hour: number): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) return false;
    const headers = { Authorization: `Bearer ${accessToken}` };
    const current = await fetch(`${API_BASE}/push?action=settings`, { headers }).then((r) => r.json());
    const days = typeof current?.notifDays === 'string' ? current.notifDays : undefined;
    const res = await fetch(`${API_BASE}/push?action=settings`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notifEnabled: true,
        notifHour: hour,
        notifMinute: 0,
        notifDays: days,
        // Дни, выбранные раньше самим человеком, остаются его выбором
        notifDaysExplicit: !!days && days !== 'mon,tue,wed,thu,fri,sat,sun',
        notifStreak: current?.notifStreak ?? true,
      }),
    });
    return res.ok;
  } catch (error) {
    console.warn('[PushPrompt] save hour failed:', error);
    return false;
  }
}

// ==================== Строка на главной (шаг 1.3) ====================

const NUDGE_CACHE_NAME = 'push_streak_nudge';
export const STREAK_NUDGE_MIN_STREAK = 3;
export const STREAK_NUDGE_INTERVAL_DAYS = 14;

/**
 * «Включи напоминания, чтобы не потерять серию»: серия от 3 дней, пушей нет (отказал в iOS или
 * так и не разрешил), не чаще раза в 14 дней.
 */
export function shouldShowStreakNudge(
  lastShownDay: string | undefined,
  today: string,
  opts: { streak: number; permission: string; supported: boolean },
): boolean {
  if (!opts.supported || opts.permission === 'granted' || opts.permission === 'unsupported') return false;
  if (opts.streak < STREAK_NUDGE_MIN_STREAK) return false;
  if (!lastShownDay) return true;
  return Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastShownDay}T00:00:00Z`) >= STREAK_NUDGE_INTERVAL_DAYS * DAY_MS;
}

export function loadStreakNudgeDay(): string | undefined {
  return readCache<string>(NUDGE_CACHE_NAME);
}

export function saveStreakNudgeDay(day: string): void {
  writeCache(NUDGE_CACHE_NAME, day);
}
