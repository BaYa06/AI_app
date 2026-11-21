/**
 * «Заморозка спасла серию» (plan/new/streak_freeze_display.md, Freeze 4)
 * @description Один раз на замороженный день. `freeze_used` сервер отдаёт только в том ответе, где
 * потратил заморозку; если его забрал фоновый запрос (bootstrap), смотрим `frozen` за вчера в неделе.
 */
import { StorageService } from './StorageService';
import type { DailyActivity } from './StreakService';

export interface FreezeNotice {
  /** Замороженный день, YYYY-MM-DD */
  date: string;
  streak: number;
  freezesLeft: number;
}

const seenKey = (date: string) => `freeze_seen_${date}`;

function yesterdayOf(todayKey: string): string {
  const d = new Date(`${todayKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function pickFreezeNotice(ctx: {
  todayKey: string;
  freezeUsed: boolean;
  week: DailyActivity[];
  streak: number;
  freezesLeft: number;
  isSeen: (date: string) => boolean;
}): FreezeNotice | null {
  const date = yesterdayOf(ctx.todayKey);
  const frozen = ctx.freezeUsed || ctx.week.some((a) => a.local_date === date && a.frozen === true);
  // Серия 0 — заморозка уже не помогла (сброс позже), хвалить нечего
  if (!frozen || ctx.streak <= 0 || ctx.isSeen(date)) return null;
  return { date, streak: ctx.streak, freezesLeft: Math.max(0, ctx.freezesLeft) };
}

export function isFreezeNoticeSeen(date: string): boolean {
  return StorageService.getBoolean(seenKey(date)) === true;
}

export function markFreezeNoticeSeen(date: string): void {
  StorageService.setBoolean(seenKey(date), true);
}
