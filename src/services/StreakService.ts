/**
 * Streak Service
 * @description Сервис для работы со стриками и ежедневной активностью
 */

import { NeonService, NetworkLoadError } from './NeonService';
import { readCache, writeCache } from './localCache';
import { getUserId } from './auth/session';
import { log } from '@/utils/logger';

// ==================== ТИПЫ ====================

export interface DailyActivity {
  local_date: string; // YYYY-MM-DD
  words_learned: number;
  minutes_learned: number;
  cards_studied: number;
  /** День засчитан в серию (сервер, Freeze 1). Нет поля — старый сервер. */
  streak_counted?: boolean;
  /** День спасён заморозкой (сервер, Freeze 1). */
  frozen?: boolean;
}

export interface UserStats {
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null; // YYYY-MM-DD
  timezone: string;
  total_words_learned: number;
  total_minutes_learned: number;
  total_cards_studied: number;
  /** Заморозок серии в запасе (покупаются за алмазы, спасают один пропущенный день) */
  streak_freezes: number;
  /** Сегодня заморозка спасла серию */
  freeze_used: boolean;
  /** Засчитан ли сегодня и сколько ещё (сервер, Freeze 6). Нет полей — старый сервер. */
  today_counted?: boolean;
  today_left?: number;
  /** review — повторить слова, которые ждут; any — ждать нечего, нужны любые ответы */
  today_need?: 'review' | 'any' | null;
  /** Учил только новые слова, а ждущие не трогал — день не засчитан (Freeze 6) */
  today_new_only?: boolean;
}

/**
 * Состояние дня в неделе серии (plan/new/streak_freeze_display.md, «Как выглядит день в неделе»):
 * counted — засчитан; frozen — спасён заморозкой; studied — занимался, но день не засчитан;
 * missed — пропущен; today — сегодня, ещё не засчитан; future — впереди.
 */
export type WeekDayState = 'counted' | 'frozen' | 'studied' | 'missed' | 'today' | 'future';

export interface WeekDayStatus {
  dayLabel: string; // 'Пн', 'Вт', ...
  date: string; // YYYY-MM-DD
  dayNumber: number; // число месяца
  status: WeekDayState;
  isToday: boolean;
  todayProgress?: number; // 0..1 для сегодня
}

/** Строка-пояснение под неделей: последний день каждого «непонятного» состояния. */
export interface WeekNote {
  kind: 'frozen' | 'studied';
  date: string;
  text: string;
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

/**
 * Записать активность за сессию — прибавку с прошлой отправки.
 * saved — активность записана (иначе прибавку надо отправить ещё раз); counted — день засчитан в серию.
 */
export async function recordActivity(
  params: RecordActivityParams
): Promise<{ saved: boolean; counted: boolean }> {
  const { wordsDelta = 0, minutesDelta = 0, cardsDelta = 0 } = params;

  try {
    // Проверяем авторизацию
    const userId = await getUserId();

    if (!userId) {
      log.debug('Streak', 'пользователь не авторизован, активность сохранена локально');
      return { saved: false, counted: false };
    }

    if (!NeonService.isEnabled()) {
      log.debug('Streak', 'Neon не настроен');
      return { saved: false, counted: false };
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

    log.debug('Streak', 'записываем активность', {
      userId,
      localDate,
      wordsDelta,
      minutesDelta,
      cardsDelta,
    });

    // 1. Upsert в daily_activity
    const activityResult = await upsertDailyActivity(userId, localDate, {
      wordsDelta,
      minutesDelta,
      cardsDelta,
    });

    if (!activityResult) {
      log.warn('Streak', 'не удалось записать daily_activity');
      return { saved: false, counted: false };
    }

    // 2. Серия: засчитывается ли день, решает сервер — по журналу ответов (повторение слов, которым
    //    пришло время; план §3.5). true — день засчитан.
    const counted = await updateUserStats(userId, localDate, yesterdayDate, {
      wordsDelta,
      minutesDelta,
      cardsDelta,
    });

    log.debug(
      'Streak',
      counted ? 'день засчитан' : 'активность записана, день в серию пока не засчитан'
    );
    // daily_activity уже записан — повторная отправка задвоила бы его, поэтому saved даже без итогов
    return { saved: true, counted };
  } catch (error) {
    log.error('Streak', 'ошибка при записи активности', error);
    return { saved: false, counted: false };
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
    log.debug('Streak', 'Neon не настроен');
    return false;
  }

  try {
    // Используем NeonService для выполнения запроса
    const result = await NeonService.upsertDailyActivity(userId, localDate, deltas);
    return result;
  } catch (error) {
    log.error('Streak', 'ошибка upsert daily_activity', error);
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
    const result = await NeonService.updateUserStatsStreak(
      userId,
      localDate,
      yesterdayDate,
      deltas
    );
    return result;
  } catch (error) {
    log.error('Streak', 'ошибка обновления user_stats', error);
    return false;
  }
}

/**
 * Получить активность за последние N дней
 */
export async function fetchWeekActivity(days: number = 7): Promise<DailyActivity[]> {
  try {
    const userId = await getUserId();

    if (!userId || !NeonService.isEnabled()) {
      return [];
    }

    const activity = await NeonService.getWeekActivity(userId, days, { throwOnError: true });
    writeCache(`activity_${days}`, activity);
    return activity;
  } catch (error) {
    // Нет сети — последнее сохранённое
    if (error instanceof NetworkLoadError)
      return readCache<DailyActivity[]>(`activity_${days}`) ?? [];
    log.error('Streak', 'ошибка получения активности за неделю', error);
    return [];
  }
}

/**
 * Получить статистику пользователя (стрик и т.д.)
 */
export async function fetchUserStats(): Promise<UserStats | null> {
  try {
    const userId = await getUserId();

    if (!userId || !NeonService.isEnabled()) {
      return null;
    }

    const stats = await NeonService.getUserStats(userId, { throwOnError: true });
    if (stats) writeCache('user_stats', stats);
    return stats;
  } catch (error) {
    if (error instanceof NetworkLoadError) return readCache<UserStats>('user_stats') ?? null;
    log.error('Streak', 'ошибка получения user_stats', error);
    return null;
  }
}

/**
 * Построить статус недели для UI
 */
const WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** YYYY-MM-DD ± дни — по календарю, без часовых поясов. */
function shiftDateKey(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Неделя серии (Пн–Вс, в которую входит todayKey) — то, что считает сервер (Freeze 3).
 * Засчитан ли день, решает только сервер (`streak_counted`, `frozen`). Старый сервер этих полей
 * не отдаёт — тогда прежнее правило «≥ 10 карточек», без снежинок и жёлтых дней.
 * Одна функция для ученика и учителя (Freeze 7).
 */
export function buildWeekStatus(
  activity: DailyActivity[],
  todayKey: string,
  todayProgress: number = 0
): WeekDayStatus[] {
  const byDate = new Map<string, DailyActivity>();
  activity.forEach((a) => byDate.set(a.local_date, a));
  const serverFlags = activity.some((a) => typeof a.streak_counted === 'boolean');

  const todayDow = (new Date(`${todayKey}T12:00:00Z`).getUTCDay() + 6) % 7; // Пн = 0
  return WEEK_DAYS.map((dayLabel, i) => {
    const date = shiftDateKey(todayKey, i - todayDow);
    const a = byDate.get(date);
    const isToday = date === todayKey;
    const counted = serverFlags ? a?.streak_counted === true : (a?.cards_studied ?? 0) >= 10;
    let status: WeekDayState;
    if (date > todayKey) status = 'future';
    else if (counted) status = 'counted';
    else if (isToday) status = 'today';
    else if (serverFlags && a?.frozen) status = 'frozen';
    else if (serverFlags && a && (a.cards_studied > 0 || a.words_learned > 0)) status = 'studied';
    else status = 'missed';
    return {
      dayLabel,
      date,
      dayNumber: parseInt(date.slice(8), 10),
      status,
      isToday,
      todayProgress: isToday ? todayProgress : undefined,
    };
  });
}

/** Пояснения под неделей: только если в ней есть такой день; по одному — за последний. */
export function weekNotes(week: WeekDayStatus[]): WeekNote[] {
  const last = (kind: WeekNote['kind']) => [...week].reverse().find((d) => d.status === kind);
  const notes: WeekNote[] = [];
  const frozen = last('frozen');
  if (frozen) {
    notes.push({
      kind: 'frozen',
      date: frozen.date,
      text: `${frozen.dayLabel} — заморозка спасла серию`,
    });
  }
  const studied = last('studied');
  if (studied) {
    notes.push({
      kind: 'studied',
      date: studied.date,
      text: `${studied.dayLabel} — занимался, но день не засчитан: нужно повторить 10 слов, которые ждали`,
    });
  }
  return notes.sort((x, y) => x.date.localeCompare(y.date));
}

/**
 * Получить активность за сегодня
 */
export async function fetchTodayActivity(): Promise<DailyActivity | null> {
  try {
    const userId = await getUserId();

    if (!userId || !NeonService.isEnabled()) {
      return null;
    }

    const todayKey = getLocalDateKey();
    const activity = await NeonService.getDailyActivity(userId, todayKey, { throwOnError: true });
    writeCache('activity_today', { date: todayKey, activity });
    return activity;
  } catch (error) {
    if (error instanceof NetworkLoadError) return cachedTodayActivity() ?? null;
    log.error('Streak', 'ошибка получения активности за сегодня', error);
    return null;
  }
}

// ==================== КЭШ (показать сразу, до ответа сервера) ====================

/** Последняя сохранённая статистика пользователя (серия, итоги) */
export function cachedUserStats(): UserStats | null {
  return readCache<UserStats>('user_stats') ?? null;
}

/** Сохранённая активность за N дней */
export function cachedWeekActivity(days: number): DailyActivity[] | null {
  return readCache<DailyActivity[]>(`activity_${days}`) ?? null;
}

/** Сохранённая активность за сегодня (только если она именно за сегодняшний день) */
export function cachedTodayActivity(): DailyActivity | null | undefined {
  const cached = readCache<{ date: string; activity: DailyActivity | null }>('activity_today');
  return cached && cached.date === getLocalDateKey() ? cached.activity : undefined;
}

// ==================== ЭКСПОРТ ====================

export const StreakService = {
  getLocalDateKey,
  cachedUserStats,
  cachedWeekActivity,
  cachedTodayActivity,
  recordActivity,
  fetchWeekActivity,
  fetchUserStats,
  fetchTodayActivity,
  buildWeekStatus,
  weekNotes,
};

export default StreakService;
