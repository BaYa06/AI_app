/**
 * Экран сдачи задания (plan/new/teacher_cabinet.md, Teacher 21; макет 12) — чистые правила.
 * Статусы считает сервер (homework-status); здесь — порядок, подписи и кому напомнить.
 */
import type { HomeworkStatusData, HomeworkStudentRow } from '@/services/homework';
import { pluralize } from '@/utils';

/** «Напомнить» одному ученику — не чаще раза в 20 часов (как на сервере) */
export const REMIND_COOLDOWN_MS = 20 * 60 * 60 * 1000;

export type RowTone = 'success' | 'warning' | 'muted';

export interface HomeworkCounts {
  submitted: number;
  inProgress: number;
  notStarted: number;
  total: number;
}

export function homeworkCounts(students: HomeworkStudentRow[]): HomeworkCounts {
  const submitted = students.filter((s) => s.status === 'submitted').length;
  const inProgress = students.filter((s) => s.status === 'in_progress').length;
  return {
    submitted,
    inProgress,
    notStarted: students.length - submitted - inProgress,
    total: students.length,
  };
}

/** Сначала дальше всех от сдачи: не начали → в процессе (меньше засчитано — выше) → сдали */
export function sortHomeworkRows(students: HomeworkStudentRow[]): HomeworkStudentRow[] {
  const rank = (s: HomeworkStudentRow) =>
    s.status === 'not_started' ? 0 : s.status === 'in_progress' ? 1 : 2;
  return [...students].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.status === 'in_progress' ? a.credited - b.credited : 0) ||
      a.displayName.localeCompare(b.displayName, 'ru')
  );
}

/**
 * Подпись статуса ученика: «Сдано · 98%», «Сдано с опозданием · 90%», «32/48»,
 * «48/48 · 70%» (все слова, оценка ниже порога — в процессе, решение 4), «Не начато».
 */
export function statusLabel(
  s: HomeworkStudentRow,
  words: number,
  minScore: number | null
): { text: string; tone: RowTone } {
  if (s.status === 'submitted') {
    const score = s.score !== null ? ` · ${s.score}%` : '';
    return { text: `${s.late ? 'Сдано с опозданием' : 'Сдано'}${score}`, tone: 'success' };
  }
  if (s.status === 'in_progress') {
    const below =
      s.credited >= words && minScore !== null && s.score !== null && s.score < minScore;
    return { text: `${s.credited}/${words}${below ? ` · ${s.score}%` : ''}`, tone: 'warning' };
  }
  return { text: 'Не начато', tone: 'muted' };
}

/** Кому «Напомнить»: не сдали и не напоминали последние 20 часов */
export function remindableIds(students: HomeworkStudentRow[], now: number = Date.now()): string[] {
  return students
    .filter(
      (s) =>
        s.status !== 'submitted' &&
        !(s.remindedAt && now - Date.parse(s.remindedAt) < REMIND_COOLDOWN_MS)
    )
    .map((s) => s.id);
}

/** «Напомнить 15 ученикам» */
export function remindButtonText(n: number): string {
  return `Напомнить ${n} ${pluralize(n, 'ученику', 'ученикам', 'ученикам')}`;
}

/** «Ünite 4 · 48 слов» */
export function homeworkHeaderTitle(data: HomeworkStatusData): string {
  const n = data.homework.words;
  return `${data.homework.title} · ${n} ${pluralize(n, 'слово', 'слова', 'слов')}`;
}

/** «A1-B · выучить все слова · от 80%» */
export function homeworkHeaderSubtitle(courseTitle: string, minScore: number | null): string {
  return [courseTitle, 'выучить все слова', minScore !== null ? `от ${minScore}%` : null]
    .filter(Boolean)
    .join(' · ');
}

/**
 * «Закреплено» (через 7 дней после выдачи): сколько слов задания в среднем дошло до «Знаю»
 * у тех, кто сдал. null — рано (сервер не прислал) или никто не сдал.
 */
export function fixedText(students: HomeworkStudentRow[], words: number): string | null {
  const done = students.filter((s) => s.status === 'submitted' && s.fixed !== null);
  if (done.length === 0 || words === 0) return null;
  const avg = done.reduce((n, s) => n + (s.fixed ?? 0), 0) / done.length;
  const pct = Math.round((avg / words) * 100);
  return `Закреплено: у сдавших в среднем ${Math.round(avg)} из ${words} ${pluralize(words, 'слова', 'слов', 'слов')} на «Знаю» (${pct}%)`;
}
