/**
 * Сводка страницы курса (plan/new/teacher_cabinet.md, Teacher 8): подписи плиток, строка
 * «учебник · расписание» в шапке и вывод под графиком активности.
 */
import { rawApiFetch } from '@/services/api/client';
import { getAccessToken } from '@/services/auth/session';
import type { ScheduleItem } from '@/utils/nextLesson';

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_SHORT: Record<string, string> = {
  mon: 'пн',
  tue: 'вт',
  wed: 'ср',
  thu: 'чт',
  fri: 'пт',
  sat: 'сб',
  sun: 'вс',
};
const MONTHS_SHORT = [
  'янв',
  'фев',
  'мар',
  'апр',
  'мая',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

/**
 * «пн–пт 10:30», «пн, ср, пт 18:00», «вт, чт 9:00 и 18:00»; пусто — null.
 * Подряд идущие 3+ дня сворачиваем в диапазон.
 */
export function formatScheduleLabel(schedule: ScheduleItem[] | null | undefined): string | null {
  if (!schedule || schedule.length === 0) return null;
  const days = DAY_ORDER.filter((d) => schedule.some((s) => s.day === d));
  if (days.length === 0) return null;

  const parts: string[] = [];
  let i = 0;
  while (i < days.length) {
    let j = i;
    while (
      j + 1 < days.length &&
      DAY_ORDER.indexOf(days[j + 1]) === DAY_ORDER.indexOf(days[j]) + 1
    ) {
      j++;
    }
    if (j - i >= 2) {
      parts.push(`${DAY_SHORT[days[i]]}–${DAY_SHORT[days[j]]}`);
    } else {
      for (let k = i; k <= j; k++) parts.push(DAY_SHORT[days[k]]);
    }
    i = j + 1;
  }

  const times = [...new Set(schedule.map((s) => s.time))].sort();
  return `${parts.join(', ')} ${times.join(' и ')}`;
}

/** «12 ноя» */
export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/**
 * Одна строка под графиком, если активность упала больше чем вдвое: «Пн учились 22, сейчас 1–3 в день».
 * Сравниваем лучший столбец с последними тремя. Спада нет или данных мало — null.
 */
export function activityInsight(chart: { day: string; count: number }[]): string | null {
  if (chart.length < 4) return null;
  const recent = chart.slice(-3).map((c) => c.count);
  const earlier = chart.slice(0, -3);
  const peak = earlier.reduce((best, c) => (c.count > best.count ? c : best), earlier[0]);
  const recentMax = Math.max(...recent);
  const recentMin = Math.min(...recent);
  if (peak.count < 3 || peak.count < recentMax * 2) return null;
  const now = recentMin === recentMax ? `${recentMax}` : `${recentMin}–${recentMax}`;
  return `${peak.day} учились ${peak.count}, сейчас ${now} в день`;
}

export interface TestHistorySummary {
  count: number;
  /** ISO-время последнего завершённого теста */
  lastFinishedAt: string | null;
}

/** Сколько живых тестов уже провели в курсе (тот же запрос, что у «Истории тестов»); null — ошибка */
export async function loadTestHistorySummary(courseId: string): Promise<TestHistorySummary | null> {
  try {
    const token = await getAccessToken();
    if (!token) return null;
    const res = await rawApiFetch(`test?action=history&courseId=${courseId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const items = (await res.json()) as Array<{ finishedAt?: string | null }>;
    if (!Array.isArray(items)) return null;
    return { count: items.length, lastFinishedAt: items[0]?.finishedAt ?? null };
  } catch {
    return null;
  }
}
