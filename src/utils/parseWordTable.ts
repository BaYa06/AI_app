/**
 * Разбор таблицы «слово — перевод» (TSV/CSV) без ИИ: простые файлы не тратят дневной лимит
 * распознаваний. Сложные (больше двух столбцов, кавычки, непонятный разделитель) → null,
 * их разбирает ИИ.
 */
export interface WordPair {
  front: string;
  back: string;
}

const DELIMITERS = ['\t', ';', ','] as const;

export function parseWordTable(content: string): WordPair[] | null {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  for (const delimiter of DELIMITERS) {
    const rows = lines.map(l => l.split(delimiter).map(c => c.trim()));
    const twoColumns = rows.filter(r => r.length === 2 && r[0] && r[1] && !/["]/.test(r.join('')));
    // Разделитель подходит, если почти все строки — ровно два непустых столбца
    if (twoColumns.length >= Math.max(1, Math.ceil(lines.length * 0.9))) {
      return twoColumns.map(([front, back]) => ({ front, back }));
    }
  }
  return null;
}
