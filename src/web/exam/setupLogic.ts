/**
 * Настройки экзамена в вебе (plan/new/web_cabinet.md, Web 13): те же правила, что в телефонном
 * ExamSetupScreen, вынесенные в чистые функции. Доли форматов и «Советуем» считает общий
 * screens/exam/examConfig.ts — цифры в телефоне и в вебе совпадают.
 */
import { FORMATS, PAIR_MIN, defaultFormats, type FormatCounts } from '@/screens/exam/examConfig';
import type { ExamFormat } from '@/services/exam';

export const MIN_WORDS = 4;
export const MAX_WORDS = 50;
export const MAX_MINUTES = 180;

/** Верхняя граница числа слов: сколько есть в выбранных наборах, но не больше MAX_WORDS и не меньше MIN_WORDS */
export function maxCountFor(available: number): number {
  return Math.max(MIN_WORDS, Math.min(MAX_WORDS, available || MAX_WORDS));
}

export function clampCount(n: number, available: number): number {
  return Math.max(MIN_WORDS, Math.min(maxCountFor(available), Math.round(n) || MIN_WORDS));
}

const others = (f: FormatCounts) => f.write + f.scramble + f.match + f.gap;

/**
 * Поставить число вопросов формата. «Выбор» — остаток, его руками не меняют.
 * «Пары» — либо 0, либо от PAIR_MIN (один экран = 3+ пары). Не хватает слов — возвращаем прежнее.
 */
export function setFormatCount(
  cur: FormatCounts,
  count: number,
  format: ExamFormat,
  value: number
): FormatCounts {
  if (format === 'choice') return cur;
  const next: FormatCounts = { ...cur, [format]: Math.max(0, Math.round(value)) };
  if (format === 'match' && next.match > 0 && next.match < PAIR_MIN) {
    next.match = value > cur.match ? PAIR_MIN : 0;
  }
  const rest = count - others(next);
  if (rest < 0) return cur;
  next.choice = rest;
  return next;
}

/** Новое число слов → доли форматов по умолчанию */
export function formatsForCount(count: number): FormatCounts {
  return defaultFormats(count);
}

/** Можно ли добавить ещё один вопрос формата (хватает «выбора», чтобы его отдать) */
export function canAddFormat(cur: FormatCounts, format: ExamFormat): boolean {
  if (format === 'choice') return false;
  if (cur.choice <= 0) return false;
  return !(format === 'match' && cur.match === 0 && cur.choice < PAIR_MIN);
}

export type MinutesChoice = 'less' | 'rec' | 'more' | 'custom';

export function minuteOptions(recMinutes: number): Record<'less' | 'rec' | 'more', number> {
  return { less: Math.max(1, recMinutes - 2), rec: recMinutes, more: recMinutes + 3 };
}

export function minutesFor(
  choice: MinutesChoice,
  custom: number | null,
  recMinutes: number
): number {
  if (choice === 'custom') return Math.max(1, Math.min(MAX_MINUTES, custom || recMinutes));
  return minuteOptions(recMinutes)[choice];
}

/** Баллы за слово при шкале 100 («по 5 за слово», «по 3,33 за слово») */
export function pointsPerWord(count: number): number {
  return Math.round((100 / Math.max(1, count)) * 100) / 100;
}

/** Деление на лёгкие / средние / сложные: по трети, остаток — сложным */
export function levelSplit(count: number): { easy: number; mid: number; hard: number } {
  const third = Math.ceil(count / 3);
  return { easy: third, mid: third, hard: count - 2 * third };
}

/** Проверка формы перед отправкой: что мешает собрать экзамен */
export function setupProblem(input: {
  selected: string[];
  count: number;
  formats: FormatCounts;
}): string | null {
  if (input.selected.length === 0) return 'Выбери хотя бы один набор.';
  const total = FORMATS.reduce((a, f) => a + (input.formats[f] || 0), 0);
  if (total !== input.count) return 'Форматы не складываются в число слов.';
  return null;
}
