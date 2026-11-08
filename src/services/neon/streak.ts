/** Серия: дневная активность, заморозка, статистика пользователя (Clean 9 — методы NeonService без изменений). */
import { getAccessToken } from '../auth/session';
import { apiFetch } from '../api/client';
import {
  authHeaders,
  pgDateToString,
  callDataApi,
  type LoadOptions,
  type UserStatsData,
  mapUserStatsRow,
} from './core';

export const streakApi = {
  /**
   * Upsert запись в daily_activity
   */
  async upsertDailyActivity(
    _userId: string,
    localDate: string,
    deltas: { wordsDelta: number; minutesDelta: number; cardsDelta: number }
  ): Promise<boolean> {
    return (await callDataApi<boolean>('upsertDailyActivity', { localDate, deltas })) === true;
  },

  /**
   * Засчитать сегодняшний день в серию. Решает сервер — по журналу ответов (план §3.5):
   * день засчитывается за повторение слов, которым пришло время. true — день засчитан.
   * Пуши о потере серии и о рекорде тоже шлёт сервер.
   */
  async updateUserStatsStreak(
    _userId: string,
    localDate: string,
    yesterdayDate: string,
    deltas: { wordsDelta: number; minutesDelta: number; cardsDelta: number }
  ): Promise<boolean> {
    // incremental: прибавка с прошлой отправки — сервер копит итоги и до засчитанного дня
    const result = await callDataApi<{ counted: boolean }>('updateUserStatsStreak', {
      localDate,
      yesterdayDate,
      deltas,
      incremental: true,
    });
    return result?.counted === true;
  },

  /**
   * Купить заморозку серии за алмазы. null — нет сети; { error } — не хватает алмазов или уже максимум.
   */
  async buyStreakFreeze(): Promise<
    | { diamonds: number; streakFreezes: number }
    | { error: 'not_enough_diamonds' | 'max_freezes' | 'unknown' }
    | null
  > {
    const token = await getAccessToken();
    if (!token) return null;
    try {
      const res = await apiFetch('data', {
        method: 'POST',
        query: { action: 'buyStreakFreeze' },
        headers: authHeaders(token),
        auth: 'none',
        body: {}, // → '{}'
      });
      if (!res.response) return null;
      const json = res.json;
      if (res.status === 409)
        return { error: json?.error === 'max_freezes' ? 'max_freezes' : 'not_enough_diamonds' };
      if (!res.ok) return { error: 'unknown' };
      return json.data;
    } catch {
      return null;
    }
  },

  /**
   * Записать событие получения/продления стрика (для админ-панели)
   */
  async logStreakEvent(_userId: string, streakDay: number): Promise<void> {
    await callDataApi('logStreakEvent', { streakDay });
  },

  /**
   * Получить активность за последние N дней
   */
  async getWeekActivity(
    _userId: string,
    days: number = 7,
    options?: LoadOptions
  ): Promise<
    {
      local_date: string;
      words_learned: number;
      minutes_learned: number;
      cards_studied: number;
    }[]
  > {
    const rows = await callDataApi<any[]>(
      'getWeekActivity',
      { days },
      'GET',
      options?.throwOnError
    );
    return (rows || []).map((row: any) => ({
      local_date: pgDateToString(row.local_date),
      words_learned: row.words_learned || 0,
      minutes_learned: row.minutes_learned || 0,
      cards_studied: row.cards_studied || 0,
    }));
  },

  /**
   * Получить статистику пользователя (сброс серии при пропуске делает сервер)
   */
  async getUserStats(_userId: string, options?: LoadOptions): Promise<UserStatsData | null> {
    const row = await callDataApi<any>('getUserStats', {}, 'GET', options?.throwOnError);
    return row ? mapUserStatsRow(row) : null;
  },

  /**
   * Получить активность за конкретную дату
   */
  async getDailyActivity(
    _userId: string,
    localDate: string,
    options?: LoadOptions
  ): Promise<{
    local_date: string;
    words_learned: number;
    minutes_learned: number;
    cards_studied: number;
  } | null> {
    const row = await callDataApi<any>(
      'getDailyActivity',
      { localDate },
      'GET',
      options?.throwOnError
    );
    if (!row) return null;
    return {
      local_date: pgDateToString(row.local_date),
      words_learned: row.words_learned || 0,
      minutes_learned: row.minutes_learned || 0,
      cards_studied: row.cards_studied || 0,
    };
  },

  // ==================== РЕЙТИНГ КУРСА ====================
};
