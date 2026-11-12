/**
 * Окно «Кто не сдал» (plan/new/teacher_cabinet.md, Teacher 23; макет 12а) — правила и тексты,
 * общие для RN-окна и Swift-окна (NotSubmittedSheet.swift).
 */
import type { HomeworkStatusData, HomeworkStudentRow } from '@/services/homework';
import { dueRelative, formatDue } from '@/services/homework';
import { pluralize } from '@/utils';
import { REMIND_COOLDOWN_MS, remindButtonText } from './homeworkStatus';

/** Инициалы как в списке учеников (teacherStudents/helpers — там RN-компоненты, сюда не тянем) */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export type NotSubmittedTab = 'all' | 'in_progress' | 'not_started';

/** «Не заходит 7+ дней» — красным (как в «Кому уделить внимание») */
export const AWAY_ALERT_DAYS = 7;

export const NOT_SUBMITTED_TEXTS = {
  close: 'Закрыть',
  selectAll: 'Выбрать всех',
  clearAll: 'Снять всех',
  chooseWhom: 'Выбери, кому напомнить',
  hint: 'Пуш: «Учитель напоминает о задании». Каждому — не чаще раза в день.',
  sentHint: 'Повторно этим ученикам — завтра',
  empty: 'Все сдали',
  remindedToday: 'напомнили сегодня',
} as const;

export interface NotSubmittedRow {
  id: string;
  name: string;
  initials: string;
  kind: 'in_progress' | 'not_started';
  status: string;
  seen: string;
  seenAlert: boolean;
  /** Уже напоминали за 20 часов — галочка недоступна */
  reminded: boolean;
}

function daysSince(date: string, now: number): number {
  const last = new Date(`${date}T12:00:00Z`).getTime();
  return Math.max(0, Math.round((now - last) / 86_400_000));
}

/** «заходил сегодня», «вчера», «5 дней назад», «не заходит 12 дней», «ещё не заходил» */
export function lastSeenText(
  lastActiveDate: string | null,
  now: number = Date.now()
): { text: string; alert: boolean } {
  if (!lastActiveDate) return { text: 'ещё не заходил в курс', alert: true };
  const d = daysSince(lastActiveDate, now);
  if (d === 0) return { text: 'заходил сегодня', alert: false };
  if (d === 1) return { text: 'заходил вчера', alert: false };
  if (d < AWAY_ALERT_DAYS) {
    return { text: `${d} ${pluralize(d, 'день', 'дня', 'дней')} назад`, alert: false };
  }
  return { text: `не заходит ${d} ${pluralize(d, 'день', 'дня', 'дней')}`, alert: true };
}

/** Не сдавшие, сначала дальше всех от сдачи: не начали → меньше засчитано */
export function notSubmittedRows(
  data: HomeworkStatusData,
  now: number = Date.now()
): NotSubmittedRow[] {
  const words = data.homework.words;
  return data.students
    .filter(
      (s): s is HomeworkStudentRow & { status: NotSubmittedRow['kind'] } => s.status !== 'submitted'
    )
    .sort(
      (a, b) =>
        (a.status === 'not_started' ? -1 : a.credited) -
          (b.status === 'not_started' ? -1 : b.credited) ||
        a.displayName.localeCompare(b.displayName, 'ru')
    )
    .map((s) => {
      const seen = lastSeenText(s.lastActiveDate, now);
      return {
        id: s.id,
        name: s.displayName,
        initials: initialsOf(s.displayName),
        kind: s.status,
        status: s.status === 'not_started' ? 'Не начато' : `${s.credited}/${words}`,
        seen: seen.text,
        seenAlert: seen.alert,
        reminded: !!s.remindedAt && now - Date.parse(s.remindedAt) < REMIND_COOLDOWN_MS,
      };
    });
}

export function filterRows(rows: NotSubmittedRow[], tab: NotSubmittedTab): NotSubmittedRow[] {
  return tab === 'all' ? rows : rows.filter((r) => r.kind === tab);
}

export function tabs(rows: NotSubmittedRow[]): Array<{ key: NotSubmittedTab; label: string }> {
  const p = rows.filter((r) => r.kind === 'in_progress').length;
  return [
    { key: 'all', label: `Все · ${rows.length}` },
    { key: 'in_progress', label: `В процессе · ${p}` },
    { key: 'not_started', label: `Не начали · ${rows.length - p}` },
  ];
}

/** «Не сдали · 11 из 22» */
export function notSubmittedTitle(rows: NotSubmittedRow[], total: number): string {
  return `Не сдали · ${rows.length} из ${total}`;
}

/** «A1-B · Ünite 4 · 48 слов» */
export function notSubmittedSubtitle(data: HomeworkStatusData, courseTitle: string): string {
  const n = data.homework.words;
  return `${courseTitle} · ${data.homework.title} · ${n} ${pluralize(n, 'слово', 'слова', 'слов')}`;
}

/** «до: 15.11.2026 20:00 · через 3 дня» */
export function notSubmittedDue(data: HomeworkStatusData, now: number = Date.now()): string {
  return `до: ${formatDue(data.homework.dueAt)} · ${dueRelative(data.homework.dueAt, now)}`;
}

/** Кнопка: «Напомнить 7 ученикам» / «Выбери, кому напомнить» / «Напомнили 7 ученикам» */
export function sendLabel(picked: number, sent: number | null): string {
  if (sent !== null) {
    return `Напомнили ${sent} ${pluralize(sent, 'ученику', 'ученикам', 'ученикам')}`;
  }
  return picked === 0 ? NOT_SUBMITTED_TEXTS.chooseWhom : remindButtonText(picked);
}

/** Выбор по умолчанию — все, кому можно напомнить */
export function defaultPicked(rows: NotSubmittedRow[]): Set<string> {
  return new Set(rows.filter((r) => !r.reminded).map((r) => r.id));
}
