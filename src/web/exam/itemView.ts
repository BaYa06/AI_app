/**
 * Как показывать вопрос учителю в превью (plan/new/web_cabinet.md, Web 14; те же правила, что в
 * ExamPreviewScreen телефона): что считать «словом», а что — подписью. Чистые функции.
 */
import type { DraftItem, Difficulty, ExamFormat } from '@/services/exam';

export const FORMAT_ORDER: ExamFormat[] = ['choice', 'write', 'gap', 'scramble', 'match'];

/** Верхняя строка: слово, о котором вопрос */
export function itemTitle(it: DraftItem): string {
  if (it.format === 'gap') return String(it.extra?.baseForm || it.answer);
  return it.direction === 'forward' || it.format === 'match' ? it.prompt : it.answer;
}

/** Нижняя строка: перевод, определение или предложение */
export function itemSub(it: DraftItem): string {
  if (it.format === 'gap') return it.prompt;
  return it.direction === 'forward' || it.format === 'match' ? it.answer : it.prompt;
}

export function groupItems(items: DraftItem[]): { format: ExamFormat; items: DraftItem[] }[] {
  return FORMAT_ORDER.map((f) => ({
    format: f,
    items: items.filter((i) => i.format === f),
  })).filter((g) => g.items.length > 0);
}

export function levelCounts(items: DraftItem[]): Record<Difficulty, number> {
  const out = { easy: 0, mid: 0, hard: 0, unstudied: 0 } as Record<Difficulty, number>;
  for (const i of items) if (i.difficulty in out) out[i.difficulty]++;
  return out;
}

/** Сколько экранов у ученика: пары (4 слова) — один экран */
export function screensCount(items: DraftItem[]): number {
  return new Set(items.map((i) => i.blockNo)).size;
}

export const LEVEL_NAME: Record<Difficulty, string> = {
  easy: 'лёгкое',
  mid: 'среднее',
  hard: 'сложное',
  unstudied: 'не изучено',
};

/** Править можно «выбор» и «вставь слово»: у остальных форматов нет неверных вариантов */
export function canEdit(it: DraftItem): boolean {
  return (
    (it.format === 'choice' || it.format === 'gap') &&
    Array.isArray(it.options) &&
    it.options.length >= 4
  );
}

/** Разбить предложение по пропуску: ['She was ', ' to leave'] — для показа с подчёркиванием */
export function splitGap(sentence: string): [string, string] | null {
  const i = sentence.indexOf('_____');
  if (i < 0) return null;
  return [sentence.slice(0, i), sentence.slice(i + 5)];
}
