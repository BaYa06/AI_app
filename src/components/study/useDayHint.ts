/**
 * Подсказка в итогах: учил только новые слова, а ждущие не трогал — день не засчитан
 * (plan/new/streak_freeze_display.md, Freeze 6; ровно случай 04.11 из обращения).
 * Решает сервер (`getUserStats`: today_counted, today_new_only, today_left). Спрашиваем чуть позже:
 * последние ответы сессии уходят на сервер в фоне.
 */
import { useEffect, useState } from 'react';
import { StreakService } from '@/services/StreakService';

const ASK_DELAY_MS = 1500;

export function useDayHint(enabled: boolean): string | null {
  const [hint, setHint] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const timer = setTimeout(async () => {
      const stats = await StreakService.fetchUserStats();
      if (!active || !stats || stats.today_counted !== false || !stats.today_new_only) return;
      const left = stats.today_left ?? 0;
      if (left > 0) {
        setHint(`Новые слова не засчитывают день — повтори ещё ${left} из тех, что ждут`);
      }
    }, ASK_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [enabled]);
  return hint;
}
