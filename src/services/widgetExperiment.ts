/**
 * Замер «учит ли виджет» (plan/widgets.md, шаг 4.1)
 * @description Каждый день запоминаем, какие слова попали в виджет, а какие — такие же по приоритету —
 * остались контрольными (WidgetPlanner.pickPoolSplit). На первом повторении слова в тесте урока
 * в один из следующих дней отправляем widget_word_reviewed { in_widget, correct }. Точность двух
 * групп сравниваем в GA4. «Было в виджете» — слово стояло в расписании, а не «его точно увидели».
 */
import type { Card } from '@/types';

/** Через сколько дней забываем слово, которое так и не повторили */
const KEEP_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Exposure {
  inWidget: boolean;
  /** День (YYYY-MM-DD), когда слово впервые попало в группу */
  day: string;
}

export type ExposureMap = Record<string, Exposure>;

const dayTime = (day: string) => new Date(`${day}T00:00:00`).getTime();

/** Запомнить сегодняшние группы. Слово остаётся в группе, куда попало первым, до повторения. */
export function recordExposures(map: ExposureMap, split: { pool: Card[]; control: Card[] }, today: string): ExposureMap {
  const next: ExposureMap = {};
  const oldest = dayTime(today) - KEEP_DAYS * DAY_MS;
  for (const [id, exposure] of Object.entries(map)) {
    if (dayTime(exposure.day) >= oldest) next[id] = exposure;
  }
  let changed = Object.keys(next).length !== Object.keys(map).length;
  const add = (cards: Card[], inWidget: boolean) => {
    for (const card of cards) {
      if (next[card.id]) continue;
      next[card.id] = { inWidget, day: today };
      changed = true;
    }
  };
  add(split.pool, true);
  add(split.control, false);
  return changed ? next : map;
}

/**
 * Ответ в тесте урока. Слово было в группе в один из прошлых дней — возвращаем группу и убираем
 * слово из учёта (считаем только первое повторение). В тот же день не считаем: меряем память на следующий день.
 */
export function takeReview(map: ExposureMap, cardId: string, today: string): { exposure: Exposure; map: ExposureMap } | null {
  const exposure = map[cardId];
  if (!exposure || exposure.day >= today) return null;
  const { [cardId]: _taken, ...rest } = map;
  return { exposure, map: rest };
}
