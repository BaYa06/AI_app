/**
 * Ближайший урок курса по расписанию (plan/new/teacher_cabinet.md, Teacher 2).
 * Расписание — дни недели и время в поясе учителя: его вводит сам учитель, поэтому считаем
 * по часам устройства. Урок сегодня, время которого уже прошло, не считается — берём следующий.
 */
export interface ScheduleItem {
  day: string;
  time: string;
}

export interface NextLesson {
  /** Начало урока по часам устройства */
  date: Date;
  /** «Сегодня · 10:30», «Завтра, пт · 10:30», «Пн, 16 ноября · 10:30» */
  label: string;
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const DAY_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

function parseTime(time: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function getNextLesson(
  schedule: ScheduleItem[] | null,
  now: Date = new Date()
): NextLesson | null {
  if (!schedule || schedule.length === 0) return null;

  let best: Date | null = null;
  for (const item of schedule) {
    const dow = DAY_KEYS.indexOf(item.day as (typeof DAY_KEYS)[number]);
    const t = parseTime(item.time);
    if (dow < 0 || !t) continue;
    for (let offset = 0; offset <= 7; offset++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, t.h, t.m);
      if (d.getDay() !== dow || d.getTime() <= now.getTime()) continue;
      if (!best || d.getTime() < best.getTime()) best = d;
      break;
    }
  }
  if (!best) return null;

  const time = `${String(best.getHours()).padStart(2, '0')}:${String(best.getMinutes()).padStart(2, '0')}`;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lessonDay = new Date(best.getFullYear(), best.getMonth(), best.getDate());
  const days = Math.round((lessonDay.getTime() - today.getTime()) / 86_400_000);

  let label: string;
  if (days === 0) {
    label = `Сегодня · ${time}`;
  } else if (days === 1) {
    label = `Завтра, ${DAY_SHORT[best.getDay()]} · ${time}`;
  } else {
    label = `${capitalize(DAY_SHORT[best.getDay()])}, ${best.getDate()} ${MONTHS_GENITIVE[best.getMonth()]} · ${time}`;
  }

  return { date: best, label };
}
