/**
 * Барабан «часы · минуты» для времени занятия (окна «Расписание занятий» и «Новый курс»)
 * на Android и вебе. Вид и колонки — как у срока задания (teacher/DueWheelPicker.tsx).
 * На iOS — системный UIDatePicker(.wheels) в Swift-листах (LessonTimeWheel в ScheduleSheet.swift).
 */
import React from 'react';
import { WheelColumn, WheelFrame } from '@/components/teacher/DueWheelPicker';
import {
  MAX_MINUTES,
  MIN_MINUTES,
  SCHEDULE_TEXTS as T,
  STEP_MIN,
  clampLessonMinutes,
} from './courseSchedule';

const pad = (n: number) => String(n).padStart(2, '0');
const FIRST_HOUR = Math.floor(MIN_MINUTES / 60);
const LAST_HOUR = Math.floor(MAX_MINUTES / 60);
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => pad(FIRST_HOUR + i));
const MINUTES = Array.from({ length: 60 / STEP_MIN }, (_, i) => pad(i * STEP_MIN));

interface Props {
  /** Минуты от полуночи */
  value: number;
  onChange: (minutes: number) => void;
}

export function LessonTimeWheel({ value, onChange }: Props) {
  const minutes = clampLessonMinutes(value);
  const hourIndex = Math.floor(minutes / 60) - FIRST_HOUR;
  const minuteIndex = (minutes % 60) / STEP_MIN;

  // 22:30 за границей — барабан минут сам докрутится до 22:00
  const set = (h: number, m: number) =>
    onChange(clampLessonMinutes((FIRST_HOUR + h) * 60 + m * STEP_MIN));

  return (
    <WheelFrame>
      <WheelColumn
        labels={HOURS}
        index={hourIndex}
        onIndex={(h) => set(h, minuteIndex)}
        align="flex-end"
        flex={1}
        accessibilityLabel={T.hourColumn}
      />
      <WheelColumn
        labels={MINUTES}
        index={minuteIndex}
        onIndex={(m) => set(hourIndex, m)}
        align="flex-start"
        flex={1}
        accessibilityLabel={T.minuteColumn}
      />
    </WheelFrame>
  );
}
