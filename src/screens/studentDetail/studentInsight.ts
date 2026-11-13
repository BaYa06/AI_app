/**
 * Экран ученика 13 (plan/new/teacher_cabinet.md, Teacher 52): чистые правила — бейдж статуса,
 * карточка-вывод, календарь за 4 недели, строки юнитов и тестов. Без RN, проверяется тестами.
 * Данные — student-stats (Teacher 51).
 */
import { pluralize } from '@/utils';

export interface StudentSetStat {
  setId: string;
  title: string;
  totalCards: number;
  learnedCards: number;
  seenCards: number;
  answers?: number;
  /** % верных ученика; null — ответов нет */
  correctPct?: number | null;
  groupCorrectPct?: number | null;
}

export interface StudentDetailData {
  seenCards: number;
  learnedCards: number;
  unlearnedCards: number;
  sets: StudentSetStat[];
  streak: number;
  lastActiveDate: string | null;
  // Новые поля (Teacher 51); старый сервер их не отдаёт
  name?: string;
  joinedAt?: string | null;
  totalAnswers?: number;
  days?: Array<{ date: string; answers: number }>;
  tests?: Array<{
    sessionId: string;
    title: string;
    finishedAt: string | null;
    purpose: string | null;
    score: number;
    correct: number;
    total: number;
  }>;
  homework?: {
    id: string;
    title: string;
    kind?: string;
    minScore: number | null;
    dueAt: string;
    status: 'submitted' | 'in_progress' | 'not_started';
    score: number | null;
  } | null;
}

export type Tone = 'success' | 'warning' | 'neutral';

/** Порог «с ошибками», если у задания порога нет */
export const DEFAULT_THRESHOLD = 80;
/** С этого дня без занятий — «Не заходит N дней» */
export const INACTIVE_DAYS = 7;

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

const pad = (n: number) => String(n).padStart(2, '0');
/** Локальная дата устройства → 'YYYY-MM-DD' */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const fromKey = (key: string) => {
  const [y, m, d] = key.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const daysBetween = (from: Date, to: Date) =>
  Math.round(
    (new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime() -
      new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()) /
      86_400_000
  );

/** «5 ноября» */
export function longDate(key: string): string {
  const d = fromKey(key);
  return `${d.getDate()} ${MONTHS_GENITIVE[d.getMonth()]}`;
}
/** «30 окт» */
export function shortDate(d: Date): string {
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** «Группа A1-B · с 30 октября» */
export function studentSubtitle(courseTitle: string, joinedAt?: string | null): string {
  const joined = joinedAt ? ` · с ${longDate(dayKey(new Date(joinedAt)))}` : '';
  return `Группа ${courseTitle}${joined}`;
}

export function studentBadge(
  lastActiveDate: string | null,
  now: Date = new Date()
): { label: string; tone: Tone } {
  if (!lastActiveDate) return { label: 'Ещё не занимался', tone: 'warning' };
  const days = daysBetween(fromKey(lastActiveDate), now);
  if (days <= 0) return { label: 'Занимался сегодня', tone: 'success' };
  if (days === 1) return { label: 'Занимался вчера', tone: 'success' };
  if (days >= INACTIVE_DAYS) {
    return {
      label: `Не заходит ${days} ${pluralize(days, 'день', 'дня', 'дней')}`,
      tone: 'warning',
    };
  }
  return { label: `Был ${days} ${pluralize(days, 'день', 'дня', 'дней')} назад`, tone: 'neutral' };
}

/** Набор, о котором говорим: последний, который ученик открывал; никакой не открывал — последний */
export function focusSet(sets: StudentSetStat[]): StudentSetStat | null {
  const filled = sets.filter((s) => s.totalCards > 0);
  const opened = filled.filter((s) => s.seenCards > 0);
  return opened[opened.length - 1] ?? filled[filled.length - 1] ?? null;
}

export function threshold(data: Pick<StudentDetailData, 'homework'>): number {
  return data.homework?.minScore ?? DEFAULT_THRESHOLD;
}

const words = (n: number) => `${n} ${pluralize(n, 'слово', 'слова', 'слов')}`;

/** Карточка-вывод: одна главная мысль об ученике */
export function studentInsight(data: StudentDetailData): {
  tone: Tone;
  title: string;
  text: string;
} {
  const set = focusSet(data.sets);
  const last = data.lastActiveDate
    ? ` Последний раз занимался ${longDate(data.lastActiveDate)}.`
    : '';
  if (!set || set.seenCards === 0) {
    return {
      tone: 'warning',
      title: 'Ещё не начинал',
      text: set
        ? `Не открыл ни одного слова из ${set.title}.${last}`
        : 'В курсе пока нет наборов со словами.',
    };
  }
  const pct = set.correctPct ?? null;
  const group =
    set.groupCorrectPct !== null && set.groupCorrectPct !== undefined
      ? ` У группы — ${set.groupCorrectPct}%.`
      : '';
  const correct = pct !== null ? `верно — ${pct}%.` : 'ответов пока нет.';
  if (set.seenCards >= set.totalCards) {
    const low = pct !== null && pct < threshold(data);
    return {
      tone: low ? 'warning' : 'success',
      title: low ? `Прошёл ${set.title}, но с ошибками` : `Прошёл ${set.title}`,
      text: `Все ${words(set.totalCards)} открыл, ${correct}${group}${last}`,
    };
  }
  return {
    tone: 'neutral',
    title: `Проходит ${set.title}`,
    text: `Открыл ${set.seenCards} из ${words(set.totalCards)}, ${correct}${group}${last}`,
  };
}

/** Клетка календаря: -1 — ещё не в курсе (пунктир), 0 — не занимался, 1–3 — сколько ответов */
export interface CalendarCell {
  date: string;
  level: -1 | 0 | 1 | 2 | 3;
}

export const CALENDAR_DAYS = 28;

export function activityLevel(answers: number): 0 | 1 | 2 | 3 {
  if (answers <= 0) return 0;
  if (answers <= 20) return 1;
  return answers <= 100 ? 2 : 3;
}

export function calendarCells(
  days: Array<{ date: string; answers: number }> | undefined,
  joinedAt: string | null | undefined,
  now: Date = new Date()
): CalendarCell[] {
  const byDay = new Map((days || []).map((d) => [d.date, d.answers]));
  const joined = joinedAt ? dayKey(new Date(joinedAt)) : null;
  return Array.from({ length: CALENDAR_DAYS }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (CALENDAR_DAYS - 1 - i));
    const date = dayKey(d);
    if (joined && date < joined) return { date, level: -1 as const };
    return { date, level: activityLevel(byDay.get(date) || 0) };
  });
}

/** «5 из 14 дней в курсе» */
export function calendarSummary(cells: CalendarCell[]): string {
  const inCourse = cells.filter((c) => c.level >= 0).length;
  const active = cells.filter((c) => c.level > 0).length;
  return `${active} из ${inCourse} ${pluralize(inCourse, 'дня', 'дней', 'дней')} в курсе`;
}

export interface UnitRow {
  key: string;
  title: string;
  sub: string;
  badge: string;
  tone: Tone;
}

/** Строки «Юниты»: «48 из 48 слов» и «70% · ниже порога» */
export function unitRows(data: StudentDetailData): UnitRow[] {
  const min = threshold(data);
  return data.sets
    .filter((s) => s.totalCards > 0)
    .map((s) => {
      const pct = s.correctPct ?? null;
      const low = pct !== null && pct < min;
      return {
        key: s.setId,
        title: s.title,
        sub: `${s.seenCards} из ${words(s.totalCards)}`,
        badge: pct === null ? '—' : low ? `${pct}% · ниже порога` : `${pct}%`,
        tone: pct === null ? 'neutral' : low ? 'warning' : 'success',
      };
    });
}

/** Строка «Тесты в классе» */
export function testsRow(data: Pick<StudentDetailData, 'tests'>, courseTitle: string): UnitRow {
  const tests = data.tests || [];
  if (tests.length === 0) {
    return {
      key: 'tests',
      title: 'Тесты в классе',
      sub: `в ${courseTitle} ещё не проводились`,
      badge: '—',
      tone: 'neutral',
    };
  }
  const last = tests[0];
  return {
    key: 'tests',
    title: 'Тесты в классе',
    sub: `${tests.length} ${pluralize(tests.length, 'тест', 'теста', 'тестов')} · последний: ${last.title}`,
    badge: `${last.score}%`,
    tone: last.score >= DEFAULT_THRESHOLD ? 'success' : 'warning',
  };
}

/** Три цифры под карточкой-выводом */
export function studentFigures(
  data: StudentDetailData
): Array<{ value: string; label: string; tone: Tone }> {
  const set = focusSet(data.sets);
  const pct = set?.correctPct ?? null;
  const activeDays = (data.days || []).length;
  const answers = data.totalAnswers ?? 0;
  return [
    {
      value: String(answers),
      label: `${pluralize(answers, 'ответ', 'ответа', 'ответов')} всего`,
      tone: 'neutral',
    },
    {
      value: pct === null ? '—' : `${pct}%`,
      label: set ? set.title : 'верных',
      tone: pct !== null && pct < threshold(data) ? 'warning' : 'neutral',
    },
    {
      value: String(activeDays),
      label: `${pluralize(activeDays, 'день', 'дня', 'дней')} занятий`,
      tone: 'neutral',
    },
  ];
}

/** «Попросить повторить Ünite 4» */
export function remindTitle(data: StudentDetailData): string {
  const set = focusSet(data.sets);
  return set ? `Попросить повторить ${set.title}` : 'Попросить позаниматься';
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
}
