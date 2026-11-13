/**
 * Отчёт учителя (plan/new/teacher_cabinet.md, Teacher 55; экран 14): типы и подписи превью.
 * Данные собирает сервер (api/_report.js); подписи здесь повторяют страницу отчёта
 * (api/_report-page.js), чтобы превью в приложении совпадало со ссылкой и PDF.
 */
import { pluralize } from '@/utils';

export type ReportKind = 'parent' | 'group';
export type ReportPeriod = 'all' | 'month' | 'week';

export interface ReportWeek {
  label: string;
  answers: number;
  /** Высота столбика 0..100 */
  share: number;
}

export interface TeacherReport {
  kind: ReportKind;
  period: ReportPeriod;
  periodLabel: string;
  course: string;
  teacher: string | null;
  answers: number;
  correctPct: number | null;
  weeks: ReportWeek[];
  comment: string;
  // Родителям
  student?: string;
  activeDays?: number;
  streak?: number;
  units?: Array<{ title: string; seen: number; total: number; correctPct: number | null }>;
  // Группе
  students?: number;
  activeStudents?: number;
  best?: Array<{ name: string; answers: number; correctPct: number | null }>;
  inactive?: string[];
}

export interface ReportParams {
  courseId: string;
  kind: ReportKind;
  studentId?: string | null;
  period: ReportPeriod;
  comment?: string;
}

export const REPORT_COMMENT_MAX = 600;
/** С этой доли верных цифра и юнит подсвечиваются зелёным */
export const REPORT_GOOD_PCT = 80;

export const REPORT_TABS: Array<{ key: ReportKind; label: string }> = [
  { key: 'parent', label: 'Родителям' },
  { key: 'group', label: 'Группе' },
];
export const REPORT_PERIODS: Array<{ key: ReportPeriod; label: string }> = [
  { key: 'all', label: 'С начала курса' },
  { key: 'month', label: 'Месяц' },
  { key: 'week', label: 'Неделя' },
];

/** 2331 → «2 331» */
export function groupDigits(n: number): string {
  return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export interface ReportFigure {
  value: string;
  label: string;
  good: boolean;
}

export function reportFigures(r: TeacherReport): ReportFigure[] {
  const answers: ReportFigure = {
    value: groupDigits(r.answers),
    label: `${pluralize(r.answers, 'ответ', 'ответа', 'ответов')} на карточки`,
    good: false,
  };
  const correct: ReportFigure = {
    value: r.correctPct === null ? '—' : `${r.correctPct}%`,
    label: 'верных ответов',
    good: (r.correctPct ?? 0) >= REPORT_GOOD_PCT,
  };
  if (r.kind === 'group') {
    const inactive = r.inactive?.length ?? 0;
    return [
      {
        value: `${r.activeStudents ?? 0} из ${r.students ?? 0}`,
        label: 'учеников занимались',
        good: false,
      },
      {
        value: String(inactive),
        label: `${pluralize(inactive, 'не заходит', 'не заходят', 'не заходят')} 7+ дней`,
        good: false,
      },
      answers,
      correct,
    ];
  }
  const days = r.activeDays ?? 0;
  const streak = r.streak ?? 0;
  return [
    {
      value: String(days),
      label: `${pluralize(days, 'день', 'дня', 'дней')} занятий`,
      good: false,
    },
    {
      value: `${streak} ${pluralize(streak, 'день', 'дня', 'дней')}`,
      label: 'подряд без пропуска',
      good: false,
    },
    answers,
    correct,
  ];
}

/** «Ünite 5 · все 50 слов» / «Ünite 5 · 12 из 50 слов» */
export function unitLabel(u: { title: string; seen: number; total: number }): string {
  const words = `${u.total} ${pluralize(u.total, 'слово', 'слова', 'слов')}`;
  return u.seen >= u.total ? `${u.title} · все ${words}` : `${u.title} · ${u.seen} из ${words}`;
}

export function reportTitle(r: TeacherReport): string {
  return r.kind === 'group' ? `Группа ${r.course}` : r.student || 'Ученик';
}

export function reportSubtitle(r: TeacherReport): string {
  return r.kind === 'group'
    ? r.teacher || ''
    : [`группа ${r.course}`, r.teacher].filter(Boolean).join(' · ');
}

/** Текст сообщения со ссылкой — для системного «Поделиться» */
export function reportShareText(r: TeacherReport, url: string): string {
  return `Отчёт Flashly: ${reportTitle(r)}, ${r.periodLabel}\n${url}`;
}

/** Параметры запроса: ученик нужен только отчёту родителям */
export function reportQuery(p: ReportParams): Record<string, string> {
  return {
    courseId: p.courseId,
    kind: p.kind,
    period: p.period,
    ...(p.kind === 'parent' && p.studentId ? { studentId: p.studentId } : {}),
  };
}
