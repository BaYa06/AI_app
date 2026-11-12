/**
 * Расписание занятий курса: время, тексты, загрузка и сохранение — общие для RN-окна
 * (CourseScheduleSheet.tsx), Swift-листа (ScheduleSheet.swift, Teacher 11) и окна «Новый курс».
 */
import { NeonService } from '@/services/NeonService';

// Шаг и границы времени занятия
export const STEP_MIN = 15;
export const DEFAULT_MINUTES = 18 * 60;
export const MIN_MINUTES = 7 * 60;
export const MAX_MINUTES = 22 * 60;

const pad = (n: number) => String(n).padStart(2, '0');
export const toTime = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
export const fromTime = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

export const SCHEDULE_TEXTS = {
  title: 'Расписание занятий',
  close: 'Закрыть',
  description: 'За 1–2 часа до занятия ученики получат напоминание повторить слова курса.',
  daysLabel: 'Дни занятий',
  timeLabel: 'Начало занятия',
  timeHint: 'Время — по часовому поясу курса',
  earlier: 'Раньше на 15 минут',
  later: 'Позже на 15 минут',
  startsAt: 'Начало в',
  save: 'Сохранить',
  saving: 'Сохранение…',
  saveFailed: 'Не удалось сохранить. Проверь интернет',
  saved: 'Расписание сохранено',
  removed: 'Расписание убрано',
} as const;

/** Текущее расписание для формы; не загрузилось — пустая форма со временем по умолчанию */
export async function loadScheduleForm(
  courseId: string
): Promise<{ days: string[]; minutes: number }> {
  const schedule = await NeonService.getCourseSchedule(courseId);
  if (!schedule || schedule.length === 0) return { days: [], minutes: DEFAULT_MINUTES };
  return { days: schedule.map((s) => s.day), minutes: fromTime(schedule[0].time) };
}

/** Сохранить; пустой список дней — убрать расписание */
export function saveSchedule(courseId: string, days: string[], minutes: number): Promise<boolean> {
  return NeonService.setCourseSchedule(
    courseId,
    days.map((day) => ({ day, time: toTime(minutes) }))
  );
}
