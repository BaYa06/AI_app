/**
 * Streak Service
 * @description Сервис для работы со стриками и ежедневной активностью
 */

import { NeonService } from './NeonService';
import { supabase } from './supabaseClient';

// ==================== ТИПЫ ====================

export interface DailyActivity {
  local_date: string; // YYYY-MM-DD
  words_learned: number;
  minutes_learned: number;
  cards_studied: number;
}

export interface UserStats {
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null; // YYYY-MM-DD
  timezone: string;
  total_words_learned: number;
  total_minutes_learned: number;
  total_cards_studied: number;
}

export interface WeekDayStatus {
  dayLabel: string; // 'Пн', 'Вт', ...
  date: string; // YYYY-MM-DD
  dayNumber: number; // число месяца
  status: 'done' | 'today' | 'future' | 'missed';
  todayProgress?: number; // 0..1 для сегодня
}

export interface RecordActivityParams {
  wordsDelta?: number;
  minutesDelta?: number;
  cardsDelta?: number;
}

// ==================== ХЕЛПЕРЫ ====================

/**
 * Получить системный таймзон устройства
 */
function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/**
 * Получить текущую дату в формате YYYY-MM-DD в заданном timezone
 */
export function getLocalDateKey(timezone: string = getDeviceTimezone()): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(now); // returns YYYY-MM-DD
  } catch {
    // Fallback если timezone некорректный
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Получить дату N дней назад
 */
function getDateKeyDaysAgo(days: number, timezone: string = getDeviceTimezone()): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  } catch {
    return date.toISOString().split('T')[0];
  }
}

/**
 * Получить "вчера" в формате YYYY-MM-DD
 */
function getYesterdayKey(timezone: string = getDeviceTimezone()): string {
  return getDateKeyDaysAgo(1, timezone);
}

// ==================== ОСНОВНЫЕ ФУНКЦИИ ====================

const MIN_CARDS_FOR_STREAK = 10; // Минимум карточек для продления стрика

/**
 * Записать активность за сессию
 * Вызывать при завершении изучения карточек
 */
export async function recordActivity(params: RecordActivityParams): Promise<boolean> {
  const { wordsDelta = 0, minutesDelta = 0, cardsDelta = 0 } = params;

  try {
    // Проверяем авторизацию
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;

    if (!userId) {
      console.log('ℹ️ Streak: пользователь не авторизован, активность сохранена локально');
      return false;
    }

    if (!NeonService.isEnabled()) {
      console.log('ℹ️ Streak: Neon не настроен');
      return false;
    }

    // Получаем таймзон из user_stats, фолбек на системный
    let timezone = getDeviceTimezone();
    try {
      const stats = await NeonService.getUserStats(userId);
      if (stats?.timezone) {
        timezone = stats.timezone;
      }
    } catch {}

    const localDate = getLocalDateKey(timezone);
    const yesterdayDate = getYesterdayKey(timezone);

    console.log('🔄 Streak: записываем активность', { userId, localDate, wordsDelta, minutesDelta, cardsDelta });

    // 1. Upsert в daily_activity
    const activityResult = await upsertDailyActivity(userId, localDate, {
      wordsDelta,
      minutesDelta,
      cardsDelta,
    });

    if (!activityResult) {
      console.warn('⚠️ Streak: не удалось записать daily_activity');
      return false;
    }

    // 2. Проверка минимального порога карточек для стрика
    if (cardsDelta < MIN_CARDS_FOR_STREAK) {
      console.log(`ℹ️ Streak: недостаточно карточек для стрика (${cardsDelta}/${MIN_CARDS_FOR_STREAK}), активность записана без обновления стрика`);
      return false;
    }

    // 3. Обновляем user_stats (стрик)
    await updateUserStats(userId, localDate, yesterdayDate, {
      wordsDelta,
      minutesDelta,
      cardsDelta,
    });

    console.log('✅ Streak: активность записана успешно');
    return true;
  } catch (error) {
    console.error('❌ Streak: ошибка при записи активности:', error);
    return false;
  }
}

/**
 * Upsert запись в daily_activity
 */
async function upsertDailyActivity(
  userId: string,
  localDate: string,
  deltas: { wordsDelta: number; minutesDelta: number; cardsDelta: number }
): Promise<boolean> {
  if (!NeonService.isEnabled()) {
    console.log('ℹ️ Streak: Neon не настроен');
    return false;
  }

  try {
    // Используем NeonService для выполнения запроса
    const result = await NeonService.upsertDailyActivity(userId, localDate, deltas);
    return result;
  } catch (error) {
    console.error('❌ Streak: ошибка upsert daily_activity:', error);
    return false;
  }
}

/**
 * Обновить user_stats с расчётом стрика
 */
async function updateUserStats(
  userId: string,
  localDate: string,
  yesterdayDate: string,
  deltas: { wordsDelta: number; minutesDelta: number; cardsDelta: number }
): Promise<boolean> {
  if (!NeonService.isEnabled()) {
    return false;
  }

  try {
    const result = await NeonService.updateUserStatsStreak(userId, localDate, yesterdayDate, deltas);
    return result;
  } catch (error) {
    console.error('❌ Streak: ошибка обновления user_stats:', error);
    return false;
  }
}

/**
 * Получить активность за последние N дней
 */
export async function fetchWeekActivity(days: number = 7): Promise<DailyActivity[]> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;

    if (!userId || !NeonService.isEnabled()) {
      return [];
    }

    const activity = await NeonService.getWeekActivity(userId, days);
    return activity;
  } catch (error) {
    console.error('❌ Streak: ошибка получения активности за неделю:', error);
    return [];
  }
}

/**
 * Получить статистику пользователя (стрик и т.д.)
 */
export async function fetchUserStats(): Promise<UserStats | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;

    if (!userId || !NeonService.isEnabled()) {
      return null;
    }

    const stats = await NeonService.getUserStats(userId);
    return stats;
  } catch (error) {
    console.error('❌ Streak: ошибка получения user_stats:', error);
    return null;
  }
}

/**
 * Построить статус недели для UI
 */
export function buildWeekStatus(
  activity: DailyActivity[],
  todayKey: string,
  todayProgress: number = 0
): WeekDayStatus[] {
  const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const today = new Date();
  
  // Определяем день недели из todayKey (timezone-safe)
  const todayParsed = new Date(todayKey + 'T12:00:00');
  const todayDayOfWeek = (todayParsed.getDay() + 6) % 7; // Пн = 0, Вс = 6

  // Форматтер для YYYY-MM-DD в правильном timezone
  const dateFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: getDeviceTimezone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  // Создаём Map для быстрого поиска активности по дате
  const activityMap = new Map<string, DailyActivity>();
  activity.forEach((a) => activityMap.set(a.local_date, a));

  const result: WeekDayStatus[] = [];

  for (let i = 0; i < 7; i++) {
    const diff = i - todayDayOfWeek;
    const date = new Date(today);
    date.setDate(today.getDate() + diff);

    const dateKey = dateFmt.format(date);
    const dayNumber = parseInt(dateKey.split('-')[2], 10);
    const dayActivity = activityMap.get(dateKey);

    let status: WeekDayStatus['status'];
    
    if (dateKey === todayKey) {
      status = 'today';
    } else if (dateKey > todayKey) {
      status = 'future';
    } else if (dayActivity && (dayActivity.cards_studied > 0 || dayActivity.words_learned > 0)) {
      status = 'done';
    } else {
      status = 'missed';
    }

    result.push({
      dayLabel: weekDays[i],
      date: dateKey,
      dayNumber,
      status,
      todayProgress: status === 'today' ? todayProgress : undefined,
    });
  }

  return result;
}

/**
 * Получить активность за сегодня
 */
export async function fetchTodayActivity(): Promise<DailyActivity | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;

    if (!userId || !NeonService.isEnabled()) {
      return null;
    }

    const todayKey = getLocalDateKey();
    const activity = await NeonService.getDailyActivity(userId, todayKey);
    return activity;
  } catch (error) {
    console.error('❌ Streak: ошибка получения активности за сегодня:', error);
    return null;
  }
}

// ==================== ЭКСПОРТ ====================

export const StreakService = {
  getLocalDateKey,
  recordActivity,
  fetchWeekActivity,
  fetchUserStats,
  fetchTodayActivity,
  buildWeekStatus,
};

export default StreakService;
