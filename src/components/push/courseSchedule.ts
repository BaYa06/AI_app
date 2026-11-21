/**
 * Расписание занятий курса: время, тексты, загрузка и сохранение — общие для RN-окна
 * (CourseScheduleSheet.tsx), Swift-листа (ScheduleSheet.swift, Teacher 11) и окна «Новый курс».
 */
import { NeonService } from '@/services/NeonService';

// Шаг барабана минут (как у срока задания) и границы времени занятия.
// Сервер (api/_handlers/teacher/courses.js, parseSchedule) принимает время, кратное 5 минутам.
export const STEP_MIN = 5;
export const DEFAULT_MINUTES = 18 * 60;
export const MIN_MINUTES = 7 * 60;
export const MAX_MINUTES = 22 * 60;

/** Минуты от полуночи → в границы занятия и на шаг барабана */
export function clampLessonMinutes(minutes: number): number {
  const snapped = Math.round(minutes / STEP_MIN) * STEP_MIN;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, snapped));
}

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
  hourColumn: 'Часы',
  minuteColumn: 'Минуты',
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
